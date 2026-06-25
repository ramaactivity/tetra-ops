"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Depreciation accrual + Asset disposal server actions.
 *
 * `postDepreciationForMonth(period_ym)` → bungkus RPC accrue_monthly_depreciation.
 * Idempotent: re-call untuk period sama akan SKIP asset yang sudah ter-posted.
 *
 * `disposeFixedAsset(itemId, formData)` → write-off asset:
 *   - Compute current accum depr + book value
 *   - Post journal: Dr 1-401 (zero out) + Dr Kas (kalau sold) +/-
 *     Dr/Cr Gain/Loss on Disposal + Cr 1-400 (reverse asset)
 *   - Update items_fixed_asset_config (disposed_at, method, sale_price)
 *   - Update inventory_items (is_active=false)
 */

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

// ─────────────────────────────────────────────────────────────────────────
// Post monthly depreciation
// ─────────────────────────────────────────────────────────────────────────

const PeriodYmSchema = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}$/, "Format harus YYYY-MM (mis. 2026-05)");

export type PostDeprResult =
	| {
			ok: true;
			posted: number;
			skipped: number;
			totalAmount: number;
			periodYm: string;
	  }
	| { ok: false; error: string };

export async function postDepreciationForMonth(
	periodYm: string,
): Promise<PostDeprResult> {
	const me = await requireOwnerLevel();
	const parsed = PeriodYmSchema.safeParse(periodYm);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0].message };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("accrue_monthly_depreciation", {
		p_period_ym: parsed.data,
		p_actor: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	const result = Array.isArray(data) ? data[0] : data;
	revalidatePath("/warehouse/assets");
	revalidatePath("/finance/accounting");
	return {
		ok: true,
		posted: Number(result?.posted_count ?? 0),
		skipped: Number(result?.skipped_count ?? 0),
		totalAmount: Number(result?.total_amount ?? 0),
		periodYm: parsed.data,
	};
}

/**
 * Cron entrypoint — accrue depreciation for the current month automatically.
 * No user session, so it uses the service-role client + a system owner as actor.
 * The RPC is idempotent (UNIQUE item_id+period), so a missed/late run is safe to
 * repeat. Without this, monthly depreciation was simply never posted unless a
 * human clicked the button.
 */
export async function runDepreciationInternal(
	periodYm?: string,
): Promise<PostDeprResult> {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return { ok: false, error: "Service key tidak tersedia" };
	const sb = createServiceClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});

	// Period default = bulan berjalan (Asia/Jakarta) YYYY-MM.
	const period =
		periodYm ??
		new Date()
			.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
			.slice(0, 7);
	const parsed = PeriodYmSchema.safeParse(period);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0].message };

	const { data: actor } = await sb
		.from("users")
		.select("id")
		.in("role", ["owner", "super_admin"])
		.eq("is_active", true)
		.order("created_at")
		.limit(1)
		.maybeSingle();
	if (!actor) return { ok: false, error: "Tidak ada owner sebagai actor" };

	const { data, error } = await sb.rpc("accrue_monthly_depreciation", {
		p_period_ym: parsed.data,
		p_actor: actor.id,
	});
	if (error) return { ok: false, error: error.message };

	const result = Array.isArray(data) ? data[0] : data;
	return {
		ok: true,
		posted: Number(result?.posted_count ?? 0),
		skipped: Number(result?.skipped_count ?? 0),
		totalAmount: Number(result?.total_amount ?? 0),
		periodYm: parsed.data,
	};
}

// ─────────────────────────────────────────────────────────────────────────
// Dispose fixed asset
// ─────────────────────────────────────────────────────────────────────────

const DISPOSAL_METHODS = [
	"sold",
	"scrapped",
	"lost",
	"donated",
	"transferred",
] as const;

const DisposalInputSchema = z.object({
	disposal_date: z.iso.date(),
	disposal_method: z.enum(DISPOSAL_METHODS, "Pilih metode"),
	disposal_sale_price: z.coerce
		.number()
		.int()
		.nonnegative("Sale price tidak boleh negatif")
		.default(0),
	disposal_notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
});

export type DisposalInput = z.infer<typeof DisposalInputSchema>;
type Errors = Partial<Record<keyof DisposalInput | "_form", string[]>>;
export type DisposalFormState =
	| { errors?: Errors; values?: Record<string, string>; success?: true }
	| undefined;

function newJournalRef(): string {
	const d = new Date();
	const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-DISP-${ym}-${rand}`;
}

function snapshot(formData: FormData): Record<string, string> {
	const out: Record<string, string> = {};
	for (const k of [
		"disposal_date",
		"disposal_method",
		"disposal_sale_price",
		"disposal_notes",
	]) {
		out[k] = String(formData.get(k) ?? "");
	}
	return out;
}

export async function disposeFixedAsset(
	itemId: string,
	_prev: DisposalFormState,
	formData: FormData,
): Promise<DisposalFormState> {
	const me = await requireOwnerLevel();
	const parsed = DisposalInputSchema.safeParse({
		disposal_date: formData.get("disposal_date"),
		disposal_method: formData.get("disposal_method"),
		disposal_sale_price: formData.get("disposal_sale_price"),
		disposal_notes: formData.get("disposal_notes"),
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as Errors,
			values: snapshot(formData),
		};
	}
	const data = parsed.data;
	const supabase = await createClient();

	// Load asset + config
	const { data: item } = await supabase
		.from("inventory_items")
		.select(
			`id, sku, name, category, is_active,
			 config:items_fixed_asset_config!inner(
			   purchase_price, salvage_value, useful_life_months,
			   depreciation_method, depreciation_start_date,
			   coa_account_asset, coa_account_accum_depr,
			   disposed_at
			 )`,
		)
		.eq("id", itemId)
		.is("deleted_at", null)
		.maybeSingle();

	if (!item) {
		return {
			errors: { _form: ["Asset tidak ditemukan"] },
			values: snapshot(formData),
		};
	}
	if (item.category !== "fixed_asset") {
		return {
			errors: { _form: ["Hanya bisa dispose item kategori Aset Tetap"] },
			values: snapshot(formData),
		};
	}

	const cfg = Array.isArray(item.config) ? item.config[0] : item.config;
	if (cfg?.disposed_at) {
		return {
			errors: { _form: ["Asset ini sudah pernah di-dispose"] },
			values: snapshot(formData),
		};
	}

	const purchasePrice = Number(cfg?.purchase_price ?? 0);
	const salvageValue = Number(cfg?.salvage_value ?? 0);
	const acctAsset = cfg?.coa_account_asset ?? "1-400";
	const acctAccum = cfg?.coa_account_accum_depr ?? "1-401";

	// Compute accumulated depreciation at disposal date (sum of all postings)
	const { data: postings } = await supabase
		.from("depreciation_postings")
		.select("monthly_amount")
		.eq("item_id", itemId);
	const accumDepr = (postings ?? []).reduce(
		(s, p) => s + Number(p.monthly_amount ?? 0),
		0,
	);
	const bookValue = Math.max(purchasePrice - accumDepr, salvageValue);

	// Net = sale_price - book_value
	// If positive → gain; if negative → loss
	const net = data.disposal_sale_price - bookValue;

	// Build journal entry (Dr/Cr balanced)
	const journalRef = newJournalRef();
	const { data: entry, error: entryErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: journalRef,
			entry_date: data.disposal_date,
			entry_type: "adjustment",
			description: `Disposal ${item.sku} (${data.disposal_method})`,
			source_type: "asset_disposal",
			source_id: itemId,
			total_amount: Math.max(
				purchasePrice,
				data.disposal_sale_price + accumDepr + Math.abs(net),
			),
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (entryErr || !entry) {
		return {
			errors: { _form: [`Gagal create journal: ${entryErr?.message}`] },
			values: snapshot(formData),
		};
	}

	type Line = {
		entry_id: string;
		account_code: string;
		debit_amount: number;
		credit_amount: number;
		description: string;
		line_order: number;
	};
	const lines: Line[] = [];
	let order = 1;

	// Dr Akum. Penyusutan (reverse contra-asset for this item)
	if (accumDepr > 0) {
		lines.push({
			entry_id: entry.id,
			account_code: acctAccum,
			debit_amount: accumDepr,
			credit_amount: 0,
			description: `Reverse akum. depresiasi ${item.name}`,
			line_order: order++,
		});
	}

	// Dr Kas (proceeds, if sold)
	if (data.disposal_sale_price > 0) {
		lines.push({
			entry_id: entry.id,
			account_code: "1-100",
			debit_amount: data.disposal_sale_price,
			credit_amount: 0,
			description: `Proceeds disposal ${item.name}`,
			line_order: order++,
		});
	}

	// Cr Peralatan & Gear (reverse asset)
	lines.push({
		entry_id: entry.id,
		account_code: acctAsset,
		debit_amount: 0,
		credit_amount: purchasePrice,
		description: `Reverse asset ${item.name}`,
		line_order: order++,
	});

	// Gain/Loss balancing line
	if (net > 0) {
		lines.push({
			entry_id: entry.id,
			account_code: "4-901",
			debit_amount: 0,
			credit_amount: net,
			description: `Gain on disposal ${item.name}`,
			line_order: order++,
		});
	} else if (net < 0) {
		lines.push({
			entry_id: entry.id,
			account_code: "5-901",
			debit_amount: -net,
			credit_amount: 0,
			description: `Loss on disposal ${item.name}`,
			line_order: order++,
		});
	}

	const { error: linesErr } = await supabase
		.from("journal_lines")
		.insert(lines);
	if (linesErr) {
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return {
			errors: { _form: [`Gagal insert journal lines: ${linesErr.message}`] },
			values: snapshot(formData),
		};
	}

	// Update config + base
	const { error: cfgErr } = await supabase
		.from("items_fixed_asset_config")
		.update({
			disposed_at: data.disposal_date,
			disposal_method: data.disposal_method,
			disposal_sale_price: data.disposal_sale_price,
			disposal_notes: data.disposal_notes,
			disposal_journal_entry_id: entry.id,
			updated_at: new Date().toISOString(),
		})
		.eq("item_id", itemId);
	if (cfgErr) {
		return {
			errors: { _form: [`Gagal update config: ${cfgErr.message}`] },
			values: snapshot(formData),
		};
	}

	await supabase
		.from("inventory_items")
		.update({ is_active: false, updated_at: new Date().toISOString() })
		.eq("id", itemId);

	revalidatePath("/warehouse/assets");
	revalidatePath("/finance/accounting");
	revalidatePath(`/warehouse/items/${itemId}/edit`);
	return { success: true };
}
