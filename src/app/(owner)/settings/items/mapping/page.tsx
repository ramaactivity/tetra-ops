import { ChevronLeft, Layers } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RekapMappingForm } from "@/components/items/rekap-mapping-form";
import { SectionHeader } from "@/components/layout/section-header";
import { getCurrentUser } from "@/lib/auth/get-user";
import { getRekapMappings } from "@/lib/actions/rekap-mapping";
import {
	REKAP_FIELDS,
	type RekapField,
} from "@/lib/rekap-mapping/types";
import { createClient } from "@/lib/supabase/server";

export default async function RekapMappingPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/settings");
	}

	const supabase = await createClient();
	const [mappingsRaw, itemsRes] = await Promise.all([
		getRekapMappings(),
		supabase
			.from("inventory_items")
			.select("id, sku, name, purchase_price_avg")
			.eq("category", "consumable")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("sku"),
	]);

	// Ensure all 7 default fields show up even if seed somehow skipped one.
	const byField = new Map(mappingsRaw.map((m) => [m.rekap_field, m]));
	const mappings = REKAP_FIELDS.map((field): {
		rekap_field: RekapField;
		item_id: string | null;
		qty_per_unit: number;
		is_active: boolean;
	} => {
		const existing = byField.get(field);
		return (
			existing ?? {
				rekap_field: field,
				item_id: null,
				qty_per_unit: 1,
				is_active: true,
			}
		);
	});

	const items = (itemsRes.data ?? []) as Array<{
		id: string;
		sku: string;
		name: string;
		purchase_price_avg: number | null;
	}>;

	const mappedCount = mappings.filter(
		(m) => m.is_active && m.item_id !== null,
	).length;
	const totalActive = mappings.filter((m) => m.is_active).length;

	return (
		<div className="space-y-4">
			<Link
				href="/settings/items"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Items
			</Link>
			<SectionHeader
				as="h2"
				title="Rekap → Item Mapping"
				description="Map setiap field rekap konsumsi ke SKU inventory. Mapping ini dipakai saat owner approve rekap (auto-deduct stok) dan saat settle event (auto-prefill HPP). qty_per_unit untuk kasus 1 rekap-unit = N stok-unit (mis: 1 mediaset = 2 cetak)."
			/>

			<div className="grid gap-3 sm:grid-cols-3">
				<StatTile
					label="Total Field"
					value={mappings.length}
					hint="rekap_field di crew_rekap"
				/>
				<StatTile
					label="Aktif"
					value={totalActive}
					hint="dipakai saat approval"
				/>
				<StatTile
					label="Sudah Mapped"
					value={`${mappedCount}/${totalActive}`}
					hint={
						mappedCount === totalActive
							? "Lengkap — auto-deduct & auto-HPP siap"
							: "Field tanpa item akan di-skip saat approval"
					}
					tone={mappedCount === totalActive ? "ok" : "warn"}
				/>
			</div>

			<RekapMappingForm mappings={mappings} items={items} />

			<div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-fluid-caption text-sky-900 dark:text-sky-200">
				<Layers className="mt-0.5 size-4 shrink-0" aria-hidden />
				<div className="space-y-1">
					<p className="font-medium">Cara kerjanya:</p>
					<ul className="ml-4 list-disc space-y-0.5 text-sky-900/80 dark:text-sky-200/80">
						<li>
							Field <span className="font-mono text-[11px]">cetak_total</span>{" "}
							optional — set Off kalau printer paper bukan SKU diskrit.
						</li>
						<li>
							<span className="font-mono text-[11px]">qty_per_unit</span> 2 = 1
							rekap unit konsumsi 2 stock unit.
						</li>
						<li>
							Konsumable extra di luar 7 default ini bisa dimasukkan crew lewat{" "}
							<span className="font-mono text-[11px]">custom_materials</span>{" "}
							JSONB di rekap (Phase B).
						</li>
					</ul>
				</div>
			</div>
		</div>
	);
}

function StatTile({
	label,
	value,
	hint,
	tone = "default",
}: {
	label: string;
	value: number | string;
	hint?: string;
	tone?: "default" | "ok" | "warn";
}) {
	const valueColor =
		tone === "ok"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "warn"
				? "text-amber-600 dark:text-amber-400"
				: "text-foreground";
	return (
		<div className="rounded-xl border border-border-default bg-surface-2 p-4">
			<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={`tabular text-2xl font-bold ${valueColor}`}
			>
				{value}
			</div>
			{hint ? (
				<div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
			) : null}
		</div>
	);
}
