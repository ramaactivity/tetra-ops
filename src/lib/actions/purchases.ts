"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { qualifiesAsFixedAsset } from "@/lib/inventory/capitalization-policy";
import { inventoryCoaForSku } from "@/lib/inventory/cogs-buckets";
import { normalizeConversion, toBase } from "@/lib/inventory/unit-conversion";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const PurchaseLineSchema = z.object({
	item_id: z.uuid(),
	quantity: z.coerce.number().positive(),
	quantity_unit: z.string().trim().min(1).max(20),
	unit_cost: z.coerce.number().int().nonnegative(),
	notes: z
		.string()
		.trim()
		.max(200)
		.optional()
		.transform((v) => (v ? v : null)),
});

const PurchaseBatchSchema = z.object({
	supplier_id: z.uuid().optional().nullable(),
	purchase_date: z.string().trim(),
	payment_method: z.enum([
		"cash",
		"top_7",
		"top_14",
		"top_30",
		"top_60",
		"top_custom",
	]),
	top_days: z.coerce.number().int().nonnegative().max(365).default(0),
	// Biaya admin/transfer bank yang ditanggung perusahaan (cash purchase only;
	// untuk TOP, biaya admin muncul saat pelunasan hutang di flow payables).
	// Dibukukan sebagai debit 5-600, nambah kredit Kas Tunai.
	admin_fee: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
	invoice_no: z
		.string()
		.trim()
		.max(60)
		.optional()
		.transform((v) => (v ? v : null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	pr_id: z.uuid().optional().nullable(),
	lines: z
		.string()
		.transform((v) => {
			try {
				return JSON.parse(v);
			} catch {
				return [];
			}
		})
		.pipe(z.array(PurchaseLineSchema).min(1, "Minimal 1 baris belanja")),
});

type PurchaseErrors = {
	supplier_id?: string[];
	purchase_date?: string[];
	payment_method?: string[];
	lines?: string[];
	_form?: string[];
};

export type PurchaseFormState =
	| {
			errors?: PurchaseErrors;
			values?: Record<string, string>;
			success?: true;
			movementsCreated?: number;
			journalEntryRef?: string;
			payableId?: string;
	  }
	| undefined;

/**
 * Map an inventory item SKU to its Chart of Accounts code.
 * Mirrors the COA seed in supabase/migrations/*chart_of_accounts*:
 *   1-200 Media Set (generic)   · 1-206 Mediaset Basic · 1-207 Mediaset Perforated
 *   1-201 Sleeve · 1-202 Flashdisk · 1-203 Pouch · 1-204 Photomagnet · 1-205 Keychain
 *   1-209 Lainnya (catch-all)
 */
function newJournalRef(date: Date): string {
	const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${yyyymmdd}-${rand}`;
}

/**
 * Multi-line purchase recording.
 * - Resolves quantity_unit via inventory_items.unit_conversion JSONB → base qty.
 * - Per-line: insert one stock_movement (direction=in, source=purchase) with
 *   supplier_id attribution and unit_cost (converted to per-base-unit).
 * - Updates inventory_items.purchase_price_avg using weighted-avg with the
 *   pre-purchase stock from get_current_stock RPC.
 * - All-or-nothing: if any line fails validation we abort before inserting.
 *
 * Idempotency note: this does NOT prevent double-submits via a unique ref.
 * Owner relies on the multi-line preview + confirm dialog to avoid dupes.
 */
export async function recordPurchaseBatch(
	_prev: PurchaseFormState,
	formData: FormData,
): Promise<PurchaseFormState> {
	const me = await requireOwnerLevel();

	const parsed = PurchaseBatchSchema.safeParse({
		supplier_id: formData.get("supplier_id") || null,
		purchase_date: formData.get("purchase_date") || new Date().toISOString(),
		payment_method: formData.get("payment_method") || "cash",
		top_days: formData.get("top_days") || 0,
		admin_fee: formData.get("admin_fee") || 0,
		invoice_no: formData.get("invoice_no"),
		notes: formData.get("notes"),
		pr_id: formData.get("pr_id") || null,
		lines: formData.get("lines") ?? "[]",
	});

	if (!parsed.success) {
		const flat = parsed.error.flatten();
		return {
			errors: flat.fieldErrors as PurchaseErrors,
		};
	}

	const supabase = await createClient();

	// Resolve all referenced items in one query for unit_conversion lookup
	const itemIds = Array.from(new Set(parsed.data.lines.map((l) => l.item_id)));
	const { data: items, error: itemsErr } = await supabase
		.from("inventory_items")
		.select(
			"id, sku, name, category, unit, unit_conversion, purchase_price_avg",
		)
		.in("id", itemIds);
	if (itemsErr) {
		return { errors: { _form: [itemsErr.message] } };
	}
	const byItem = new Map((items ?? []).map((i) => [i.id as string, i]));

	// Pull fixed-asset configs (for CapEx COA routing override). Inventory
	// satellite COA fetch happens inline in journal section below.
	const faItemIds = (items ?? [])
		.filter((i) => i.category === "fixed_asset")
		.map((i) => i.id as string);
	const faConfigByItem = new Map<
		string,
		{
			coa_account_asset: string | null;
			asset_number: string | null;
			useful_life_months: number | null;
		}
	>();
	if (faItemIds.length > 0) {
		const { data: faCfgs } = await supabase
			.from("items_fixed_asset_config")
			.select("item_id, coa_account_asset, asset_number, useful_life_months")
			.in("item_id", faItemIds);
		for (const c of (faCfgs ?? []) as Array<{
			item_id: string;
			coa_account_asset: string | null;
			asset_number: string | null;
			useful_life_months: number | null;
		}>) {
			faConfigByItem.set(c.item_id, {
				coa_account_asset: c.coa_account_asset,
				asset_number: c.asset_number,
				useful_life_months: c.useful_life_months,
			});
		}
	}

	const purchaseDateIso = new Date(parsed.data.purchase_date).toISOString();
	const movements: Array<{
		ref_id: string;
		item_id: string;
		direction: "in";
		quantity: number;
		quantity_unit: string | null;
		quantity_in_unit: number | null;
		unit_cost: number;
		source: string;
		source_id: string | null;
		source_description: string;
		notes: string | null;
		performed_by: string;
		supplier_id: string | null;
		created_at: string;
	}> = [];

	// Track CapEx lines separately — fixed_asset doesn't enter stock_movements;
	// instead it updates items_fixed_asset_config and joins the journal as
	// 1-400 (or custom) debit. line_total computed at quantity * unit_cost
	// (asset purchase is 1-to-1, no base unit conversion).
	const capexLines: Array<{
		item_id: string;
		amount: number;
		coa_asset: string;
		sku: string;
		quantity: number;
		unit_cost: number;
		purchase_date: string;
		/** false → below capitalization policy: expensed (debit 5-250), not an asset. */
		capitalized: boolean;
	}> = [];

	// Validate units + compute base qty for each line
	for (const line of parsed.data.lines) {
		const it = byItem.get(line.item_id);
		if (!it) {
			return {
				errors: { _form: [`Item ${line.item_id} tidak ditemukan`] },
			};
		}

		// ─── Fixed asset (CapEx) path ─────────────────────────────────────
		// Skip stock_movements; we'll add to journal as 1-400 debit + update
		// items_fixed_asset_config.purchase_price + purchase_date.
		if (it.category === "fixed_asset") {
			const lineTotal = Math.round(line.quantity * line.unit_cost);
			const faCfg = faConfigByItem.get(line.item_id);
			// Capitalization policy decided from the ACTUAL purchase price + the
			// item's useful life. Below policy → expense it now (debit 5-250),
			// don't capitalize to the asset account.
			const capitalized = qualifiesAsFixedAsset(
				lineTotal,
				faCfg?.useful_life_months ?? null,
			);
			const coaAsset = capitalized
				? (faCfg?.coa_account_asset ?? "1-400")
				: "5-250";
			capexLines.push({
				item_id: line.item_id,
				amount: lineTotal,
				coa_asset: coaAsset,
				sku: it.sku as string,
				quantity: line.quantity,
				unit_cost: line.unit_cost,
				purchase_date: purchaseDateIso,
				capitalized,
			});
			continue;
		}

		// ─── Inventory path (existing flow) ───────────────────────────────
		const baseUnit = it.unit as string;
		const map = normalizeConversion(it.unit_conversion, baseUnit);

		let baseQty: number;
		let perUnitToBaseRatio: number;
		try {
			baseQty = toBase(line.quantity, line.quantity_unit, map);
			perUnitToBaseRatio = toBase(1, line.quantity_unit, map);
		} catch {
			return {
				errors: {
					lines: [
						`Unit "${line.quantity_unit}" tidak dikenal untuk item ${line.item_id}`,
					],
				},
			};
		}
		const baseUnitCost =
			perUnitToBaseRatio > 0
				? Math.round(line.unit_cost / perUnitToBaseRatio)
				: line.unit_cost;

		const refId = `MOV-I-${Math.floor(Math.random() * 99_999_999)
			.toString()
			.padStart(8, "0")}`;

		const lineNotes = [
			line.quantity_unit !== baseUnit
				? `[${line.quantity} ${line.quantity_unit} → ${baseQty} ${baseUnit}]`
				: null,
			line.notes,
		]
			.filter(Boolean)
			.join(" ");

		movements.push({
			ref_id: refId,
			item_id: line.item_id,
			direction: "in",
			quantity: baseQty,
			quantity_unit:
				line.quantity_unit !== baseUnit ? line.quantity_unit : null,
			quantity_in_unit: line.quantity_unit !== baseUnit ? line.quantity : null,
			unit_cost: baseUnitCost,
			source: "purchase",
			source_id: parsed.data.pr_id ?? null,
			source_description: parsed.data.invoice_no
				? `Pembelian inv ${parsed.data.invoice_no}`
				: "Pembelian",
			notes: lineNotes || null,
			performed_by: me.profile.id,
			supplier_id: parsed.data.supplier_id ?? null,
			created_at: purchaseDateIso,
		});
	}

	// Insert inventory movements (skipped if all lines were CapEx). Capture IDs
	// so we can roll them back if the journal/payable step later fails.
	const insertedMovementIds: string[] = [];
	if (movements.length > 0) {
		const { data: insRows, error: insErr } = await supabase
			.from("stock_movements")
			.insert(movements)
			.select("id");
		if (insErr) {
			return { errors: { _form: [insErr.message] } };
		}
		for (const r of (insRows ?? []) as Array<{ id: string }>) {
			insertedMovementIds.push(r.id);
		}
	}

	// Update fixed_asset_config for CapEx lines (purchase_price + date) — each
	// line is an independent update, so run them concurrently (≈1 round-trip
	// wall-clock instead of N sequential).
	await Promise.all(
		capexLines.map((cap) =>
			supabase
				.from("items_fixed_asset_config")
				.update({
					purchase_price: cap.amount,
					purchase_date: cap.purchase_date.slice(0, 10),
					depreciation_start_date: cap.purchase_date.slice(0, 10),
					// Keep the flag in sync with the actual purchase price.
					is_capitalized: cap.capitalized,
					depreciation_method: cap.capitalized ? "straight_line" : "none",
					updated_at: new Date().toISOString(),
				})
				.eq("item_id", cap.item_id),
		),
	);

	// Recompute weighted-avg cost per item via the atomic, row-locking RPC.
	// IMPORTANT: aggregate ALL lines per item first. The previous code used
	// movements.find() (FIRST line only), so an item appearing on multiple
	// batch lines undercounted the incoming qty and corrupted the avg. We sum
	// incoming base-qty and a qty-weighted incoming unit cost per item, then
	// recompute once. Movements are already inserted above (RPC reads on-hand).
	const incomingByItem = new Map<string, { qty: number; costQty: number }>();
	for (const m of movements) {
		const agg = incomingByItem.get(m.item_id) ?? { qty: 0, costQty: 0 };
		agg.qty += m.quantity;
		agg.costQty += m.quantity * m.unit_cost;
		incomingByItem.set(m.item_id, agg);
	}

	// Snapshot WAC BEFORE recompute so a later journal/payable failure can restore
	// it (compensating rollback → no silent partial-success that drifts the GL).
	const affectedIds = Array.from(incomingByItem.keys());
	const { data: oldAvgRows } = affectedIds.length
		? await supabase
				.from("inventory_items")
				.select("id, purchase_price_avg")
				.in("id", affectedIds)
		: { data: [] };
	const oldAvgMap = new Map(
		(
			(oldAvgRows ?? []) as Array<{ id: string; purchase_price_avg: number }>
		).map((r) => [r.id, Number(r.purchase_price_avg)]),
	);
	const rollbackStock = async () => {
		if (insertedMovementIds.length > 0) {
			await supabase
				.from("stock_movements")
				.delete()
				.in("id", insertedMovementIds);
		}
		for (const [id, avg] of oldAvgMap) {
			await supabase
				.from("inventory_items")
				.update({ purchase_price_avg: avg })
				.eq("id", id);
			await supabase
				.from("items_inventory_config")
				.update({ purchase_price_avg: avg })
				.eq("item_id", id);
		}
	};

	await Promise.all(
		Array.from(incomingByItem.entries()).map(async ([itemId, agg]) => {
			if (agg.qty <= 0) return;
			const incomingCost = agg.costQty / agg.qty; // qty-weighted incoming cost
			const { error: avgErr } = await supabase.rpc(
				"recompute_weighted_avg_cost",
				{
					p_item_id: itemId,
					p_incoming_qty: agg.qty,
					p_incoming_cost: incomingCost,
				},
			);
			if (avgErr) {
				console.error(
					`[purchases] recompute_weighted_avg_cost failed for ${itemId}:`,
					avgErr.message,
				);
			}
		}),
	);

	// ─── Journal entry: auto-cash entry / AP entry ────────────────────────
	// Cash purchase → DEBIT inventory accounts, CREDIT Kas Tunai (1-100).
	// TOP purchase → DEBIT inventory accounts, CREDIT Hutang Vendor (2-101).
	// Skipped on best-effort basis — stock_movements already committed; if
	// journal insert fails we still return success and note it.
	let journalEntryRef: string | undefined;
	let journalEntryId: string | undefined;
	try {
		// Compute totals grouped by COA code — mix of inventory accounts
		// (per item SKU) + fixed-asset accounts (1-400 default, overridable).
		const totalByCoa = new Map<string, number>();
		let grandTotal = 0;

		// Inventory lines
		for (const m of movements) {
			const it = byItem.get(m.item_id);
			const sku = (it as { sku?: string } | undefined)?.sku ?? "";
			const coa = inventoryCoaForSku(sku);
			const lineTotal = Math.round(m.quantity * m.unit_cost);
			totalByCoa.set(coa, (totalByCoa.get(coa) ?? 0) + lineTotal);
			grandTotal += lineTotal;
		}

		// CapEx lines (fixed asset purchases)
		for (const cap of capexLines) {
			totalByCoa.set(
				cap.coa_asset,
				(totalByCoa.get(cap.coa_asset) ?? 0) + cap.amount,
			);
			grandTotal += cap.amount;
		}

		if (grandTotal > 0) {
			const isCash = parsed.data.payment_method === "cash";
			// Biaya admin bank hanya berlaku pada pembelian cash (dibayar sekarang).
			// TOP → admin fee muncul saat pelunasan hutang (flow payables), bukan di sini.
			const adminFee = isCash ? parsed.data.admin_fee : 0;
			const creditAccount = isCash ? "1-100" : "2-101";
			// Uang kas yang benar-benar keluar = nilai barang + biaya admin.
			const creditTotal = grandTotal + adminFee;
			const entryType = isCash ? "transfer" : "asset_in";
			const refId = newJournalRef(new Date(purchaseDateIso));
			const entryDate = purchaseDateIso.slice(0, 10);

			const descParts: string[] = [];
			if (parsed.data.invoice_no) {
				descParts.push(`Pembelian inv ${parsed.data.invoice_no}`);
			} else {
				descParts.push("Pembelian stok");
			}
			if (parsed.data.supplier_id) {
				const { data: sup } = await supabase
					.from("suppliers")
					.select("name")
					.eq("id", parsed.data.supplier_id)
					.maybeSingle();
				if (sup?.name) descParts.push(`dari ${sup.name}`);
			}
			if (!isCash) {
				descParts.push(`(${parsed.data.payment_method.toUpperCase()})`);
			}

			const { data: entry, error: entryErr } = await supabase
				.from("journal_entries")
				.insert({
					ref_id: refId,
					entry_date: entryDate,
					entry_type: entryType,
					description: descParts.join(" "),
					source_type: "purchase",
					source_id: parsed.data.pr_id ?? null,
					total_amount: creditTotal,
					created_by: me.profile.id,
				})
				.select("id")
				.single();
			if (entryErr || !entry) {
				console.error("[purchases] journal_entries insert failed:", entryErr);
				await rollbackStock();
				return {
					errors: {
						_form: [
							`Pembelian dibatalkan — gagal catat jurnal: ${entryErr?.message ?? "unknown"}. Coba lagi.`,
						],
					},
				};
			} else {
				const lines: Array<{
					entry_id: string;
					account_code: string;
					debit_amount: number;
					credit_amount: number;
					description: string;
					line_order: number;
				}> = [];
				let order = 1;
				for (const [coa, amount] of totalByCoa) {
					// Differentiate CapEx (1-4xx) vs Persediaan (1-2xx) in description
					const isCapEx = coa.startsWith("1-4");
					lines.push({
						entry_id: entry.id,
						account_code: coa,
						debit_amount: amount,
						credit_amount: 0,
						description: isCapEx ? "Aktiva tetap masuk" : "Persediaan masuk",
						line_order: order++,
					});
				}
				// Biaya admin bank → debit 5-600 (beban perusahaan), terpisah dari
				// nilai persediaan supaya HPP tetap akurat.
				if (adminFee > 0) {
					lines.push({
						entry_id: entry.id,
						account_code: "5-600",
						debit_amount: adminFee,
						credit_amount: 0,
						description: "Biaya admin/transfer bank",
						line_order: order++,
					});
				}
				lines.push({
					entry_id: entry.id,
					account_code: creditAccount,
					debit_amount: 0,
					credit_amount: creditTotal,
					description: isCash
						? "Pembayaran kas tunai"
						: `Hutang vendor (${parsed.data.payment_method.toUpperCase()})`,
					line_order: order,
				});

				const { error: linesErr } = await supabase
					.from("journal_lines")
					.insert(lines);
				if (linesErr) {
					console.error("[purchases] journal_lines insert failed:", linesErr);
					// Roll back the entry header + stock so nothing is left half-done.
					await supabase.from("journal_entries").delete().eq("id", entry.id);
					await rollbackStock();
					return {
						errors: {
							_form: [
								`Pembelian dibatalkan — gagal catat jurnal: ${linesErr.message}. Coba lagi.`,
							],
						},
					};
				}
				journalEntryRef = refId;
				journalEntryId = entry.id;
			}
		}
	} catch (e) {
		console.error("[purchases] journal entry error:", e);
		await rollbackStock();
		return {
			errors: {
				_form: [
					`Pembelian dibatalkan — error jurnal: ${e instanceof Error ? e.message : String(e)}.`,
				],
			},
		};
	}

	// ─── Hutang Dagang (payable) — only for non-cash purchases ────────────
	// Insert one payable per Pembelian TOP batch. Tracks due_date computed
	// from purchase_date + top_days mapping.
	let payableId: string | undefined;
	try {
		const isCash = parsed.data.payment_method === "cash";
		if (!isCash && journalEntryId) {
			// Sertakan capexLines: aset tetap yang dibeli TOP juga jadi hutang ke
			// vendor, dan jurnal sudah meng-kredit 2-101 untuk inventory+capex.
			// Tanpa ini, batch TOP campur inventory+aset (atau murni aset) bikin
			// payable < kredit 2-101 → drift kontrol-akun (reconciliation-check).
			const grandTotal =
				movements.reduce(
					(s, m) => s + Math.round(m.quantity * m.unit_cost),
					0,
				) + capexLines.reduce((s, c) => s + c.amount, 0);
			if (grandTotal > 0) {
				const topDays =
					parsed.data.payment_method === "top_7"
						? 7
						: parsed.data.payment_method === "top_14"
							? 14
							: parsed.data.payment_method === "top_30"
								? 30
								: parsed.data.payment_method === "top_60"
									? 60
									: parsed.data.top_days || 30;

				const issuedDate = new Date(purchaseDateIso);
				const dueDate = new Date(issuedDate);
				dueDate.setDate(dueDate.getDate() + topDays);

				// Build descriptive label
				let label = parsed.data.invoice_no
					? `Pembelian inv ${parsed.data.invoice_no}`
					: "Pembelian stok";
				if (parsed.data.supplier_id) {
					const { data: sup } = await supabase
						.from("suppliers")
						.select("name")
						.eq("id", parsed.data.supplier_id)
						.maybeSingle();
					if (sup?.name) label += ` — ${sup.name}`;
				}

				const { data: payable, error: payErr } = await supabase
					.from("payables")
					.insert({
						supplier_id: parsed.data.supplier_id ?? null,
						source_type: "purchase",
						source_journal_id: journalEntryId,
						invoice_no: parsed.data.invoice_no ?? null,
						description: label,
						amount: grandTotal,
						amount_paid: 0,
						issued_date: issuedDate.toISOString().slice(0, 10),
						due_date: dueDate.toISOString().slice(0, 10),
						payment_terms: parsed.data.payment_method,
						status: "open",
						notes: parsed.data.notes ?? null,
					})
					.select("id")
					.single();
				if (payErr) {
					console.error("[purchases] payable insert failed:", payErr);
					// JE already posted for a TOP purchase — undo JE + stock so the
					// payable subledger never disagrees with GL 2-101.
					await supabase
						.from("journal_entries")
						.delete()
						.eq("id", journalEntryId);
					await rollbackStock();
					return {
						errors: {
							_form: [
								`Pembelian dibatalkan — gagal catat hutang: ${payErr.message}. Coba lagi.`,
							],
						},
					};
				}
				if (payable) payableId = payable.id;
			}
		}
	} catch (e) {
		console.error("[purchases] payable creation error:", e);
		if (journalEntryId) {
			await supabase.from("journal_entries").delete().eq("id", journalEntryId);
		}
		await rollbackStock();
		return {
			errors: {
				_form: [
					`Pembelian dibatalkan — error hutang: ${e instanceof Error ? e.message : String(e)}.`,
				],
			},
		};
	}

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/purchases");
	revalidatePath("/warehouse/purchase-requests");
	revalidatePath("/finance");
	revalidatePath("/finance/payables");
	return {
		success: true,
		movementsCreated: movements.length,
		journalEntryRef,
		payableId,
	};
}
