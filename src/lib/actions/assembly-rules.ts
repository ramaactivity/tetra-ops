"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { ASSEMBLY_FIELDS } from "@/lib/rekap/assembly-fields";
import { createClient } from "@/lib/supabase/server";

async function requireOwner() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const AddSchema = z.object({
	rekap_field: z.enum(ASSEMBLY_FIELDS),
	component_sku: z.string().trim().min(1),
	qty_per_unit: z.coerce.number().positive().max(1000),
});

export async function addAssemblyComponent(input: {
	rekap_field: string;
	component_sku: string;
	qty_per_unit: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwner();
	const parsed = AddSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Input tidak valid",
		};
	}
	const sb = await createClient();
	const { error } = await sb.from("rekap_assembly_rules").upsert(
		{
			rekap_field: parsed.data.rekap_field,
			component_sku: parsed.data.component_sku,
			qty_per_unit: parsed.data.qty_per_unit,
			is_active: true,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "rekap_field,component_sku" },
	);
	if (error) return { ok: false, error: error.message };
	revalidatePath("/settings/assembly");
	return { ok: true };
}

export async function updateAssemblyQty(
	id: string,
	qty: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwner();
	if (!Number.isFinite(qty) || qty <= 0) {
		return { ok: false, error: "Qty harus > 0" };
	}
	const sb = await createClient();
	const { error } = await sb
		.from("rekap_assembly_rules")
		.update({ qty_per_unit: qty, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) return { ok: false, error: error.message };
	revalidatePath("/settings/assembly");
	return { ok: true };
}

export async function removeAssemblyComponent(
	id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwner();
	const sb = await createClient();
	const { error } = await sb.from("rekap_assembly_rules").delete().eq("id", id);
	if (error) return { ok: false, error: error.message };
	revalidatePath("/settings/assembly");
	return { ok: true };
}
