// Persediaan & COGS report — compute layer.
// Turns get_inventory_rollforward(month) RPC rows into a grouped, valued
// roll-forward: Stok Awal + Pembelian − Stok Akhir = Pemakaian (COGS), valued
// at the canonical WAC (inventory_items.purchase_price_avg). Opname-anchored
// where a committed opname exists; otherwise derived (estimate).

import {
	bucketForSku,
	bucketLabel,
	COGS_BUCKETS,
	type CogsBucket,
} from "@/lib/inventory/cogs-buckets";

export type RollforwardRpcRow = {
	item_id: string;
	sku: string;
	name: string;
	unit: string;
	wac_now: number | string | null;
	purchases_qty: number | string | null;
	purchases_cost: number | string | null;
	usage_qty: number | string | null;
	usage_cost: number | string | null;
	net_move_in_month: number | string | null;
	current_stock: number | string | null;
	opname_prior_qty: number | string | null;
	opname_this_qty: number | string | null;
};

export type RollforwardItem = {
	item_id: string;
	sku: string;
	name: string;
	unit: string;
	bucket: CogsBucket;
	wac: number;
	openingQty: number;
	openingTotal: number;
	purchasesQty: number;
	purchasesPrice: number;
	purchasesTotal: number;
	closingQty: number;
	closingTotal: number;
	usageQty: number;
	usageTotal: number;
	recordedUsageQty: number; // rekap_consumption (reconciliation context)
	openingDerived: boolean; // true = no prior committed opname (estimate)
	closingDerived: boolean; // true = no committed opname this period
	negative: boolean; // opening or closing qty < 0 (data-quality signal)
};

export type RollforwardBucket = {
	key: CogsBucket;
	label: string;
	items: RollforwardItem[];
	subtotal: {
		openingTotal: number;
		purchasesTotal: number;
		closingTotal: number;
		usageTotal: number;
	};
};

export type RollforwardResult = {
	buckets: RollforwardBucket[];
	grand: {
		openingTotal: number;
		purchasesTotal: number;
		closingTotal: number;
		usageTotal: number;
	};
	kpis: {
		totalCogs: number;
		mediasetCogs: number;
		sleeveCogs: number;
		flashdiskCogs: number;
		closingValue: number;
	};
	flags: {
		hasPriorOpname: boolean; // some item anchored opening to a committed opname
		hasThisOpname: boolean; // some item anchored closing to a committed opname
		negativeSkus: string[]; // items with negative opening/closing qty
	};
	itemCount: number;
};

const n = (v: number | string | null): number => (v == null ? 0 : Number(v));
const round = (v: number): number => Math.round(v);

function computeItem(row: RollforwardRpcRow): RollforwardItem {
	const wac = n(row.wac_now);
	const purchasesQty = n(row.purchases_qty);
	const purchasesCost = n(row.purchases_cost);
	const currentStock = n(row.current_stock);
	const netMove = n(row.net_move_in_month);
	const opnamePrior = row.opname_prior_qty;
	const opnameThis = row.opname_this_qty;

	const openingDerived = opnamePrior == null;
	const closingDerived = opnameThis == null;

	// Opening: prior committed opname, else roll current back by this month's net.
	const openingQty = openingDerived ? currentStock - netMove : n(opnamePrior);
	// Closing: this-period committed opname, else current on-hand.
	const closingQty = closingDerived ? currentStock : n(opnameThis);

	const purchasesPrice =
		purchasesQty > 0 ? round(purchasesCost / purchasesQty) : wac;

	// Pemakaian / COGS = ACTUAL recorded event consumption (rekap_consumption),
	// valued at the exact HPP unit_cost from each consumption movement. This is
	// the true material COGS — NOT the roll-forward plug, which on Tetra's
	// unaudited data conflates stray adjustments/settlements and explodes into
	// meaningless numbers. Opening/Closing remain the inventory roll-forward
	// context (with negatives flagged); the gap between (Awal+Beli−Akhir) and
	// recorded usage is the audit variance that opname resolves.
	const usageQty = n(row.usage_qty);
	const usageTotal = round(n(row.usage_cost));

	return {
		item_id: row.item_id,
		sku: row.sku,
		name: row.name,
		unit: row.unit,
		bucket: bucketForSku(row.sku),
		wac,
		openingQty,
		openingTotal: round(openingQty * wac),
		purchasesQty,
		purchasesPrice,
		purchasesTotal: round(purchasesCost),
		closingQty,
		closingTotal: round(closingQty * wac),
		usageQty,
		usageTotal,
		recordedUsageQty: usageQty,
		openingDerived,
		closingDerived,
		negative: openingQty < 0 || closingQty < 0,
	};
}

/** Does this item have any activity/value worth showing this month? */
function isActiveRow(it: RollforwardItem): boolean {
	return (
		it.openingQty !== 0 ||
		it.closingQty !== 0 ||
		it.purchasesQty !== 0 ||
		it.usageQty !== 0 ||
		it.recordedUsageQty !== 0
	);
}

export function computeRollforward(
	rows: RollforwardRpcRow[],
): RollforwardResult {
	const items = rows.map(computeItem).filter(isActiveRow);

	const byBucket = new Map<CogsBucket, RollforwardItem[]>();
	for (const it of items) {
		const arr = byBucket.get(it.bucket) ?? [];
		arr.push(it);
		byBucket.set(it.bucket, arr);
	}

	const buckets: RollforwardBucket[] = [];
	for (const { key, label } of COGS_BUCKETS) {
		const list = byBucket.get(key);
		if (!list || list.length === 0) continue; // skip empty bucket sections
		const subtotal = list.reduce(
			(acc, it) => ({
				openingTotal: acc.openingTotal + it.openingTotal,
				purchasesTotal: acc.purchasesTotal + it.purchasesTotal,
				closingTotal: acc.closingTotal + it.closingTotal,
				usageTotal: acc.usageTotal + it.usageTotal,
			}),
			{ openingTotal: 0, purchasesTotal: 0, closingTotal: 0, usageTotal: 0 },
		);
		buckets.push({
			key,
			label: bucketLabel(key) || label,
			items: list,
			subtotal,
		});
	}

	const grand = buckets.reduce(
		(acc, b) => ({
			openingTotal: acc.openingTotal + b.subtotal.openingTotal,
			purchasesTotal: acc.purchasesTotal + b.subtotal.purchasesTotal,
			closingTotal: acc.closingTotal + b.subtotal.closingTotal,
			usageTotal: acc.usageTotal + b.subtotal.usageTotal,
		}),
		{ openingTotal: 0, purchasesTotal: 0, closingTotal: 0, usageTotal: 0 },
	);

	const bucketCogs = (key: CogsBucket) =>
		buckets.find((b) => b.key === key)?.subtotal.usageTotal ?? 0;

	return {
		buckets,
		grand,
		kpis: {
			totalCogs: grand.usageTotal,
			mediasetCogs: bucketCogs("mediaset"),
			sleeveCogs: bucketCogs("sleeve"),
			flashdiskCogs: bucketCogs("flashdisk"),
			closingValue: grand.closingTotal,
		},
		flags: {
			hasPriorOpname: items.some((it) => !it.openingDerived),
			hasThisOpname: items.some((it) => !it.closingDerived),
			negativeSkus: items.filter((it) => it.negative).map((it) => it.sku),
		},
		itemCount: items.length,
	};
}
