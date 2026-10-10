"use server";

/**
 * Uang jalan crew — sisi owner (DR-049). Memberi uang di muka (Dr 1-320 /
 * Cr kas-bank), menerima sisa yang dikembalikan (Dr kas-bank / Cr 1-320), dan
 * membatalkan catatan yang salah (jurnal pembalik). Pemotongan dari fee terjadi
 * otomatis di payCrewFee.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { insufficientBalanceError } from "@/lib/finance/balance-guard";
import { saldoUangJalanDb } from "@/lib/rekap/uang-jalan-db";
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
	method: z.enum(["tunai", "transfer"]).optional(),
	proofUrl: z.url().max(1000).nullish(),
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
	const { eventId, projectId, userId, amount, accountCode, method, date } =
		p.data;
	const proofUrl = p.data.proofUrl ?? null;
	const db = await createClient();
	const { data: acct } = await db
		.from("chart_of_accounts")
		.select("code, name, account_type, is_active")
		.eq("code", accountCode)
		.maybeSingle();
	if (
		!acct?.is_active ||
		acct.account_type !== "asset" ||
		accountCode === "1-320"
	)
		return { ok: false, error: "Pilih rekening kas/bank yang aktif." };
	const { data: u } = await db
		.from("users")
		.select("full_name, nickname")
		.eq("id", userId)
		.maybeSingle();
	const nama =
		(u?.nickname as string | null) || (u?.full_name as string | null) || "crew";

	if (kind === "beri") {
		const saldoErr = await insufficientBalanceError(
			db,
			accountCode,
			acct.name as string,
			amount,
		);
		if (saldoErr) return { ok: false, error: saldoErr };
	} else {
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
				kind === "beri"
					? `Uang jalan untuk ${nama}`
					: `Sisa uang jalan dari ${nama}`,
			source_type: kind === "beri" ? "uang_jalan" : "uang_jalan_kembali",
			source_event_id: eventId,
			total_amount: amount,
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
					{
						account_code: accountCode,
						debit_amount: 0,
						credit_amount: amount,
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
	const { data: orig } = await db
		.from("journal_lines")
		.select("account_code, debit_amount, credit_amount, description")
		.eq("entry_id", r.journal_id);
	const { data: rev, error: re } = await db
		.from("journal_entries")
		.insert({
			ref_id: ref(new Date()),
			entry_date: new Date(Date.now() + 7 * 3600_000)
				.toISOString()
				.slice(0, 10),
			entry_type: "reversal",
			description: "Pembatalan catatan uang jalan",
			source_type: "uang_jalan_reversal",
			source_event_id: r.event_id,
			total_amount: r.amount,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (re || !rev)
		return {
			ok: false,
			error: re?.message ?? "Gagal membuat jurnal pembalik.",
		};
	await db.from("journal_lines").insert(
		(orig ?? []).map((l, i) => ({
			entry_id: rev.id,
			account_code: l.account_code,
			debit_amount: Number(l.credit_amount ?? 0),
			credit_amount: Number(l.debit_amount ?? 0),
			description: `Pembalik — ${l.description ?? ""}`.slice(0, 200),
			line_order: i + 1,
		})),
	);
	await db
		.from("journal_entries")
		.update({ is_reversed: true, reversed_by_entry_id: rev.id })
		.eq("id", r.journal_id);
	await db.from("uang_jalan").update({ is_reversed: true }).eq("id", r.id);
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	return { ok: true, note: "Catatan dibatalkan" };
}
