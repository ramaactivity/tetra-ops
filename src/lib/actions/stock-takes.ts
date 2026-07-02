"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

/**
 * Create a draft Stock Opname seeded with all active *inventory* items.
 *
 * Inventory v2 (2026-05-21): counted_qty stays NULL until the owner actually
 * audits the row. NULL distinguishes "not yet checked" from "checked and
 * matches system". Progress + commit semantics depend on this distinction.
 *
 * Opname v2 (2026-07-02):
 *  - Fixed assets are NOT seeded — they have no stock_movements so system_qty
 *    is always a fake 0 ("HABIS" noise) and the commit engine skips them anyway.
 *  - Single active draft: two concurrent drafts commit double adjustments, so
 *    if one exists we return it instead of creating another.
 */
export async function createStockTake(
	formData: FormData,
): Promise<
	{ ok: true; id: string; resumed?: boolean } | { ok: false; error: string }
> {
	const me = await requireOwnerLevel();
	const notes = String(formData.get("notes") ?? "").trim() || null;

	const supabase = await createClient();

	const { data: existingDraft } = await supabase
		.from("stock_takes")
		.select("id")
		.eq("status", "draft")
		.order("taken_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (existingDraft) {
		return { ok: true, id: existingDraft.id, resumed: true };
	}

	const { data: take, error } = await supabase
		.from("stock_takes")
		.insert({ taken_by: me.profile.id, notes, status: "draft" })
		.select("id")
		.single();
	if (error || !take) {
		return {
			ok: false,
			error: error?.message ?? "Gagal membuat stock opname",
		};
	}

	const { data: items } = await supabase
		.from("inventory_items")
		.select("id")
		.is("deleted_at", null)
		.eq("is_active", true)
		.eq("category", "inventory");

	if (items && items.length > 0) {
		const ids = (items as Array<{ id: string }>).map((it) => it.id);
		// Batched stock for all opname lines in one query instead of an RPC per
		// item. See get_stock_levels migration.
		const { data: levels } = await supabase.rpc("get_stock_levels", {
			p_item_ids: ids,
		});
		const stockMap = new Map(
			((levels ?? []) as Array<{ item_id: string; stock: number }>).map((r) => [
				r.item_id,
				Number(r.stock),
			]),
		);
		const lines = ids.map((id) => ({
			stock_take_id: take.id,
			item_id: id,
			system_qty: stockMap.get(id) ?? 0,
			counted_qty: null,
		}));
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
		.nullish()
		.transform((v) => (v ? v : null)),
	/**
	 * "1" = owner klik "Sesuai" (anggap fisik = sistem, tidak hitung manual).
	 * Saat commit, baris is_match mengikuti stok LIVE — bukan snapshot draft —
	 * jadi tidak pernah menciptakan adjustment palsu dari snapshot basi.
	 */
	is_match: z
		.string()
		.nullish()
		.transform((v) => v === "1"),
});

export async function updateStockTakeLine(
	formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();

	const parsed = UpdateLineSchema.safeParse({
		stock_take_id: formData.get("stock_take_id"),
		item_id: formData.get("item_id"),
		counted_qty: formData.get("counted_qty"),
		counted_breakdown: formData.get("counted_breakdown"),
		notes: formData.get("notes"),
		is_match: formData.get("is_match"),
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
			is_match: parsed.data.is_match,
			updated_at: new Date().toISOString(),
		})
		.eq("stock_take_id", parsed.data.stock_take_id)
		.eq("item_id", parsed.data.item_id);
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/warehouse/stock-take/${parsed.data.stock_take_id}`);
	return { ok: true };
}

/**
 * Bulk "anggap sesuai sistem" untuk semua baris yang belum dihitung.
 * Satu statement SQL via RPC (dulu: N update paralel). Baris ditandai
 * is_match=true — saat commit mereka mengikuti stok live, jadi aman
 * walau stok bergerak selama draft terbuka. Hitungan manual tidak ditimpa.
 */
export async function matchAllToSystem(
	stockTakeId: string,
): Promise<{ ok: true; matched: number } | { ok: false; error: string }> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("match_all_stock_take_lines", {
		p_stock_take_id: stockTakeId,
	});
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/warehouse/stock-take/${stockTakeId}`);
	return { ok: true, matched: Number(data ?? 0) };
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

export async function commitStockTake(
	stockTakeId: string,
): Promise<
	| { ok: true; movements: number; journals: number }
	| { ok: false; error: string }
> {
	const me = await requireOwnerLevel();

	// Opname v2: RPC melakukan SEMUANYA dalam satu transaksi — refresh
	// system_qty dari stok live (draft basi tidak lagi menghasilkan adjustment
	// salah), lalu movements + wastage_logs + journal_entries/lines per selisih.
	// Tidak ada lagi loop journaling best-effort di JS yang bisa mati di tengah.
	const supabase = await createClient();
	const { data, error } = await supabase.rpc("commit_stock_take", {
		p_stock_take_id: stockTakeId,
		p_actor: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	const result = (data ?? {}) as { movements?: number; journals?: number };

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/stock-take");
	revalidatePath(`/warehouse/stock-take/${stockTakeId}`);
	revalidatePath("/warehouse/wastage");
	revalidatePath("/finance");
	return {
		ok: true,
		movements: Number(result.movements ?? 0),
		journals: Number(result.journals ?? 0),
	};
}

export async function cancelStockTake(
	stockTakeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
export async function deleteStockTake(
	stockTakeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
			error:
				"Stock opname yang sudah committed adalah audit trail — tidak bisa dihapus.",
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
