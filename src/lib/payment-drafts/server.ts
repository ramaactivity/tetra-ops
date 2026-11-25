import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { HERMES_URL_CONFIG_KEY } from "@/lib/ai/hermes";
import { resolveOwnerActorId } from "@/lib/auth/owner-actor";
import { inboxForDocs, loadClientDocs } from "@/lib/booking-inbox/client-docs";
import { pickPrimaryDoc } from "@/lib/booking-inbox/klien-data";
import { todayWIB } from "@/lib/dates";
import {
	defaultClientMessage,
	ownerGroupChatId,
} from "@/lib/documents/approval";
import { sendDocumentCore } from "@/lib/documents/send";
import { computeTotals } from "@/lib/documents/totals";
import type { DocItem, DocumentRow } from "@/lib/documents/types";
import {
	ensureArchiveMonthFolder,
	uploadFileToFolder,
} from "@/lib/drive/client";
import { safeSegment } from "@/lib/drive/naming";
import { cocokNomor } from "@/lib/events/penerima";
import {
	checkPayment,
	logPaymentCore,
	offerPaymentDocsToOwner,
	type PaymentType,
} from "@/lib/finance/payment-core";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	isTelegramConfigured,
	sendTelegramMessage,
} from "@/lib/telegram/client";
import { tgEscape } from "@/lib/telegram/format";
import {
	type BankLite,
	BotDraftSchema,
	type DraftRow,
	JENIS_BAYAR_LABEL,
	jenisBayar,
	planDraftUpsert,
} from "./core";
import { type PembayaranTercatat, signedRequest, webhookUrl } from "./webhook";

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

const EVENT_PHONE_SELECT =
	"id, project_id, client_name, event_date, client_wa, pic_wa, channel, vendor_contact, extra_pics, booker_contact:contacts!events_booker_contact_id_fkey(name, phone), pic_contact:contacts!events_pic_contact_id_fkey(phone)";

export type EventByPhone = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	booker: string | null;
};

/**
 * Acara mendatang yang nomornya cocok — aturan yang sama dengan
 * /api/bot/klien (cocokNomor: vendor → client_wa → PIC → pemesan → PIC
 * cadangan). Kasus Shella 25 Nov: invoice masih memuat nomor pemesan, padahal
 * nomor klien di event sudah dibetulkan.
 */
export async function upcomingEventsByPhone(
	admin: SupabaseClient,
	phone: string | null,
): Promise<EventByPhone[]> {
	const tail = phoneTail(phone);
	return (await upcomingEventsForPhones(admin, [phone])).get(tail) ?? [];
}

/** Banyak nomor sekaligus (daftar Booking Masuk) — kunci = 9 digit terakhir. */
export async function upcomingEventsForPhones(
	admin: SupabaseClient,
	phones: Array<string | null>,
): Promise<Map<string, EventByPhone[]>> {
	const tails = [
		...new Set(phones.map((p) => phoneTail(p)).filter((t) => t.length === 9)),
	];
	const out = new Map<string, EventByPhone[]>();
	if (!tails.length) return out;
	// ponytail: semua acara mendatang dimuat lalu disaring (puluhan baris) —
	// sama dengan /api/bot/klien; pindah ke RPC berindeks kalau sudah ribuan.
	const { data, error } = await admin
		.from("events")
		.select(EVENT_PHONE_SELECT)
		.is("deleted_at", null)
		.eq("is_demo", false)
		.neq("status", "cancelled")
		.gte("event_date", todayWIB())
		.order("event_date");
	if (error) throw new Error(`events: ${error.message}`);
	for (const e of data ?? []) {
		const b = (
			Array.isArray(e.booker_contact) ? e.booker_contact[0] : e.booker_contact
		) as { name?: string | null } | null;
		const row: EventByPhone = {
			id: e.id as string,
			project_id: e.project_id as string,
			client_name: e.client_name as string,
			event_date: e.event_date as string,
			booker: b?.name ?? null,
		};
		for (const t of tails)
			if (cocokNomor(e as Parameters<typeof cocokNomor>[0], t))
				out.set(t, [...(out.get(t) ?? []), row]);
	}
	return out;
}

/**
 * Target untuk event tertentu (event_id dari bot atau pilihan owner): event +
 * invoice aktifnya + Booking Masuk yang sudah jadi event itu. null = event
 * tidak ada / dihapus / dibatalkan.
 */
export async function targetForEvent(
	admin: SupabaseClient,
	eventId: string,
): Promise<DraftTarget | null> {
	const [{ data: ev }, { data: inv }, { data: ib }] = await Promise.all([
		admin
			.from("events")
			.select("id, status, deleted_at")
			.eq("id", eventId)
			.maybeSingle(),
		admin
			.from("documents")
			.select("id")
			.eq("event_id", eventId)
			.eq("doc_type", "invoice")
			.neq("status", "void")
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle(),
		admin
			.from("booking_inbox")
			.select("id")
			.eq("event_id", eventId)
			.limit(1)
			.maybeSingle(),
	]);
	// Event selesai/di-settle tetap boleh menerima pelunasan (checkPayment).
	if (!ev || ev.deleted_at || ev.status === "cancelled") return null;
	return {
		booking_inbox_id: (ib?.id as string | undefined) ?? null,
		document_id: (inv?.id as string | undefined) ?? null,
		event_id: eventId,
	};
}

/** Tagihan klien: invoice/quotation acuan + Booking Masuk + event-nya. */
export async function resolveDraftTarget(
	admin: SupabaseClient,
	q: {
		client_wa: string | null;
		wa_jid: string | null;
		invoice_no: string | null;
		event_id?: string | null;
	},
): Promise<DraftTarget> {
	if (q.event_id) {
		const t = await targetForEvent(admin, q.event_id);
		if (t) return t;
	}
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
	// Tidak ada dokumen yang cocok → cari acara mendatang lewat nomor. Satu =
	// target; lebih dari satu = owner memilih. Ada Booking Masuk baru tanpa
	// event = bisa jadi booking kedua → juga owner yang memilih (kartu
	// "Klien sudah punya event" di Booking Masuk), jangan ditebak.
	if (!doc && !inbox) {
		const evs = await upcomingEventsByPhone(admin, q.client_wa).catch((e) => {
			console.error("[payment-drafts] cari event lewat nomor:", e);
			return [];
		});
		if (evs.length === 1) {
			const t = await targetForEvent(admin, evs[0].id);
			if (t) return t;
		}
	}
	return {
		booking_inbox_id: inbox?.id ?? null,
		document_id: doc?.id ?? null,
		event_id: doc?.event_id ?? inbox?.event_id ?? null,
	};
}

/**
 * Tagihan yang masih boleh dibayar: event (aturan checkPayment) atau total
 * invoice/quotation lepas, dikurangi draft lain yang sudah disetujui tapi
 * belum masuk buku. `terbayar` = sudah masuk buku + draft disetujui itu
 * (dasar jenis DP/Cicilan/Pelunasan). null = tagihan tidak ditemukan.
 */
export async function tagihanDraft(
	admin: SupabaseClient,
	t: DraftTarget,
	excludeDraftId?: string,
): Promise<{ sisa: number; terbayar: number } | null> {
	let base: number | null = null;
	let masukBuku = 0;
	if (t.event_id) {
		const g = await checkPayment(admin, {
			eventId: t.event_id,
			amount: 0,
			paymentDate: todayWIB(),
		});
		if (g.ok) {
			base = g.sisaSebelum;
			masukBuku = g.billable - g.sisaSebelum;
		}
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
	return { sisa: Math.max(0, base - held), terbayar: masukBuku + held };
}

/** Sisa tagihan saja (lihat tagihanDraft). */
export async function sisaTagihan(
	admin: SupabaseClient,
	t: DraftTarget,
	excludeDraftId?: string,
): Promise<number | null> {
	return (await tagihanDraft(admin, t, excludeDraftId))?.sisa ?? null;
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
	// Tertaut langsung ke event (event_id dari bot) atau belum tertaut sama
	// sekali → dikonfirmasi di Uang Masuk.
	return `${base}/billing/uang-masuk`;
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
	// event_id dari bot menang atas tebakan lama yang belum punya event
	// (Shella 25 Nov: draft tertaut ke Booking Masuk palsu tanpa event).
	const fromBot =
		body.event_id && !existing?.event_id
			? await targetForEvent(admin, body.event_id)
			: null;
	const target: DraftTarget = fromBot
		? {
				booking_inbox_id:
					existing?.booking_inbox_id ?? fromBot.booking_inbox_id,
				document_id: existing?.document_id ?? fromBot.document_id,
				event_id: fromBot.event_id,
			}
		: existing?.document_id || existing?.booking_inbox_id
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
		const row = await afterApproval(admin, data as DraftRow);
		// Bukti baru → kartu Telegram + lonceng owner, tanpa menahan balasan bot.
		after(() =>
			offerDraftToOwner(row).catch((e) =>
				console.error("[payment-drafts] kartu owner:", e),
			),
		);
		return reply(row);
	}
	const { data, error } = await admin
		.from("payment_drafts")
		.update({ ...(plan.action === "update" ? plan.patch : {}), ...bukti })
		.eq("id", (existing as DraftRow).id)
		.in("status", ["menunggu", "disetujui"])
		.select("*")
		.maybeSingle();
	if (error) throw new Error(error.message);
	return reply(await afterApproval(admin, (data ?? existing) as DraftRow));
}

/** Disetujui lewat WA + booking sudah punya event → langsung masuk buku. */
async function afterApproval(
	admin: SupabaseClient,
	r: DraftRow,
): Promise<DraftRow> {
	if (r.status !== "disetujui") return r;
	if (!(await postIfEventExists(admin, r, null))) return r;
	const { data } = await admin
		.from("payment_drafts")
		.select("*")
		.eq("id", r.id)
		.maybeSingle();
	return (data as DraftRow | null) ?? r;
}

const wibDate = (iso: string) =>
	new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** Event yang sekarang memiliki draft: miliknya, Booking Masuk-nya, atau dokumennya. */
export async function eventOfDraft(
	admin: SupabaseClient,
	d: Pick<DraftRow, "event_id" | "booking_inbox_id" | "document_id">,
): Promise<string | null> {
	if (d.event_id) return d.event_id;
	if (d.booking_inbox_id) {
		const { data } = await admin
			.from("booking_inbox")
			.select("event_id")
			.eq("id", d.booking_inbox_id)
			.maybeSingle();
		if (data?.event_id) return data.event_id as string;
	}
	if (d.document_id) {
		const { data } = await admin
			.from("documents")
			.select("event_id")
			.eq("id", d.document_id)
			.maybeSingle();
		if (data?.event_id) return data.event_id as string;
	}
	return null;
}

/**
 * Draft yang DISETUJUI milik event ini (langsung, lewat Booking Masuk, atau
 * lewat invoice/quotation-nya) → masuk buku lewat logPaymentCore — semua guard
 * ikut (cutoff, lebih bayar, jurnal atomik). Dipanggil saat event dibuat dan
 * saat draft disetujui untuk booking yang sudah punya event (DR-055).
 * Gagal = draft tetap disetujui + alasan di catatan_posting.
 */
/**
 * `kirimLangsung` (tombol "Konfirmasi & kirim terima kasih", owner 19 Nov
 * 2026): setelah masuk buku, kuitansi — atau nota lunas kalau lunas — langsung
 * terkirim ke klien dengan pesan bawaan; Hermes tidak diminta mengusulkan
 * kiriman yang sama.
 */
export type PostOpts = { kirimLangsung?: boolean };

export async function postApprovedDrafts(
	eventId: string,
	actorId: string,
	opts: PostOpts = {},
): Promise<{ posted: number; failed: string[] }> {
	const admin = createAdminClient();
	const [{ data: docs }, { data: inbox }] = await Promise.all([
		admin
			.from("documents")
			.select("id, source_document_id")
			.eq("event_id", eventId),
		admin.from("booking_inbox").select("id").eq("event_id", eventId),
	]);
	const docIds = [
		...new Set(
			(docs ?? [])
				.flatMap((d) => [d.id as string, d.source_document_id as string | null])
				.filter((x): x is string => Boolean(x)),
		),
	];
	const inboxIds = (inbox ?? []).map((r) => r.id as string);
	const ors = [`event_id.eq.${eventId}`];
	if (docIds.length) ors.push(`document_id.in.(${docIds.join(",")})`);
	if (inboxIds.length) ors.push(`booking_inbox_id.in.(${inboxIds.join(",")})`);
	const { data, error } = await admin
		.from("payment_drafts")
		.select("*")
		.eq("status", "disetujui")
		.or(ors.join(","))
		.order("created_at");
	if (error) {
		console.error("[payment-drafts] posting:", error.message);
		return { posted: 0, failed: [error.message] };
	}
	let posted = 0;
	const failed: string[] = [];
	for (const d of (data ?? []) as DraftRow[]) {
		const r = await postDraft(admin, d, eventId, actorId, opts);
		if (r === "posted") posted++;
		else if (r !== "skip") failed.push(r);
	}
	return { posted, failed };
}

async function postDraft(
	admin: SupabaseClient,
	d: DraftRow,
	eventId: string,
	actorId: string,
	opts: PostOpts,
): Promise<"posted" | "skip" | string> {
	const note = async (msg: string) => {
		await admin
			.from("payment_drafts")
			.update({ catatan_posting: msg, event_id: eventId })
			.eq("id", d.id)
			.eq("status", "disetujui");
		return msg;
	};
	if (!d.nominal) return note("Nominal kosong.");
	if (!d.bank_account_id) return note("Rekening tujuan belum dipilih.");
	const paymentDate = wibDate(
		d.waktu_transfer ?? d.waktu_pesan ?? d.created_at,
	);
	const g = await checkPayment(admin, {
		eventId,
		amount: d.nominal,
		paymentDate,
	});
	if (!g.ok) return note(g.error);
	// Klaim atomik: hanya satu jalur (buat event / konfirmasi / bot) yang memposting.
	const { data: claimed } = await admin
		.from("payment_drafts")
		.update({ status: "tercatat", event_id: eventId, catatan_posting: null })
		.eq("id", d.id)
		.eq("status", "disetujui")
		.select("id")
		.maybeSingle();
	if (!claimed) return "skip";
	const paymentType: PaymentType = jenisBayar({
		terbayar: g.billable - g.sisaSebelum,
		sisa: g.sisaSebelum,
		nominal: d.nominal,
	});
	try {
		const res = await logPaymentCore(
			admin,
			{
				eventId,
				amount: d.nominal,
				paymentDate,
				bankAccountId: d.bank_account_id,
				paymentType,
				proofUrl: d.bukti_url,
				notes: "Dari bukti transfer WA",
				senderName: d.nama_pengirim,
			},
			actorId,
			// Kuitansi ditawarkan lewat Hermes (Telegram hanya cadangan) — lihat kabariHermes.
			{ skipOwnerOffer: true },
		);
		if (!res.ok) {
			await admin
				.from("payment_drafts")
				.update({ status: "disetujui", catatan_posting: res.error })
				.eq("id", d.id);
			return res.error;
		}
		await admin
			.from("payment_drafts")
			.update({ payment_id: res.paymentId })
			.eq("id", d.id);
		const posted = { ...res, paymentType, nominal: d.nominal };
		after(() =>
			(opts.kirimLangsung
				? kirimTerimaKasih(eventId, posted, actorId)
				: kabariHermes(d, eventId, posted)
			).catch((e) => console.error("[payment-drafts] setelah posting:", e)),
		);
		return "posted";
	} catch (e) {
		// Tidak tahu apakah jurnal sudah tertulis → JANGAN dikembalikan ke
		// disetujui (bisa tercatat dobel); tandai untuk dicek owner.
		const msg = `Error saat mencatat — cek pembayaran event sebelum mengulang: ${e instanceof Error ? e.message : String(e)}`;
		console.error("[payment-drafts] posting:", e);
		await admin
			.from("payment_drafts")
			.update({ catatan_posting: msg })
			.eq("id", d.id);
		return msg;
	}
}

export type KonfirmasiResult =
	| { ok: true; tercatat?: boolean }
	| { ok: false; error: string; warning?: undefined }
	| { ok: false; warning: string; error?: undefined };

const rpx = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

/**
 * Owner menyetujui bukti (app: Uang Masuk/Booking Masuk, atau tap kartu
 * Telegram). Lebih bayar ditahan (keputusan Rama); nominal sama dalam 24 jam =
 * peringatan (`force` untuk tetap lanjut). `kirim` = langsung kirim kuitansi +
 * terima kasih setelah masuk buku (DR-059).
 */
export async function konfirmasiCore(
	admin: SupabaseClient,
	d: DraftRow,
	bankAccountId: string,
	actorId: string,
	opts: { force?: boolean; kirim?: boolean } = {},
): Promise<KonfirmasiResult> {
	if (d.status === "disetujui") return { ok: true };
	if (!d.nominal) return { ok: false, error: "Isi nominal yang masuk dulu." };
	const banks = await receivingBanks(admin);
	if (!banks.some((b) => b.id === bankAccountId))
		return { ok: false, error: "Pilih rekening tujuan yang menerima uang." };
	const target = {
		booking_inbox_id: d.booking_inbox_id,
		document_id: d.document_id,
		event_id: d.event_id,
	};
	const sisa = await sisaTagihan(admin, target, d.id);
	if (sisa == null)
		return {
			ok: false,
			error:
				"Tagihan klien ini belum ketemu (belum ada invoice/quotation). Buat invoice dulu supaya sisa tagihan bisa dicek.",
		};
	if (d.nominal > sisa)
		return {
			ok: false,
			error: `Nominal ${rpx(d.nominal)} melebihi sisa tagihan ${rpx(sisa)}. Koreksi nominal atau tagihannya dulu.`,
		};
	if (
		!opts.force &&
		(await hasDuplicate(admin, {
			draftId: d.id,
			nominal: d.nominal,
			target,
			client_wa: d.client_wa,
		}))
	)
		return {
			ok: false,
			warning: `Sudah ada bukti/pembayaran ${rpx(d.nominal)} untuk klien ini dalam 24 jam terakhir. Mungkin bukti yang sama terkirim dua kali.`,
		};
	const { error } = await admin
		.from("payment_drafts")
		.update({
			status: "disetujui",
			bank_account_id: bankAccountId,
			disetujui_at: new Date().toISOString(),
			disetujui_via: "app",
			disetujui_oleh: actorId,
			updated_by: actorId,
		})
		.eq("id", d.id)
		.eq("status", "menunggu");
	if (error) return { ok: false, error: error.message };
	// Booking sudah punya event → langsung masuk buku (DR-055).
	const tercatat = await postIfEventExists(admin, d, actorId, {
		kirimLangsung: opts.kirim,
	});
	await resolveDraftNotifications(admin, d.id);
	return { ok: true, tercatat };
}

/** Tolak/batalkan bukti — tetap tersimpan sebagai jejak, tidak masuk buku. */
export async function batalCore(
	admin: SupabaseClient,
	d: DraftRow,
	actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const { error } = await admin
		.from("payment_drafts")
		.update({
			status: "dibatalkan",
			dibatalkan_at: new Date().toISOString(),
			dibatalkan_oleh: actorId,
			updated_by: actorId,
		})
		.eq("id", d.id)
		.in("status", ["menunggu", "disetujui"]);
	if (error) return { ok: false, error: error.message };
	await resolveDraftNotifications(admin, d.id);
	return { ok: true };
}

/** Lonceng "bukti transfer masuk" selesai begitu bukti ditangani. */
export async function resolveDraftNotifications(
	admin: SupabaseClient,
	draftId: string,
) {
	const now = new Date().toISOString();
	const { error } = await admin
		.from("notifications")
		.update({
			is_read: true,
			read_at: now,
			is_resolved: true,
			resolved_at: now,
		})
		.eq("entity_type", "payment_draft")
		.eq("entity_id", draftId)
		.eq("is_resolved", false);
	if (error) console.error("[payment-drafts] resolve notif:", error.message);
}

/**
 * Bukti transfer baru dari bot → kartu di grup owner Telegram + lonceng app
 * (DR-059). Tombol: catat & kirim terima kasih / catat saja / tolak — diproses
 * `handleDraftTap` (hanya owner terdaftar). Yang sudah tercatat otomatis cukup
 * dikabarkan.
 */
export async function offerDraftToOwner(d: DraftRow): Promise<void> {
	if (d.status === "dibatalkan") return;
	const admin = createAdminClient();
	const evId = await eventOfDraft(admin, d);
	const [{ data: ev }, { data: ib }] = await Promise.all([
		evId
			? admin
					.from("events")
					.select("project_id, client_name")
					.eq("id", evId)
					.maybeSingle()
			: Promise.resolve({ data: null }),
		d.booking_inbox_id
			? admin
					.from("booking_inbox")
					.select("client_name")
					.eq("id", d.booking_inbox_id)
					.maybeSingle()
			: Promise.resolve({ data: null }),
	]);
	const klien =
		(ev?.client_name as string | undefined) ??
		(ib?.client_name as string | undefined) ??
		d.nama_klien ??
		"klien belum dikenali";
	const tagihan =
		d.status === "menunggu"
			? await tagihanDraft(
					admin,
					{
						booking_inbox_id: d.booking_inbox_id,
						document_id: d.document_id,
						event_id: evId,
					},
					d.id,
				)
			: null;
	const sisa = tagihan?.sisa ?? null;
	const jenis = tagihan
		? JENIS_BAYAR_LABEL[jenisBayar({ ...tagihan, nominal: d.nominal })]
		: "transfer";
	const nominal = d.nominal ? rpx(d.nominal) : "nominal belum terbaca";
	const bank =
		[d.bank_pengirim, d.bank_tujuan].filter(Boolean).join(" → ") || "bank ?";
	const lines = [
		`💸 <b>Bukti ${jenis} masuk</b> — ${tgEscape(klien)}${ev ? ` (${ev.project_id})` : ""}`,
		`<b>${nominal}</b> · ${tgEscape(bank)}`,
		`Pengirim: ${tgEscape(d.nama_pengirim ?? "—")}`,
	];
	if (sisa != null && d.nominal)
		lines.push(
			`Sisa tagihan: ${rpx(sisa)} → ${sisa - d.nominal <= 0 ? "lunas" : rpx(sisa - d.nominal)}`,
		);
	lines.push(
		d.status === "tercatat"
			? "✅ Sudah tercatat otomatis (admin konfirmasi di WA + syarat lolos)."
			: d.status === "disetujui"
				? "✅ Disetujui otomatis — masuk buku saat event dibuat."
				: evId
					? "Cocokkan dengan mutasi bank, lalu pilih:"
					: "Event belum dibuat — yang disetujui masuk buku saat event dibuat.",
	);

	const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
	type Btn = { text: string; callback_data?: string; url?: string };
	const rows: Btn[][] = [];
	if (d.status === "menunggu" && d.nominal) {
		if (evId) {
			rows.push([
				{
					text: "✅ Masuk — catat & kirim terima kasih",
					callback_data: `dp:k:${d.id}`,
				},
			]);
			rows.push([
				{ text: "📝 Catat saja", callback_data: `dp:c:${d.id}` },
				{ text: "❌ Tolak", callback_data: `dp:x:${d.id}` },
			]);
		} else
			rows.push([
				{ text: "✅ Setujui", callback_data: `dp:c:${d.id}` },
				{ text: "❌ Tolak", callback_data: `dp:x:${d.id}` },
			]);
	}
	if (app.startsWith("https://"))
		rows.push([
			...(d.bukti_file_id
				? [
						{
							text: "🧾 Lihat bukti",
							url: `${app}/api/payment-drafts/${d.id}/bukti`,
						},
					]
				: []),
			{ text: "Buka Uang Masuk", url: `${app}/billing/uang-masuk` },
		]);

	if (isTelegramConfigured()) {
		const { chatId } = await ownerGroupChatId(admin);
		if (chatId)
			await sendTelegramMessage(chatId, lines.join("\n"), {
				replyMarkup: rows as never,
			});
	}
	if (d.status !== "menunggu") return;
	const { data: owners } = await admin
		.from("users")
		.select("id")
		.eq("is_active", true)
		.is("deleted_at", null)
		.in("role", ["owner", "super_admin"]);
	if (!owners?.length) return;
	const { error } = await admin.from("notifications").insert(
		owners.map((u) => ({
			user_id: u.id,
			severity: "warning",
			category: "financial",
			title: `Bukti ${jenis} masuk: ${nominal} dari ${klien}`,
			body: "Cocokkan dengan mutasi bank, lalu konfirmasi di Uang Masuk.",
			entity_type: "payment_draft",
			entity_id: d.id,
			action_url: "/billing/uang-masuk",
		})),
	);
	if (error) console.error("[payment-drafts] notif:", error.message);
}

/** Disetujui untuk booking yang sudah punya event → langsung posting. */
export async function postIfEventExists(
	admin: SupabaseClient,
	d: Pick<DraftRow, "event_id" | "booking_inbox_id" | "document_id">,
	actorId: string | null,
	opts: PostOpts = {},
): Promise<boolean> {
	const ev = await eventOfDraft(admin, d);
	if (!ev) return false;
	const actor = actorId ?? (await resolveOwnerActorId(admin));
	if (!actor) {
		console.error("[payment-drafts] posting: owner pelaku tidak ditemukan");
		return false;
	}
	return (await postApprovedDrafts(ev, actor, opts)).posted > 0;
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

export type SenderHit = {
	key: string;
	nama: string;
	klien: string;
	nominal: number | null;
	tanggal: string;
	keterangan: string;
	href: string;
};

/**
 * Cari nama pemilik rekening pengirim (mutasi bank → klien mana). Draft yang
 * belum masuk buku + pembayaran tercatat (sender_name / payer_name).
 */
export async function searchSender(
	supabase: SupabaseClient,
	raw: string,
): Promise<SenderHit[]> {
	const q = raw.replace(/[,()*%\\]/g, " ").trim();
	if (q.length < 3) return [];
	const [drafts, pays] = await Promise.all([
		supabase
			.from("payment_drafts")
			.select(
				"id, nama_pengirim, nama_klien, nominal, status, created_at, waktu_transfer, booking_inbox_id, booking:booking_inbox(client_name)",
			)
			.ilike("nama_pengirim", `%${q}%`)
			.neq("status", "tercatat")
			.order("created_at", { ascending: false })
			.limit(20),
		supabase
			.from("payments")
			.select(
				"id, amount, payment_date, sender_name, payer_name, event:events(project_id, client_name)",
			)
			.or(`sender_name.ilike.*${q}*,payer_name.ilike.*${q}*`)
			.eq("is_reversed", false)
			.order("payment_date", { ascending: false })
			.limit(20),
	]);
	if (drafts.error) throw new Error(`payment_drafts: ${drafts.error.message}`);
	if (pays.error) throw new Error(`payments: ${pays.error.message}`);
	const out: SenderHit[] = [];
	for (const d of drafts.data ?? []) {
		// to-one embed = objek.
		const b = d.booking as { client_name?: string | null } | null;
		out.push({
			key: `d-${d.id}`,
			nama: d.nama_pengirim as string,
			klien:
				b?.client_name ||
				(d.nama_klien as string | null) ||
				"Klien belum diketahui",
			nominal: (d.nominal as number | null) ?? null,
			tanggal: ((d.waktu_transfer ?? d.created_at) as string).slice(0, 10),
			keterangan:
				d.status === "dibatalkan"
					? "Bukti DP dibatalkan"
					: "Bukti DP belum masuk buku",
			href: d.booking_inbox_id
				? `/operations/booking-masuk/${d.booking_inbox_id}`
				: "/operations/booking-masuk",
		});
	}
	for (const p of pays.data ?? []) {
		const ev = p.event as { project_id?: string; client_name?: string } | null;
		out.push({
			key: `p-${p.id}`,
			nama: ((p.sender_name ?? p.payer_name) as string) || q,
			klien: ev?.client_name ?? "—",
			nominal: p.amount as number,
			tanggal: p.payment_date as string,
			keterangan: "Pembayaran tercatat",
			href: ev?.project_id
				? `/operations/${ev.project_id}/payments`
				: "/billing",
		});
	}
	return out.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/**
 * Kirim webhook "pembayaran tercatat" ke Hermes dengan coba ulang. Alamat
 * dibaca ulang tiap percobaan (quick tunnel bisa berganti). 400/401 = isi /
 * tanda tangan salah → tidak diulang.
 */
export async function kirimWebhookPembayaran(
	admin: SupabaseClient,
	payload: PembayaranTercatat,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const secret = process.env.WEBHOOK_PEMBAYARAN_SECRET?.trim();
	if (!secret)
		return { ok: false, error: "WEBHOOK_PEMBAYARAN_SECRET belum diisi" };
	let last = "";
	for (const wait of [0, 2000, 5000]) {
		if (wait) await new Promise((r) => setTimeout(r, wait));
		const { data } = await admin
			.from("system_config")
			.select("value")
			.eq("key", HERMES_URL_CONFIG_KEY)
			.maybeSingle();
		const url = webhookUrl(data?.value);
		if (!url) {
			last = "alamat Hermes belum terdaftar";
			continue;
		}
		try {
			const req = signedRequest(secret, payload);
			const r = await fetch(url, {
				method: "POST",
				headers: req.headers,
				body: req.body,
				signal: AbortSignal.timeout(10_000),
			});
			if (r.ok) return { ok: true };
			last = `Hermes menjawab ${r.status}: ${(await r.text()).slice(0, 160)}`;
			if (r.status === 400 || r.status === 401) break;
		} catch (e) {
			last = `Hermes tidak terjangkau: ${e instanceof Error ? e.message : String(e)}`;
		}
	}
	return { ok: false, error: last };
}

type Posted = {
	paymentId: string;
	docs: Array<{ id: string; docType: string; docNumber: string }>;
	lunas: boolean;
	sisaSesudah: number;
	paymentType: PaymentType;
	nominal: number;
};

/**
 * Owner menekan "Konfirmasi & kirim terima kasih": nota lunas (kalau lunas)
 * atau kuitansi terkirim dengan pesan bawaan ("terima kasih, pembayaran sudah
 * kami terima"). Gagal kirim → cadangan tawaran 1-tap ke grup owner.
 */
async function kirimTerimaKasih(eventId: string, res: Posted, actorId: string) {
	const admin = createAdminClient();
	const pick =
		(res.lunas && res.docs.find((x) => x.docType === "nota_lunas")) ||
		res.docs.find((x) => x.docType === "receipt");
	let sent = false;
	if (pick) {
		const { data: doc } = await admin
			.from("documents")
			.select("*")
			.eq("id", pick.id)
			.maybeSingle();
		if (doc) {
			const r = await sendDocumentCore(
				admin,
				{
					documentId: pick.id,
					pesan: await defaultClientMessage(admin, doc as DocumentRow),
					nomor: null,
				},
				{ actorId },
			);
			sent = !("error" in r) && r.status !== "gagal";
			if (!sent)
				console.error(
					"[payment-drafts] kirim terima kasih:",
					JSON.stringify(r),
				);
		}
	}
	if (!sent && res.docs.length > 0)
		await offerPaymentDocsToOwner(
			eventId,
			{
				docs: res.docs as Parameters<typeof offerPaymentDocsToOwner>[1]["docs"],
				lunas: res.lunas,
				remaining: res.sisaSesudah,
			},
			res.paymentType,
			res.nominal,
		);
}

/**
 * Setelah DP dari draft tercatat: kabari Hermes (usulan kuitansi ke Rama).
 * Gagal → tandai "kuitansi belum disiapkan" + cadangan tawaran Telegram 1-tap.
 * Kuitansi tidak pernah terkirim ke klien dari sini.
 */
async function kabariHermes(d: DraftRow, eventId: string, res: Posted) {
	const admin = createAdminClient();
	const receipt = res.docs.find((x) => x.docType === "receipt") ?? null;
	const [{ data: ev }, { data: doc }] = await Promise.all([
		admin
			.from("events")
			.select("project_id, client_name")
			.eq("id", eventId)
			.maybeSingle(),
		d.document_id
			? admin
					.from("documents")
					.select("doc_number")
					.eq("id", d.document_id)
					.maybeSingle()
			: Promise.resolve({ data: null as { doc_number: string } | null }),
	]);
	const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
	const r = await kirimWebhookPembayaran(admin, {
		draft_id: d.id,
		nama_klien: (ev?.client_name as string | null) ?? d.nama_klien,
		client_wa: d.client_wa,
		nominal: res.nominal,
		nama_pengirim: d.nama_pengirim,
		invoice_no:
			(doc?.doc_number as string | undefined) ??
			d.invoice_no ??
			res.docs.find((x) => x.docType === "invoice")?.docNumber ??
			null,
		booking_inbox_id: d.booking_inbox_id,
		booking_id: d.booking_inbox_id,
		event_id: eventId,
		project_id: (ev?.project_id as string | null) ?? null,
		payment_id: res.paymentId,
		kuitansi_no: receipt?.docNumber ?? null,
		kuitansi_url:
			receipt && appUrl ? `${appUrl}/finance/dokumen/${receipt.id}` : null,
	});
	await admin
		.from("payment_drafts")
		.update(
			r.ok
				? { kuitansi_status: "dikabarkan_ke_hermes", kuitansi_catatan: null }
				: { kuitansi_status: "belum_disiapkan", kuitansi_catatan: r.error },
		)
		.eq("id", d.id);
	if (!r.ok && res.docs.length > 0)
		await offerPaymentDocsToOwner(
			eventId,
			{
				docs: res.docs as Parameters<typeof offerPaymentDocsToOwner>[1]["docs"],
				lunas: res.lunas,
				remaining: res.sisaSesudah,
			},
			res.paymentType,
			res.nominal,
		);
}
