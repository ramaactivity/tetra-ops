import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { signedPdfQuery } from "@/lib/documents/pdf-link";
import {
	DOC_TYPE_LABEL,
	type DocumentRow,
	docFilename,
	pendingAdminItems,
} from "@/lib/documents/types";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Kirim dokumen ke WA klien lewat bot Tetra (B1). Satu inti untuk tool MCP
 * `kirim_dokumen`, tombol Telegram "Kirim ke klien", tombol editor, dan
 * `kirim_pengingat_pelunasan`. Koneksi WA hidup di proses bot; perintah
 * dititipkan ke antrean `bot_commands` (dieksekusi ≤10 detik).
 *
 * delivered_at hanya diisi saat bot melaporkan `done` — bukan saat antre.
 */

export type SendDocInput = {
	documentId: string;
	pesan: string;
	/** Default: WA klien dokumen, lalu WA event. */
	nomor?: string | null;
};

export type ResolvedSend = {
	doc: DocumentRow;
	nomor: string;
	pesan: string;
	namaFile: string;
	ringkasan: string;
};

/** Validasi tanpa efek samping — dipakai preview `_usulan` & sebelum kirim. */
export async function resolveSendDocument(
	supabase: SupabaseClient,
	input: SendDocInput,
): Promise<ResolvedSend | { error: string }> {
	const pesan = input.pesan.trim();
	if (pesan.length < 20 || pesan.length > 1500)
		return { error: "pesan wajib diisi, 20–1500 karakter" };

	const { data } = await supabase
		.from("documents")
		.select("*")
		.eq("id", input.documentId)
		.maybeSingle();
	const doc = data as DocumentRow | null;
	if (!doc) return { error: "Dokumen tidak ditemukan." };
	if (doc.status === "void")
		return { error: `${doc.doc_number} sudah dibatalkan (void).` };
	const pending = pendingAdminItems(doc.items);
	if (pending.length > 0)
		return {
			error: `Isi dulu harga: ${pending.join(", ")} (${doc.doc_number}).`,
		};

	let raw = input.nomor?.trim() || doc.client.phone || null;
	if (!raw && doc.event_id) {
		const { data: ev } = await supabase
			.from("events")
			.select("client_wa")
			.eq("id", doc.event_id)
			.maybeSingle();
		raw = (ev?.client_wa as string | null) ?? null;
	}
	if (!isLikelyWaPhone(raw))
		return {
			error: `Nomor WA klien tidak valid ("${raw ?? ""}"). Isi nomor di dokumen/event dulu.`,
		};
	const nomor = toWaPhone(raw as string);
	const jenis = DOC_TYPE_LABEL[doc.doc_type];
	return {
		doc,
		nomor,
		pesan,
		namaFile: docFilename(doc.doc_type, doc.doc_number, doc.client.name),
		ringkasan: `Kirim ${jenis} ${doc.doc_number} (${doc.client.name}) ke WA +${nomor} lewat bot Tetra, dengan pesan di bawah + PDF terlampir.`,
	};
}

export type SendDocResult =
	| {
			status: "terkirim" | "gagal" | "antre";
			hasil: unknown;
			doc_number: string;
			command_id: string;
	  }
	| { error: string };

export async function sendDocumentCore(
	supabase: SupabaseClient,
	input: SendDocInput,
	opts: {
		actorId: string | null;
		/** Format antrean. `send-invoice` dipertahankan untuk bot lama. */
		command?: "send-document" | "send-invoice";
		/** Berapa kali cek hasil bot (tiap 4 dtk). Webhook Telegram maks ~20 dtk. */
		pollRounds?: number;
		/** Label log pengingat untuk dokumen ber-event. */
		logTemplate?: string;
	},
): Promise<SendDocResult> {
	const r = await resolveSendDocument(supabase, input);
	if ("error" in r) return r;

	const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
	if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL belum diset." };
	// 1 jam cukup untuk antrean bot (cek tiap 10 dtk) plus bot yang reconnect.
	const q = signedPdfQuery(r.doc.id, 3600);
	if (!q) return { error: "MCP_API_TOKEN belum diset." };

	const { data: cmd, error } = await supabase
		.from("bot_commands")
		.insert({
			command: `${opts.command ?? "send-document"}:${JSON.stringify({
				nomor: r.nomor,
				pesan: r.pesan,
				pdf_url: `${appUrl}/api/pdf/document/${r.doc.id}?download=1&${q}`,
				nama_file: r.namaFile,
			})}`,
			status: "pending",
		})
		.select("id")
		.single();
	if (error) return { error: `Gagal menitipkan ke bot: ${error.message}` };

	const rounds = opts.pollRounds ?? 8;
	for (let i = 0; i < rounds; i++) {
		await new Promise((res) => setTimeout(res, 4000));
		const { data: st } = await supabase
			.from("bot_commands")
			.select("status, result")
			.eq("id", cmd.id)
			.maybeSingle();
		if (!st || st.status === "pending") continue;
		const ok = st.status === "done";
		if (ok) await markDelivered(supabase, r, opts, cmd.id as string);
		return {
			status: ok ? "terkirim" : "gagal",
			hasil: st.result,
			doc_number: r.doc.doc_number,
			command_id: cmd.id as string,
		};
	}
	return {
		status: "antre",
		hasil:
			"Bot belum memproses (mungkin sedang reconnect). Perintah tetap di antrean; tanda terkirim belum dicatat.",
		doc_number: r.doc.doc_number,
		command_id: cmd.id as string,
	};
}

async function markDelivered(
	supabase: SupabaseClient,
	r: ResolvedSend,
	opts: { actorId: string | null; logTemplate?: string },
	commandId: string,
) {
	await supabase
		.from("documents")
		.update({
			delivered_at: new Date().toISOString(),
			delivered_via: "wa_bot",
			// Draft yang benar-benar sampai ke klien = terkirim.
			...(r.doc.status === "draft" ? { status: "sent" } : {}),
		})
		.eq("id", r.doc.id);
	if (r.doc.event_id) {
		await supabase.from("event_reminders_log").insert({
			event_id: r.doc.event_id,
			template_code: opts.logTemplate ?? `dokumen_${r.doc.doc_type}`,
			recipient_phone: r.nomor,
			recipient_label: r.doc.client.name,
			sent_by: opts.actorId,
			notes: `bot_commands ${commandId}, ${r.doc.doc_number}`,
		});
	}
}
