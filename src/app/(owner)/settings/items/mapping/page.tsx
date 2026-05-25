import { ChevronLeft, Layers } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RekapMappingForm } from "@/components/items/rekap-mapping-form";
import { SectionHeader } from "@/components/layout/section-header";
import { getRekapMappings } from "@/lib/actions/rekap-mapping";
import { getCurrentUser } from "@/lib/auth/get-user";
import { REKAP_FIELDS, type RekapField } from "@/lib/rekap-mapping/types";
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
			.eq("category", "inventory")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("sku"),
	]);

	// Ensure all 7 default fields show up even if seed somehow skipped one.
	// Each field may have multiple rows (one per frame_size override + default).
	const byFieldArr = new Map<RekapField, typeof mappingsRaw>();
	for (const m of mappingsRaw) {
		const arr = byFieldArr.get(m.rekap_field) ?? [];
		arr.push(m);
		byFieldArr.set(m.rekap_field, arr);
	}

	const mappings: typeof mappingsRaw = [];
	for (const field of REKAP_FIELDS) {
		const existing = byFieldArr.get(field);
		if (existing && existing.length > 0) {
			mappings.push(...existing);
		} else {
			// No mapping at all for this field — show a placeholder default row
			mappings.push({
				rekap_field: field,
				frame_size: "",
				item_id: null,
				qty_per_unit: 1,
				is_active: true,
			});
		}
	}

	const items = (itemsRes.data ?? []) as Array<{
		id: string;
		sku: string;
		name: string;
		purchase_price_avg: number | null;
	}>;

	const activeRows = mappings.filter((m) => m.is_active);
	const mappedRows = activeRows.filter((m) => m.item_id !== null);
	const uniqueFields = new Set(activeRows.map((m) => m.rekap_field)).size;
	const mappedFields = new Set(mappedRows.map((m) => m.rekap_field)).size;

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
				description="Map setiap field rekap konsumsi ke SKU inventory. Bisa per frame_size (4R / 2R / Polaroid) — mediaset basic untuk 4R butuh 1 lembar/cetak, untuk 2R butuh 0.5 lembar/cetak karena 1 lembar dipotong jadi 2 cetak 2R."
			/>

			<div className="grid gap-3 sm:grid-cols-3">
				<StatTile
					label="Total Field"
					value={REKAP_FIELDS.length}
					hint="rekap_field di crew_rekap"
				/>
				<StatTile
					label="Total Rows"
					value={activeRows.length}
					hint={`${uniqueFields} field × N size override`}
				/>
				<StatTile
					label="Sudah Mapped"
					value={`${mappedFields}/${REKAP_FIELDS.length}`}
					hint={
						mappedFields === REKAP_FIELDS.length
							? "Lengkap — auto-deduct & auto-HPP siap"
							: "Field tanpa default akan di-skip saat approval"
					}
					tone={mappedFields === REKAP_FIELDS.length ? "ok" : "warn"}
				/>
			</div>

			<RekapMappingForm mappings={mappings} items={items} />

			<div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-fluid-caption text-sky-900 dark:text-sky-200">
				<Layers className="mt-0.5 size-4 shrink-0" aria-hidden />
				<div className="space-y-1">
					<p className="font-medium">Cara kerjanya:</p>
					<ul className="ml-4 list-disc space-y-0.5 text-sky-900/80 dark:text-sky-200/80">
						<li>
							<strong>Default</strong> (frame_size kosong) berlaku untuk semua
							ukuran. Override per size cuma di-pakai kalau event match.
						</li>
						<li>
							<span className="font-mono text-[11px]">qty_per_unit</span>{" "}
							menerima desimal — 0.5 untuk 2R (1 lembar basic = 2 cetak 2R), 1
							untuk 4R.
						</li>
						<li>
							Field <span className="font-mono text-[11px]">cetak_total</span>{" "}
							optional — set Off kalau printer paper bukan SKU diskrit.
						</li>
						<li>
							Konsumable extra di luar 7 default ini bisa dimasukkan crew lewat{" "}
							<span className="font-mono text-[11px]">custom_materials</span>{" "}
							JSONB di rekap.
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
