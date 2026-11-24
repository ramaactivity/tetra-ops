import "server-only";

/**
 * Inti uang jalan crew (DR-049) tanpa cookie login: dipakai aksi owner
 * (Catat uang jalan) dan pencatatan otomatis dari laporan crew di rekap
 * (owner 24 Nov 2026 — laporan crew cukup, owner hanya melengkapi).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { insufficientBalanceError } from "@/lib/finance/balance-guard";
import {
	pegangRekeningTetra,
	rencanaDariLaporan,
	TALANGAN_OWNER_COA,
} from "@/lib/rekap/uang-jalan";
import { saldoUangJalanDb } from "@/lib/rekap/uang-jalan-db";

export type UangJalanResult =
	| { ok: true; note?: string }
	| { ok: false; error: string };

export const ref = (d: Date) =>
	`JE-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
		Math.random() * 0xffffffff,
	)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase()}`;

export const UangJalanInput = z.object({
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

export async function postUangJalan(
	db: SupabaseClient,
	actorId: string,
	kind: "beri" | "kembali",
	raw: unknown,
	opts: { dariLaporan?: boolean } = {},
): Promise<UangJalanResult> {
	const p = UangJalanInput.safeParse(raw);
	if (!p.success)
		return {
			ok: false,
			error: p.error.issues[0]?.message ?? "Isian belum valid.",
		};
	const { eventId, userId, amount, method, date } = p.data;
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
			created_by: actorId,
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
		dari_laporan: Boolean(opts.dariLaporan),
		created_by: actorId,
	});
	if (ie) {
		await db.from("journal_lines").delete().eq("entry_id", entry.id);
		await db.from("journal_entries").delete().eq("id", entry.id);
		return { ok: false, error: ie.message };
	}
	return {
		ok: true,
		note:
			kind === "beri"
				? `Uang jalan untuk ${nama} tercatat`
				: `Sisa uang jalan dari ${nama} diterima`,
	};
}

/** Jurnal pembalik untuk catatan uang jalan / talangan (dipakai aksi owner & sinkron laporan). */
export async function balikJurnal(
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

/** Satu baris laporan crew: uang jalan diterima dari satu owner. */
export type UjRincian = {
	owner_id: string;
	amount: number;
	method: "tunai" | "transfer";
	/** Tanggal diterima YYYY-MM-DD (kosong = tanggal acara). */
	tanggal?: string | null;
	bukti_url?: string | null;
};

/**
 * Laporan crew di rekap → buku uang jalan (owner 24 Nov 2026: "cukup crew
 * aja"). Hanya SELISIH laporan vs yang sudah tercatat yang dibukukan, jadi
 * catatan owner yang lebih dulu tidak dobel. Sumber dana ikut aturan 14 Nov:
 * owner pemegang rekening Tetra → rekening Tetra; owner lain → uang pribadi
 * (hutang Tetra di 2-310). Bukti dari crew dilampirkan ke catatan owner yang
 * belum punya bukti. Laporan yang turun TIDAK membatalkan apa pun — owner
 * yang memutuskan (panel memperingatkan selisihnya).
 */
export async function syncUangJalanDariLaporan(
	db: SupabaseClient,
	eventId: string,
	actorId: string,
	today: string,
): Promise<{ dicatat: number; catatan: string[] }> {
	const catatan: string[] = [];
	const [
		{ data: rk },
		{ data: ev },
		{ data: ledger },
		{ data: owners },
		{ data: banks },
	] = await Promise.all([
		db
			.from("crew_rekap")
			.select("uj_rincian, uj_holder")
			.eq("event_id", eventId)
			.maybeSingle(),
		db
			.from("events")
			.select("project_id, event_date")
			.eq("id", eventId)
			.maybeSingle(),
		db
			.from("uang_jalan")
			.select("id, user_id, owner_id, amount, proof_url, journal_id, dari_laporan")
			.eq("event_id", eventId)
			.eq("kind", "beri")
			.eq("is_reversed", false),
		db
			.from("users")
			.select("id, full_name")
			.in("role", ["owner", "super_admin"])
			.eq("is_active", true),
		db
			.from("bank_accounts")
			.select("account_holder, coa_code, is_default_receive")
			.eq("is_active", true)
			.eq("account_kind", "bank"),
	]);
	const rows = ((rk?.uj_rincian ?? []) as UjRincian[]).filter(
		(r) => r?.owner_id && Number(r.amount) > 0,
	);
	const holder = rk?.uj_holder as string | null | undefined;
	if (!rows.length || !holder || !ev) return { dicatat: 0, catatan };

	const mine = (ledger ?? []).filter((l) => l.user_id === holder);
	// Catatan otomatis milik laporan: dihitung ulang dari catatan MANUAL owner
	// saja, lalu disusun ulang kalau laporan (pemberi/nominal) berubah —
	// owner mengoreksi lewat Koreksi rekap (owner 24 Nov 2026).
	const manual = mine.filter((l) => !l.dari_laporan);
	const auto = mine.filter((l) => l.dari_laporan);
	let rencana = rencanaDariLaporan(
		rows.map((r) => ({ owner_id: r.owner_id, amount: Number(r.amount) })),
		manual.map((l) => ({
			owner_id: (l.owner_id as string | null) ?? null,
			amount: Number(l.amount),
		})),
	);
	const per = (xs: Array<{ owner: string; amount: number }>) =>
		JSON.stringify(
			Object.entries(
				xs.reduce<Record<string, number>>((m, x) => {
					m[x.owner] = (m[x.owner] ?? 0) + x.amount;
					return m;
				}, {}),
			).sort(),
		);
	const sama =
		per(
			rencana.map((x) => ({ owner: rows[x.index].owner_id, amount: x.amount })),
		) ===
		per(
			auto.map((l) => ({
				owner: l.owner_id as string,
				amount: Number(l.amount),
			})),
		);
	if (sama) rencana = [];
	else if (auto.length > 0) {
		const totalAuto = auto.reduce((t, l) => t + Number(l.amount), 0);
		if ((await saldoUangJalanDb(db, eventId, holder)) < totalAuto) {
			catatan.push(
				"uang jalan dari laporan sudah terpotong fee / dikembalikan — koreksi manual di panel uang jalan",
			);
			rencana = [];
		} else
			for (const l of auto) {
				const err = await balikJurnal(db, l.journal_id as string, {
					description: "Koreksi laporan uang jalan crew",
					sourceType: "uang_jalan_reversal",
					eventId,
					amount: Number(l.amount),
					by: actorId,
				});
				if (err) {
					catatan.push(err);
					rencana = [];
					break;
				}
				await db
					.from("uang_jalan")
					.update({ is_reversed: true })
					.eq("id", l.id);
			}
	}
	const holderNames = (banks ?? []).map(
		(b) => b.account_holder as string | null,
	);
	const tetraCoa =
		((banks ?? []).find((b) => b.is_default_receive)?.coa_code as
			| string
			| undefined) ??
		((banks ?? [])[0]?.coa_code as string | undefined) ??
		"1-110";
	const eventDate = (ev.event_date as string) ?? today;
	let dicatat = 0;

	for (const { index, amount } of rencana) {
		const r = rows[index];
		const o = (owners ?? []).find((x) => x.id === r.owner_id);
		if (!o) {
			catatan.push(`pemberi ${r.owner_id} bukan owner aktif`);
			continue;
		}
		const rekTetra = pegangRekeningTetra(o.full_name as string, holderNames);
		const tgl = r.tanggal && r.tanggal <= today ? r.tanggal : eventDate;
		const res = await postUangJalan(
			db,
			actorId,
			"beri",
			{
				eventId,
				projectId: ev.project_id,
				userId: holder,
				amount,
				accountCode: rekTetra ? tetraCoa : TALANGAN_OWNER_COA,
				ownerId: o.id,
				pribadi: !rekTetra,
				method: r.method,
				proofUrl: r.bukti_url || null,
				date: tgl > today ? today : tgl,
			},
			{ dariLaporan: true },
		);
		if (res.ok) dicatat += amount;
		else catatan.push(res.error);
	}
	// Bukti dari crew untuk catatan owner yang belum punya bukti.
	for (const r of rows) {
		if (!r.bukti_url) continue;
		const tanpaBukti = mine.find(
			(l) => l.owner_id === r.owner_id && !l.proof_url,
		);
		if (tanpaBukti)
			await db
				.from("uang_jalan")
				.update({ proof_url: r.bukti_url })
				.eq("id", tanpaBukti.id);
	}
	return { dicatat, catatan };
}
