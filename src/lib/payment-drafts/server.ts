import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { HERMES_URL_CONFIG_KEY } from "@/lib/ai/hermes";
import { resolveOwnerActorId } from "@/lib/auth/owner-actor";
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
import {
	checkPayment,
	logPaymentCore,
	offerPaymentDocsToOwner,
	type PaymentType,
} from "@/lib/finance/payment-core";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	type BankLite,
	BotDraftSchema,
	type DraftRow,
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
		return reply(await afterApproval(admin, data as DraftRow));
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
export async function postApprovedDrafts(
	eventId: string,
	actorId: string,
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
		const r = await postDraft(admin, d, eventId, actorId);
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
	const paymentType: PaymentType =
		g.sisaSesudah <= 0
			? "pelunasan"
			: g.billable - g.sisaSebelum <= 0
				? "dp"
				: "partial";
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
			kabariHermes(d, eventId, posted).catch((e) =>
				console.error("[payment-drafts] kabari Hermes:", e),
			),
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

/** Disetujui untuk booking yang sudah punya event → langsung posting. */
export async function postIfEventExists(
	admin: SupabaseClient,
	d: Pick<DraftRow, "event_id" | "booking_inbox_id" | "document_id">,
	actorId: string | null,
): Promise<boolean> {
	const ev = await eventOfDraft(admin, d);
	if (!ev) return false;
	const actor = actorId ?? (await resolveOwnerActorId(admin));
	if (!actor) {
		console.error("[payment-drafts] posting: owner pelaku tidak ditemukan");
		return false;
	}
	return (await postApprovedDrafts(ev, actor)).posted > 0;
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

/**
 * Setelah DP dari draft tercatat: kabari Hermes (usulan kuitansi ke Rama).
 * Gagal → tandai "kuitansi belum disiapkan" + cadangan tawaran Telegram 1-tap.
 * Kuitansi tidak pernah terkirim ke klien dari sini.
 */
async function kabariHermes(
	d: DraftRow,
	eventId: string,
	res: {
		paymentId: string;
		docs: Array<{ id: string; docType: string; docNumber: string }>;
		lunas: boolean;
		sisaSesudah: number;
		paymentType: PaymentType;
		nominal: number;
	},
) {
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
