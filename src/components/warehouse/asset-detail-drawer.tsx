"use client";

import { Archive, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { archiveItem } from "@/lib/actions/items";
import { formatRupiah } from "@/lib/format";

/**
 * Drawer untuk lihat detail per-unit dari group asset di EquipmentTable.
 * Group "Kamera Canon 700D" yang punya 3 unit → klik row → drawer kanan
 * tampil 3 unit dengan serial, kondisi, lokasi, edit + archive per-unit.
 */

export type AssetUnit = {
	id: string;
	sku: string;
	asset_number: string | null;
	serial_number: string | null;
	condition: string | null;
	current_location: string | null;
	purchase_price: number | null;
	useful_life_months: number | null;
	depreciation_start_date: string | null;
	is_active: boolean;
	acquisition_type:
		| "new_commercial"
		| "used_commercial"
		| "owner_contribution"
		| null;
};

const CONDITION_LABEL: Record<string, string> = {
	normal: "Normal",
	service: "Servis",
	damaged: "Rusak",
	lost: "Hilang",
};

const LOCATION_LABEL: Record<string, string> = {
	gudang_pusat: "Gudang Pusat",
	event: "Sedang di Event",
	service_center: "Service Center",
	crew_carry: "Dibawa Crew",
	lost: "Hilang",
};

const ACQUISITION_LABEL: Record<string, string> = {
	new_commercial: "Baru",
	used_commercial: "Second",
	owner_contribution: "Modal Owner",
};

function monthsBetween(startIso: string | null, totalMonths: number | null) {
	if (!startIso || !totalMonths) return null;
	const start = new Date(startIso);
	if (Number.isNaN(start.getTime())) return null;
	const now = new Date();
	const elapsed = Math.max(
		0,
		(now.getFullYear() - start.getFullYear()) * 12 +
			(now.getMonth() - start.getMonth()),
	);
	return Math.max(0, totalMonths - elapsed);
}

export function AssetDetailDrawer({
	open,
	onOpenChange,
	modelName,
	units,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	modelName: string;
	units: AssetUnit[];
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const confirm = useConfirm();

	const totalPrice = units.reduce((s, u) => s + (u.purchase_price ?? 0), 0);
	const activeCount = units.filter((u) => u.is_active).length;

	async function handleArchive(id: string, sku: string) {
		const ok = await confirm({
			title: `Arsipkan unit ${sku}?`,
			description: "Aksi ini tidak ada undo di UI.",
			confirmLabel: "Arsipkan",
			variant: "destructive",
		});
		if (!ok) return;
		startTransition(async () => {
			try {
				await archiveItem(id);
				toast.success(`${sku} ter-archive`);
				router.refresh();
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Gagal archive");
			}
		});
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="sm:max-w-xl">
				<SheetHeader>
					<SheetTitle className="text-lg">{modelName}</SheetTitle>
					<SheetDescription>
						{units.length} unit fisik · {activeCount} aktif · total nilai{" "}
						<strong className="text-foreground">
							{formatRupiah(totalPrice)}
						</strong>
					</SheetDescription>
				</SheetHeader>

				<div className="mt-2 space-y-2">
					{units.map((u, idx) => {
						const remaining = monthsBetween(
							u.depreciation_start_date,
							u.useful_life_months,
						);
						const condition = u.condition
							? (CONDITION_LABEL[u.condition] ?? u.condition)
							: null;
						const location = u.current_location
							? (LOCATION_LABEL[u.current_location] ?? u.current_location)
							: null;
						const acquisition = u.acquisition_type
							? ACQUISITION_LABEL[u.acquisition_type]
							: null;
						return (
							<div
								key={u.id}
								className="bg-surface-2 rounded-lg p-4 ring-1 ring-foreground/[0.04]"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="text-sm font-semibold">
												Unit #{idx + 1}
											</span>
											{!u.is_active && (
												<span className="bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 inline-flex h-4 items-center rounded-full px-1.5 text-[9px] font-medium">
													Inactive
												</span>
											)}
											{acquisition && (
												<span className="text-muted-foreground inline-flex h-4 items-center rounded-full bg-surface-3 px-1.5 text-[9px] font-medium">
													{acquisition}
												</span>
											)}
										</div>
										<div className="tabular text-muted-foreground mt-0.5 text-[11px]">
											{u.sku}
											{u.asset_number &&
												u.asset_number !== u.sku &&
												` · ${u.asset_number}`}
										</div>
									</div>
									<div className="flex items-center gap-1">
										<Link
											href={`/warehouse/items/${u.id}/edit`}
											className="text-muted-foreground hover:bg-surface-3 hover:text-foreground inline-flex size-7 items-center justify-center rounded-md"
											title="Edit unit ini"
										>
											<Pencil className="size-3.5" />
										</Link>
										<button
											type="button"
											onClick={() => handleArchive(u.id, u.sku)}
											disabled={pending}
											className="text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 inline-flex size-7 items-center justify-center rounded-md disabled:opacity-40"
											title="Archive unit ini"
										>
											<Archive className="size-3.5" />
										</button>
									</div>
								</div>

								<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
									<DrawerField label="Serial #" value={u.serial_number} mono />
									<DrawerField label="Kondisi" value={condition} />
									<DrawerField label="Lokasi" value={location} />
									<DrawerField
										label="Harga Beli"
										value={
											u.purchase_price ? formatRupiah(u.purchase_price) : null
										}
										tabular
									/>
									<DrawerField
										label="Masa Pakai"
										value={
											remaining !== null && u.useful_life_months
												? `${remaining} / ${u.useful_life_months} bln`
												: null
										}
										tabular
									/>
								</dl>
							</div>
						);
					})}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function DrawerField({
	label,
	value,
	mono,
	tabular,
}: {
	label: string;
	value: string | null;
	mono?: boolean;
	tabular?: boolean;
}) {
	return (
		<div>
			<dt className="text-muted-foreground text-[10px] uppercase tracking-wider">
				{label}
			</dt>
			<dd
				className={`mt-0.5 ${
					value ? "text-foreground font-medium" : "text-foreground/30 italic"
				} ${mono ? "font-mono" : ""} ${tabular ? "tabular" : ""}`}
			>
				{value ?? "Belum di-set"}
			</dd>
		</div>
	);
}
