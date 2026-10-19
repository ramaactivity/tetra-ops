"use server";

/**
 * Uang jalan crew — sisi owner (DR-049). Memberi uang di muka (Dr 1-320 /
 * Cr kas-bank), menerima sisa yang dikembalikan (Dr kas-bank / Cr 1-320), dan
 * membatalkan catatan yang salah (jurnal pembalik). Pemotongan dari fee terjadi
 * otomatis di payCrewFee.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordQuickTransactionCore } from "@/lib/actions/journal-entries";
import { getCurrentUser } from "@/lib/auth/get-user";
import { insufficientBalanceError } from "@/lib/finance/balance-guard";
import { findCategory } from "@/lib/finance/quick-record-categories";
import { TALANGAN_OWNER_COA, uraiPelunasan } from "@/lib/rekap/uang-jalan";
import { loadTalanganOwner, saldoUangJalanDb } from "@/lib/rekap/uang-jalan-db";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; note?: string } | { ok: false; error: string };

const ref = (d: Date) =>
	`JE-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
		Math.random() * 0xffffffff,
	)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase()}`;

const Input = z.object({
	eventId: z.uuid(),
	projectId: z.string().min(1).max(40),
	userId: z.uuid(),
	amount: z.coerce.number().int().positive().max(50_000_000),
	accountCode: z.string().min(1).max(20),
	/** Owner yang memberi (beri) / menerima sisa (kembali). */
	ownerId: z.uuid().nullish(),
	/** Uang pribadi owner (bukan rekening Tetra) → utang ke owner di 2-310. */
	pribadi: z.boolean().optional(),
	method: z.enum(["tunai", "transfer"]).optional(),
	proofUrl: z.url().max(1000).nullish(),
	/** Biaya admin transfer (hanya saat memberi lewat transfer) → 5-600. */
	adminFee: z.coerce.number().int().min(0).max(100_000).optional(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function owner() {
	const me = await getCurrentUser();
	return me &&
		(me.profile.role === "owner" || me.profile.role === "super_admin")
		? me
		: null;
}

async function post(kind: "beri" | "kembali", raw: unknown): Promise<Result> {
	const me = await owner();
	if (!me) return { ok: false, error: "Hanya owner." };
	const p = Input.safeParse(raw);
	if (!p.success)
		return {
			ok: false,
			error: p.error.issues[0]?.message ?? "Isian belum valid.",
		};
	const { eventId, projectId, userId, amount, method, date } = p.data;
	const ownerId = p.data.ownerId ?? null;
	const pribadi = Boolean(p.data.pribadi);
	if (kind === "beri" && !ownerId)
		return { ok: false, error: "Pilih siapa yang memberi uang jalan." };
	if (pribadi && !ownerId)
		return { ok: false, error: "Pilih owner pemilik uangnya." };
	const accountCode = pribadi ? TALANGAN_OWNER_COA : p.data.accountCode;
	const proofUrl = p.data.proofUrl ?? null;
	// Admin dari rekening pribadi owner ikut jadi hutang Tetra ke owner itu.
	const admin =
		kind === "beri" && method === "transfer" ? (p.data.adminFee ?? 0) : 0;
	const db = await createClient();
	const { data: acct } = await db
		.from("chart_of_accounts")
		.select("code, name, account_type, is_active")
		.eq("code", accountCode)
		.maybeSingle();
	if (
		!pribadi &&
		(!acct?.is_active ||
			acct.account_type !== "asset" ||
			accountCode === "1-320")
	)
		return { ok: false, error: "Pilih rekening kas/bank yang aktif." };
	let ownerName = "";
	if (ownerId) {
		const { data: o } = await db
			.from("users")
			.select("full_name, nickname, role")
			.eq("id", ownerId)
			.maybeSingle();
		if (o?.role !== "owner" && o?.role !== "super_admin")
			return { ok: false, error: "Pemberi harus owner." };
		ownerName = (o.nickname as string | null) || (o.full_name as string);
	}
	const { data: u } = await db
		.from("users")
		.select("full_name, nickname")
		.eq("id", userId)
		.maybeSingle();
	const nama =
		(u?.nickname as string | null) || (u?.full_name as string | null) || "crew";

	if (kind === "beri" && !pribadi) {
		const saldoErr = await insufficientBalanceError(
			db,
			accountCode,
			acct?.name as string,
			amount + admin,
		);
		if (saldoErr) return { ok: false, error: saldoErr };
	} else if (kind === "kembali") {
		const saldo = await saldoUangJalanDb(db, eventId, userId);
		if (amount > saldo)
			return {
				ok: false,
				error: `Uang jalan yang masih dipegang ${nama} hanya ${saldo.toLocaleString("id-ID")}.`,
			};
	}

	const { data: entry, error: ee } = await db
		.from("journal_entries")
		.insert({
			ref_id: ref(new Date(date)),
			entry_date: date,
			entry_type: "transfer",
			description:
				(kind === "beri"
					? `Uang jalan untuk ${nama}`
					: `Sisa uang jalan dari ${nama}`) +
				(ownerName
					? ` (${kind === "beri" ? "dari" : "ke"} ${ownerName}${pribadi ? ", uang pribadi" : ""})`
					: ""),
			source_type: kind === "beri" ? "uang_jalan" : "uang_jalan_kembali",
			source_event_id: eventId,
			total_amount: amount + admin,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (ee || !entry)
		return { ok: false, error: `Gagal catat jurnal: ${ee?.message ?? "?"}` };
	const lines =
		kind === "beri"
			? [
					{
						account_code: "1-320",
						debit_amount: amount,
						credit_amount: 0,
						description: `Uang jalan ${nama}`,
					},
					...(admin > 0
						? [
								{
									account_code: "5-600",
									debit_amount: admin,
									credit_amount: 0,
									description: "Biaya admin transfer uang jalan",
								},
							]
						: []),
					{
						account_code: accountCode,
						debit_amount: 0,
						credit_amount: amount + admin,
						description: pribadi
							? `Talangan uang pribadi ${ownerName}`
							: "Kas/bank keluar",
					},
				]
			: [
					{
						account_code: accountCode,
						debit_amount: amount,
						credit_amount: 0,
						description: pribadi
							? `Sisa dikembalikan ke ${ownerName}`
							: "Kas/bank masuk",
					},
					{
						account_code: "1-320",
						debit_amount: 0,
						credit_amount: amount,
						description: `Sisa uang jalan ${nama}`,
					},
				];
	const { error: le } = await db
		.from("journal_lines")
		.insert(
			lines.map((l, i) => ({ ...l, entry_id: entry.id, line_order: i + 1 })),
		);
	if (le) {
		await db.from("journal_entries").delete().eq("id", entry.id);
		return { ok: false, error: `Gagal catat jurnal: ${le.message}` };
	}
	const { error: ie } = await db.from("uang_jalan").insert({
		event_id: eventId,
		user_id: userId,
		kind,
		amount,
		method: method ?? null,
		proof_url: proofUrl,
		account_code: accountCode,
		owner_id: ownerId,
		admin_fee: admin,
		journal_id: entry.id,
		created_by: me.profile.id,
	});
	if (ie) {
		await db.from("journal_lines").delete().eq("entry_id", entry.id);
		await db.from("journal_entries").delete().eq("id", entry.id);
		return { ok: false, error: ie.message };
	}
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath("/finance");
	return {
		ok: true,
		note:
			kind === "beri"
				? `Uang jalan untuk ${nama} tercatat`
				: `Sisa uang jalan dari ${nama} diterima`,
	};
}

/** Owner memberi uang jalan (tunai / transfer / top-up). */
export async function beriUangJalan(raw: unknown): Promise<Result> {
	return post("beri", raw);
}

/** Owner menerima sisa uang jalan yang dikembalikan crew. */
export async function terimaSisaUangJalan(raw: unknown): Promise<Result> {
	return post("kembali", raw);
}

/** Batalkan catatan uang jalan yang salah (beri/kembali) dengan jurnal pembalik. */
export async function batalUangJalan(
	id: string,
	projectId: string,
): Promise<Result> {
	const me = await owner();
	if (!me) return { ok: false, error: "Hanya owner." };
	if (!z.uuid().safeParse(id).success)
		return { ok: false, error: "Catatan tidak ditemukan." };
	const db = await createClient();
	const { data: r } = await db
		.from("uang_jalan")
		.select("id, kind, event_id, user_id, amount, journal_id, is_reversed")
		.eq("id", id)
		.maybeSingle();
	if (!r || r.is_reversed)
		return { ok: false, error: "Catatan tidak ditemukan." };
	if (r.kind === "potong_fee")
		return {
			ok: false,
			error: "Potongan fee dibatalkan lewat Batalkan bayar fee.",
		};
	if (r.kind === "beri") {
		const saldo = await saldoUangJalanDb(
			db,
			r.event_id as string,
			r.user_id as string,
		);
		if (saldo < Number(r.amount))
			return {
				ok: false,
				error:
					"Uang jalan ini sudah terpakai untuk potong fee / sudah dikembalikan. Batalkan itu dulu.",
			};
	}
	const balik = await balikJurnal(db, r.journal_id as string, {
		description: "Pembatalan catatan uang jalan",
		sourceType: "uang_jalan_reversal",
		eventId: r.event_id as string,
		amount: Number(r.amount),
		by: me.profile.id,
	});
	if (balik) return { ok: false, error: balik };
	await db.from("uang_jalan").update({ is_reversed: true }).eq("id", r.id);
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	return { ok: true, note: "Catatan dibatalkan" };
}

/**
 * Jurnal pembalik (debit↔kredit) + tandai jurnal asal dibatalkan. Ditolak kalau
 * pembalikan bikin saldo kas/bank minus. Mengembalikan pesan error atau null.
 */
async function balikJurnal(
	// biome-ignore lint/suspicious/noExplicitAny: klien Supabase server.
	db: any,
	journalId: string,
	o: {
		description: string;
		sourceType: string;
		eventId: string | null;
		amount: number;
		by: string;
	},
): Promise<string | null> {
	const { data: orig } = await db
		.from("journal_lines")
		.select("account_code, debit_amount, credit_amount, description")
		.eq("entry_id", journalId);
	const lines = (orig ?? []) as Array<{
		account_code: string;
		debit_amount: number | string | null;
		credit_amount: number | string | null;
		description: string | null;
	}>;
	// Uang yang dulu MASUK ke kas/bank akan keluar lagi saat dibalik.
	for (const l of lines) {
		const out = Number(l.debit_amount ?? 0);
		if (out <= 0 || !/^1-1\d{2}$/.test(l.account_code)) continue;
		const { data: c } = await db
			.from("chart_of_accounts")
			.select("name")
			.eq("code", l.account_code)
			.maybeSingle();
		const err = await insufficientBalanceError(
			db,
			l.account_code,
			(c?.name as string | undefined) ?? l.account_code,
			out,
		);
		if (err) return err;
	}
	const { data: rev, error: re } = await db
		.from("journal_entries")
		.insert({
			ref_id: ref(new Date()),
			entry_date: new Date(Date.now() + 7 * 3600_000)
				.toISOString()
				.slice(0, 10),
			entry_type: "reversal",
			description: o.description,
			source_type: o.sourceType,
			source_event_id: o.eventId,
			total_amount: o.amount,
			created_by: o.by,
		})
		.select("id")
		.single();
	if (re || !rev) return re?.message ?? "Gagal membuat jurnal pembalik.";
	const { error: le } = await db.from("journal_lines").insert(
		lines.map((l, i) => ({
			entry_id: rev.id,
			account_code: l.account_code,
			debit_amount: Number(l.credit_amount ?? 0),
			credit_amount: Number(l.debit_amount ?? 0),
			description: `Pembalik — ${l.description ?? ""}`.slice(0, 200),
			line_order: i + 1,
		})),
	);
	if (le) {
		await db.from("journal_entries").delete().eq("id", rev.id);
		return `Gagal membuat jurnal pembalik: ${le.message}`;
	}
	await db
		.from("journal_entries")
		.update({ is_reversed: true, reversed_by_entry_id: rev.id })
		.eq("id", journalId);
	return null;
}

const Bayar = z.object({
	ownerId: z.uuid(),
	direction: z.enum(["bayar", "terima"]),
	amount: z.coerce.number().int().positive().max(100_000_000),
	accountCode: z.string().min(1).max(20),
	adminFee: z.coerce.number().int().min(0).max(100_000).optional(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	eventId: z.uuid().nullish(),
});

/**
 * Lunasi / cicil hutang-piutang Tetra ↔ owner (akumulasi semua acara):
 *   bayar  — Tetra transfer ke owner: Dr 2-310 / Cr kas-bank
 *   terima — owner setor ke Tetra:    Dr kas-bank / Cr 2-310
 */
export async function bayarTalanganOwner(
	raw: unknown,
): Promise<
	{ ok: true; note: string; refId: string } | { ok: false; error: string }
> {
	const me = await owner();
	if (!me) return { ok: false, error: "Hanya owner." };
	const p = Bayar.safeParse(raw);
	if (!p.success)
		return {
			ok: false,
			error: p.error.issues[0]?.message ?? "Isian belum valid.",
		};
	const { ownerId, direction, amount, accountCode, date } = p.data;
	const bayar = direction === "bayar";
	const admin = bayar ? (p.data.adminFee ?? 0) : 0;
	const db = await createClient();
	const { data: acct } = await db
		.from("chart_of_accounts")
		.select("name, account_type, is_active")
		.eq("code", accountCode)
		.maybeSingle();
	if (
		!acct?.is_active ||
		acct.account_type !== "asset" ||
		accountCode === "1-320"
	)
		return { ok: false, error: "Pilih rekening kas/bank yang aktif." };
	const row = (await loadTalanganOwner(db)).find((o) => o.id === ownerId);
	const nama = row?.name ?? "owner";
	const sisa = bayar ? (row?.saldo ?? 0) : -(row?.saldo ?? 0);
	if (sisa <= 0)
		return {
			ok: false,
			error: bayar
				? `Tetra tidak sedang berutang ke ${nama}.`
				: `${nama} tidak sedang berutang ke Tetra.`,
		};
	if (amount > sisa)
		return {
			ok: false,
			error: `Maksimal ${sisa.toLocaleString("id-ID")} (sisa hutangnya).`,
		};
	if (bayar) {
		const saldoErr = await insufficientBalanceError(
			db,
			accountCode,
			acct.name as string,
			amount + admin,
		);
		if (saldoErr) return { ok: false, error: saldoErr };
	}
	const refId = ref(new Date(date));
	// Keterangan: item mana yang dilunasi (apa · acara · kapan), paling lama dulu.
	const rincian = bayar ? uraiPelunasan(row?.rincian ?? [], amount) : "";

	const { data: entry, error: ee } = await db
		.from("journal_entries")
		.insert({
			ref_id: refId,
			entry_date: date,
			entry_type: "transfer",
			description: (bayar
				? `Bayar hutang ke ${nama}${rincian ? ` — ${rincian}` : ""}`
				: `Terima pelunasan hutang dari ${nama}`
			).slice(0, 300),
			source_type: "talangan_owner",
			source_event_id: p.data.eventId ?? null,
			total_amount: amount + admin,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (ee || !entry)
		return { ok: false, error: `Gagal catat jurnal: ${ee?.message ?? "?"}` };
	const lines = bayar
		? [
				{
					account_code: TALANGAN_OWNER_COA,
					debit_amount: amount,
					credit_amount: 0,
					description: `Bayar hutang ke ${nama}`,
				},
				...(admin > 0
					? [
							{
								account_code: "5-600",
								debit_amount: admin,
								credit_amount: 0,
								description: "Biaya admin transfer ke owner",
							},
						]
					: []),
				{
					account_code: accountCode,
					debit_amount: 0,
					credit_amount: amount + admin,
					description: "Kas/bank keluar",
				},
			]
		: [
				{
					account_code: accountCode,
					debit_amount: amount,
					credit_amount: 0,
					description: "Kas/bank masuk",
				},
				{
					account_code: TALANGAN_OWNER_COA,
					debit_amount: 0,
					credit_amount: amount,
					description: `Pelunasan hutang ${nama}`,
				},
			];
	const rollback = async () => {
		await db.from("journal_lines").delete().eq("entry_id", entry.id);
		await db.from("journal_entries").delete().eq("id", entry.id);
	};
	const { error: le } = await db
		.from("journal_lines")
		.insert(
			lines.map((l, i) => ({ ...l, entry_id: entry.id, line_order: i + 1 })),
		);
	if (le) {
		await rollback();
		return { ok: false, error: `Gagal catat jurnal: ${le.message}` };
	}
	const { error: ie } = await db.from("talangan_owner_bayar").insert({
		owner_id: ownerId,
		direction,
		amount,
		account_code: accountCode,
		journal_id: entry.id,
		event_id: p.data.eventId ?? null,
		note: rincian || null,
		created_by: me.profile.id,
	});
	if (ie) {
		await rollback();
		return { ok: false, error: ie.message };
	}
	revalidatePath("/finance");
	revalidatePath("/dashboard");
	return {
		ok: true,
		refId,
		note: bayar
			? `Pembayaran ke ${nama} tercatat`
			: `Pelunasan dari ${nama} tercatat`,
	};
}

/** Batalkan pembayaran/penerimaan hutang owner yang salah (jurnal pembalik). */
export async function batalBayarTalangan(id: string): Promise<Result> {
	const me = await owner();
	if (!me) return { ok: false, error: "Hanya owner." };
	if (!z.uuid().safeParse(id).success)
		return { ok: false, error: "Catatan tidak ditemukan." };
	const db = await createClient();
	const { data: r } = await db
		.from("talangan_owner_bayar")
		.select("id, direction, amount, journal_id, event_id, is_reversed")
		.eq("id", id)
		.maybeSingle();
	if (!r || r.is_reversed || !r.journal_id)
		return { ok: false, error: "Catatan tidak ditemukan." };
	// Hutang dari biaya acara dibatalkan di rekap / jurnal acaranya, supaya
	// biaya acara & hutangnya batal bersama.
	if (r.event_id && (r.direction === "talangan" || r.direction === "piutang"))
		return {
			ok: false,
			error: "Catatan ini dari acara — batalkan dari rekap / jurnal acaranya.",
		};
	const balik = await balikJurnal(db, r.journal_id as string, {
		description: "Pembatalan catatan hutang-piutang owner",
		sourceType: "talangan_owner_reversal",
		eventId: (r.event_id as string | null) ?? null,
		amount: Number(r.amount),
		by: me.profile.id,
	});
	if (balik) return { ok: false, error: balik };
	await db
		.from("talangan_owner_bayar")
		.update({ is_reversed: true })
		.eq("id", r.id);
	revalidatePath("/finance");
	revalidatePath("/dashboard");
	return { ok: true, note: "Catatan dibatalkan" };
}

const Catat = z.object({
	ownerId: z.uuid(),
	/**
	 * biaya    — owner bayarin biaya Tetra pakai uang pribadi (Dr beban / Cr 2-310)
	 * pinjaman — owner meminjamkan uang ke rekening Tetra (Dr kas-bank / Cr 2-310)
	 * piutang  — owner pinjam / pakai uang Tetra (Dr 2-310 / Cr kas-bank)
	 */
	jenis: z.enum(["biaya", "pinjaman", "piutang"]),
	amount: z.coerce.number().int().positive().max(500_000_000),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	note: z.string().trim().min(3, "Isi keterangannya (min. 3 huruf)").max(200),
	categoryId: z.string().trim().max(40).nullish(),
	accountCode: z.string().trim().max(20).nullish(),
});

/** Catat hutang / piutang owner langsung (bukan dari acara). */
export async function catatTalanganOwner(
	raw: unknown,
): Promise<
	{ ok: true; note: string; refId: string } | { ok: false; error: string }
> {
	const me = await owner();
	if (!me) return { ok: false, error: "Hanya owner." };
	const p = Catat.safeParse(raw);
	if (!p.success)
		return {
			ok: false,
			error: p.error.issues[0]?.message ?? "Isian belum valid.",
		};
	const { ownerId, jenis, amount, date, note } = p.data;
	const db = await createClient();
	const { data: o } = await db
		.from("users")
		.select("full_name, nickname, role")
		.eq("id", ownerId)
		.maybeSingle();
	if (o?.role !== "owner" && o?.role !== "super_admin")
		return { ok: false, error: "Pilih owner-nya." };
	const nama = (o.nickname as string | null) || (o.full_name as string);
	const done = (refId: string, msg: string) => {
		revalidatePath("/finance");
		revalidatePath("/dashboard");
		return { ok: true as const, note: msg, refId };
	};

	if (jenis === "biaya") {
		const cat = findCategory(p.data.categoryId ?? "");
		if (!cat || cat.entryType !== "expense" || !cat.coa.startsWith("5-"))
			return { ok: false, error: "Pilih kategori biayanya." };
		// Jalur Catat yang sama (beban + hutang ke owner ditulis bersama).
		const res = await recordQuickTransactionCore(db, me.profile.id, {
			direction: "keluar",
			amount,
			entry_date: date,
			account_code: TALANGAN_OWNER_COA,
			category_id: cat.id,
			note,
			talangan_owner_id: ownerId,
		});
		if (!res?.success || !res.refId)
			return { ok: false, error: res?.error ?? "Gagal mencatat." };
		return done(
			res.refId,
			`Tetra berutang ${amount.toLocaleString("id-ID")} ke ${nama}`,
		);
	}

	const accountCode = p.data.accountCode ?? "";
	const { data: acct } = await db
		.from("chart_of_accounts")
		.select("name, account_type, is_active")
		.eq("code", accountCode)
		.maybeSingle();
	if (
		!acct?.is_active ||
		acct.account_type !== "asset" ||
		accountCode === "1-320"
	)
		return { ok: false, error: "Pilih rekening kas/bank yang aktif." };
	const masuk = jenis === "pinjaman";
	if (!masuk) {
		const saldoErr = await insufficientBalanceError(
			db,
			accountCode,
			acct.name as string,
			amount,
		);
		if (saldoErr) return { ok: false, error: saldoErr };
	}
	const refId = ref(new Date(date));
	const { data: entry, error: ee } = await db
		.from("journal_entries")
		.insert({
			ref_id: refId,
			entry_date: date,
			entry_type: "transfer",
			description: (masuk
				? `${nama} meminjamkan uang ke Tetra — ${note}`
				: `${nama} pinjam / pakai uang Tetra — ${note}`
			).slice(0, 300),
			source_type: "talangan_owner",
			total_amount: amount,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (ee || !entry)
		return { ok: false, error: `Gagal catat jurnal: ${ee?.message ?? "?"}` };
	const lines = [
		{
			account_code: masuk ? accountCode : TALANGAN_OWNER_COA,
			debit_amount: amount,
			credit_amount: 0,
			description: masuk ? "Kas/bank masuk" : `Piutang ke ${nama}`,
		},
		{
			account_code: masuk ? TALANGAN_OWNER_COA : accountCode,
			debit_amount: 0,
			credit_amount: amount,
			description: masuk ? `Hutang ke ${nama}` : "Kas/bank keluar",
		},
	];
	const rollback = async () => {
		await db.from("journal_lines").delete().eq("entry_id", entry.id);
		await db.from("journal_entries").delete().eq("id", entry.id);
	};
	const { error: le } = await db
		.from("journal_lines")
		.insert(
			lines.map((l, i) => ({ ...l, entry_id: entry.id, line_order: i + 1 })),
		);
	if (le) {
		await rollback();
		return { ok: false, error: `Gagal catat jurnal: ${le.message}` };
	}
	const { error: ie } = await db.from("talangan_owner_bayar").insert({
		owner_id: ownerId,
		direction: masuk ? "talangan" : "piutang",
		amount,
		account_code: accountCode,
		journal_id: entry.id,
		note,
		created_by: me.profile.id,
	});
	if (ie) {
		await rollback();
		return { ok: false, error: ie.message };
	}
	return done(
		refId,
		masuk
			? `Tetra berutang ${amount.toLocaleString("id-ID")} ke ${nama}`
			: `${nama} berutang ${amount.toLocaleString("id-ID")} ke Tetra`,
	);
}

/** Tempel bukti (diunggah ke Arsip Nota) ke jurnal catatan hutang-piutang owner. */
export async function lampirBuktiTalangan(
	refId: string,
	url: string,
): Promise<Result> {
	const me = await owner();
	if (!me) return { ok: false, error: "Hanya owner." };
	if (!z.url().safeParse(url).success || refId.length > 40)
		return { ok: false, error: "Bukti tidak valid." };
	const db = await createClient();
	const { error } = await db
		.from("journal_entries")
		.update({ proof_url: url })
		.eq("ref_id", refId)
		.in("source_type", ["manual", "talangan_owner"]);
	if (error) return { ok: false, error: error.message };
	return { ok: true };
}
