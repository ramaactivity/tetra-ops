"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const DIRECTIONS = ["in", "out", "adjustment"] as const;
const SOURCES = [
	"manual_adjust",
	"purchase",
	"damage",
	"loss",
	"stock_take",
	"transfer",
] as const;

const StockMovementInputSchema = z.object({
	item_id: z.uuid("Item tidak valid"),
	direction: z.enum(DIRECTIONS, "Pilih arah"),
	quantity: z.coerce.number().int().positive("Quantity harus > 0"),
	unit_cost: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.coerce.number().int().nonnegative().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	source: z.enum(SOURCES, "Pilih sumber"),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
});

export type StockMovementInput = z.infer<typeof StockMovementInputSchema>;
type SmErrors = Partial<Record<keyof StockMovementInput | "_form", string[]>>;
export type StockMovementFormState =
	| { errors?: SmErrors; values?: Record<string, string> }
	| undefined;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function buildRefId(direction: (typeof DIRECTIONS)[number]) {
	const code = direction === "in" ? "I" : direction === "out" ? "O" : "A";
	return `MOV-${code}-${randomInt(10_000_000, 100_000_000)}`;
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = ["direction", "quantity", "unit_cost", "source", "notes"];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	return out;
}

export async function addStockMovement(
	itemId: string,
	_prev: StockMovementFormState,
	formData: FormData,
): Promise<StockMovementFormState> {
	const me = await requireOwnerLevel();

	const parsed = StockMovementInputSchema.safeParse({
		item_id: itemId,
		direction: formData.get("direction"),
		quantity: formData.get("quantity"),
		unit_cost: formData.get("unit_cost"),
		source: formData.get("source"),
		notes: formData.get("notes"),
	});

	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as SmErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();
	const refId = buildRefId(parsed.data.direction);

	// For purchase-direction-in with unit_cost, compute weighted-average cost
	// BEFORE inserting the movement (need pre-insert stock count).
	const isPurchaseIn =
		parsed.data.direction === "in" &&
		parsed.data.source === "purchase" &&
		parsed.data.unit_cost !== null;

	let weightedAvg: number | null = null;
	if (isPurchaseIn) {
		const [stockRes, itemRes] = await Promise.all([
			supabase.rpc("get_current_stock", { p_item_id: itemId }),
			supabase
				.from("inventory_items")
				.select("purchase_price_avg")
				.eq("id", itemId)
				.maybeSingle(),
		]);
		const oldStock = Math.max(0, Number(stockRes.data ?? 0));
		const oldAvg = Number(itemRes.data?.purchase_price_avg ?? 0);
		const newQty = parsed.data.quantity;
		const newCost = parsed.data.unit_cost ?? 0;
		const totalStock = oldStock + newQty;
		weightedAvg =
			totalStock > 0
				? Math.round((oldStock * oldAvg + newQty * newCost) / totalStock)
				: newCost;
	}

	const { error } = await supabase.from("stock_movements").insert({
		ref_id: refId,
		item_id: parsed.data.item_id,
		direction: parsed.data.direction,
		quantity: parsed.data.quantity,
		unit_cost: parsed.data.unit_cost,
		source: parsed.data.source,
		source_description: null,
		notes: parsed.data.notes,
		performed_by: me.authId,
	});

	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	if (isPurchaseIn && weightedAvg !== null) {
		await supabase
			.from("inventory_items")
			.update({
				purchase_price_avg: weightedAvg,
				updated_at: new Date().toISOString(),
			})
			.eq("id", itemId);
	}

	revalidatePath("/warehouse");
	return undefined;
}
