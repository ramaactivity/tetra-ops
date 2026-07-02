/**
 * Quick-record ("Catat") category presets — the friendliness layer that lets
 * an owner record money in/out without ever touching debit/credit or raw COA
 * codes. Each category maps to an account that already exists in the seed
 * (supabase/migrations/20260520_chart_of_accounts_extra_seed.sql).
 *
 * Pure constants + helpers — no "use server", safe to import from both the
 * client chips and the server action. The server action resolves a category by
 * `id` here so the COA code is never trusted from the client.
 */

import {
	Boxes,
	Camera,
	Car,
	Coffee,
	Fuel,
	Handshake,
	Home,
	type LucideIcon,
	Martini,
	Megaphone,
	MoreHorizontal,
	ShoppingBag,
	Smartphone,
	Sparkles,
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
};

/** Uang keluar — beban (debit the expense account, credit kas/bank). */
export const KELUAR_CATEGORIES: readonly CatatCategory[] = [
	{
		id: "transport-bbm",
		label: "Transport & BBM",
		icon: Fuel,
		coa: "5-210",
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
		id: "konsumsi",
		label: "Konsumsi",
		icon: UtensilsCrossed,
		coa: "5-240",
		entryType: "expense",
	},
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
		id: "bayar-kost",
		label: "Bayar kost",
		icon: Home,
		coa: "5-260",
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
		id: "bayar-internet",
		label: "Bayar internet",
		icon: Wifi,
		coa: "5-270",
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
		id: "sewa-alat",
		label: "Sewa alat",
		icon: Boxes,
		coa: "5-220",
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
		id: "marketing",
		label: "Marketing",
		icon: Megaphone,
		coa: "5-410",
		entryType: "expense",
	},
	{
		id: "platform",
		label: "Platform / app",
		icon: Smartphone,
		coa: "5-400",
		entryType: "expense",
	},
	{
		id: "komisi",
		label: "Komisi",
		icon: Handshake,
		coa: "5-300",
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
