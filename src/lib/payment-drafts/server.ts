import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { inboxForDocs, loadClientDocs } from "@/lib/booking-inbox/client-docs";
import { pickPrimaryDoc } from "@/lib/booking-inbox/klien-data";
import { todayWIB } from "@/lib/dates";
import { computeTotals } from "@/lib/documents/totals";
import type { DocItem } from "@/lib/documents/types";
import {
	ensureArchiveMonthFolder,
	uploadFileToFolder,
} from "@/lib/drive/client";
import { safeSegment } from "@/lib/drive/naming";
import { checkPayment } from "@/lib/finance/payment-core";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	type BankLite,
	BotDraftSchema,
	type DraftRow,
	planDraftUpsert,
} from "./core";

/**
 * Draft bukti DP (DR-055) — I/O: cari tagihan klien, hitung sisa, simpan
 * bukti privat di Drive, upsert draft. Posting ke buku terjadi terpisah
 * (saat event ada), bukan di sini.
 */

export type DraftTarget = {
	booking_inbox_id: string | null;
	document_id: string | null;
	event_id: string | null;
};

/** Tagihan klien: invoice/quotation acuan + Booking Masuk + event-nya. */
export async function resolveDraftTarget(
	admin: SupabaseClient,
	q: {
		client_wa: string | null;
		wa_jid: string | null;
		invoice_no: string | null;
	},
): Promise<DraftTarget> {
	const docs = await loadClientDocs(admin, { jid: q.wa_jid, wa: q.client_wa });
	let doc = q.invoice_no
		? (docs.find((d) => d.doc_number === q.invoice_no) ?? null)
		: null;
	if (!doc && q.invoice_no) {
		const { data } = await admin
			.from("documents")
			.select("id, event_id")
			.eq("doc_number", q.invoice_no)
			.neq("status", "void")
			.maybeSingle();
		if (data)
			return {
				booking_inbox_id: null,
				document_id: data.id as string,
				event_id: (data.event_id as string | null) ?? null,
			};
	}
	doc = doc ?? pickPrimaryDoc(docs);
	const inbox = (await inboxForDocs(admin, docs, q.client_wa))[0] ?? null;
	return {
		booking_inbox_id: inbox?.id ?? null,
		document_id: doc?.id ?? null,
		event_id: doc?.event_id ?? inbox?.event_id ?? null,
	};
}

/**
 * Sisa tagihan yang masih boleh dibayar: event (aturan checkPayment) atau
 * total invoice/quotation lepas, dikurangi draft lain yang sudah disetujui
 * tapi belum masuk buku. null = tagihan tidak ditemukan.
 */
export async function sisaTagihan(
	admin: SupabaseClient,
	t: DraftTarget,
	excludeDraftId?: string,
): Promise<number | null> {
	let base: number | null = null;
	if (t.event_id) {
		const g = await checkPayment(admin, {
			eventId: t.event_id,
			amount: 0,
			paymentDate: todayWIB(),
		});
		base = g.ok ? g.sisaSebelum : null;
	} else if (t.document_id) {
		const { data: d } = await admin
			.from("documents")
			.select("items, discount, gross_up_enabled, gross_up_rate, status")
			.eq("id", t.document_id)
			.maybeSingle();
		if (d && d.status !== "void")
			base = computeTotals(
				(d.items ?? []) as DocItem[],
				Number(d.discount) || 0,
				{
					enabled: Boolean(d.gross_up_enabled),
					ratePct: Number(d.gross_up_rate) || 0,
				},
			).total;
	}
	if (base == null) return null;
	const col = t.event_id ? "event_id" : "document_id";
	const id = t.event_id ?? t.document_id;
	const { data: pending } = await admin
		.from("payment_drafts")
		.select("id, nominal")
		.eq(col, id)
		.eq("status", "disetujui");
	const held = (pending ?? [])
		.filter((p) => p.id !== excludeDraftId)
		.reduce((s, p) => s + (Number(p.nominal) || 0), 0);
	return Math.max(0, base - held);
}

/**
 * Bukti/pembayaran lain bernominal sama untuk klien/tagihan ini dalam 24 jam
 * (screenshot yang sama dikirim dua kali). Dipakai gerbang konfirmasi otomatis
 * dan peringatan Konfirmasi. Gagal membaca = dianggap dobel (aman: menunggu).
 */
export async function hasDuplicate(
	admin: SupabaseClient,
	q: {
		draftId?: string | null;
		nominal: number | null;
		target: DraftTarget;
		client_wa: string | null;
	},
): Promise<boolean> {
	if (!q.nominal) return false;
	const since = new Date(Date.now() - 24 * 3600_000).toISOString();
	const ors: string[] = [];
	if (q.target.document_id) ors.push(`document_id.eq.${q.target.document_id}`);
	if (q.target.booking_inbox_id)
		ors.push(`booking_inbox_id.eq.${q.target.booking_inbox_id}`);
	if (q.target.event_id) ors.push(`event_id.eq.${q.target.event_id}`);
	const tail = phoneTail(q.client_wa);
	if (tail.length === 9) ors.push(`client_wa.like.*${tail}`);
	try {
		if (ors.length) {
			let dq = admin
				.from("payment_drafts")
				.select("id")
				.eq("nominal", q.nominal)
				.in("status", ["disetujui", "tercatat"])
				.gte("created_at", since)
				.or(ors.join(","));
			if (q.draftId) dq = dq.neq("id", q.draftId);
			const { data, error } = await dq.limit(1);
			if (error) throw new Error(error.message);
			if (data?.length) return true;
		}
		if (q.target.event_id) {
			const { data, error } = await admin
				.from("payments")
				.select("id")
				.eq("event_id", q.target.event_id)
				.eq("amount", q.nominal)
				.eq("is_reversed", false)
				.gte("created_at", since)
				.limit(1);
			if (error) throw new Error(error.message);
			if (data?.length) return true;
		}
		return false;
	} catch (e) {
		console.error("[payment-drafts] cek dobel:", e);
		return true;
	}
}

export async function receivingBanks(
	admin: SupabaseClient,
): Promise<BankLite[]> {
	const { data, error } = await admin
		.from("bank_accounts")
		.select("id, account_number")
		.eq("is_active", true)
		.neq("account_kind", "emoney");
	if (error) throw new Error(`bank_accounts: ${error.message}`);
	return (data ?? []) as BankLite[];
}

/** Simpan bukti di Drive TANPA link publik (dibuka lewat route ber-sesi owner). */
export async function uploadBuktiPrivat(
	body: Buffer,
	mime: string,
	meta: { nama: string | null; nominal: number | null },
): Promise<{ fileId: string; url: string }> {
	const now = new Date(Date.now() + 7 * 3600_000);
	const folder = await ensureArchiveMonthFolder("Bukti DP WA", now);
	const ext =
		mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
	const name = [
		now.toISOString().slice(0, 10),
		"Bukti DP",
		meta.nama ? safeSegment(meta.nama, 50) : null,
		meta.nominal ? `Rp${meta.nominal.toLocaleString("id-ID")}` : null,
	]
		.filter(Boolean)
		.join(" - ");
	const f = await uploadFileToFolder(folder.id, `${name}.${ext}`, mime, body, {
		publicLink: false,
	});
	return { fileId: f.id, url: f.webViewLink };
}

export function draftUrl(
	appUrl: string,
	d: Pick<DraftRow, "booking_inbox_id" | "document_id">,
) {
	const base = appUrl.replace(/\/$/, "");
	if (d.booking_inbox_id)
		return `${base}/operations/booking-masuk/${d.booking_inbox_id}`;
	if (d.document_id) return `${base}/finance/dokumen/${d.document_id}`;
	return `${base}/operations/booking-masuk`;
}

export type BotDraftResponse = {
	status: number;
	body:
		| {
				ok: true;
				id: string;
				status: DraftRow["status"];
				url: string;
				gerbang: string[];
		  }
		| { ok: false; error: string; issues?: unknown };
};

/** POST /api/bot/pembayaran/draft — idempoten per pesan_id_wa. */
export async function handleBotDraft(
	json: unknown,
	appUrl: string,
): Promise<BotDraftResponse> {
	const parsed = BotDraftSchema.safeParse(json);
	if (!parsed.success)
		return {
			status: 400,
			body: {
				ok: false,
				error: "Body tidak valid",
				issues: parsed.error.issues,
			},
		};
	const body = parsed.data;
	const admin = createAdminClient();
	const { data: found } = await admin
		.from("payment_drafts")
		.select("*")
		.eq("pesan_id_wa", body.pesan_id_wa)
		.maybeSingle();
	const existing = found as DraftRow | null;
	const target: DraftTarget =
		existing?.document_id || existing?.booking_inbox_id
			? {
					booking_inbox_id: existing.booking_inbox_id,
					document_id: existing.document_id,
					event_id: existing.event_id,
				}
			: await resolveDraftTarget(admin, body);
	const plan = planDraftUpsert(existing, body, {
		banks: await receivingBanks(admin),
		sisa: await sisaTagihan(admin, target, existing?.id),
		duplicate: await hasDuplicate(admin, {
			draftId: existing?.id,
			nominal: existing?.nominal ?? body.nominal,
			target,
			client_wa: existing?.client_wa ?? body.client_wa,
		}),
		target,
		now: new Date().toISOString(),
	});
	const reply = (r: DraftRow) => ({
		status: 200,
		body: {
			ok: true as const,
			id: r.id,
			status: r.status,
			url: draftUrl(appUrl, r),
			gerbang: r.gerbang ?? [],
		},
	});
	if (plan.action === "ignore" && existing) return reply(existing);

	// Bukti: unggah sekali. Gagal unggah ≠ gagal simpan (bot boleh kirim ulang).
	let bukti: { bukti_file_id: string; bukti_url: string } | null = null;
	const mime = body.gambar_mime ?? body.mime;
	if (body.gambar && mime && !existing?.bukti_file_id) {
		try {
			const up = await uploadBuktiPrivat(
				Buffer.from(body.gambar, "base64"),
				mime,
				{
					nama: body.nama_klien ?? existing?.nama_klien ?? null,
					nominal: body.nominal ?? existing?.nominal ?? null,
				},
			);
			bukti = { bukti_file_id: up.fileId, bukti_url: up.url };
		} catch (e) {
			console.error("[payment-drafts] unggah bukti:", e);
		}
	}

	if (plan.action === "insert") {
		const { data, error } = await admin
			.from("payment_drafts")
			.insert({ ...plan.row, ...bukti })
			.select("*")
			.single();
		// Dua kiriman bot balapan: yang kalah membaca baris pemenang.
		if (error?.code === "23505") return handleBotDraft(json, appUrl);
		if (error) throw new Error(error.message);
		return reply(data as DraftRow);
	}
	const { data, error } = await admin
		.from("payment_drafts")
		.update({ ...(plan.action === "update" ? plan.patch : {}), ...bukti })
		.eq("id", (existing as DraftRow).id)
		.in("status", ["menunggu", "disetujui"])
		.select("*")
		.maybeSingle();
	if (error) throw new Error(error.message);
	return reply((data ?? existing) as DraftRow);
}

/** Draft milik satu Booking Masuk (terbaru dulu). `supabase` ber-RLS owner. */
export async function loadDraftsForBooking(
	supabase: SupabaseClient,
	bookingId: string,
): Promise<DraftRow[]> {
	const { data, error } = await supabase
		.from("payment_drafts")
		.select("*")
		.eq("booking_inbox_id", bookingId)
		.order("created_at", { ascending: false });
	if (error) throw new Error(`payment_drafts: ${error.message}`);
	return (data ?? []) as DraftRow[];
}
