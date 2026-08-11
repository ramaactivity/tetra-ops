"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { payCommission } from "@/lib/actions/commissions";
import { recordQuickTransaction } from "@/lib/actions/journal-entries";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Antrian transaksi event yang baru dibukukan saat settle.
 *
 * Kartu-kartu di halaman rekap = tempat MENGISI (pengeluaran/pemasukan lain,
 * rencana bayar komisi sales, beserta buktinya). Jurnalnya lahir sekali jalan
 * saat "Konfirmasi settle" — sama seperti fee crew, yang angkanya diisi di
 * kartu tapi utangnya baru lahir di jurnal settlement.
 *
 * Alasannya bukan sekadar rapi: kalau tiap kartu langsung memposting jurnal,
 * satu event bisa punya jurnal setengah jadi (biaya sudah masuk buku, event-nya
 * belum ditutup / batal ditutup) dan angka "berapa untung event ini" tidak
 * pernah bisa dilihat utuh sebelum keputusan settle diambil.
 */

export type QueueKind = "expense" | "commission_sales";

export type QueuedEntry = {
	id: string;
	kind: QueueKind;
	direction: "masuk" | "keluar" | null;
	categoryId: string | null;
	note: string | null;
	amount: number;
	accountCode: string;
	adminFee: number;
	proofUrl: string | null;
	postedAt: string | null;
	postError: string | null;
};

const ExpenseSchema = z.object({
	event_id: z.string().uuid(),
	project_id: z.string().trim().min(1).max(64),
	direction: z.enum(["masuk", "keluar"]),
	category_id: z.string().trim().min(1).max(40),
	amount: z.coerce.number().int().positive().max(500_000_000),
	note: z.string().trim().max(300).nullish(),
	account_code: z.string().trim().min(2).max(20),
	proof_url: z.string().trim().max(2000).nullish(),
});

async function requireOwner() {
	const me = await getCurrentUser();
	if (!me) return null;
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return null;
	}
	return me;
}

export type QueueResponse = { ok: true } | { ok: false; error: string };

/** Antre satu pemasukan/pengeluaran lain untuk dibukukan saat settle. */
export async function queueEventExpense(input: {
	event_id: string;
	project_id: string;
	direction: "masuk" | "keluar";
	category_id: string;
	amount: number;
	note?: string | null;
	account_code: string;
	proof_url?: string | null;
}): Promise<QueueResponse> {
	const me = await requireOwner();
	if (!me) return { ok: false, error: "Hanya owner yang bisa mengisi ini" };

	const parsed = ExpenseSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join("; "),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase.from("event_settle_queue").insert({
		event_id: parsed.data.event_id,
		kind: "expense",
		direction: parsed.data.direction,
		category_id: parsed.data.category_id,
		note: parsed.data.note ?? null,
		amount: parsed.data.amount,
		account_code: parsed.data.account_code,
		proof_url: parsed.data.proof_url ?? null,
		created_by: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/operations/${parsed.data.project_id}/rekap`);
	return { ok: true };
}

/** Antre beberapa pengeluaran sekaligus (mis. semua biaya dibayar owner). */
export async function queueEventExpensesBatch(input: {
	event_id: string;
	project_id: string;
	account_code: string;
	items: Array<{
		category_id: string;
		amount: number;
		note: string;
		proof_url?: string | null;
	}>;
}): Promise<{ ok: true; queued: number } | { ok: false; error: string }> {
	const me = await requireOwner();
	if (!me) return { ok: false, error: "Hanya owner yang bisa mengisi ini" };

	const rows = input.items
		.filter((i) => Number(i.amount) > 0)
		.map((i) => ({
			event_id: input.event_id,
			kind: "expense" as const,
			direction: "keluar" as const,
			category_id: i.category_id,
			note: i.note?.slice(0, 300) ?? null,
			amount: Math.trunc(Number(i.amount)),
			account_code: input.account_code,
			proof_url: i.proof_url ?? null,
			created_by: me.profile.id,
		}));
	if (rows.length === 0) return { ok: true, queued: 0 };

	const supabase = await createClient();
	const { error } = await supabase.from("event_settle_queue").insert(rows);
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/operations/${input.project_id}/rekap`);
	return { ok: true, queued: rows.length };
}

/**
 * Rencana bayar komisi sales saat settle. Satu event maksimal satu rencana
 * aktif (unique index) — dipanggil ulang = mengganti yang lama.
 */
export async function queueSalesCommissionPayment(input: {
	event_id: string;
	project_id: string;
	amount: number;
	account_code: string;
	admin_fee?: number;
	proof_url?: string | null;
}): Promise<QueueResponse> {
	const me = await requireOwner();
	if (!me) return { ok: false, error: "Hanya owner yang bisa mengisi ini" };
	const amount = Math.trunc(Number(input.amount) || 0);
	if (amount <= 0) return { ok: false, error: "Nominal komisi belum diisi" };

	const supabase = await createClient();
	await supabase
		.from("event_settle_queue")
		.delete()
		.eq("event_id", input.event_id)
		.eq("kind", "commission_sales")
		.is("posted_at", null);

	const { error } = await supabase.from("event_settle_queue").insert({
		event_id: input.event_id,
		kind: "commission_sales",
		amount,
		account_code: input.account_code,
		admin_fee: Math.max(0, Math.trunc(Number(input.admin_fee) || 0)),
		proof_url: input.proof_url ?? null,
		created_by: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/operations/${input.project_id}/rekap`);
	return { ok: true };
}

/** Batalkan satu baris antrian (hanya yang belum diposting). */
export async function removeQueuedEntry(input: {
	id: string;
	project_id: string;
}): Promise<QueueResponse> {
	const me = await requireOwner();
	if (!me) return { ok: false, error: "Hanya owner yang bisa menghapus ini" };

	const supabase = await createClient();
	const { error } = await supabase
		.from("event_settle_queue")
		.delete()
		.eq("id", input.id)
		.is("posted_at", null);
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/operations/${input.project_id}/rekap`);
	return { ok: true };
}

export type SettleQueueSummary = {
	posted: number;
	failed: number;
	errors: string[];
};

/**
 * Posting semua antrian event ini — dipanggil settleEvent SETELAH RPC settle
 * berhasil (kas benar-benar keluar sekarang, dan event sudah completed sehingga
 * pembayaran komisi masuk jalur pelunasan utang, bukan uang muka).
 *
 * Best-effort per baris: satu gagal (mis. saldo kurang) tidak membatalkan yang
 * lain & tidak membatalkan settle-nya. Kegagalan disimpan di post_error supaya
 * kelihatan di kartu dan bisa diulang manual.
 */
export async function postSettleQueue(
	eventId: string,
	projectId: string,
): Promise<SettleQueueSummary | undefined> {
	const supabase = await createClient();
	const { data: rows } = await supabase
		.from("event_settle_queue")
		.select(
			"id, kind, direction, category_id, note, amount, account_code, admin_fee, proof_url",
		)
		.eq("event_id", eventId)
		.is("posted_at", null)
		.order("created_at", { ascending: true });
	if (!rows || rows.length === 0) return undefined;

	const today = new Date().toISOString().slice(0, 10);
	let posted = 0;
	let failed = 0;
	const errors: string[] = [];

	for (const row of rows) {
		let ok = false;
		let err: string | null = null;
		let ref: string | null = null;

		if (row.kind === "expense") {
			const fd = new FormData();
			fd.set("direction", (row.direction as string) ?? "keluar");
			fd.set("amount", String(row.amount));
			fd.set("entry_date", today);
			fd.set("account_code", row.account_code as string);
			fd.set("category_id", (row.category_id as string) ?? "operasional-lain");
			fd.set("event_id", eventId);
			if (row.note) fd.set("note", row.note as string);
			if (row.proof_url) fd.set("proof_url", row.proof_url as string);
			const res = await recordQuickTransaction(undefined, fd);
			ok = Boolean(res?.success);
			err = res?.success ? null : (res?.error ?? "Gagal mencatat transaksi");
			ref = res?.refId ?? null;
		} else {
			const res = await payCommission({
				event_id: eventId,
				project_id: projectId,
				kind: "sales",
				bank_account_code: row.account_code as string,
				admin_fee: Number(row.admin_fee ?? 0),
				payment_date: today,
				proof_url: (row.proof_url as string | null) ?? null,
			});
			ok = res.ok;
			err = res.ok ? null : res.error;
			ref = res.ok ? res.journalRef : null;
		}

		if (ok) {
			posted += 1;
			await supabase
				.from("event_settle_queue")
				.update({
					posted_at: new Date().toISOString(),
					posted_ref: ref,
					post_error: null,
				})
				.eq("id", row.id as string);
		} else {
			failed += 1;
			errors.push(
				`${row.kind === "expense" ? (row.note ?? "Transaksi") : "Komisi sales"}: ${err}`,
			);
			await supabase
				.from("event_settle_queue")
				.update({ post_error: err })
				.eq("id", row.id as string);
		}
	}

	return { posted, failed, errors };
}
