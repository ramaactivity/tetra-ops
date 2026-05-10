"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { REKAP_FIELDS, type RekapField } from "@/lib/rekap-mapping/types";
import { createClient } from "@/lib/supabase/server";

const NonNegInt = z.coerce.number().int().nonnegative().default(0);

const RekapInputSchema = z.object({
	cetak_total: NonNegInt,
	media_set_used: NonNegInt,
	sleeve_used: NonNegInt,
	flashdisk_used: NonNegInt,
	pouch_used: NonNegInt,
	photomagnet_used: NonNegInt,
	keychain_used: NonNegInt,
	proof_photo_urls: z
		.string()
		.trim()
		.transform((v) =>
			v
				? v
						.split(/[\n,]/)
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
		)
		.refine((arr) => arr.length > 0, {
			message: "Minimal 1 URL foto bukti",
		}),
	crew_notes: z
		.string()
		.trim()
		.max(1000)
		.optional()
		.transform((v) => (v ? v : null)),
});

export type RekapInput = z.infer<typeof RekapInputSchema>;
type RekapErrors = Partial<Record<keyof RekapInput | "_form", string[]>>;
export type RekapFormState =
	| { errors?: RekapErrors; values?: Record<string, string>; success?: true }
	| undefined;

async function requireOwnerOrCrew() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (
		me.profile.role !== "super_admin" &&
		me.profile.role !== "owner" &&
		me.profile.role !== "crew"
	) {
		throw new Error("Forbidden");
	}
	return me;
}

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = [
		"cetak_total",
		"media_set_used",
		"sleeve_used",
		"flashdisk_used",
		"pouch_used",
		"photomagnet_used",
		"keychain_used",
		"proof_photo_urls",
		"crew_notes",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	return out;
}

export async function submitRekap(
	eventId: string,
	projectId: string,
	_prev: RekapFormState,
	formData: FormData,
): Promise<RekapFormState> {
	const me = await requireOwnerOrCrew();

	const parsed = RekapInputSchema.safeParse({
		cetak_total: formData.get("cetak_total"),
		media_set_used: formData.get("media_set_used"),
		sleeve_used: formData.get("sleeve_used"),
		flashdisk_used: formData.get("flashdisk_used"),
		pouch_used: formData.get("pouch_used"),
		photomagnet_used: formData.get("photomagnet_used"),
		keychain_used: formData.get("keychain_used"),
		proof_photo_urls: formData.get("proof_photo_urls"),
		crew_notes: formData.get("crew_notes"),
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as RekapErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();

	// Authorization: crew can only submit rekap for events they're assigned
	// to. Owner-level can submit for any event (e.g. retroactive entries).
	if (me.profile.role === "crew") {
		const { data: assignment } = await supabase
			.from("crew_assignments")
			.select("id")
			.eq("event_id", eventId)
			.eq("user_id", me.profile.id)
			.maybeSingle();
		if (!assignment) {
			return {
				errors: {
					_form: ["Lo gak di-assign ke event ini, gak bisa submit rekap."],
				},
				values: snapshotValues(formData),
			};
		}
	}

	// Upsert by event_id (UNIQUE)
	const { data: existing } = await supabase
		.from("crew_rekap")
		.select("id, is_approved")
		.eq("event_id", eventId)
		.maybeSingle();

	// Block edits to already-approved rekaps (owner can re-open via reject)
	if (existing && existing.is_approved === true) {
		return {
			errors: {
				_form: [
					"Rekap sudah di-approve owner. Hubungi owner kalau perlu revisi.",
				],
			},
			values: snapshotValues(formData),
		};
	}

	const payload = {
		event_id: eventId,
		submitted_by: me.authId,
		cetak_total: parsed.data.cetak_total,
		media_set_used: parsed.data.media_set_used,
		sleeve_used: parsed.data.sleeve_used,
		flashdisk_used: parsed.data.flashdisk_used,
		pouch_used: parsed.data.pouch_used,
		photomagnet_used: parsed.data.photomagnet_used,
		keychain_used: parsed.data.keychain_used,
		proof_photo_urls: parsed.data.proof_photo_urls,
		crew_notes: parsed.data.crew_notes,
	};

	if (existing) {
		const { error } = await supabase
			.from("crew_rekap")
			.update(payload)
			.eq("id", existing.id);
		if (error) {
			return {
				errors: { _form: [error.message] },
				values: snapshotValues(formData),
			};
		}
	} else {
		const { error } = await supabase.from("crew_rekap").insert(payload);
		if (error) {
			return {
				errors: { _form: [error.message] },
				values: snapshotValues(formData),
			};
		}
	}

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/settle`);
	return { success: true };
}

type RekapStockSnapshot = {
	id: string;
	event_id: string;
	is_approved: boolean | null;
	stock_committed_at: string | null;
	stock_movement_batch_id: string | null;
	cetak_total: number;
	media_set_used: number;
	sleeve_used: number;
	flashdisk_used: number;
	pouch_used: number;
	photomagnet_used: number;
	keychain_used: number;
	custom_materials: Record<string, number> | null;
};

type DeductionLine = {
	item_id: string;
	sku: string;
	name: string;
	qty: number;
	unit_cost: number;
	source_label: string; // e.g. "media_set_used" or "extra: ITEM-X"
};

async function readAutoDeductFlag(
	supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
	const { data } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", "rekap.auto_deduct_stock")
		.maybeSingle();
	if (!data) return true; // default ON
	const v = data.value;
	if (typeof v === "boolean") return v;
	if (typeof v === "string") return v === "true" || v === "1";
	if (typeof v === "number") return v !== 0;
	return true;
}

/**
 * Compute the deduction plan for a rekap: which items, how much, at what
 * unit cost. Pure read — no side effects. Used by the approval preview
 * dialog and by the actual approval flow inside reviewRekap.
 */
async function planRekapDeduction(
	supabase: Awaited<ReturnType<typeof createClient>>,
	rekap: RekapStockSnapshot,
): Promise<{ lines: DeductionLine[]; missingMappings: RekapField[] }> {
	const { data: mappings } = await supabase
		.from("rekap_field_mapping")
		.select("rekap_field, item_id, qty_per_unit, is_active");

	const activeMappings = ((mappings ?? []) as Array<{
		rekap_field: RekapField;
		item_id: string | null;
		qty_per_unit: number;
		is_active: boolean;
	}>).filter((m) => m.is_active);

	const itemIdsNeeded = new Set<string>();
	for (const m of activeMappings) {
		if (m.item_id) itemIdsNeeded.add(m.item_id);
	}
	// Also custom materials by SKU
	const customSkus: string[] = rekap.custom_materials
		? Object.keys(rekap.custom_materials).filter(
				(k) => Number(rekap.custom_materials?.[k] ?? 0) > 0,
			)
		: [];

	// Lookup items: by id (from mapping) and by sku (from custom_materials)
	const [byIdRes, bySkuRes] = await Promise.all([
		itemIdsNeeded.size > 0
			? supabase
					.from("inventory_items")
					.select("id, sku, name, purchase_price_avg")
					.in("id", Array.from(itemIdsNeeded))
			: Promise.resolve({ data: [] as Array<{ id: string; sku: string; name: string; purchase_price_avg: number | null }> }),
		customSkus.length > 0
			? supabase
					.from("inventory_items")
					.select("id, sku, name, purchase_price_avg")
					.in("sku", customSkus)
			: Promise.resolve({ data: [] as Array<{ id: string; sku: string; name: string; purchase_price_avg: number | null }> }),
	]);

	const itemsById = new Map(
		(byIdRes.data ?? []).map((it) => [it.id, it]),
	);
	const itemsBySku = new Map((bySkuRes.data ?? []).map((it) => [it.sku, it]));

	const lines: DeductionLine[] = [];
	const missingMappings: RekapField[] = [];

	for (const m of activeMappings) {
		const qtyRekap = Number(rekap[m.rekap_field] ?? 0);
		if (qtyRekap <= 0) continue;
		if (!m.item_id) {
			missingMappings.push(m.rekap_field);
			continue;
		}
		const item = itemsById.get(m.item_id);
		if (!item) {
			missingMappings.push(m.rekap_field);
			continue;
		}
		const finalQty = qtyRekap * (m.qty_per_unit ?? 1);
		lines.push({
			item_id: item.id,
			sku: item.sku,
			name: item.name,
			qty: finalQty,
			unit_cost: Number(item.purchase_price_avg ?? 0),
			source_label: m.rekap_field,
		});
	}

	if (rekap.custom_materials) {
		for (const [sku, qtyRaw] of Object.entries(rekap.custom_materials)) {
			const qty = Number(qtyRaw ?? 0);
			if (qty <= 0) continue;
			const item = itemsBySku.get(sku);
			if (!item) continue; // silently skip unknown SKU
			lines.push({
				item_id: item.id,
				sku: item.sku,
				name: item.name,
				qty,
				unit_cost: Number(item.purchase_price_avg ?? 0),
				source_label: `extra: ${sku}`,
			});
		}
	}

	return { lines, missingMappings };
}

function buildRefId(direction: "in" | "out") {
	const code = direction === "in" ? "I" : "O";
	const r = Math.floor(Math.random() * 99_999_999)
		.toString()
		.padStart(8, "0");
	return `MOV-${code}-${r}`;
}

/**
 * Public action: returns deduction lines for an unapproved rekap so the
 * UI can show a preview before owner clicks "Approve". Owner-level only.
 */
export async function getRekapApprovalPreview(
	rekapId: string,
): Promise<
	| {
			ok: true;
			lines: DeductionLine[];
			missingMappings: RekapField[];
			autoDeductEnabled: boolean;
			alreadyCommitted: boolean;
	  }
	| { ok: false; error: string }
> {
	await requireOwnerLevel();
	const supabase = await createClient();

	const { data: rekap, error } = await supabase
		.from("crew_rekap")
		.select(
			"id, event_id, is_approved, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
		)
		.eq("id", rekapId)
		.maybeSingle();
	if (error || !rekap) {
		return { ok: false, error: error?.message ?? "Rekap tidak ditemukan" };
	}

	const flag = await readAutoDeductFlag(supabase);
	const plan = await planRekapDeduction(supabase, rekap as RekapStockSnapshot);

	return {
		ok: true,
		lines: plan.lines,
		missingMappings: plan.missingMappings,
		autoDeductEnabled: flag,
		alreadyCommitted: rekap.stock_committed_at !== null,
	};
}

export async function reviewRekap(
	rekapId: string,
	projectId: string,
	approved: boolean,
	notes: string,
): Promise<{ error?: string }> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();

	// Read pre-update state to decide stock side-effects
	const { data: existing } = await supabase
		.from("crew_rekap")
		.select(
			"id, event_id, is_approved, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
		)
		.eq("id", rekapId)
		.maybeSingle();
	if (!existing) return { error: "Rekap tidak ditemukan" };

	const wasApproved = existing.is_approved === true;
	const willApprove = approved === true;
	const hadStockCommitted = existing.stock_committed_at !== null;

	const autoDeductEnabled = await readAutoDeductFlag(supabase);

	// 1. UPDATE the rekap row first (review fields)
	const updatePayload: Record<string, unknown> = {
		is_approved: approved,
		reviewed_by: me.authId,
		reviewed_at: new Date().toISOString(),
		review_notes: notes.trim() || null,
	};

	// 2. Handle stock side-effects
	if (
		willApprove &&
		!wasApproved &&
		!hadStockCommitted &&
		autoDeductEnabled
	) {
		// Approval transition → deduct stock
		const plan = await planRekapDeduction(
			supabase,
			existing as RekapStockSnapshot,
		);
		if (plan.lines.length > 0) {
			const batchId = randomUUID();
			const movements = plan.lines.map((l) => ({
				ref_id: buildRefId("out"),
				item_id: l.item_id,
				direction: "out" as const,
				quantity: l.qty,
				unit_cost: l.unit_cost,
				source: "rekap_consumption",
				source_id: existing.event_id,
				source_description: `Rekap approved (${l.source_label})`,
				notes: `Auto-deduct from rekap approval — batch ${batchId.slice(0, 8)}`,
				performed_by: me.authId,
			}));
			const { error: insErr } = await supabase
				.from("stock_movements")
				.insert(movements);
			if (insErr) {
				return { error: `Gagal create stock movements: ${insErr.message}` };
			}
			updatePayload.stock_committed_at = new Date().toISOString();
			updatePayload.stock_movement_batch_id = batchId;
		}
	} else if (!willApprove && wasApproved && hadStockCommitted) {
		// Reject after prior approval → reverse the original movements
		const { data: priorMovements } = await supabase
			.from("stock_movements")
			.select("id, item_id, quantity, unit_cost, source_description")
			.eq("source", "rekap_consumption")
			.eq("source_id", existing.event_id)
			.eq("direction", "out");

		if (priorMovements && priorMovements.length > 0) {
			const reversals = priorMovements.map((m) => ({
				ref_id: buildRefId("in"),
				item_id: m.item_id,
				direction: "in" as const,
				quantity: m.quantity,
				unit_cost: m.unit_cost,
				source: "rekap_consumption",
				source_id: existing.event_id,
				source_description: `Reversal: rekap rejected (${m.source_description ?? ""})`,
				notes: "Auto-reversal: rekap rejected after prior approval",
				performed_by: me.authId,
			}));
			const { error: revErr } = await supabase
				.from("stock_movements")
				.insert(reversals);
			if (revErr) {
				return {
					error: `Gagal create reversal movements: ${revErr.message}`,
				};
			}
		}
		updatePayload.stock_committed_at = null;
		updatePayload.stock_movement_batch_id = null;
	}

	const { error } = await supabase
		.from("crew_rekap")
		.update(updatePayload)
		.eq("id", rekapId);
	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/settle`);
	revalidatePath("/warehouse");
	return {};
}

// Re-export REKAP_FIELDS so consumers don't need a second import.
export async function listRekapFields(): Promise<readonly RekapField[]> {
	return REKAP_FIELDS;
}
