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

		// Atomic + race-free: lock owner row → cek saldo → jurnal (Dr 2-300 /
		// Cr kas) + owner_earnings dalam 1 transaksi (RPC record_owner_withdrawal).
		// Menggantikan flow multi-statement lama yang TOCTOU + non-atomik.
		const { error } = await supabase.rpc("record_owner_withdrawal", {
			p_owner_user_id: parsed.data.owner_user_id,
			p_amount: parsed.data.amount,
			p_bank_account_id: parsed.data.bank_account_id,
			p_method: parsed.data.withdrawal_method,
			p_account: parsed.data.withdrawal_account,
			p_reference: parsed.data.withdrawal_reference,
			p_description: parsed.data.description,
			p_actor: me.profile.id,
		});
		if (error) return { error: error.message };

		revalidatePath("/finance");
		revalidatePath("/finance/accounting");
		revalidatePath("/dashboard");
		return { ok: true };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
