"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { inventoryCoaForSku } from "@/lib/inventory/cogs-buckets";

/**
 * Proactive reconciliation guard (run by the daily anomaly-scan cron). Compares
 * GL control accounts against their subledgers / physical stock; if anything
 * drifts, notifies owners (with dedup) pointing to /finance/reconciliation.
 * No session — uses the service-role client. Read-only except the notification
 * insert (only when drift exists).
 */
export type ReconCheckResult = {
	ok: boolean;
	drifts?: number;
	notified?: number;
	detail?: string[];
	error?: string;
};

function serviceClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return null;
	return createServiceClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

export async function runReconciliationCheckInternal(): Promise<ReconCheckResult> {
	const sb = serviceClient();
	if (!sb) return { ok: false, error: "Service key tidak tersedia" };

	// GL balances per account (raw = Σdebit − Σcredit)
	const { data: lines } = await sb
		.from("journal_lines")
		.select("account_code, debit_amount, credit_amount");
	const glRaw = new Map<string, number>();
	for (const l of (lines ?? []) as Array<{
		account_code: string;
		debit_amount: number;
		credit_amount: number;
	}>) {
		glRaw.set(
			l.account_code,
			(glRaw.get(l.account_code) ?? 0) +
				Number(l.debit_amount) -
				Number(l.credit_amount),
		);
	}
	const assetGl = (c: string) => glRaw.get(c) ?? 0;
	const liabGl = (c: string) => -(glRaw.get(c) ?? 0);

	const drifts: string[] = [];

	// Persediaan: GL 1-2xx vs nilai stok fisik per bucket
	const { data: items } = await sb
		.from("inventory_items")
		.select("id, sku, purchase_price_avg")
		.eq("category", "inventory")
		.eq("is_active", true)
		.is("deleted_at", null);
	const ids = ((items ?? []) as Array<{ id: string }>).map((i) => i.id);
	const { data: levels } = ids.length
		? await sb.rpc("get_stock_levels", { p_item_ids: ids })
		: { data: [] };
	const stock = new Map(
		((levels ?? []) as Array<{ item_id: string; stock: number }>).map((r) => [
			r.item_id,
			Number(r.stock),
		]),
	);
	const phys = new Map<string, number>();
	for (const it of (items ?? []) as Array<{
		id: string;
		sku: string;
		purchase_price_avg: number;
	}>) {
		const c = inventoryCoaForSku(it.sku);
		phys.set(
			c,
			(phys.get(c) ?? 0) +
				Math.round(
					(stock.get(it.id) ?? 0) * (Number(it.purchase_price_avg) || 0),
				),
		);
	}
	for (const c of [
		"1-200",
		"1-201",
		"1-202",
		"1-203",
		"1-204",
		"1-205",
		"1-209",
	]) {
		const d = assetGl(c) - (phys.get(c) ?? 0);
		if (d !== 0) drifts.push(`${c} (${d > 0 ? "+" : ""}${d})`);
	}

	// Hutang Vendor 2-101 vs payables terbuka
	const { data: payables } = await sb
		.from("payables")
		.select("amount, amount_paid, status");
	const ap = (
		(payables ?? []) as Array<{
			amount: number;
			amount_paid: number;
			status: string;
		}>
	)
		.filter((p) => p.status !== "cancelled")
		.reduce((s, p) => s + (Number(p.amount) - Number(p.amount_paid)), 0);
	if (liabGl("2-101") - ap !== 0)
		drifts.push(`2-101 (${liabGl("2-101") - ap})`);

	// Owner pool 2-300 vs owner_earnings
	const { data: earnings } = await sb.from("owner_earnings").select("amount");
	const owner = ((earnings ?? []) as Array<{ amount: number }>).reduce(
		(s, e) => s + Number(e.amount),
		0,
	);
	if (liabGl("2-300") - owner !== 0) {
		drifts.push(`2-300 (${liabGl("2-300") - owner})`);
	}

	// Sinking 2-2xx vs movements per fund
	const { data: funds } = await sb
		.from("sinking_funds")
		.select("id, coa_account");
	const { data: moves } = await sb
		.from("sinking_fund_movements")
		.select("fund_id, movement_type, amount");
	const net = new Map<string, number>();
	for (const m of (moves ?? []) as Array<{
		fund_id: string;
		movement_type: string;
		amount: number;
	}>) {
		const sign = m.movement_type === "withdrawal" ? -1 : 1;
		net.set(m.fund_id, (net.get(m.fund_id) ?? 0) + sign * Number(m.amount));
	}
	for (const f of (funds ?? []) as Array<{ id: string; coa_account: string }>) {
		const d = liabGl(f.coa_account) - (net.get(f.id) ?? 0);
		if (d !== 0) drifts.push(`${f.coa_account} (${d})`);
	}

	if (drifts.length === 0) return { ok: true, drifts: 0, notified: 0 };

	// Notify owners (dedup: skip if an unread/undismissed recon notif exists)
	const { data: owners } = await sb
		.from("users")
		.select("id")
		.in("role", ["owner", "super_admin"])
		.eq("is_active", true);
	const ownerIds = ((owners ?? []) as Array<{ id: string }>).map((o) => o.id);
	const { data: existing } = await sb
		.from("notifications")
		.select("user_id")
		.eq("entity_type", "reconciliation")
		.eq("is_dismissed", false)
		.eq("is_read", false)
		.in("user_id", ownerIds);
	const have = new Set(
		((existing ?? []) as Array<{ user_id: string }>).map((e) => e.user_id),
	);
	const body = `${drifts.length} akun belum sinkron (${drifts.slice(0, 3).join("; ")}${drifts.length > 3 ? "; …" : ""}). Cek panel Rekonsiliasi.`;
	const rows = ownerIds
		.filter((id) => !have.has(id))
		.map((id) => ({
			user_id: id,
			severity: "warning" as const,
			category: "financial" as const,
			title: "Rekonsiliasi: ada selisih keuangan",
			body,
			entity_type: "reconciliation",
			action_url: "/finance/reconciliation",
		}));
	if (rows.length > 0) await sb.from("notifications").insert(rows);

	return {
		ok: true,
		drifts: drifts.length,
		notified: rows.length,
		detail: drifts,
	};
}
