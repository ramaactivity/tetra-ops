"use server";

import { previewRekapHpp } from "@/lib/actions/rekap";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export type HppBreakdown = {
	mediaset: number;
	sleeve: number;
	flashdisk: number;
	pouch: number;
	photomagnet: number;
	keychain: number;
	bonus: number;
	other: number;
	total: number;
};

export type OpexBreakdown = {
	fee_lead: number;
	fee_asisten: number;
	fee_crew_c: number;
	fee_extra: number;
	reimbursement: number;
	transport: number;
	bensin: number;
	toll: number;
	parking: number;
	konsumsi: number;
	misc: number;
	komisi_vendor: number;
	komisi_relasi: number;
	/** Biaya event dibayar langsung owner (via Catat transaksi) — info, BUKAN bagian total. */
	owner_paid_total: number;
	total: number;
};

export type ProfitPreview = {
	revenue_gross: number;
	addon_revenue: number;
	discount_total: number;
	revenue_net: number;
	hpp: HppBreakdown;
	opex: OpexBreakdown;
	total_biaya: number;
	net_profit: number;
	margin_pct: number;
	is_loss: boolean;
	sinking_estimate: number;
	owner_pool_estimate: number;
	operating_cash_estimate: number;
};

export type ProfitPreviewResponse =
	| { ok: true; data: ProfitPreview }
	| { ok: false; error: string };

const EMPTY_HPP: HppBreakdown = {
	mediaset: 0,
	sleeve: 0,
	flashdisk: 0,
	pouch: 0,
	photomagnet: 0,
	keychain: 0,
	bonus: 0,
	other: 0,
	total: 0,
};

const EMPTY_OPEX: OpexBreakdown = {
	fee_lead: 0,
	fee_asisten: 0,
	fee_crew_c: 0,
	fee_extra: 0,
	reimbursement: 0,
	transport: 0,
	bensin: 0,
	toll: 0,
	parking: 0,
	konsumsi: 0,
	misc: 0,
	komisi_vendor: 0,
	komisi_relasi: 0,
	owner_paid_total: 0,
	total: 0,
};

export async function getProfitPreview(
	eventId: string,
): Promise<ProfitPreviewResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { ok: false, error: "Forbidden" };
	}

	const supabase = await createClient();

	// 1) Find recap for this event
	const { data: recap, error: recapErr } = await supabase
		.from("crew_rekap")
		.select("id, hpp_snapshot")
		.eq("event_id", eventId)
		.maybeSingle();
	if (recapErr) return { ok: false, error: recapErr.message };

	// 2) Revenue: events.base_price/custom_package_price + addons_total - discount = grand_total
	const [{ data: ev }, { data: sinkingFunds }] = await Promise.all([
		supabase
			.from("events")
			.select(
				"base_price, custom_package_price, addons_total, discount_amount, grand_total, vendor_commission_amount, referrer_commission",
			)
			.eq("id", eventId)
			.maybeSingle(),
		supabase
			.from("sinking_funds")
			.select("code, allocation_type, allocation_value, is_active")
			.eq("is_active", true),
	]);

	const revenue_gross =
		Number(ev?.custom_package_price ?? ev?.base_price ?? 0) +
		Number(ev?.addons_total ?? 0);
	const addon_revenue = Number(ev?.addons_total ?? 0);
	const discount_total = Number(ev?.discount_amount ?? 0);
	const revenue_net = Number(ev?.grand_total ?? revenue_gross - discount_total);

	// 3) HPP + OpEx via RPC (only if recap exists)
	let hpp: HppBreakdown = EMPTY_HPP;
	let opex: OpexBreakdown = EMPTY_OPEX;

	if (recap?.id) {
		// HPP: prefer canonical snapshot (di-tulis saat approval/commit) →
		// preview == settled. Kalau belum ada snapshot, hitung via planner
		// kanonik (dry-run) supaya tetap match hasil settle — BUKAN
		// calculate_recap_hpp lama yang bisa drifted.
		if (recap.hpp_snapshot) {
			hpp = normalizeHpp(recap.hpp_snapshot);
		} else {
			const planned = await previewRekapHpp(eventId);
			if (planned) hpp = normalizeHpp(planned);
		}
		const opexRes = await supabase.rpc("calculate_recap_opex", {
			p_recap_id: recap.id,
		});
		if (!opexRes.error && opexRes.data) {
			opex = normalizeOpex(opexRes.data);
		}
	}

	// Komisi diambil dari kolom event (mirror settle_event v_opex). OpEx RPC
	// tidak menghitung komisi, jadi tambahkan di sini supaya preview == settle.
	const komisi_vendor = Number(ev?.vendor_commission_amount ?? 0);
	const komisi_relasi = Number(ev?.referrer_commission ?? 0);
	opex = {
		...opex,
		komisi_vendor,
		komisi_relasi,
		total: opex.total + komisi_vendor + komisi_relasi,
	};

	const total_biaya = hpp.total + opex.total;
	const net_profit = revenue_net - total_biaya;
	const is_loss = net_profit <= 0;
	const margin_pct =
		revenue_net > 0 ? +((net_profit / revenue_net) * 100).toFixed(2) : 0;

	// 4) Sinking estimate (mirror RPC: only allocate if profit > 0)
	let sinking_estimate = 0;
	if (!is_loss) {
		for (const fund of sinkingFunds ?? []) {
			const value = Number(fund.allocation_value ?? 0);
			if (fund.allocation_type === "percentage") {
				sinking_estimate += Math.floor((net_profit * value) / 100);
			} else {
				sinking_estimate += value;
			}
		}
	}

	// 5) Owner pool estimate (mirror RPC: owner_count × per-person).
	// Owners = role 'owner' only; super_admin is admin-only, not an owner.
	const { data: owners } = await supabase
		.from("users")
		.select("id")
		.eq("role", "owner")
		.eq("is_active", true);
	const ownerCount = (owners ?? []).length;
	const POOL_PER_PERSON = 50000;
	const owner_pool_estimate = is_loss ? 0 : ownerCount * POOL_PER_PERSON;

	const operating_cash_estimate = Math.max(
		net_profit - sinking_estimate - owner_pool_estimate,
		0,
	);

	return {
		ok: true,
		data: {
			revenue_gross,
			addon_revenue,
			discount_total,
			revenue_net,
			hpp,
			opex,
			total_biaya,
			net_profit,
			margin_pct,
			is_loss,
			sinking_estimate,
			owner_pool_estimate,
			operating_cash_estimate,
		},
	};
}

export type StockCheckShortage = {
	item_id: string;
	sku: string;
	name: string;
	needed: number;
	available: number;
	shortage: number;
};

export type StockCheckResponse =
	| { ok: true; sufficient: boolean; shortages: StockCheckShortage[] }
	| { ok: false; error: string };

export async function checkRecapStock(
	recapId: string,
): Promise<StockCheckResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };

	const supabase = await createClient();
	const { data, error } = await supabase.rpc(
		"_validate_recap_stock_sufficient",
		{ p_recap_id: recapId },
	);
	if (error) return { ok: false, error: error.message };

	const result = data as {
		sufficient: boolean;
		shortages: StockCheckShortage[];
	};
	return {
		ok: true,
		sufficient: Boolean(result?.sufficient),
		shortages: (result?.shortages ?? []) as StockCheckShortage[],
	};
}

function normalizeHpp(raw: unknown): HppBreakdown {
	const o = (raw ?? {}) as Record<string, unknown>;
	const n = (k: string) => Number(o[k] ?? 0);
	return {
		mediaset: n("mediaset"),
		sleeve: n("sleeve"),
		flashdisk: n("flashdisk"),
		pouch: n("pouch"),
		photomagnet: n("photomagnet"),
		keychain: n("keychain"),
		bonus: n("bonus"),
		other: n("other"),
		total: n("total"),
	};
}

function normalizeOpex(raw: unknown): OpexBreakdown {
	const o = (raw ?? {}) as Record<string, unknown>;
	const n = (k: string) => Number(o[k] ?? 0);
	return {
		fee_lead: n("fee_lead"),
		fee_asisten: n("fee_asisten"),
		fee_crew_c: n("fee_crew_c"),
		fee_extra: n("fee_extra"),
		reimbursement: n("reimbursement"),
		transport: n("transport"),
		bensin: n("bensin"),
		toll: n("toll"),
		parking: n("parking"),
		konsumsi: n("konsumsi"),
		misc: n("misc"),
		komisi_vendor: n("komisi_vendor"),
		komisi_relasi: n("komisi_relasi"),
		owner_paid_total: n("owner_paid_total"),
		total: n("total"),
	};
}
