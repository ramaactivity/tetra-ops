"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { insufficientBalanceError } from "@/lib/finance/balance-guard";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function newJournalRef(date: Date): string {
	const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${yyyymmdd}-${rand}`;
}

const PaymentSchema = z.object({
	payable_id: z.uuid(),
	amount: z.coerce.number().int().positive(),
	payment_date: z.string().trim().min(8),
	payment_account_code: z.string().trim().min(2).max(20),
	// Biaya admin/transfer bank yang ditanggung perusahaan (di luar nilai hutang).
	// Dibukukan sebagai debit 5-600, nambah kredit kas/bank. TIDAK menambah
	// amount_paid payable (subledger hutang tetap akurat).
	admin_fee: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
	notes: z
		.string()
		.trim()
		.max(300)
		.optional()
		.transform((v) => (v ? v : null)),
});

/**
 * Record a payment against a payable.
 *  - Inserts payable_payments row → trigger bumps payables.amount_paid
 *  - Status trigger auto-rolls to partial/paid based on amount_paid
 *  - Creates balanced journal entry: DEBIT 2-101 Hutang Vendor, CREDIT
 *    payment_account_code (e.g. 1-100 Kas, 1-110 Bank BCA).
 */
export async function recordPayablePayment(
	formData: FormData,
): Promise<
	| { ok: true; remaining: number; status: string; journalRef?: string }
	| { ok: false; error: string }
> {
	const me = await requireOwnerLevel();

	const parsed = PaymentSchema.safeParse({
		payable_id: formData.get("payable_id"),
		amount: formData.get("amount"),
		payment_date: formData.get("payment_date"),
		payment_account_code: formData.get("payment_account_code"),
		admin_fee: formData.get("admin_fee") || 0,
		notes: formData.get("notes"),
	});
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join(", "),
		};
	}

	const supabase = await createClient();

	// Read the payable for validation + outstanding check
	const { data: payable, error: readErr } = await supabase
		.from("payables")
		.select(
			"id, amount, amount_paid, status, supplier_id, description, source_journal_id",
		)
		.eq("id", parsed.data.payable_id)
		.maybeSingle();
	if (readErr || !payable) {
		return { ok: false, error: readErr?.message ?? "Payable tidak ditemukan" };
	}
	if (payable.status === "paid") {
		return { ok: false, error: "Payable ini sudah lunas" };
	}
	if (payable.status === "cancelled") {
		return { ok: false, error: "Payable ini sudah dibatalkan" };
	}

	const remaining = Number(payable.amount) - Number(payable.amount_paid);
	if (parsed.data.amount > remaining) {
		return {
			ok: false,
			error: `Pembayaran melebihi sisa hutang (sisa Rp ${remaining.toLocaleString(
				"id-ID",
			)})`,
		};
	}

	// Validate payment account exists + active
	const { data: payAcc, error: payAccErr } = await supabase
		.from("chart_of_accounts")
		.select("code, name, is_active, account_type")
		.eq("code", parsed.data.payment_account_code)
		.maybeSingle();
	if (payAccErr || !payAcc) {
		return {
			ok: false,
			error: `Akun pembayaran ${parsed.data.payment_account_code} tidak ditemukan`,
		};
	}
	if (!payAcc.is_active) {
		return {
			ok: false,
			error: `Akun ${parsed.data.payment_account_code} nonaktif`,
		};
	}
	if (payAcc.account_type !== "asset") {
		return {
			ok: false,
			error: `Akun pembayaran harus tipe asset (kas/bank), bukan ${payAcc.account_type}`,
		};
	}

	// Create journal entry: DEBIT 2-101 Hutang Vendor, CREDIT payment_account_code.
	// Plus, if any: DEBIT 5-600 Beban Admin Bank → kas keluar = hutang + biaya admin.
	const adminFee = parsed.data.admin_fee;
	const cashOut = parsed.data.amount + adminFee;

	// Guard saldo: bayar hutang tidak boleh bikin rekening pembayaran minus.
	const saldoErr = await insufficientBalanceError(
		supabase,
		parsed.data.payment_account_code,
		(payAcc.name as string) ?? parsed.data.payment_account_code,
		cashOut,
	);
	if (saldoErr) return { ok: false, error: saldoErr };

	let journalEntryId: string | null = null;
	let journalRef: string | undefined;
	try {
		const refId = newJournalRef(new Date(parsed.data.payment_date));
		const { data: entry, error: entryErr } = await supabase
			.from("journal_entries")
			.insert({
				ref_id: refId,
				entry_date: parsed.data.payment_date,
				entry_type: "asset_out",
				description: `Bayar hutang${payable.description ? ` — ${payable.description}` : ""}`,
				source_type: "payment",
				source_id: payable.id,
				total_amount: cashOut,
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (entryErr || !entry) {
			console.error("[payables] journal entry insert failed:", entryErr);
			throw new Error(
				entryErr?.message ?? "Gagal membuat jurnal pembayaran hutang",
			);
		} else {
			const journalLines = [
				{
					entry_id: entry.id,
					account_code: "2-101",
					debit_amount: parsed.data.amount,
					credit_amount: 0,
					description: "Hutang vendor turun",
					line_order: 1,
				},
			];
			if (adminFee > 0) {
				journalLines.push({
					entry_id: entry.id,
					account_code: "5-600",
					debit_amount: adminFee,
					credit_amount: 0,
					description: "Biaya admin/transfer bank",
					line_order: 2,
				});
			}
			journalLines.push({
				entry_id: entry.id,
				account_code: parsed.data.payment_account_code,
				debit_amount: 0,
				credit_amount: cashOut,
				description: "Pembayaran kas/bank",
				line_order: journalLines.length + 1,
			});
			const { error: linesErr } = await supabase
				.from("journal_lines")
				.insert(journalLines);
			if (linesErr) {
				console.error("[payables] journal lines insert failed:", linesErr);
				// Rollback header supaya tidak meninggalkan entry tanpa baris.
				await supabase.from("journal_entries").delete().eq("id", entry.id);
				throw new Error(linesErr.message);
			}
			journalEntryId = entry.id;
			journalRef = refId;
		}
	} catch (e) {
		// JANGAN lanjut menulis payable_payments. Sebelumnya kegagalan jurnal
		// hanya di-log lalu eksekusi berjalan terus: baris pembayaran tetap
		// masuk dengan journal_entry_id NULL, trigger menaikkan amount_paid,
		// status jadi "paid", dan UI menampilkan "Lunas" — padahal GL tidak
		// pernah mendebit 2-101 maupun mengkredit kas/bank. Hasilnya 2-101 di
		// Buku Besar lebih tinggi dari subledger hutang dan kas overstated,
		// tanpa jejak pembayaran mana penyebabnya.
		// Pola abort ini sama dengan purchases.ts:508-566.
		console.error("[payables] journal entry creation failed:", e);
		return {
			ok: false,
			error: `Pembayaran dibatalkan — jurnal gagal dibuat: ${
				e instanceof Error ? e.message : "unknown error"
			}`,
		};
	}

	// Insert payment row → trigger updates payable.amount_paid + status
	const { error: payErr } = await supabase.from("payable_payments").insert({
		payable_id: parsed.data.payable_id,
		amount: parsed.data.amount,
		payment_date: parsed.data.payment_date,
		payment_account_code: parsed.data.payment_account_code,
		journal_entry_id: journalEntryId,
		notes: parsed.data.notes,
		paid_by: me.profile.id,
	});
	if (payErr) {
		// If payment insert fails, also clean up the journal we just made
		if (journalEntryId) {
			await supabase.from("journal_entries").delete().eq("id", journalEntryId);
		}
		return { ok: false, error: payErr.message };
	}

	// Fetch fresh payable to return remaining + status
	const { data: refreshed } = await supabase
		.from("payables")
		.select("amount, amount_paid, status")
		.eq("id", parsed.data.payable_id)
		.maybeSingle();
	const newRemaining = refreshed
		? Number(refreshed.amount) - Number(refreshed.amount_paid)
		: 0;
	const newStatus = refreshed?.status ?? "open";

	revalidatePath("/finance");
	revalidatePath("/finance/payables");
	revalidatePath("/finance/accounting");
	return { ok: true, remaining: newRemaining, status: newStatus, journalRef };
}

export async function cancelPayable(
	payableId: string,
	reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();
	const supabase = await createClient();

	const { data: payable } = await supabase
		.from("payables")
		.select("status, amount_paid")
		.eq("id", payableId)
		.maybeSingle();
	if (!payable) return { ok: false, error: "Payable tidak ditemukan" };
	if (payable.status === "paid") {
		return { ok: false, error: "Payable sudah lunas — tidak bisa dibatalkan" };
	}
	if (Number(payable.amount_paid) > 0) {
		return {
			ok: false,
			error:
				"Payable sudah ada pembayaran — hapus dulu pembayaran sebelum cancel",
		};
	}

	const { error } = await supabase
		.from("payables")
		.update({
			status: "cancelled",
			cancelled_at: new Date().toISOString(),
			cancelled_reason: reason.trim() || null,
		})
		.eq("id", payableId);
	if (error) return { ok: false, error: error.message };

	revalidatePath("/finance/payables");
	return { ok: true };
}
