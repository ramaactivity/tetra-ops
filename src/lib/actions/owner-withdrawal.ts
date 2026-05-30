"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const WithdrawalSchema = z.object({
	owner_user_id: z.uuid(),
	amount: z.coerce.number().int().positive(),
	bank_account_id: z.uuid("Pilih kas/bank sumber dana"),
	withdrawal_method: z.enum(["transfer", "cash"]),
	withdrawal_account: z
		.string()
		.trim()
		.max(120)
		.optional()
		.transform((v) => (v ? v : null)),
	withdrawal_reference: z
		.string()
		.trim()
		.max(120)
		.optional()
		.transform((v) => (v ? v : null)),
	description: z.string().trim().min(1).max(500),
});

export type WithdrawalFormState =
	| { ok?: boolean; error?: string }
	| undefined;

function newJournalRef(date: Date): string {
	const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${yyyymmdd}-${rand}`;
}

export async function recordOwnerWithdrawal(
	_prev: WithdrawalFormState,
	formData: FormData,
): Promise<WithdrawalFormState> {
	try {
		const me = await getCurrentUser();
		if (!me) return { error: "Unauthorized" };
		if (me.profile.role !== "super_admin") {
			return { error: "Hanya super_admin yang bisa rekam withdrawal" };
		}

		const parsed = WithdrawalSchema.safeParse({
			owner_user_id: formData.get("owner_user_id"),
			amount: formData.get("amount"),
			bank_account_id: formData.get("bank_account_id"),
			withdrawal_method: formData.get("withdrawal_method"),
			withdrawal_account: String(formData.get("withdrawal_account") ?? ""),
			withdrawal_reference: String(formData.get("withdrawal_reference") ?? ""),
			description: String(formData.get("description") ?? ""),
		});
		if (!parsed.success) {
			return {
				error: parsed.error.issues
					.map((iss) =>
						iss.path.length
							? `${iss.path.join(".")}: ${iss.message}`
							: iss.message,
					)
					.join("; "),
			};
		}

		const supabase = await createClient();

		// Verify the target user is super_admin or owner
		const { data: target } = await supabase
			.from("users")
			.select("id, role")
			.eq("id", parsed.data.owner_user_id)
			.maybeSingle();
		if (!target) return { error: "Owner tidak ditemukan" };
		if (target.role !== "super_admin" && target.role !== "owner") {
			return { error: "Target bukan super_admin / owner" };
		}

		// Compute current available balance for this owner
		const { data: earningsData } = await supabase
			.from("owner_earnings")
			.select("amount, earning_type")
			.eq("owner_user_id", parsed.data.owner_user_id);
		const earnings = (earningsData ?? []) as Array<{
			amount: number;
			earning_type: string;
		}>;
		const earned = earnings
			.filter((e) => e.earning_type !== "withdrawal" && e.amount > 0)
			.reduce((s, e) => s + e.amount, 0);
		const withdrawn = earnings
			.filter((e) => e.earning_type === "withdrawal" || e.amount < 0)
			.reduce((s, e) => s + Math.abs(e.amount), 0);
		const balance = earned - withdrawn;

		if (parsed.data.amount > balance) {
			return {
				error: `Saldo tidak cukup. Available: Rp ${balance.toLocaleString("id-ID")}, request: Rp ${parsed.data.amount.toLocaleString("id-ID")}`,
			};
		}

		// Resolve source kas/bank → COA (asset). Membayar owner = uang keluar.
		const { data: bank } = await supabase
			.from("bank_accounts")
			.select("coa_code, account_name, is_active")
			.eq("id", parsed.data.bank_account_id)
			.maybeSingle();
		if (!bank) return { error: "Kas/bank sumber tidak ditemukan" };
		if (!bank.is_active) return { error: `${bank.account_name} nonaktif` };

		// GL: Dr 2-300 Hutang Bagi Hasil Owner (turunkan kewajiban) / Cr kas-bank.
		// Mirror settle_event yang meng-kredit 2-300 saat profit dialokasikan.
		const refId = newJournalRef(new Date());
		const { data: entry, error: entryErr } = await supabase
			.from("journal_entries")
			.insert({
				ref_id: refId,
				entry_date: new Date().toISOString().slice(0, 10),
				entry_type: "asset_out",
				description: `Withdrawal owner pool — ${parsed.data.description}`,
				source_type: "owner_withdrawal",
				source_id: parsed.data.owner_user_id,
				total_amount: parsed.data.amount,
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (entryErr || !entry) {
			return { error: `Gagal create journal: ${entryErr?.message}` };
		}
		const { error: linesErr } = await supabase.from("journal_lines").insert([
			{
				entry_id: entry.id,
				account_code: "2-300",
				debit_amount: parsed.data.amount,
				credit_amount: 0,
				description: "Bagi hasil owner dibayar",
				line_order: 1,
			},
			{
				entry_id: entry.id,
				account_code: bank.coa_code,
				debit_amount: 0,
				credit_amount: parsed.data.amount,
				description: `Kas keluar (${bank.account_name})`,
				line_order: 2,
			},
		]);
		if (linesErr) {
			await supabase.from("journal_entries").delete().eq("id", entry.id);
			return { error: `Gagal create journal lines: ${linesErr.message}` };
		}

		// Insert withdrawal as negative amount with earning_type='withdrawal'
		const { error: insertErr } = await supabase
			.from("owner_earnings")
			.insert({
				owner_user_id: parsed.data.owner_user_id,
				earning_type: "withdrawal",
				amount: -parsed.data.amount,
				description: parsed.data.description,
				withdrawal_method: parsed.data.withdrawal_method,
				withdrawal_account: parsed.data.withdrawal_account,
				withdrawal_reference: parsed.data.withdrawal_reference,
				performed_by: me.profile.id,
			});

		if (insertErr) {
			// Roll back the journal so GL & sub-ledger stay in lockstep.
			await supabase.from("journal_entries").delete().eq("id", entry.id);
			return { error: insertErr.message };
		}

		revalidatePath("/finance");
		revalidatePath("/finance/accounting");
		revalidatePath("/dashboard");
		return { ok: true };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
