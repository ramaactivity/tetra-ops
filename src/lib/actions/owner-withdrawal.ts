"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const WithdrawalSchema = z.object({
	owner_user_id: z.uuid(),
	amount: z.coerce.number().int().positive(),
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

		if (insertErr) return { error: insertErr.message };

		revalidatePath("/finance");
		revalidatePath("/dashboard");
		return { ok: true };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
