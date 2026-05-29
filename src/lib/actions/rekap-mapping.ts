"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { REKAP_FIELDS, type RekapField } from "@/lib/rekap-mapping/types";
import { createClient } from "@/lib/supabase/server";

const FRAME_SIZES = ["", "4R", "2R", "polaroid", "none"] as const;
export type FrameSizeKey = (typeof FRAME_SIZES)[number];

const InputSchema = z.object({
	rekap_field: z.enum(REKAP_FIELDS, "Field tidak valid"),
	frame_size: z.enum(FRAME_SIZES, "Frame size tidak valid").default(""),
	item_id: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.uuid().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	// NUMERIC for fractional ratios — 0.5 for 2R cut, 1.0 default
	qty_per_unit: z.coerce
		.number()
		.gt(0, "qty_per_unit harus > 0")
		.max(10000, "qty_per_unit terlalu besar"),
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
		frame_size: formData.get("frame_size") ?? "",
		item_id: formData.get("item_id"),
		qty_per_unit: formData.get("qty_per_unit"),
		is_active:
			formData.get("is_active") === "on" ||
			formData.get("is_active") === "true",
	});

	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join(", "),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase.from("rekap_field_mapping").upsert(
		{
			rekap_field: parsed.data.rekap_field,
			frame_size: parsed.data.frame_size,
			item_id: parsed.data.item_id,
			qty_per_unit: parsed.data.qty_per_unit,
			is_active: parsed.data.is_active,
			updated_by: me.profile.id,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "rekap_field,frame_size" },
	);

	if (error) return { ok: false, error: error.message };

	revalidatePath("/warehouse/rekap-mapping");
	return { ok: true };
}

/**
 * Delete a per-size override row. Used when owner wants to remove a
 * size-specific mapping and revert to the default ('') fallback.
 * Cannot delete the default row itself (frame_size = '') — use
 * updateRekapMapping with is_active=false instead.
 */
export async function deleteRekapMappingOverride(
	rekapField: RekapField,
	frameSize: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();
	if (!frameSize) {
		return {
			ok: false,
			error: "Cannot delete default mapping — toggle is_active instead.",
		};
	}
	const supabase = await createClient();
	const { error } = await supabase
		.from("rekap_field_mapping")
		.delete()
		.eq("rekap_field", rekapField)
		.eq("frame_size", frameSize);
	if (error) return { ok: false, error: error.message };
	revalidatePath("/warehouse/rekap-mapping");
	return { ok: true };
}

export type RekapMappingRow = {
	rekap_field: RekapField;
	frame_size: string;
	item_id: string | null;
	qty_per_unit: number;
	is_active: boolean;
};

export async function getRekapMappings(): Promise<RekapMappingRow[]> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("rekap_field_mapping")
		.select("rekap_field, frame_size, item_id, qty_per_unit, is_active")
		.order("rekap_field")
		.order("frame_size");
	return ((data ?? []) as Array<{
		rekap_field: RekapField;
		frame_size: string | null;
		item_id: string | null;
		qty_per_unit: number | string;
		is_active: boolean;
	}>).map((m) => ({
		rekap_field: m.rekap_field,
		frame_size: m.frame_size ?? "",
		item_id: m.item_id,
		qty_per_unit: Number(m.qty_per_unit) || 1,
		is_active: m.is_active,
	}));
}
