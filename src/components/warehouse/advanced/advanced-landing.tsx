import {
	ArrowUpDown,
	ClipboardList,
	Coins,
	type LucideIcon,
	PackageSearch,
	ShoppingBag,
	Store,
	Tags,
	Truck,
	Wrench,
} from "lucide-react";
import Link from "next/link";

type AdvancedLink = {
	href: string;
	label: string;
	desc: string;
	icon: LucideIcon;
};

type AdvancedGroup = {
	title: string;
	items: AdvancedLink[];
};

const GROUPS: AdvancedGroup[] = [
	{
		title: "Operasi stok",
		items: [
			{
				href: "/warehouse/stock-take",
				label: "Stock Opname",
				desc: "Hitung fisik & cocokkan dengan sistem",
				icon: ClipboardList,
			},
			{
				href: "/warehouse?tab=movements",
				label: "Log Mutasi",
				desc: "Riwayat semua keluar-masuk stok",
				icon: ArrowUpDown,
			},
			// Wastage hidden until owners are ready (2026-06-24). Route still live.
		],
	},
	{
		title: "Pembelian & supplier",
		items: [
			{
				href: "/warehouse/purchases",
				label: "Pembelian",
				desc: "Catat belanja & stok masuk",
				icon: ShoppingBag,
			},
			{
				href: "/warehouse/purchase-requests",
				label: "Permintaan Beli",
				desc: "Daftar permintaan beli dari crew",
				icon: Truck,
			},
			{
				href: "/warehouse/suppliers",
				label: "Supplier",
				desc: "Kelola data supplier",
				icon: Store,
			},
			{
				href: "/warehouse?tab=market",
				label: "Market List",
				desc: "Bandingkan harga antar supplier",
				icon: Tags,
			},
		],
	},
	{
		title: "Aset & finansial",
		items: [
			{
				href: "/warehouse?tab=fixed_asset",
				label: "Aset Tetap",
				desc: "Kondisi, lokasi, check-out alat",
				icon: Wrench,
			},
			{
				href: "/warehouse/assets",
				label: "Asset Register",
				desc: "Nilai buku, penyusutan, disposal",
				icon: Coins,
			},
			{
				href: "/warehouse?tab=consumables",
				label: "Daftar Persediaan",
				desc: "Semua item + nilai HPP & avg cost",
				icon: PackageSearch,
			},
		],
	},
];

export function AdvancedLanding() {
	return (
		<div className="space-y-5">
			<p className="text-[12.5px] text-muted-foreground">
				Fitur teknis & finansial. Untuk operasi harian, cukup pakai tab{" "}
				<span className="font-medium text-foreground">Kebutuhan Event</span>.
			</p>
			{GROUPS.map((group) => (
				<div key={group.title} className="space-y-2">
					<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
						{group.title}
					</h3>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{group.items.map((item) => {
							const Icon = item.icon;
							return (
								<Link
									key={item.href}
									href={item.href}
									className="group flex items-start gap-3 rounded-2xl border border-border-subtle bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-secondary"
								>
									<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground/70 group-hover:bg-background">
										<Icon className="size-[18px]" />
									</span>
									<div className="min-w-0 space-y-0.5">
										<div className="font-medium text-foreground">
											{item.label}
										</div>
										<div className="text-[12px] text-muted-foreground">
											{item.desc}
										</div>
									</div>
								</Link>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}
