"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { revalidateDashboard } from "@/lib/dashboard/stats";
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
	// Ongkos transfer ke rekening owner — ditanggung perusahaan (Dr 5-600),
	// bukan potongan jatah owner. Tiap owner beda bank → beda ongkos.
	admin_fee: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
	// Catatan tambahan opsional; deskripsi final dibentuk dari periode + catatan.
	description: z.string().trim().max(500).optional(),
	period_label: z.string().trim().max(60).optional(),
});

/**
 * Biaya admin per owner untuk mode "ambil semua": {"<owner_id>": 2500}.
 * Nilainya dikirim sebagai JSON dari form; yang bukan angka wajar dibuang di
 * sini supaya RPC tidak pernah menerima ongkos transfer yang absurd.
 */
function parseAdminFees(raw: string): Record<string, number> {
	if (!raw.trim()) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	const out: Record<string, number> = {};
	for (const [id, val] of Object.entries(parsed as Record<string, unknown>)) {
		const n = Math.round(Number(val));
		if (Number.isFinite(n) && n > 0 && n <= 1_000_000) out[id] = n;
	}
	return out;
}

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
	admin_fee: true,
});

/** Ref jurnal per owner (untuk lampiran bukti transfer setelah tersimpan). */
export type WithdrawalRef = {
	owner_user_id: string;
	full_name: string;
	amount: number;
	/** Ongkos transfer ke rekening owner ini (beban perusahaan, 5-600). */
	admin_fee?: number;
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
					p_admin_fees: parseAdminFees(
						String(formData.get("admin_fees") ?? ""),
					),
				},
			);
			if (error) return { error: error.message };
			revalidatePath("/finance");
			revalidatePath("/finance/accounting");
			revalidateDashboard();
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
			admin_fee: formData.get("admin_fee") ?? 0,
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
			p_admin_fee: parsed.data.admin_fee,
		});
		if (error) return { error: error.message };

		revalidatePath("/finance");
		revalidatePath("/finance/accounting");
		revalidateDashboard();
		const refId = (data as { ref_id?: string } | null)?.ref_id;
		return { ok: true, refId };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
