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
	Fuel,
	Handshake,
	type LucideIcon,
	Megaphone,
	MoreHorizontal,
	Smartphone,
	Sparkles,
	Users,
	UtensilsCrossed,
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
		id: "fee-crew",
		label: "Fee crew",
		icon: Users,
		coa: "5-200",
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

/** Reverse lookup COA → category, used to label recent transactions. */
const CATEGORY_BY_COA = new Map(ALL_CATEGORIES.map((c) => [c.coa, c]));

export function categoryByCoa(coa: string): CatatCategory | undefined {
	return CATEGORY_BY_COA.get(coa);
}

export const DIRECTION_LABEL: Record<CatatDirection, string> = {
	masuk: "Masuk",
	keluar: "Keluar",
	transfer: "Transfer",
};
