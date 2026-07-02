"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { defaultsForInventorySku } from "@/lib/inventory/coa-defaults";
import { inventoryCoaForSku } from "@/lib/inventory/cogs-buckets";
import { getItemWithConfig } from "@/lib/inventory/item-loader";
import { createClient } from "@/lib/supabase/server";

/**
 * Wastage recording engine.
 *
 * Saat catat wastage (testing waste, defective on arrival, handling damage,
 * dst.), sistem melakukan 3 hal atomik:
 *   1. INSERT stock_movements (direction=out, source=wastage, qty di base unit)
 *   2. INSERT wastage_logs (link ke movement + cost snapshot + alasan)
 *   3. INSERT journal_entries + journal_lines:
 *        Dr 5-510 Beban Wastage
 *        Cr <coa_account_inventory dari item config>
 *
 * Catatan: purchase_price_avg TIDAK di-update — wastage hanya kurangi qty.
 *
 * Hanya untuk item kategori `inventory`. Fixed asset waste / write-off
 * akan ditangani di flow terpisah (Phase berikutnya).
 */

const WASTAGE_REASONS = [
	"testing",
	"defective_on_arrival",
	"handling_damage",
	"production_reject",
	"expired",
	"customer_returned",
	"opname_shortage",
	"other",
] as const;

export type WastageReason = (typeof WASTAGE_REASONS)[number];

const WastageInputSchema = z.object({
	item_id: z.uuid("Item tidak valid"),
	qty_base: z.coerce.number().positive("Qty harus > 0"),
	reason: z.enum(WASTAGE_REASONS, "Pilih alasan"),
	reason_detail: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	event_id: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null))
		.refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), {
			message: "event_id harus UUID atau kosong",
		}),
	supplier_id: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null))
		.refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), {
			message: "supplier_id harus UUID atau kosong",
		}),
	evidence_url: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null))
		.refine((v) => v === null || /^https?:\/\//.test(v), {
			message: "URL evidence harus http(s)://...",
		}),
});

export type WastageInput = z.infer<typeof WastageInputSchema>;
type Errors = Partial<Record<keyof WastageInput | "_form", string[]>>;
export type WastageFormState =
	| { errors?: Errors; values?: Record<string, string>; success?: true }
	| undefined;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function snapshot(formData: FormData): Record<string, string> {
	const keys = [
		"item_id",
		"qty_base",
		"reason",
		"reason_detail",
		"event_id",
		"supplier_id",
		"evidence_url",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	return out;
}

/** Build a stable, sortable ref_id: WST-YYYYMMDD-XXXXX. */
function newWastageRef(): string {
	const d = new Date();
	const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
	const rand = Math.floor(Math.random() * 99999)
		.toString()
		.padStart(5, "0");
	return `WST-${yyyymmdd}-${rand}`;
}

function newMovementRef(): string {
	return `MOV-O-${Math.floor(Math.random() * 99_999_999)
		.toString()
		.padStart(8, "0")}`;
}

function newJournalRef(): string {
	const d = new Date();
	const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${yyyymmdd}-${rand}`;
}

export async function recordWastage(
	_prev: WastageFormState,
	formData: FormData,
): Promise<WastageFormState> {
	const me = await requireOwnerLevel();

	const parsed = WastageInputSchema.safeParse({
		item_id: formData.get("item_id"),
		qty_base: formData.get("qty_base"),
		reason: formData.get("reason"),
		reason_detail: formData.get("reason_detail"),
		event_id: formData.get("event_id"),
		supplier_id: formData.get("supplier_id"),
		evidence_url: formData.get("evidence_url"),
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as Errors,
			values: snapshot(formData),
		};
	}
	const data = parsed.data;
	const supabase = await createClient();

	// 1. Load item — must be category=inventory
	const loaded = await getItemWithConfig(supabase, data.item_id);
	if (!loaded) {
		return {
			errors: { _form: ["Item tidak ditemukan"] },
			values: snapshot(formData),
		};
	}
	if (loaded.kind !== "inventory") {
		return {
			errors: {
				_form: [
					"Wastage hanya untuk Persediaan. Untuk Aset Tetap, gunakan flow Incident / Write-off.",
				],
			},
			values: snapshot(formData),
		};
	}

	const item = loaded.base;
	const cfg = loaded.config;
	const avgCost = cfg.purchase_price_avg ?? 0;
	const costAtTime = Math.round(data.qty_base * avgCost);

	// 2. INSERT stock_movements (direction=out, source=wastage)
	const movementRef = newMovementRef();
	const sourceDesc = `Wastage: ${data.reason}${data.reason_detail ? ` — ${data.reason_detail}` : ""}`;
	const { data: movement, error: movErr } = await supabase
		.from("stock_movements")
		.insert({
			ref_id: movementRef,
			item_id: data.item_id,
			direction: "out",
			quantity: data.qty_base,
			unit_cost: avgCost,
			source: "wastage",
			// source_id stays null for wastage: the event link (if any) lives in
			// wastage_logs.event_id, and the journal/wastage_log reference this
			// movement — not the other way round. Storing event_id here was wrong
			// (it mislabels a wastage row as an event reference for reconciliation
			// joins on (source, source_id)).
			source_id: null,
			source_description: sourceDesc,
			notes: data.reason_detail,
			performed_by: me.profile.id,
			supplier_id: data.supplier_id,
		})
		.select("id")
		.single();
	if (movErr || !movement) {
		return {
			errors: {
				_form: [`Gagal insert stock_movement: ${movErr?.message}`],
			},
			values: snapshot(formData),
		};
	}

	// 3. INSERT wastage_logs
	const wastageRef = newWastageRef();
	const { error: wstErr } = await supabase.from("wastage_logs").insert({
		ref_id: wastageRef,
		item_id: data.item_id,
		qty_base: data.qty_base,
		reason: data.reason,
		reason_detail: data.reason_detail,
		cost_at_time: costAtTime,
		event_id: data.event_id,
		supplier_id: data.supplier_id,
		evidence_url: data.evidence_url,
		stock_movement_id: movement.id,
		reported_by: me.profile.id,
	});
	if (wstErr) {
		// Rollback the movement so audit stays consistent
		await supabase.from("stock_movements").delete().eq("id", movement.id);
		return {
			errors: { _form: [`Gagal insert wastage_log: ${wstErr.message}`] },
			values: snapshot(formData),
		};
	}

	// 4. INSERT journal_entries + journal_lines (Dr 5-510 / Cr coa_inventory)
	//    Best-effort: log error tapi tidak rollback wastage (data inti sudah
	//    tersimpan; jurnal bisa di-redo manual jika gagal).
	if (costAtTime > 0) {
		// Canonical bucket COA so wastage/opname credit the SAME inventory account
		// purchases debit and COGS credits — keeps GL inventory = physical stock.
		const inventoryAccount = inventoryCoaForSku(item.sku);
		const wastageAccount =
			cfg.coa_account_wastage ?? defaultsForInventorySku(item.sku).wastage;
		const journalRef = newJournalRef();
		const today = new Date().toISOString().slice(0, 10);

		const { data: entry, error: entryErr } = await supabase
			.from("journal_entries")
			.insert({
				ref_id: journalRef,
				entry_date: today,
				entry_type: "adjustment",
				description: `Wastage ${item.sku} — ${data.reason}`,
				source_type: "wastage",
				source_id: movement.id,
				total_amount: costAtTime,
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (entryErr || !entry) {
			console.error("[wastage] journal_entries insert failed:", entryErr);
		} else {
			const { error: linesErr } = await supabase.from("journal_lines").insert([
				{
					entry_id: entry.id,
					account_code: wastageAccount,
					debit_amount: costAtTime,
					credit_amount: 0,
					description: `Beban wastage ${item.name}`,
					line_order: 1,
				},
				{
					entry_id: entry.id,
					account_code: inventoryAccount,
					debit_amount: 0,
					credit_amount: costAtTime,
					description: `Persediaan keluar ${data.qty_base} ${item.unit}`,
					line_order: 2,
				},
			]);
			if (linesErr) {
				console.error("[wastage] journal_lines insert failed:", linesErr);
				await supabase.from("journal_entries").delete().eq("id", entry.id);
			}
		}
	}

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/wastage");
	revalidatePath("/finance");

	return { success: true };
}

/**
 * Journal untuk koreksi stok non-pembelian dari dialog Adjust Stok
 * (opname / damage / testing / loss) yang TIDAK lewat jalur Stock Opname formal
 * maupun flow Wastage. Tanpa ini, addStockMovement mengubah qty + nilai
 * persediaan tapi GL Persediaan tak ikut → drift (ke-flag reconciliation-check,
 * tidak auto-heal). Best-effort:
 *   - 'in'  (opname lebih)                → Dr Persediaan / Cr Beban Wastage (contra)
 *   - 'out' (rusak / hilang / opname kurang) → Dr Beban Wastage / Cr Persediaan
 * Pakai COA bucket yang SAMA dengan purchase debit & COGS credit → GL = stok fisik.
 */
export async function recordAdjustmentJournal(
	supabase: Awaited<ReturnType<typeof createClient>>,
	args: {
		item_id: string;
		qty_base: number; // absolute, > 0
		direction: "in" | "out";
		stock_movement_id?: string | null;
		reported_by: string;
		label?: string; // "opname" / "damage" / "loss" — untuk deskripsi entry
	},
): Promise<{ ok: true } | { ok: false; error: string }> {
	const loaded = await getItemWithConfig(supabase, args.item_id);
	if (!loaded || loaded.kind !== "inventory") return { ok: true };
	const item = loaded.base;
	const cfg = loaded.config;
	const avgCost = cfg.purchase_price_avg ?? 0;
	const costAtTime = Math.round(args.qty_base * avgCost);
	if (costAtTime <= 0) return { ok: true };

	const inventoryAccount = inventoryCoaForSku(item.sku);
	const wastageAccount =
		cfg.coa_account_wastage ?? defaultsForInventorySku(item.sku).wastage;
	const today = new Date().toISOString().slice(0, 10);
	const isIn = args.direction === "in";

	const { data: entry, error: entryErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: newJournalRef(),
			entry_date: today,
			entry_type: "adjustment",
			description: `Adjust stok (${args.label ?? args.direction}) ${item.sku} — ${args.qty_base} ${item.unit}`,
			source_type: "wastage",
			source_id: args.stock_movement_id ?? null,
			total_amount: costAtTime,
			created_by: args.reported_by,
		})
		.select("id")
		.single();
	if (entryErr || !entry) {
		console.error(
			"[adjust-journal] journal_entries insert failed:",
			entryErr?.message,
		);
		return { ok: false, error: entryErr?.message ?? "journal insert failed" };
	}

	const persediaanLine = {
		entry_id: entry.id,
		account_code: inventoryAccount,
		debit_amount: isIn ? costAtTime : 0,
		credit_amount: isIn ? 0 : costAtTime,
		description: `Persediaan ${isIn ? "masuk" : "keluar"} ${args.qty_base} ${item.unit}`,
		line_order: isIn ? 1 : 2,
	};
	const wastageLine = {
		entry_id: entry.id,
		account_code: wastageAccount,
		debit_amount: isIn ? 0 : costAtTime,
		credit_amount: isIn ? costAtTime : 0,
		description: `Koreksi stok ${item.name}`,
		line_order: isIn ? 2 : 1,
	};
	const { error: linesErr } = await supabase
		.from("journal_lines")
		.insert([persediaanLine, wastageLine]);
	if (linesErr) {
		console.error(
			"[adjust-journal] journal_lines insert failed:",
			linesErr.message,
		);
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return { ok: false, error: linesErr.message };
	}
	return { ok: true };
}
