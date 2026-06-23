"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

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

const PRItemSchema = z.object({
	item_id: z.uuid(),
	qty_requested: z.coerce.number().positive(),
	unit: z.string().trim().min(1).max(20),
	notes: z
		.string()
		.trim()
		.max(200)
		.optional()
		.transform((v) => (v ? v : null)),
});

const CreatePRSchema = z.object({
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	items: z
		.string()
		.transform((v) => {
			try {
				return JSON.parse(v);
			} catch {
				return [];
			}
		})
		.pipe(z.array(PRItemSchema).min(1, "Minimal 1 item")),
});

type PRErrors = { notes?: string[]; items?: string[]; _form?: string[] };

export type PRFormState =
	| {
			errors?: PRErrors;
			values?: Record<string, string>;
			success?: true;
			id?: string;
	  }
	| undefined;

export async function createPurchaseRequest(
	_prev: PRFormState,
	formData: FormData,
): Promise<PRFormState> {
	const me = await requireOwnerOrCrew();

	const parsed = CreatePRSchema.safeParse({
		notes: formData.get("notes"),
		items: formData.get("items") ?? "[]",
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as PRErrors,
			values: {
				notes: String(formData.get("notes") ?? ""),
				items: String(formData.get("items") ?? ""),
			},
		};
	}

	const supabase = await createClient();
	const { data: pr, error: prErr } = await supabase
		.from("purchase_requests")
		.insert({
			requested_by: me.profile.id,
			notes: parsed.data.notes,
			status: "open",
		})
		.select("id")
		.single();
	if (prErr || !pr) {
		return { errors: { _form: [prErr?.message ?? "Gagal create PR"] } };
	}

	const lines = parsed.data.items.map((i) => ({
		pr_id: pr.id,
		item_id: i.item_id,
		qty_requested: i.qty_requested,
		unit: i.unit,
		notes: i.notes,
	}));
	const { error: itemsErr } = await supabase
		.from("purchase_request_items")
		.insert(lines);
	if (itemsErr) {
		// Roll back the PR header so we don't leave an empty one
		await supabase.from("purchase_requests").delete().eq("id", pr.id);
		return { errors: { _form: [itemsErr.message] } };
	}

	revalidatePath("/warehouse/purchase-requests");
	revalidatePath("/warehouse");
	return { success: true, id: pr.id };
}

const ReceiveItemSchema = z.object({
	pr_item_id: z.uuid(),
	qty_received: z.coerce.number().nonnegative(),
	supplier_id: z.uuid().optional().nullable(),
	unit_cost: z.coerce.number().int().nonnegative().optional().nullable(),
	notes: z.string().trim().max(200).optional(),
});

const ReceivePRSchema = z.object({
	pr_id: z.uuid(),
	items: z
		.string()
		.transform((v) => {
			try {
				return JSON.parse(v);
			} catch {
				return [];
			}
		})
		.pipe(z.array(ReceiveItemSchema).min(1)),
	supplier_id: z.uuid().optional().nullable(),
});

/**
 * Owner clicks "Terima" on a PR. Each line with qty_received > 0 generates
 * one stock_movement (direction=in, source=purchase_request) and bumps the
 * PRI's qty_received. The PR status trigger auto-rolls to partial/completed.
 */
export async function receivePurchaseRequest(
	formData: FormData,
): Promise<{ ok: true; movements: number } | { ok: false; error: string }> {
	const me = await requireOwnerLevel();

	const parsed = ReceivePRSchema.safeParse({
		pr_id: formData.get("pr_id"),
		items: formData.get("items") ?? "[]",
		supplier_id: formData.get("supplier_id") || null,
	});
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join(", "),
		};
	}

	const supabase = await createClient();

	// Fetch the PR items to validate + get item_ids
	const ids = parsed.data.items.map((i) => i.pr_item_id);
	const { data: priRows, error: priErr } = await supabase
		.from("purchase_request_items")
		.select("id, pr_id, item_id, qty_requested, qty_received, unit")
		.in("id", ids);
	if (priErr) return { ok: false, error: priErr.message };
	if (!priRows || priRows.length === 0) {
		return { ok: false, error: "Tidak ada item yang ditemukan" };
	}

	const byId = new Map(priRows.map((r) => [r.id, r]));
	const wrongPR = priRows.find((r) => r.pr_id !== parsed.data.pr_id);
	if (wrongPR) return { ok: false, error: "Item bukan dari PR ini" };

	const movements: Array<{
		ref_id: string;
		item_id: string;
		direction: "in";
		quantity: number;
		unit_cost: number | null;
		source: string;
		source_id: string;
		source_description: string;
		notes: string | null;
		performed_by: string;
		supplier_id: string | null;
	}> = [];

	const priUpdates: Array<{ id: string; qty_received: number }> = [];

	for (const incoming of parsed.data.items) {
		const pri = byId.get(incoming.pr_item_id);
		if (!pri) continue;
		if (incoming.qty_received <= 0) continue;

		const newReceived = Number(pri.qty_received) + incoming.qty_received;
		priUpdates.push({ id: pri.id, qty_received: newReceived });

		const refId = `MOV-I-${Math.floor(Math.random() * 99_999_999)
			.toString()
			.padStart(8, "0")}`;
		movements.push({
			ref_id: refId,
			item_id: pri.item_id,
			direction: "in",
			quantity: incoming.qty_received,
			unit_cost: incoming.unit_cost ?? null,
			source: "purchase_request",
			source_id: parsed.data.pr_id,
			source_description: `Terima PR (qty ${incoming.qty_received} ${pri.unit})`,
			notes: incoming.notes ?? null,
			performed_by: me.profile.id,
			supplier_id: parsed.data.supplier_id ?? null,
		});
	}

	if (movements.length === 0) {
		return { ok: false, error: "Tidak ada qty diterima" };
	}

	const { error: insErr } = await supabase
		.from("stock_movements")
		.insert(movements);
	if (insErr) return { ok: false, error: insErr.message };

	// Update weighted-avg cost for items received WITH a unit_cost (so the
	// canonical purchase_price_avg no longer goes stale on PR receipt). Lines
	// without a cost still increase on-hand but leave the avg untouched.
	// Aggregate per item (an item can span multiple PR lines), then one atomic
	// row-locking recompute each. Movements are already inserted above.
	const costedByItem = new Map<string, { qty: number; costQty: number }>();
	for (const m of movements) {
		if (m.unit_cost === null) continue;
		const agg = costedByItem.get(m.item_id) ?? { qty: 0, costQty: 0 };
		agg.qty += m.quantity;
		agg.costQty += m.quantity * m.unit_cost;
		costedByItem.set(m.item_id, agg);
	}
	await Promise.all(
		Array.from(costedByItem.entries()).map(async ([itemId, agg]) => {
			if (agg.qty <= 0) return;
			const { error: avgErr } = await supabase.rpc(
				"recompute_weighted_avg_cost",
				{
					p_item_id: itemId,
					p_incoming_qty: agg.qty,
					p_incoming_cost: agg.costQty / agg.qty,
				},
			);
			if (avgErr) {
				console.error(
					`[purchase-requests] recompute_weighted_avg_cost failed for ${itemId}:`,
					avgErr.message,
				);
			}
		}),
	);

	// Each row gets a distinct qty_received, so this can't be one bulk UPDATE —
	// but the updates are independent, so fire them concurrently (≈1 round-trip
	// wall-clock instead of N sequential ones) and surface any failure.
	const priUpdateResults = await Promise.all(
		priUpdates.map((u) =>
			supabase
				.from("purchase_request_items")
				.update({ qty_received: u.qty_received })
				.eq("id", u.id),
		),
	);
	const priUpdateErr = priUpdateResults.find((r) => r.error)?.error;
	if (priUpdateErr) return { ok: false, error: priUpdateErr.message };

	revalidatePath("/warehouse/purchase-requests");
	revalidatePath("/warehouse");
	return { ok: true, movements: movements.length };
}

export async function cancelPurchaseRequest(
	prId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("purchase_requests")
		.update({
			status: "cancelled",
			updated_at: new Date().toISOString(),
		})
		.eq("id", prId)
		.in("status", ["open", "partial"]);
	if (error) return { ok: false, error: error.message };
	revalidatePath("/warehouse/purchase-requests");
	return { ok: true };
}
