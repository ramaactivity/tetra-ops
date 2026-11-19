import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateID, formatRupiah } from "@/lib/format";
import {
	isTelegramConfigured,
	sendTelegramMessage,
	tgApi,
	tgEscape,
} from "@/lib/telegram/client";
import { isOwnerTg } from "./approval-auth";
import { issuePaidDocCore } from "./invoice";
import {
	loadSupersedingInvoices,
	notifyApprovalNeeded,
	resolveApprovalNotifications,
} from "./pending-approval";
import { sapaKlien, teksDokumen, teksQuotation } from "./pesan-klien";
import { sendDocumentCore } from "./send";
import { computeTotals } from "./totals";
import {
	DOC_TYPE_LABEL,
	type DocumentRow,
	isRevision,
	pendingAdminItems,
	supersededBy,
} from "./types";

/**
 * Persetujuan 1 tap di Telegram (B2/B4): dokumen yang berisi uang tidak pernah
 * terkirim ke klien tanpa tap owner. Alurnya:
 *   offerSendToOwner → pesan grup + tombol "Kirim ke klien" (ks:<request id>)
 *   handleDocSendTap → cek owner, klaim request (anti tap ganda), cek isian
 *                      admin, lalu kirim lewat bot (sendDocumentCore).
 */

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

export const editorUrl = (id: string) => `${appUrl()}/finance/dokumen/${id}`;

async function ownerGroupChatId(supabase: SupabaseClient) {
	const { data } = await supabase
		.from("telegram_settings")
		.select("group_chat_id, owner_tg_ids")
		.eq("id", 1)
		.maybeSingle();
	return {
		chatId: (data?.group_chat_id as number | null) ?? null,
		ownerIds: ((data?.owner_tg_ids as number[] | null) ?? []).map(Number),
	};
}

/**
 * Buat permintaan kirim + tawarkan ke grup owner. Best-effort: gagal kirim
 * Telegram tidak menggagalkan pemicunya (dokumen tetap tersimpan).
 */
export async function offerSendToOwner(
	supabase: SupabaseClient,
	opts: { documentIds: string[]; headerHtml: string; pesan?: string | null },
): Promise<{ requestId: string | null }> {
	try {
		const { data: req, error } = await supabase
			.from("doc_send_requests")
			.insert({ document_ids: opts.documentIds, pesan: opts.pesan ?? null })
			.select("id")
			.single();
		if (error || !req) {
			console.error("[approval] request:", error?.message);
			return { requestId: null };
		}
		// Sama di aplikasi: lonceng + antrean "Perlu persetujuan" di Dokumen.
		await notifyApprovalNeeded(req.id as string, opts.documentIds);
		if (!isTelegramConfigured()) return { requestId: req.id as string };
		const { chatId } = await ownerGroupChatId(supabase);
		if (!chatId) return { requestId: req.id as string };
		await sendTelegramMessage(chatId, opts.headerHtml, {
			replyMarkup: [
				[{ text: "✅ Kirim ke klien", callback_data: `ks:${req.id}` }],
				[{ text: "✏️ Edit dulu", url: editorUrl(opts.documentIds[0]) }],
			],
		});
		return { requestId: req.id as string };
	} catch (e) {
		console.error("[approval] offer failed:", e);
		return { requestId: null };
	}
}

/** Pesan WA standar per dokumen — disusun saat kirim supaya angkanya terbaru. */
/** Tanggal di pesan klien: nama bulan lengkap ("2 Desember 2026") — owner 19 Nov 2026. */
const tglKlien = (iso: string) =>
	new Date(iso).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

export async function defaultClientMessage(
	supabase: SupabaseClient,
	doc: DocumentRow,
	index = 0,
): Promise<string> {
	const nama = sapaKlien(doc.client);
	const jenis = DOC_TYPE_LABEL[doc.doc_type];
	const acara = doc.event_info?.date
		? ` untuk acara ${tglKlien(doc.event_info.date)}`
		: "";
	const revisi = isRevision(doc);
	if (doc.doc_type === "quotation") {
		const total = computeTotals(doc.items, doc.discount, {
			enabled: doc.gross_up_enabled,
			ratePct: doc.gross_up_rate,
		}).total;
		return teksQuotation({
			client: doc.client,
			tanggalAcara: doc.event_info?.date ? tglKlien(doc.event_info.date) : null,
			total: formatRupiah(total),
			berlakuSampai: doc.valid_until ? tglKlien(doc.valid_until) : null,
			revisi,
		});
	}
	// Dokumen kedua dalam satu kiriman cukup kalimat pendek.
	if (index > 0)
		return `Terlampir juga ${jenis.toLowerCase()}-nya. Terima kasih 🙏`;

	if (doc.doc_type === "receipt") {
		// Kalimat owner 19 Nov 2026 (kuitansi DP Yessi).
		return `Halo ${nama}, terima kasih 🙏 Pembayaran sudah kami terima. Untuk kuitansinya terlampir ya kak.`;
	}
	if (doc.doc_type === "nota_lunas")
		// Kalimat owner 19 Nov 2026 (Hilmi & Syifa): klien perlu tahu uangnya
		// sudah masuk, bukan cuma statusnya lunas.
		return `Halo ${nama}, pembayaran${acara} sudah masuk dan lunas ya 🙏 Terlampir nota lunasnya. Terima kasih banyak atas kepercayaannya!`;
	if (doc.doc_type === "bast")
		return `Halo ${nama}, terlampir Berita Acara Serah Terima (BAST)${acara}. Terima kasih sudah memakai Tetra Photobooth 🙏`;
	return teksDokumen({
		client: doc.client,
		jenis,
		tanggalAcara: doc.event_info?.date ? tglKlien(doc.event_info.date) : null,
		revisi,
	});
}

export type TapOutcome = {
	/** Balasan singkat ke grup (segera). */
	reply: string;
	/** Kerja lanjutan (kirim + tunggu bot) — jalankan di after(). */
	followUp?: () => Promise<string>;
};

/**
 * Tombol "Kirim ke klien" ditekan. `supabase` = admin (webhook tanpa sesi).
 * Urutan: owner? → klaim request → isian admin lengkap? → kirim.
 */
export async function handleDocSendTap(
	supabase: SupabaseClient,
	requestId: string,
	fromId: number | null,
): Promise<TapOutcome> {
	const { ownerIds } = await ownerGroupChatId(supabase);
	if (!isOwnerTg(fromId, ownerIds)) {
		return {
			reply: ownerIds.length
				? "⛔ Tombol kirim hanya untuk owner."
				: "⛔ Belum ada owner terdaftar untuk tombol kirim. Ketik /id di grup, lalu daftarkan user id owner di Tetra Ops.",
		};
	}

	// Klaim atomik: tap ganda / dua owner menekan bersamaan → hanya satu jalan.
	const { data: req } = await supabase
		.from("doc_send_requests")
		.update({ handled_at: new Date().toISOString(), handled_by_tg: fromId })
		.eq("id", requestId)
		.is("handled_at", null)
		.select("document_ids, pesan, nomor")
		.maybeSingle();
	if (!req) return { reply: "ℹ️ Permintaan ini sudah diproses sebelumnya." };

	const { data: rows } = await supabase
		.from("documents")
		.select("*")
		.in("id", req.document_ids as string[]);
	const byId = new Map(((rows ?? []) as DocumentRow[]).map((d) => [d.id, d]));
	const all = (req.document_ids as string[])
		.map((id) => byId.get(id))
		.filter((d): d is DocumentRow => Boolean(d));
	// Tombol lama untuk quotation yang sudah jadi invoice → jangan kirim
	// penawaran basi ke klien.
	const invoices = await loadSupersedingInvoices(supabase, all);
	const skipped = all
		.map((d) => ({ d, by: supersededBy(d, invoices) }))
		.filter((x) => x.by);
	const docs = all.filter((d) => !skipped.some((x) => x.d.id === d.id));
	const skipNote = skipped
		.map(
			(x) =>
				`ℹ️ ${x.d.doc_number} tidak dikirim — sudah diganti ${x.by === "invoice" ? "invoice" : x.by}.`,
		)
		.join("\n");
	if (docs.length === 0) {
		await supabase
			.from("doc_send_requests")
			.update({ result: { via: "telegram", how: "superseded" } })
			.eq("id", requestId);
		await resolveApprovalNotifications(requestId);
		return { reply: skipNote || "ℹ️ Tidak ada dokumen yang perlu dikirim." };
	}

	const blocked = docs
		.map((d) => ({ d, pending: pendingAdminItems(d.items) }))
		.filter((x) => x.pending.length > 0);
	if (blocked.length > 0) {
		// Lepas klaim supaya tombol bisa dipakai lagi setelah harga diisi.
		await supabase
			.from("doc_send_requests")
			.update({ handled_at: null, handled_by_tg: null })
			.eq("id", requestId);
		return {
			reply: blocked
				.map(
					(x) =>
						`✏️ Isi dulu harga di ${x.d.doc_number}: ${x.pending.map(tgEscape).join(", ")}\n${editorUrl(x.d.id)}`,
				)
				.join("\n\n"),
		};
	}

	await resolveApprovalNotifications(requestId);
	return {
		reply: `${skipNote ? `${skipNote}\n` : ""}⏳ Mengirim ${docs.map((d) => d.doc_number).join(" + ")} ke klien lewat bot WA…`,
		followUp: async () => {
			const lines: string[] = [];
			for (const [i, d] of docs.entries()) {
				const pesan =
					i === 0 && req.pesan
						? (req.pesan as string)
						: await defaultClientMessage(supabase, d, i);
				const res = await sendDocumentCore(
					supabase,
					{
						documentId: d.id,
						pesan,
						nomor: (req.nomor as string | null) ?? null,
					},
					// Webhook maks 30 dtk: 1 dokumen ≤20 dtk, 2 dokumen ≤2×12 dtk.
					{ actorId: null, pollRounds: docs.length > 1 ? 3 : 5 },
				);
				lines.push(
					"error" in res
						? `❌ ${d.doc_number}: ${tgEscape(res.error)}`
						: res.status === "terkirim"
							? `✅ ${d.doc_number} terkirim ke klien`
							: res.status === "gagal"
								? `❌ ${d.doc_number} gagal dikirim bot: ${tgEscape(String(res.hasil ?? ""))}`
								: `🕓 ${d.doc_number} masih di antrean bot (belum dikonfirmasi)`,
				);
			}
			await supabase
				.from("doc_send_requests")
				.update({ result: { lines } })
				.eq("id", requestId);
			return lines.join("\n");
		},
	};
}

/** Hilangkan tombol dari pesan yang sudah ditap (cegah tap berulang). */
export async function clearKeyboard(chatId: number, messageId: number) {
	await tgApi("editMessageReplyMarkup", {
		chat_id: chatId,
		message_id: messageId,
		reply_markup: { inline_keyboard: [] },
	});
}

/** Klien korporat/instansi paling butuh BAST → tampil paling atas. */
const BAST_PRIORITY = new Set(["corporate", "instansi", "gathering", "wisuda"]);

/**
 * Digest pagi (B4): event 14 hari terakhir yang sudah lewat & lunas tetapi
 * BAST-nya belum sampai ke klien. BAST diterbitkan (idempoten), lalu satu
 * tombol "Kirim" per event. Request yang belum ditap dipakai ulang, jadi
 * digest harian tidak menumpuk baris baru.
 */
export async function buildBastReadyOffer(
	supabase: SupabaseClient,
	todayISO: string,
): Promise<{
	html: string;
	keyboard: Array<Array<{ text: string; callback_data: string }>>;
} | null> {
	const since = new Date(`${todayISO}T00:00:00Z`);
	since.setUTCDate(since.getUTCDate() - 14);
	const { data: events } = await supabase
		.from("events")
		.select("id, client_name, event_date, event_category")
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.neq("status", "cancelled")
		.lt("event_date", todayISO)
		.gte("event_date", since.toISOString().slice(0, 10))
		.lte("remaining_balance", 0)
		.gt("total_paid", 0)
		.order("event_date", { ascending: false })
		.limit(20);
	const rows = [...(events ?? [])].sort(
		(a, b) =>
			Number(BAST_PRIORITY.has(b.event_category as string)) -
			Number(BAST_PRIORITY.has(a.event_category as string)),
	);

	const offers: Array<{ label: string; requestId: string }> = [];
	for (const ev of rows) {
		if (offers.length >= 8) break;
		const bast = await issuePaidDocCore(
			supabase,
			ev.id as string,
			"bast",
			null,
			todayISO,
		);
		if (!bast.ok) continue;
		const { data: doc } = await supabase
			.from("documents")
			.select("delivered_at")
			.eq("id", bast.id)
			.maybeSingle();
		if (doc?.delivered_at) continue;
		const { data: prior } = await supabase
			.from("doc_send_requests")
			.select("id, handled_at, result")
			.contains("document_ids", [bast.id]);
		// Owner menekan "Abaikan" di aplikasi → jangan ditawarkan lagi tiap pagi.
		if (
			(prior ?? []).some(
				(r) => (r.result as { how?: string } | null)?.how === "dismissed",
			)
		)
			continue;
		const pending = (prior ?? []).find((r) => !r.handled_at);
		let requestId = (pending?.id as string | undefined) ?? null;
		if (!requestId) {
			const { data: req } = await supabase
				.from("doc_send_requests")
				.insert({ document_ids: [bast.id] })
				.select("id")
				.single();
			requestId = (req?.id as string | undefined) ?? null;
		}
		if (!requestId) continue;
		offers.push({
			label: `${ev.client_name} · ${formatDateID(ev.event_date as string)}`,
			requestId,
		});
	}
	if (offers.length === 0) return null;
	return {
		html: [
			`📄 <b>BAST siap dikirim</b> — ${offers.length} event sudah lewat & lunas`,
			...offers.map((o) => `• ${tgEscape(o.label)}`),
			"",
			"Tap untuk mengirim BAST ke klien lewat bot WA.",
		].join("\n"),
		keyboard: offers.map((o) => [
			{
				text: `📄 Kirim BAST · ${o.label}`.slice(0, 60),
				callback_data: `ks:${o.requestId}`,
			},
		]),
	};
}
