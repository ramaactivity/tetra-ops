"use server";

import { previewRekapHpp } from "@/lib/actions/rekap";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	allocateProfit,
	allocationBase,
	type ProfitAllocation,
} from "@/lib/finance/profit-allocation";
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
	/** Komisi sales Tetra (kolom events.direct_sales_commission, semua channel). */
	komisi_sales: number;
	/** Biaya event dibayar langsung owner (via Catat transaksi) — info, BUKAN bagian total. */
	owner_paid_total: number;
	total: number;
};

/**
 * Uang keluar/masuk lain yang menempel di event tapi TIDAK lewat mesin
 * settlement (biaya dibayar owner, ganti barang rusak, tip klien). Dibukukan
 * sebagai jurnal kas tersendiri — jadi tidak mengubah net_profit settlement,
 * tapi tetap uang event. Ditampilkan supaya owner lihat laba event yang
 * sebenarnya sebelum memutuskan settle.
 */
export type ExtraCashFlow = {
	/** Sudah masuk buku (jurnal manual tertaut event ini). */
	expensePosted: number;
	incomePosted: number;
	/** Masih di antrian kartu rekap — dibukukan saat settle. */
	expenseQueued: number;
	incomeQueued: number;
	expenseTotal: number;
	incomeTotal: number;
	/** Rincian per baris — sama dengan kartu "Pemasukan / pengeluaran lain". */
	items: Array<{
		label: string;
		amount: number;
		direction: "keluar" | "masuk";
		/** Belum dibukukan (dibukukan saat settle). */
		queued: boolean;
	}>;
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
	extra: ExtraCashFlow;
	/** net_profit − pengeluaran lain + pemasukan lain. */
	net_profit_after_extra: number;
	/** Rincian pembagian untung (target vs yang benar-benar dibagi). */
	allocation: ProfitAllocation;
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
	komisi_sales: 0,
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
				"base_price, custom_package_price, addons_total, discount_amount, grand_total, vendor_commission_amount, referrer_commission, direct_sales_commission",
			)
			.eq("id", eventId)
			.maybeSingle(),
		supabase
			.from("sinking_funds")
			.select(
				"code, allocation_type, allocation_value, is_active, display_order",
			)
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
	// Komisi sales Tetra dulu tidak ikut dihitung di sini → preview lebih-saji
	// laba dibanding hasil settle (settle_event membacanya untuk semua channel).
	const komisi_sales = Number(ev?.direct_sales_commission ?? 0);
	opex = {
		...opex,
		komisi_vendor,
		komisi_relasi,
		komisi_sales,
		total: opex.total + komisi_vendor + komisi_relasi + komisi_sales,
	};

	const total_biaya = hpp.total + opex.total;
	const net_profit = revenue_net - total_biaya;
	const is_loss = net_profit <= 0;
	const margin_pct =
		revenue_net > 0 ? +((net_profit / revenue_net) * 100).toFixed(2) : 0;

	// Uang keluar/masuk lain yang menempel di event ini — yang sudah dibukukan
	// (jurnal manual) maupun yang masih antre di kartu rekap.
	const [{ data: manualEntries }, { data: queued }] = await Promise.all([
		supabase
			.from("journal_entries")
			.select("entry_type, total_amount, description, created_at")
			.eq("source_event_id", eventId)
			.eq("source_type", "manual")
			.eq("is_reversed", false)
			.order("created_at", { ascending: true }),
		supabase
			.from("event_settle_queue")
			.select("direction, amount, note, created_at")
			.eq("event_id", eventId)
			.eq("kind", "expense")
			.is("posted_at", null)
			.order("created_at", { ascending: true }),
	]);
	// "Pulsa — PT Mitra … — Team Building" → "Pulsa": nama event sudah jelas
	// dari halamannya.
	const shortLabel = (s: string | null | undefined) =>
		(s ?? "").split(" — ")[0].trim() || "Transaksi";
	const items: ExtraCashFlow["items"] = [];
	let expensePosted = 0;
	let incomePosted = 0;
	for (const e of manualEntries ?? []) {
		// Hanya expense / revenue (pemasukan manual). Jurnal reversal/adjustment
		// bukan pemasukan — dulu ikut terhitung "pemasukan lain" (sama dengan
		// settle_event_impl).
		if (e.entry_type !== "expense" && e.entry_type !== "revenue") continue;
		const amt = Number(e.total_amount ?? 0);
		const keluar = e.entry_type === "expense";
		if (keluar) expensePosted += amt;
		else incomePosted += amt;
		items.push({
			label: shortLabel(e.description as string | null),
			amount: amt,
			direction: keluar ? "keluar" : "masuk",
			queued: false,
		});
	}
	let expenseQueued = 0;
	let incomeQueued = 0;
	for (const q of queued ?? []) {
		const amt = Number(q.amount ?? 0);
		const keluar = q.direction === "keluar";
		if (keluar) expenseQueued += amt;
		else incomeQueued += amt;
		items.push({
			label: shortLabel(q.note as string | null),
			amount: amt,
			direction: keluar ? "keluar" : "masuk",
			queued: true,
		});
	}
	const extra: ExtraCashFlow = {
		expensePosted,
		incomePosted,
		expenseQueued,
		incomeQueued,
		expenseTotal: expensePosted + expenseQueued,
		incomeTotal: incomePosted + incomeQueued,
		items,
	};
	const net_profit_after_extra =
		net_profit - extra.expenseTotal + extra.incomeTotal;

	// 4–5) Pembagian untung — aturan yang SAMA dengan settle_event_impl:
	// dasar = untung setelah pengeluaran lain; dana cadangan dikorbankan dulu,
	// bagi hasil owner dihapus kalau untung tidak cukup (profit-allocation.ts).
	const [{ data: owners }, { data: poolCfg }, { data: arrears }] =
		await Promise.all([
			// Owners = role 'owner' only; super_admin is admin-only, not an owner.
			supabase
				.from("users")
				.select("id")
				.eq("role", "owner")
				.eq("is_active", true),
			supabase
				.from("system_config")
				.select("value")
				.eq("key", "settlement.owner_pool_per_person")
				.maybeSingle(),
			// Tunggakan bagi hasil event lain yang belum lunas (subsidi silang).
			supabase
				.from("owner_pool_arrears")
				.select("remaining")
				.is("voided_at", null)
				.gt("remaining", 0)
				.neq("source_event_id", eventId),
		]);
	const allocation = allocateProfit({
		available: allocationBase(
			net_profit,
			extra.expenseTotal - extra.incomeTotal,
		),
		funds: (sinkingFunds ?? []).map((f) => ({
			code: f.code as string,
			allocation_type: f.allocation_type as string,
			allocation_value: Number(f.allocation_value ?? 0),
			display_order: (f.display_order as number | null) ?? 0,
		})),
		ownerCount: (owners ?? []).length,
		perPerson: Number(poolCfg?.value ?? 50000) || 50000,
		arrearsOutstanding: (arrears ?? []).reduce(
			(sum, a) => sum + Number(a.remaining ?? 0),
			0,
		),
	});
	const sinking_estimate = allocation.sinkingTotal;
	const owner_pool_estimate = allocation.ownerPool;
	const operating_cash_estimate = Math.max(
		net_profit -
			sinking_estimate -
			owner_pool_estimate -
			allocation.arrearsPaid,
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
			extra,
			net_profit_after_extra,
			allocation,
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
		komisi_sales: n("komisi_sales"),
		owner_paid_total: n("owner_paid_total"),
		total: n("total"),
	};
}
