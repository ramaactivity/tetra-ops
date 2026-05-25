"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { recordOpnameShortageWastage } from "@/lib/actions/wastage";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

/**
 * Create a draft Stock Opname seeded with all active inventory items.
 *
 * Inventory v2 (2026-05-21): counted_qty stays NULL until the owner actually
 * audits the row. NULL distinguishes "not yet checked" from "checked and
 * matches system". Progress + commit semantics depend on this distinction.
 */
export async function createStockTake(formData: FormData): Promise<
	{ ok: true; id: string } | { ok: false; error: string }
> {
	const me = await requireOwnerLevel();
	const notes = String(formData.get("notes") ?? "").trim() || null;

	const supabase = await createClient();
	const { data: take, error } = await supabase
		.from("stock_takes")
		.insert({ taken_by: me.profile.id, notes, status: "draft" })
		.select("id")
		.single();
	if (error || !take) {
		return { ok: false, error: error?.message ?? "Failed to create stock opname" };
	}

	const { data: items } = await supabase
		.from("inventory_items")
		.select("id")
		.is("deleted_at", null)
		.eq("is_active", true);

	if (items && items.length > 0) {
		const lines = await Promise.all(
			(items as Array<{ id: string }>).map(async (it) => {
				const { data: stock } = await supabase.rpc("get_current_stock", {
					p_item_id: it.id,
				});
				return {
					stock_take_id: take.id,
					item_id: it.id,
					system_qty: Number(stock ?? 0),
					counted_qty: null,
				};
			}),
		);
		await supabase.from("stock_take_lines").insert(lines);
	}

	revalidatePath("/warehouse/stock-take");
	return { ok: true, id: take.id };
}

const BundleSchema = z.object({
	qty: z.coerce.number().nonnegative(),
	unit: z.string().trim().min(1),
	note: z
		.string()
		.trim()
		.max(80)
		.nullable()
		.optional()
		.transform((v) => (v ? v : null)),
});

const UpdateLineSchema = z.object({
	stock_take_id: z.uuid(),
	item_id: z.uuid(),
	counted_qty: z
		.string()
		.trim()
		.transform((v) => (v === "" ? null : Number(v)))
		.refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
			message: "Counted qty harus angka non-negatif",
		}),
	/**
	 * Optional JSON-stringified array of bundles. When provided, the server
	 * trusts the client-summed `counted_qty` (already converted to base unit
	 * via lib/inventory/unit-conversion) and persists the raw composition
	 * for audit. Empty / missing string → null (single-input mode).
	 */
	counted_breakdown: z
		.string()
		.trim()
		.optional()
		.transform((v) => {
			if (!v) return null;
			try {
				const parsed = JSON.parse(v);
				if (!Array.isArray(parsed)) return null;
				const filtered = parsed
					.map((b) => BundleSchema.safeParse(b))
					.filter((r) => r.success)
					.map((r) => (r as { success: true; data: unknown }).data);
				return filtered.length > 0 ? filtered : null;
			} catch {
				return null;
			}
		}),
	notes: z
		.string()
		.trim()
		.max(200)
		.optional()
		.transform((v) => (v ? v : null)),
});

export async function updateStockTakeLine(formData: FormData): Promise<
	{ ok: true } | { ok: false; error: string }
> {
	await requireOwnerLevel();

	const parsed = UpdateLineSchema.safeParse({
		stock_take_id: formData.get("stock_take_id"),
		item_id: formData.get("item_id"),
		counted_qty: formData.get("counted_qty"),
		counted_breakdown: formData.get("counted_breakdown"),
		notes: formData.get("notes"),
	});
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join(", "),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("stock_take_lines")
		.update({
			counted_qty: parsed.data.counted_qty,
			counted_breakdown: parsed.data.counted_breakdown,
			notes: parsed.data.notes,
			updated_at: new Date().toISOString(),
		})
		.eq("stock_take_id", parsed.data.stock_take_id)
		.eq("item_id", parsed.data.item_id);
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/warehouse/stock-take/${parsed.data.stock_take_id}`);
	return { ok: true };
}

/**
 * Bulk set counted_qty = system_qty for every still-NULL line in a draft.
 * Used when owner finishes spot-checking and wants to confirm "the rest
 * are fine as-is". Only affects unaudited lines — won't overwrite manual
 * counts.
 */
export async function matchAllToSystem(stockTakeId: string): Promise<
	{ ok: true; matched: number } | { ok: false; error: string }
> {
	await requireOwnerLevel();

	const supabase = await createClient();

	const { data: nullLines, error: readErr } = await supabase
		.from("stock_take_lines")
		.select("item_id, system_qty")
		.eq("stock_take_id", stockTakeId)
		.is("counted_qty", null);
	if (readErr) return { ok: false, error: readErr.message };
	if (!nullLines || nullLines.length === 0) {
		return { ok: true, matched: 0 };
	}

	const updates = nullLines.map((l) =>
		supabase
			.from("stock_take_lines")
			.update({
				counted_qty: l.system_qty,
				updated_at: new Date().toISOString(),
			})
			.eq("stock_take_id", stockTakeId)
			.eq("item_id", l.item_id),
	);
	const results = await Promise.all(updates);
	const firstErr = results.find((r) => r.error)?.error;
	if (firstErr) return { ok: false, error: firstErr.message };

	revalidatePath(`/warehouse/stock-take/${stockTakeId}`);
	return { ok: true, matched: nullLines.length };
}

/**
 * Update notes on a draft stock-opname (owner can leave a header memo —
 * "audit pre-pameran", "check after weekend event", etc).
 */
export async function updateStockTakeNotes(
	stockTakeId: string,
	notes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();

	const trimmed = notes.trim().slice(0, 500);
	const supabase = await createClient();
	const { error } = await supabase
		.from("stock_takes")
		.update({
			notes: trimmed || null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", stockTakeId)
		.eq("status", "draft");
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/warehouse/stock-take/${stockTakeId}`);
	return { ok: true };
}

export async function commitStockTake(stockTakeId: string): Promise<
	{ ok: true; movements: number; wastageLogged: number } | { ok: false; error: string }
> {
	const me = await requireOwnerLevel();

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("commit_stock_take", {
		p_stock_take_id: stockTakeId,
		p_actor: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	// Post-commit: auto-log shortage variances as wastage (opname_shortage).
	// RPC sudah create adjustment movements; kita query yang direction=out
	// (= shortage) lalu insert wastage_logs untuk audit & cost tracking.
	let wastageLogged = 0;
	try {
		const { data: shortageMovements } = await supabase
			.from("stock_movements")
			.select("id, item_id, quantity")
			.eq("source", "stock_take")
			.eq("source_id", stockTakeId)
			.eq("direction", "out");

		for (const m of (shortageMovements ?? []) as Array<{
			id: string;
			item_id: string;
			quantity: number | string;
		}>) {
			const result = await recordOpnameShortageWastage(supabase, {
				item_id: m.item_id,
				qty_base: Number(m.quantity),
				stock_take_id: stockTakeId,
				stock_movement_id: m.id,
				reported_by: me.profile.id,
			});
			if (result.ok) wastageLogged++;
		}
	} catch (e) {
		console.error("[stock-takes] auto-wastage logging failed:", e);
	}

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/stock-take");
	revalidatePath(`/warehouse/stock-take/${stockTakeId}`);
	revalidatePath("/warehouse/wastage");
	return { ok: true, movements: Number(data ?? 0), wastageLogged };
}

export async function cancelStockTake(stockTakeId: string): Promise<
	{ ok: true } | { ok: false; error: string }
> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { error } = await supabase
		.from("stock_takes")
		.update({ status: "cancelled", updated_at: new Date().toISOString() })
		.eq("id", stockTakeId)
		.eq("status", "draft");
	if (error) return { ok: false, error: error.message };

	revalidatePath("/warehouse/stock-take");
	revalidatePath(`/warehouse/stock-take/${stockTakeId}`);
	return { ok: true };
}

/**
 * Permanent delete — only for cancelled drafts. Cleans the list view of
 * abandoned sessions. Committed takes are immutable audit trail and
 * cannot be deleted.
 */
export async function deleteStockTake(stockTakeId: string): Promise<
	{ ok: true } | { ok: false; error: string }
> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { data: existing } = await supabase
		.from("stock_takes")
		.select("status")
		.eq("id", stockTakeId)
		.maybeSingle();
	if (!existing) return { ok: false, error: "Stock opname tidak ditemukan" };
	if (existing.status === "committed") {
		return {
			ok: false,
			error: "Stock opname yang sudah committed adalah audit trail — tidak bisa dihapus.",
		};
	}

	const { error } = await supabase
		.from("stock_takes")
		.delete()
		.eq("id", stockTakeId);
	if (error) return { ok: false, error: error.message };

	revalidatePath("/warehouse/stock-take");
	return { ok: true };
}
