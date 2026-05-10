"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { REKAP_FIELDS, type RekapField } from "@/lib/rekap-mapping/types";
import { createClient } from "@/lib/supabase/server";

const InputSchema = z.object({
	rekap_field: z.enum(REKAP_FIELDS, "Field tidak valid"),
	item_id: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.uuid().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	qty_per_unit: z.coerce.number().int().min(1, "qty_per_unit minimum 1"),
	is_active: z.coerce.boolean(),
});

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

export async function updateRekapMapping(
	formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await requireOwnerLevel();

	const parsed = InputSchema.safeParse({
		rekap_field: formData.get("rekap_field"),
		item_id: formData.get("item_id"),
		qty_per_unit: formData.get("qty_per_unit"),
		is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
	});

	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join(", "),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("rekap_field_mapping")
		.upsert(
			{
				rekap_field: parsed.data.rekap_field,
				item_id: parsed.data.item_id,
				qty_per_unit: parsed.data.qty_per_unit,
				is_active: parsed.data.is_active,
				updated_by: me.profile.id,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "rekap_field" },
		);

	if (error) return { ok: false, error: error.message };

	revalidatePath("/settings/items/mapping");
	return { ok: true };
}

export async function getRekapMappings(): Promise<
	Array<{
		rekap_field: RekapField;
		item_id: string | null;
		qty_per_unit: number;
		is_active: boolean;
	}>
> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("rekap_field_mapping")
		.select("rekap_field, item_id, qty_per_unit, is_active")
		.order("rekap_field");
	return (data ?? []) as Array<{
		rekap_field: RekapField;
		item_id: string | null;
		qty_per_unit: number;
		is_active: boolean;
	}>;
}
