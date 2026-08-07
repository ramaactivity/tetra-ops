import { recordPurchaseBatch } from "@/lib/actions/purchases";

/**
 * "Asal barang" saat menambah item baru — dari mana barang ini datang, dan
 * karena itu bagaimana pembukuannya.
 *
 *   • purchase            → dibeli sekarang. Dicatat lewat jalur Pembelian yang
 *                           sudah ada (recordPurchaseBatch): stok masuk +
 *                           harga rata-rata + jurnal Dr persediaan/aset /
 *                           Cr kas atau Hutang Vendor + kebijakan kapitalisasi.
 *   • owner_contribution  → barang lama yang sudah dimiliki / disetor owner.
 *                           Tidak ada uang keluar: Dr persediaan / Cr 3-100.
 *   • none                → cuma didaftarkan. Tanpa stok, tanpa jurnal.
 *
 * SENGAJA memanggil recordPurchaseBatch, bukan menulis jurnal sendiri — modul
 * Pembelian adalah satu-satunya jalur pembelian di aplikasi ini. Menulis jurnal
 * kedua untuk hal yang sama persis jenis tabrakan akun yang sudah menyusahkan
 * (lihat 2-101 & kategori komisi di Catat).
 */

export const ITEM_ORIGINS = ["purchase", "owner_contribution", "none"] as const;
export type ItemOrigin = (typeof ITEM_ORIGINS)[number];

export function readItemOrigin(formData: FormData): ItemOrigin {
	const raw = String(formData.get("origin") ?? "none").trim();
	return (ITEM_ORIGINS as readonly string[]).includes(raw)
		? (raw as ItemOrigin)
		: "none";
}

/** Angka dari form; kosong/NaN → 0. */
function num(formData: FormData, key: string): number {
	const n = Number(String(formData.get(key) ?? "").replace(/[^\d.-]/g, ""));
	return Number.isFinite(n) ? n : 0;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export type OriginResult = { ok: true } | { ok: false; error: string };

/**
 * Catat pembelian 1 baris untuk item yang baru dibuat (atau item lama yang
 * di-restock). Nilai form pakai prefix `buy_` supaya tidak bentrok dengan
 * field identitas item.
 */
export async function recordItemPurchase(
	formData: FormData,
	itemId: string,
	fallbackUnit: string,
): Promise<OriginResult> {
	const qty = num(formData, "buy_quantity");
	return recordItemPurchaseLines(
		formData,
		[{ itemId, quantity: qty }],
		fallbackUnit,
	);
}

/**
 * Satu nota, beberapa baris. Dipakai saat satu kali input menghasilkan lebih
 * dari satu barang — mis. beli 3 printer sekaligus: tiap unit jadi baris aset
 * sendiri (serial & penyusutan per unit), tapi uang keluarnya satu nota, bukan
 * tiga jurnal terpisah.
 */
export async function recordItemPurchaseLines(
	formData: FormData,
	items: Array<{ itemId: string; quantity: number }>,
	fallbackUnit: string,
): Promise<OriginResult> {
	const unitCost = num(formData, "buy_unit_cost");
	const lines = items.filter((l) => l.quantity > 0);
	if (lines.length === 0) {
		return { ok: false, error: "Jumlah beli harus lebih dari 0" };
	}

	const fd = new FormData();
	fd.set("supplier_id", String(formData.get("buy_supplier_id") ?? ""));
	fd.set("purchase_date", String(formData.get("buy_date") || today()));
	fd.set(
		"payment_method",
		String(formData.get("buy_payment_method") || "cash"),
	);
	fd.set("top_days", String(num(formData, "buy_top_days")));
	fd.set("admin_fee", String(num(formData, "buy_admin_fee")));
	fd.set("invoice_no", String(formData.get("buy_invoice_no") ?? ""));
	fd.set("notes", String(formData.get("buy_notes") ?? ""));
	fd.set(
		"lines",
		JSON.stringify(
			lines.map((l) => ({
				item_id: l.itemId,
				quantity: l.quantity,
				quantity_unit:
					String(formData.get("buy_unit") ?? "").trim() || fallbackUnit,
				unit_cost: Math.round(unitCost),
			})),
		),
	);

	const res = await recordPurchaseBatch(undefined, fd);
	if (res?.errors) {
		const msg =
			res.errors._form?.[0] ??
			res.errors.lines?.[0] ??
			res.errors.purchase_date?.[0] ??
			res.errors.supplier_id?.[0] ??
			"Pembelian gagal dicatat";
		return { ok: false, error: msg };
	}
	return { ok: true };
}

type SupabaseLike = {
	from: (t: string) => {
		// biome-ignore lint/suspicious/noExplicitAny: rantai builder PostgREST
		insert: (v: any) => any;
	};
};

/**
 * Barang lama / setoran owner: stok masuk + Dr akun barang / Cr 3-100 Modal
 * Owner. Tidak menyentuh kas — memang tidak ada uang keluar.
 */
export async function recordOwnerContribution(
	supabase: SupabaseLike,
	input: {
		itemId: string;
		itemName: string;
		coaAccount: string;
		quantity: number;
		unitCost: number;
		date: string;
		actorProfileId: string;
		actorAuthId: string;
	},
): Promise<OriginResult> {
	const { quantity, unitCost } = input;
	if (quantity <= 0) return { ok: false, error: "Jumlah harus lebih dari 0" };
	const total = Math.round(quantity * unitCost);

	const stamp = input.date.replace(/-/g, "");
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();

	const { error: moveErr } = await supabase.from("stock_movements").insert({
		ref_id: `SM-${stamp}-${rand.slice(0, 8)}`,
		item_id: input.itemId,
		direction: "in",
		quantity,
		unit_cost: unitCost,
		source: "manual_adjust",
		source_description: `Barang lama / setoran owner: ${input.itemName}`,
		performed_by: input.actorAuthId,
		notes: "Stok awal dari barang yang sudah dimiliki (setoran modal owner)",
	});
	if (moveErr)
		return { ok: false, error: `Gagal catat stok: ${moveErr.message}` };

	if (total <= 0) return { ok: true };

	const { data: entry, error: entryErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: `JE-${stamp}-${rand}`,
			entry_date: input.date,
			entry_type: "adjustment",
			description: `Setoran modal owner — ${input.itemName}`,
			source_type: "owner_contribution",
			source_id: input.itemId,
			total_amount: total,
			created_by: input.actorProfileId,
		})
		.select("id")
		.single();
	if (entryErr || !entry) {
		return {
			ok: false,
			error: `Gagal catat jurnal: ${entryErr?.message ?? "unknown"}`,
		};
	}

	const { error: linesErr } = await supabase.from("journal_lines").insert([
		{
			entry_id: entry.id,
			account_code: input.coaAccount,
			debit_amount: total,
			credit_amount: 0,
			description: `Barang masuk (setoran owner): ${input.itemName}`,
			line_order: 1,
		},
		{
			entry_id: entry.id,
			account_code: "3-100",
			debit_amount: 0,
			credit_amount: total,
			description: `Setoran modal — ${input.itemName}`,
			line_order: 2,
		},
	]);
	if (linesErr) {
		return { ok: false, error: `Gagal catat jurnal: ${linesErr.message}` };
	}
	return { ok: true };
}
