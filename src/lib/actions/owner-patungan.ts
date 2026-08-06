"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { revalidateDashboard } from "@/lib/dashboard/stats";
import { recordPatunganFromPool } from "@/lib/finance/owner-patungan";
import { createClient } from "@/lib/supabase/server";

/**
 * Catat patungan owner yang dipotong dari bagi hasil — untuk beban yang sudah
 * terlanjur dibayar penuh oleh Tetra (mis. kost dibayar duluan, patungannya
 * menyusul). Kalau patungannya ditentukan bersamaan dengan pencatatan
 * pengeluaran, jalurnya lewat Catat transaksi (recordQuickTransaction).
 */

const Schema = z.object({
	expense_coa: z.string().trim().min(3).max(20),
	per_owner: z.coerce.number().int().positive("Nominal harus lebih dari 0"),
	description: z.string().trim().min(3).max(200),
	date: z.string().trim().min(8),
});

export type PatunganFormState =
	| { ok?: true; message?: string; error?: string }
	| undefined;

export async function recordOwnerPatungan(
	_prev: PatunganFormState,
	formData: FormData,
): Promise<PatunganFormState> {
	const me = await getCurrentUser();
	if (!me) return { error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { error: "Hanya owner yang bisa mencatat patungan" };
	}

	const parsed = Schema.safeParse({
		expense_coa: formData.get("expense_coa"),
		per_owner: formData.get("per_owner"),
		description: formData.get("description"),
		date: formData.get("date"),
	});
	if (!parsed.success) {
		return { error: parsed.error.issues.map((i) => i.message).join("; ") };
	}

	const supabase = await createClient();
	const res = await recordPatunganFromPool(supabase, {
		expenseCoa: parsed.data.expense_coa,
		perOwner: parsed.data.per_owner,
		description: parsed.data.description,
		date: parsed.data.date,
		actorProfileId: me.profile.id,
	});
	if (!res.ok) return { error: res.error };

	revalidatePath("/finance");
	revalidatePath("/finance/accounting");
	revalidatePath("/finance/bulanan");
	revalidateDashboard();
	return {
		ok: true,
		message: `Patungan ${res.owners} owner dicatat — total ${res.total.toLocaleString("id-ID")}`,
	};
}
