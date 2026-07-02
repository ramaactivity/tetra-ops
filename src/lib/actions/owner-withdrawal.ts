"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

// Sentinel untuk "Ambil semua owner sekaligus" pada field owner.
const ALL_OWNERS = "__ALL__";

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
	// Catatan tambahan opsional; deskripsi final dibentuk dari periode + catatan.
	description: z.string().trim().max(500).optional(),
	period_label: z.string().trim().max(60).optional(),
});

// Deskripsi tersimpan: "Bagi hasil <periode>" + catatan tambahan bila ada.
function buildDescription(periodLabel?: string, note?: string): string {
	const base = periodLabel ? `Bagi hasil ${periodLabel}` : "Bagi hasil owner";
	const extra = note?.trim();
	return extra ? `${base} — ${extra}` : base;
}

// Mode "semua owner": tanpa owner_user_id/amount (ditarik penuh per owner).
const AllWithdrawalSchema = WithdrawalSchema.omit({
	owner_user_id: true,
	amount: true,
});

/** Ref jurnal per owner (untuk lampiran bukti transfer setelah tersimpan). */
export type WithdrawalRef = {
	owner_user_id: string;
	full_name: string;
	amount: number;
	ref_id: string;
};

export type WithdrawalFormState =
	| {
			ok?: boolean;
			error?: string;
			/** Single: ref jurnal untuk lampiran bukti. */
			refId?: string;
			/** Bulk: ref jurnal per owner untuk lampiran bukti. */
			refs?: WithdrawalRef[];
	  }
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

		// Mode "Ambil semua owner sekaligus" — 1 transaksi all-or-nothing.
		if (formData.get("owner_user_id") === ALL_OWNERS) {
			const parsedAll = AllWithdrawalSchema.safeParse({
				bank_account_id: formData.get("bank_account_id"),
				withdrawal_method: formData.get("withdrawal_method"),
				withdrawal_account: String(formData.get("withdrawal_account") ?? ""),
				withdrawal_reference: String(
					formData.get("withdrawal_reference") ?? "",
				),
				description: String(formData.get("description") ?? ""),
				period_label: String(formData.get("period_label") ?? ""),
			});
			if (!parsedAll.success) {
				return {
					error: parsedAll.error.issues
						.map((iss) =>
							iss.path.length
								? `${iss.path.join(".")}: ${iss.message}`
								: iss.message,
						)
						.join("; "),
				};
			}
			const supabase = await createClient();
			const { data, error } = await supabase.rpc(
				"record_all_owner_withdrawals",
				{
					p_bank_account_id: parsedAll.data.bank_account_id,
					p_method: parsedAll.data.withdrawal_method,
					p_account: parsedAll.data.withdrawal_account,
					p_reference: parsedAll.data.withdrawal_reference,
					p_description: buildDescription(
						parsedAll.data.period_label,
						parsedAll.data.description,
					),
					p_actor: me.profile.id,
				},
			);
			if (error) return { error: error.message };
			revalidatePath("/finance");
			revalidatePath("/finance/accounting");
			revalidatePath("/dashboard");
			const refs = (data as { refs?: WithdrawalRef[] } | null)?.refs ?? [];
			return { ok: true, refs };
		}

		const parsed = WithdrawalSchema.safeParse({
			owner_user_id: formData.get("owner_user_id"),
			amount: formData.get("amount"),
			bank_account_id: formData.get("bank_account_id"),
			withdrawal_method: formData.get("withdrawal_method"),
			withdrawal_account: String(formData.get("withdrawal_account") ?? ""),
			withdrawal_reference: String(formData.get("withdrawal_reference") ?? ""),
			description: String(formData.get("description") ?? ""),
			period_label: String(formData.get("period_label") ?? ""),
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
		const { data, error } = await supabase.rpc("record_owner_withdrawal", {
			p_owner_user_id: parsed.data.owner_user_id,
			p_amount: parsed.data.amount,
			p_bank_account_id: parsed.data.bank_account_id,
			p_method: parsed.data.withdrawal_method,
			p_account: parsed.data.withdrawal_account,
			p_reference: parsed.data.withdrawal_reference,
			p_description: buildDescription(
				parsed.data.period_label,
				parsed.data.description,
			),
			p_actor: me.profile.id,
		});
		if (error) return { error: error.message };

		revalidatePath("/finance");
		revalidatePath("/finance/accounting");
		revalidatePath("/dashboard");
		const refId = (data as { ref_id?: string } | null)?.ref_id;
		return { ok: true, refId };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
