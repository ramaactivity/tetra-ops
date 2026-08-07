/**
 * "Model" aset tetap — pengelompokan unit fisik berdasarkan nama.
 *
 * Satu unit fisik tetap = satu baris `inventory_items` + satu
 * `items_fixed_asset_config`, karena serial number, kondisi, lokasi, dan
 * penyusutan melekat pada unit-nya, bukan pada modelnya. Photobooth jalan
 * lebih dari satu unit: 3 booth = 3 printer, 3 kamera, 3 lighting. Jadi yang
 * dibutuhkan owner saat menambah alat adalah pertanyaan pertama "alat baru,
 * atau unit ke-sekian dari alat yang sudah ada?".
 *
 * Modul biasa (bukan "use server") — dipakai server component untuk memuat
 * pilihan, dan tipenya dipakai form client.
 */

export type AssetModelUnit = {
	id: string;
	sku: string;
	assetNumber: string | null;
	serial: string | null;
	condition: string | null;
	disposedAt: string | null;
};

export type AssetModelOption = {
	/** Unit pertama dari model ini — dipakai sebagai id model. */
	id: string;
	name: string;
	/** SKU terpendek di grup = basis penomoran unit berikutnya (-2, -3, …). */
	baseSku: string;
	unit: string;
	/** Jumlah unit yang belum di-dispose. */
	unitCount: number;
	/** Harga unit terakhir yang dibeli — jadi ancar-ancar harga unit berikutnya. */
	lastPrice: number;
	usefulLifeMonths: number | null;
	salvageValue: number;
	units: AssetModelUnit[];
};

/** Kunci pengelompokan: nama tanpa beda huruf besar/kecil & spasi ganda. */
export function normalizeModelName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Basis SKU sebuah model = SKU terpendek di antara unit-unitnya.
 *
 * SENGAJA tidak memotong sufiks angka: SKU lama banyak yang berakhiran angka
 * acak (EQ-953916, EQ-LENS-TAMRON-1750) — memotongnya malah menghasilkan basis
 * "EQ". Unit ke-2 dari model lama cukup jadi `EQ-953916-2`, tetap satu keluarga
 * dan tetap unik.
 */
export function baseSkuOf(skus: string[]): string {
	return skus.reduce((a, b) => (b.length < a.length ? b : a), skus[0] ?? "");
}

type Row = {
	id: string;
	sku: string;
	name: string;
	unit: string | null;
	config: {
		asset_number: string | null;
		serial_number: string | null;
		purchase_price: number | string | null;
		purchase_date: string | null;
		salvage_value: number | string | null;
		useful_life_months: number | null;
		condition: string | null;
		disposed_at: string | null;
	} | null;
};

type SupabaseLike = {
	from: (table: string) => {
		// biome-ignore lint/suspicious/noExplicitAny: rantai builder PostgREST
		select: (cols: string) => any;
	};
};

/**
 * Daftar model aset tetap untuk picker "Nama Alat".
 *
 * Catatan embed: `items_fixed_asset_config` punya FK unik ke item, jadi
 * PostgREST mengembalikan OBJECT (bukan array) — jangan dibaca dengan `[0]`.
 */
export async function loadAssetModels(
	supabase: SupabaseLike,
): Promise<AssetModelOption[]> {
	const { data } = await supabase
		.from("inventory_items")
		.select(
			`id, sku, name, unit,
			 config:items_fixed_asset_config!inner(
			   asset_number, serial_number, purchase_price, purchase_date,
			   salvage_value, useful_life_months, condition, disposed_at
			 )`,
		)
		.eq("category", "fixed_asset")
		.is("deleted_at", null)
		.order("name");

	const byName = new Map<string, AssetModelOption>();
	// Urutan tanggal beli menentukan siapa "unit terakhir" (harga acuan).
	const lastDateByName = new Map<string, string>();

	for (const raw of (data ?? []) as Row[]) {
		const cfg = Array.isArray(raw.config) ? raw.config[0] : raw.config;
		if (!cfg) continue;

		const key = normalizeModelName(raw.name);
		const unitEntry: AssetModelUnit = {
			id: raw.id,
			sku: raw.sku,
			assetNumber: cfg.asset_number,
			serial: cfg.serial_number,
			condition: cfg.condition,
			disposedAt: cfg.disposed_at,
		};

		const existing = byName.get(key);
		if (!existing) {
			byName.set(key, {
				id: raw.id,
				name: raw.name.trim(),
				baseSku: raw.sku,
				unit: raw.unit ?? "unit",
				unitCount: cfg.disposed_at ? 0 : 1,
				lastPrice: Number(cfg.purchase_price ?? 0),
				usefulLifeMonths: cfg.useful_life_months,
				salvageValue: Number(cfg.salvage_value ?? 0),
				units: [unitEntry],
			});
			if (cfg.purchase_date) lastDateByName.set(key, cfg.purchase_date);
			continue;
		}

		existing.units.push(unitEntry);
		if (!cfg.disposed_at) existing.unitCount += 1;
		// SKU terpendek = SKU unit pertama; unit berikutnya bersufiks -2, -3, …
		existing.baseSku = baseSkuOf([existing.baseSku, raw.sku]);
		const lastDate = lastDateByName.get(key);
		if (cfg.purchase_date && (!lastDate || cfg.purchase_date >= lastDate)) {
			lastDateByName.set(key, cfg.purchase_date);
			existing.lastPrice = Number(cfg.purchase_price ?? 0);
			if (cfg.useful_life_months) {
				existing.usefulLifeMonths = cfg.useful_life_months;
			}
			existing.salvageValue = Number(cfg.salvage_value ?? 0);
		}
	}

	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
