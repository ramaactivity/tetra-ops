/**
 * Quick-record ("Catat") category presets — the friendliness layer that lets
 * an owner record money in/out without ever touching debit/credit or raw COA
 * codes. Each category maps to an account that already exists in the seed
 * (supabase/migrations/20260520_chart_of_accounts_extra_seed.sql).
 *
 * URUTAN = FREKUENSI PEMAKAIAN NYATA. 8 kategori pertama tampil sebagai chip;
 * sisanya di balik "Lihat semua". Diurutkan dari audit jurnal manual
 * 2026-06-24 → 2026-08-02: Konsumsi rapat 8×, Beli alat 5×, Transport 3×,
 * Komisi sales/relasi 2× (dulu TIDAK ada kategorinya → owner terpaksa pakai
 * "Akun lain" / label "Pengeluaran"), lalu kost/sewa alat/admin bank/ads 1×.
 * Transport online, Konsumsi, dan Entertain 0× — digeser ke bawah.
 *
 * Pure constants + helpers — no "use server", safe to import from both the
 * client chips and the server action. The server action resolves a category by
 * `id` here so the COA code is never trusted from the client.
 */

import {
	BadgePercent,
	Boxes,
	Camera,
	Car,
	CarFront,
	CircleParking,
	Coffee,
	Fuel,
	Gift,
	Handshake,
	Home,
	Landmark,
	type LucideIcon,
	Martini,
	Megaphone,
	MoreHorizontal,
	PiggyBank,
	RotateCcw,
	Route,
	ShoppingBag,
	Smartphone,
	Sparkles,
	Store,
	Tag,
	Users,
	UtensilsCrossed,
	Wifi,
	Wrench,
} from "lucide-react";

export type CatatDirection = "masuk" | "keluar" | "transfer";

export type CatatCategory = {
	id: string;
	label: string;
	icon: LucideIcon;
	/** Counterpart account: the expense (5-xxx) or revenue (4-xxx) account. */
	coa: string;
	entryType: "expense" | "revenue";
	/**
	 * Reimbursement ("patungan owner"): uang MASUK yang mengembalikan sebagian
	 * beban yang sudah Tetra bayar full → mengkredit AKUN BEBAN (coa 5-xxx),
	 * bukan pendapatan. Efeknya beban bersih turun & kas Tetra kembali benar.
	 * Jurnal di-tag entry_type "adjustment" (Koreksi), bukan "revenue".
	 */
	reimbursement?: boolean;
	/**
	 * Setoran modal: uang MASUK yang menambah ekuitas (coa 3-xxx), bukan
	 * pendapatan — di-tag "adjustment" supaya tidak menggelembungkan omzet.
	 */
	capital?: boolean;
	/**
	 * Biaya rutin bulanan (kost, internet, langganan app). Yang penting bukan
	 * tanggal transaksinya melainkan BULAN YANG DIBAYAR, jadi UI wajib meminta
	 * periodenya & memperingatkan kalau bulan itu sudah pernah dibayar.
	 */
	monthly?: boolean;
};

/**
 * Uang keluar — beban (debit the expense account, credit kas/bank).
 * 8 pertama = chip yang langsung terlihat; urutan berdasar frekuensi nyata.
 */
export const KELUAR_CATEGORIES: readonly CatatCategory[] = [
	// ── Top 8 (chip) ────────────────────────────────────────────────────────
	{
		id: "konsumsi-rapat",
		label: "Konsumsi rapat",
		icon: Coffee,
		coa: "5-280",
		entryType: "expense",
	},
	{
		id: "beli-alat",
		label: "Beli alat/barang",
		icon: ShoppingBag,
		coa: "5-250",
		entryType: "expense",
	},
	{
		id: "transport-bbm",
		label: "Transport & BBM",
		icon: Fuel,
		coa: "5-210",
		entryType: "expense",
	},
	{
		// Sama polanya dgn "Bayar fee crew": settlement sudah meng-akrual komisi
		// jadi utang (Cr 2-102), jadi MEMBAYAR = melunasi utang itu → Dr 2-102 /
		// Cr kas. Dulu kategori ini mendebit beban 5-301, akibatnya beban komisi
		// tercatat DUA KALI dan utangnya tak pernah lunas (kejadian nyata: komisi
		// Adit Rahman & Ramadan Saputra, diperbaiki 2026-08-06).
		// Untuk komisi yang menempel di event, jalur utamanya tetap Finance ›
		// Komisi — di sana pembayarannya ikut tercatat per event & per penerima.
		id: "komisi-sales",
		label: "Bayar komisi sales/relasi",
		icon: Handshake,
		coa: "2-102",
		entryType: "expense",
	},
	{
		id: "bayar-kost",
		label: "Bayar kost",
		icon: Home,
		coa: "5-260",
		entryType: "expense",
		monthly: true,
	},
	{
		id: "sewa-alat",
		label: "Sewa alat",
		icon: Boxes,
		coa: "5-220",
		entryType: "expense",
	},
	{
		// Fee transfer/admin yang berdiri sendiri (mis. "admin fee rangga") —
		// beda dari field "Biaya admin" yang nempel di transaksi lain.
		id: "admin-bank",
		label: "Admin / fee bank",
		icon: Landmark,
		coa: "5-600",
		entryType: "expense",
	},
	{
		id: "marketing",
		label: "Marketing / topup ads",
		icon: Megaphone,
		coa: "5-410",
		entryType: "expense",
	},
	{
		// Semua ongkos ikut pameran dikumpulkan di satu akun — sewa booth,
		// brosur, konsumsi, DAN fee crew yang jaga booth. Fee crew expo sengaja
		// TIDAK lewat kategori "Bayar fee crew": yang itu mendebit Hutang Crew
		// (melunasi akrual settlement), sementara crew jaga booth tidak punya
		// event, jadi tidak pernah ada hutangnya — pernah bikin Hutang Crew
		// minus Rp750.000 dan bebannya hilang dari laba-rugi.
		id: "expo",
		label: "Pameran / expo (termasuk fee crew jaga booth)",
		icon: Store,
		coa: "5-412",
		entryType: "expense",
	},
	// ── Lihat semua ─────────────────────────────────────────────────────────
	{
		id: "bayar-internet",
		label: "Bayar internet",
		icon: Wifi,
		coa: "5-270",
		entryType: "expense",
		monthly: true,
	},
	{
		// Dulu tercatat ke Transport BBM padahal COA-nya sendiri sudah ada.
		id: "sewa-mobil",
		label: "Sewa mobil",
		icon: CarFront,
		coa: "5-212",
		entryType: "expense",
	},
	{
		id: "toll",
		label: "Toll / e-toll",
		icon: Route,
		coa: "5-213",
		entryType: "expense",
	},
	{
		id: "parkir",
		label: "Parkir",
		icon: CircleParking,
		coa: "5-214",
		entryType: "expense",
	},
	{
		id: "konsumsi",
		label: "Konsumsi event",
		icon: UtensilsCrossed,
		coa: "5-240",
		entryType: "expense",
	},
	{
		id: "transport-online",
		label: "Transport online",
		icon: Car,
		coa: "5-211",
		entryType: "expense",
	},
	{
		id: "perawatan",
		label: "Perawatan alat",
		icon: Wrench,
		coa: "5-230",
		entryType: "expense",
	},
	{
		id: "entertain",
		label: "Entertain / jamu klien",
		icon: Martini,
		coa: "5-285",
		entryType: "expense",
	},
	{
		id: "bonus-klien",
		label: "Bonus klien",
		icon: Gift,
		coa: "5-411",
		entryType: "expense",
	},
	{
		// Cash-basis: fee crew di-akrual ke Hutang Crew (2-100) saat settlement.
		// Membayar crew = melunasi hutang itu → Dr 2-100 / Cr Kas (BUKAN beban lagi,
		// supaya tidak dobel-beban dengan settlement).
		id: "fee-crew",
		label: "Bayar fee crew",
		icon: Users,
		coa: "2-100",
		entryType: "expense",
	},
	{
		id: "platform",
		label: "Platform / app",
		icon: Smartphone,
		coa: "5-400",
		entryType: "expense",
		monthly: true,
	},
	{
		// Komisi utk vendor/WO (bukan sales perorangan). Sama seperti komisi
		// sales: membayar = melunasi utang komisi vendor (Dr 2-103 / Cr kas),
		// BUKAN beban baru — settlement sudah membebankan 5-300 saat event
		// ditutup. Modul Komisi di /finance/vendors tetap jalur utama utk komisi
		// per-event (tercatat per event + bisa dibayar di muka).
		id: "komisi",
		label: "Bayar komisi vendor",
		icon: BadgePercent,
		coa: "2-103",
		entryType: "expense",
	},
	{
		id: "operasional-lain",
		label: "Operasional lain",
		icon: MoreHorizontal,
		coa: "5-900",
		entryType: "expense",
	},
] as const;

/** Uang masuk — pendapatan non-event (debit kas/bank, credit revenue). */
export const MASUK_CATEGORIES: readonly CatatCategory[] = [
	{
		id: "jasa",
		label: "Pendapatan jasa",
		icon: Camera,
		coa: "4-100",
		entryType: "revenue",
	},
	{
		id: "add-on",
		label: "Add-on / lainnya",
		icon: Sparkles,
		coa: "4-140",
		entryType: "revenue",
	},
	{
		// Jual flashdisk/alat second dsb. (mis. "Tetra Visual beli flashdisk") —
		// dulu dicatat lewat "Akun lain" 4-901.
		id: "jual-bekas",
		label: "Jual alat/barang",
		icon: Tag,
		coa: "4-901",
		entryType: "revenue",
	},
	// ── Patungan owner (reimburse) ──────────────────────────────────────────
	// Tetra bayar full dulu; owner transfer balik patungannya. Uang masuk ini
	// MENGURANGI beban terkait (bukan pendapatan) → jumlah uang Tetra selalu
	// benar tanpa perlu pilih akun manual (rawan salah).
	{
		id: "patungan-kost",
		label: "Patungan kost",
		icon: Home,
		coa: "5-260",
		entryType: "expense",
		reimbursement: true,
	},
	{
		id: "patungan-konsumsi-rapat",
		label: "Patungan konsumsi rapat",
		icon: Coffee,
		coa: "5-280",
		entryType: "expense",
		reimbursement: true,
	},
	{
		id: "patungan-entertain",
		label: "Patungan entertain",
		icon: Martini,
		coa: "5-285",
		entryType: "expense",
		reimbursement: true,
	},
	{
		// Barang dibalikin / dana belanja kembali → kurangi beban belanjanya,
		// bukan pendapatan.
		id: "refund-belanja",
		label: "Refund belanja",
		icon: RotateCcw,
		coa: "5-250",
		entryType: "expense",
		reimbursement: true,
	},
	{
		// Owner nyetor dana segar ke kas Tetra → ekuitas, bukan omzet.
		id: "modal-owner",
		label: "Setoran modal owner",
		icon: PiggyBank,
		coa: "3-100",
		entryType: "revenue",
		capital: true,
	},
] as const;

export const ALL_CATEGORIES: readonly CatatCategory[] = [
	...KELUAR_CATEGORIES,
	...MASUK_CATEGORIES,
];

export function categoriesFor(
	direction: CatatDirection,
): readonly CatatCategory[] {
	if (direction === "keluar") return KELUAR_CATEGORIES;
	if (direction === "masuk") return MASUK_CATEGORIES;
	return [];
}

const CATEGORY_BY_ID = new Map(ALL_CATEGORIES.map((c) => [c.id, c]));

export function findCategory(
	id: string | null | undefined,
): CatatCategory | undefined {
	return id ? CATEGORY_BY_ID.get(id) : undefined;
}

/**
 * Reverse lookup COA → category, untuk melabeli transaksi terakhir. First-wins:
 * beberapa kategori berbagi COA (mis. 5-260 dipakai "Bayar kost" DAN "Patungan
 * kost"); yang didaftar duluan (kategori keluar/pengeluaran) menang supaya
 * transaksi keluar tak salah dilabeli sebagai reimburse.
 */
const CATEGORY_BY_COA = new Map<string, CatatCategory>();
for (const c of ALL_CATEGORIES) {
	if (!CATEGORY_BY_COA.has(c.coa)) CATEGORY_BY_COA.set(c.coa, c);
}

export function categoryByCoa(coa: string): CatatCategory | undefined {
	return CATEGORY_BY_COA.get(coa);
}

export const DIRECTION_LABEL: Record<CatatDirection, string> = {
	masuk: "Masuk",
	keluar: "Keluar",
	transfer: "Transfer",
};

/**
 * Biaya lapangan rekap → kategori Catat transaksi. Dipakai tombol "Catat ke
 * pembukuan" di rekap owner untuk biaya yang DIBAYAR OWNER: biaya itu sengaja
 * tidak masuk OpEx settlement (lihat calculate_recap_opex), jadi harus
 * dibukukan lewat Catat — tombol ini yang menutup celahnya supaya tidak
 * bergantung ingatan owner.
 */
export const REKAP_EXPENSE_CATEGORY: Record<string, string> = {
	transport_online: "transport-online",
	transport_rental: "sewa-mobil",
	bensin: "transport-bbm",
	toll: "toll",
	parking: "parkir",
	konsumsi: "konsumsi",
	misc: "operasional-lain",
};
