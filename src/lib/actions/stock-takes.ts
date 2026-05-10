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
 * Create a draft stock-take. Optionally seed lines for all consumable +
 * equipment items so owner can edit counted_qty inline.
 */
export async function createStockTake(formData: FormData): Promise<
	| { ok: true; id: string }
	| { ok: false; error: string }
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
		return { ok: false, error: error?.message ?? "Failed to create stock take" };
	}

	// Seed lines from current items + RPC stock count
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
				const sysQty = Number(stock ?? 0);
				return {
					stock_take_id: take.id,
					item_id: it.id,
					system_qty: sysQty,
					counted_qty: sysQty,
				};
			}),
		);
		await supabase.from("stock_take_lines").insert(lines);
	}

	revalidatePath("/warehouse/stock-take");
	return { ok: true, id: take.id };
}

const UpdateLineSchema = z.object({
	stock_take_id: z.uuid(),
	item_id: z.uuid(),
	counted_qty: z.coerce.number().int().nonnegative(),
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
			notes: parsed.data.notes,
			updated_at: new Date().toISOString(),
		})
		.eq("stock_take_id", parsed.data.stock_take_id)
		.eq("item_id", parsed.data.item_id);
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/warehouse/stock-take/${parsed.data.stock_take_id}`);
	return { ok: true };
}

export async function commitStockTake(stockTakeId: string): Promise<
	{ ok: true; movements: number } | { ok: false; error: string }
> {
	const me = await requireOwnerLevel();

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("commit_stock_take", {
		p_stock_take_id: stockTakeId,
		p_actor: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/stock-take");
	revalidatePath(`/warehouse/stock-take/${stockTakeId}`);
	return { ok: true, movements: Number(data ?? 0) };
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
