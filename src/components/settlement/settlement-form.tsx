"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
	closeSettlement,
	type SettlementFormState,
} from "@/lib/actions/settlements";
import { formatRupiah } from "@/lib/format";

export type SinkingFundConfig = {
	id: string;
	code: string;
	name: string;
	allocation_type: "percentage" | "flat";
	allocation_value: number;
};

type Defaults = {
	revenue_gross: number;
	discount_total: number;
	fee_lead: number;
	fee_asisten: number;
	fee_crew_c: number;
	platform_fee: number;
	owner_pool_per_person: number;
};

const HPP_FIELDS: Array<{ key: HppKey; label: string; hint?: string }> = [
	{ key: "mediaset", label: "Media Set", hint: "Cetak qty × harga avg" },
	{ key: "sleeve", label: "Sleeve", hint: "Cetak qty × harga avg" },
	{ key: "flashdisk", label: "Flashdisk" },
	{ key: "pouch", label: "Pouch" },
	{ key: "photomagnet", label: "Photomagnet (jika ada)" },
	{ key: "keychain", label: "Keychain (jika ada)" },
	{
		key: "bonus",
		label: "Freebie (Bonus untuk Klien)",
		hint: "Item gratis × harga avg. Internal cost.",
	},
	{ key: "other", label: "Lainnya", hint: "Material tambahan" },
];

const OPEX_FIELDS: Array<{ key: OpexKey; label: string; hint?: string }> = [
	{ key: "fee_lead", label: "Fee Lead" },
	{ key: "fee_asisten", label: "Fee Asisten" },
	{ key: "fee_crew_c", label: "Fee Crew C", hint: "Hanya jika 3 crew" },
	{ key: "fee_extra", label: "Fee Extra", hint: "Bonus/overtime crew" },
	{ key: "transport_bbm", label: "Transport / BBM" },
	{ key: "sewa_alat", label: "Sewa Alat / Studio" },
	{
		key: "perawatan",
		label: "Perawatan Alat",
		hint: "Biasanya dari sinking fund",
	},
	{ key: "konsumsi", label: "Konsumsi / Lainnya" },
	{ key: "komisi_vendor", label: "Komisi Vendor / EO" },
	{ key: "komisi_relasi", label: "Komisi Relasi" },
	{ key: "komisi_sales_direct", label: "Komisi Sales Direct" },
	{ key: "platform_fee", label: "Platform Fee", hint: "Tetra Ops pool" },
	{
		key: "diskon_tambahan",
		label: "Diskon Tambahan",
		hint: "Bonus diskon di akhir",
	},
];

type HppKey =
	| "mediaset"
	| "sleeve"
	| "flashdisk"
	| "pouch"
	| "photomagnet"
	| "keychain"
	| "bonus"
	| "other";

type OpexKey =
	| "fee_lead"
	| "fee_asisten"
	| "fee_crew_c"
	| "fee_extra"
	| "transport_bbm"
	| "sewa_alat"
	| "perawatan"
	| "konsumsi"
	| "komisi_vendor"
	| "komisi_relasi"
	| "komisi_sales_direct"
	| "platform_fee"
	| "diskon_tambahan";

type FormValues = {
	revenue_gross: number;
	discount_total: number;
	owner_pool_per_person: number;
	hpp: Record<HppKey, number>;
	opex: Record<OpexKey, number>;
};

function num(v: string | number | undefined | null): number {
	if (v === null || v === undefined || v === "") return 0;
	const n = typeof v === "string" ? Number(v) : v;
	return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

const ZERO_HPP: Record<HppKey, number> = {
	mediaset: 0,
	sleeve: 0,
	flashdisk: 0,
	pouch: 0,
	photomagnet: 0,
	keychain: 0,
	bonus: 0,
	other: 0,
};

export function SettlementForm({
	eventId,
	projectId,
	defaults,
	sinkingFunds,
	ownerCount,
	autoHpp = ZERO_HPP,
}: {
	eventId: string;
	projectId: string;
	defaults: Defaults;
	sinkingFunds: SinkingFundConfig[];
	ownerCount: number;
	autoHpp?: Record<HppKey, number>;
}) {
	const action = closeSettlement.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		SettlementFormState,
		FormData
	>(action, undefined);

	const [values, setValues] = useState<FormValues>(() => ({
		revenue_gross: defaults.revenue_gross,
		discount_total: defaults.discount_total,
		owner_pool_per_person: defaults.owner_pool_per_person,
		hpp: { ...autoHpp },
		opex: {
			fee_lead: defaults.fee_lead,
			fee_asisten: defaults.fee_asisten,
			fee_crew_c: defaults.fee_crew_c,
			fee_extra: 0,
			transport_bbm: 0,
			sewa_alat: 0,
			perawatan: 0,
			konsumsi: 0,
			komisi_vendor: 0,
			komisi_relasi: 0,
			komisi_sales_direct: 0,
			platform_fee: defaults.platform_fee,
			diskon_tambahan: 0,
		},
	}));

	const autoTotal = useMemo(
		() => Object.values(autoHpp).reduce((a, b) => a + b, 0),
		[autoHpp],
	);

	const hppWasOverridden = useMemo(() => {
		if (autoTotal === 0) return false;
		return (Object.keys(values.hpp) as HppKey[]).some(
			(k) => (values.hpp[k] ?? 0) !== (autoHpp[k] ?? 0),
		);
	}, [values.hpp, autoHpp, autoTotal]);

	const totals = useMemo(() => {
		const revenue_net = Math.max(
			0,
			values.revenue_gross - values.discount_total,
		);
		const hpp_total = Object.values(values.hpp).reduce((a, b) => a + b, 0);
		const opex_total = Object.values(values.opex).reduce((a, b) => a + b, 0);
		const total_biaya = hpp_total + opex_total;
		const net_profit = revenue_net - total_biaya;
		const is_loss = net_profit <= 0;
		const margin =
			revenue_net > 0
				? Math.round((net_profit / revenue_net) * 10_000) / 100
				: 0;

		const sinking = sinkingFunds.map((f) => {
			let amt = 0;
			if (!is_loss) {
				if (f.allocation_type === "percentage") {
					amt = Math.floor((net_profit * Number(f.allocation_value)) / 100);
				} else {
					amt = Math.floor(Number(f.allocation_value));
				}
			}
			return { ...f, amount: amt };
		});
		const sinking_total = sinking.reduce((a, b) => a + b.amount, 0);
		const owner_pool_total = is_loss
			? 0
			: ownerCount * values.owner_pool_per_person;
		const operating_cash = net_profit - sinking_total - owner_pool_total;

		return {
			revenue_net,
			hpp_total,
			opex_total,
			total_biaya,
			net_profit,
			is_loss,
			margin,
			sinking,
			sinking_total,
			owner_pool_total,
			operating_cash,
		};
	}, [values, sinkingFunds, ownerCount]);

	function updateRoot(
		key: "revenue_gross" | "discount_total" | "owner_pool_per_person",
		v: string,
	) {
		setValues((s) => ({ ...s, [key]: num(v) }));
	}

	function updateHpp(key: HppKey, v: string) {
		setValues((s) => ({ ...s, hpp: { ...s.hpp, [key]: num(v) } }));
	}

	function updateOpex(key: OpexKey, v: string) {
		setValues((s) => ({ ...s, opex: { ...s.opex, [key]: num(v) } }));
	}

	const profitClass = totals.is_loss ? "text-rose-500" : "text-emerald-500";

	return (
		<form
			action={formAction}
			className="space-y-6 pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-32"
		>
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			{/* Revenue Card */}
			<section className="border-border-default bg-surface-2 space-y-4 rounded-lg border p-5">
				<div className="flex items-center justify-between">
					<h2 className="text-base font-semibold tracking-tight">Revenue</h2>
					<span className="tabular text-foreground text-sm font-semibold">
						{formatRupiah(totals.revenue_net)}
					</span>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<NumberField
						label="Grand Total Booking"
						name="revenue_gross"
						value={values.revenue_gross}
						onChange={(v) => updateRoot("revenue_gross", v)}
						hint="Auto-filled dari grand_total"
					/>
					<NumberField
						label="Diskon (saat booking)"
						name="discount_total"
						value={values.discount_total}
						onChange={(v) => updateRoot("discount_total", v)}
						hint="Read-only dari booking; bisa override"
					/>
				</div>
			</section>

			{/* Stage 1: HPP */}
			<section className="border-border-default bg-surface-2 space-y-4 rounded-lg border p-5">
				<div className="space-y-1">
					<div className="flex items-baseline justify-between">
						<h2 className="text-base font-semibold tracking-tight">
							Material Gudang (HPP)
						</h2>
						<span className="tabular text-foreground text-sm font-semibold">
							{formatRupiah(totals.hpp_total)}
						</span>
					</div>
					{Object.values(autoHpp).some((v) => v > 0) ? (
						<div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[11px] text-foreground">
							<Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
							<p>
								<span className="font-medium">Auto-derived</span> dari rekap ×
								avg-cost stok ({formatRupiah(autoTotal)} total). Edit kalau ada
								koreksi — manual override akan ditandai badge.
							</p>
						</div>
					) : (
						<p className="text-muted-foreground text-xs">
							Auto-prefill kosong — pastikan rekap udah di-approve dan{" "}
							<a
								href="/settings/items/mapping"
								className="text-primary hover:underline"
							>
								mapping items
							</a>{" "}
							udah lengkap.
						</p>
					)}
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{HPP_FIELDS.map((f) => {
						const auto = autoHpp[f.key] ?? 0;
						const current = values.hpp[f.key] ?? 0;
						const overridden = auto > 0 && current !== auto;
						return (
							<NumberField
								key={f.key}
								label={f.label}
								name={`hpp_${f.key}`}
								value={values.hpp[f.key]}
								onChange={(v) => updateHpp(f.key, v)}
								hint={
									auto > 0
										? `Auto: ${formatRupiah(auto)}${overridden ? " · MANUAL OVERRIDE" : ""}`
										: f.hint
								}
								tone={overridden ? "amber" : auto > 0 ? "primary" : "default"}
								onResetToAuto={
									auto > 0 && overridden
										? () => updateHpp(f.key, String(auto))
										: undefined
								}
							/>
						);
					})}
				</div>
			</section>

			{/* Stage 2: OpEx */}
			<section className="border-border-default bg-surface-2 space-y-4 rounded-lg border p-5">
				<div className="flex items-baseline justify-between">
					<h2 className="text-base font-semibold tracking-tight">
						SDM & Operasional
					</h2>
					<span className="tabular text-foreground text-sm font-semibold">
						{formatRupiah(totals.opex_total)}
					</span>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{OPEX_FIELDS.map((f) => (
						<NumberField
							key={f.key}
							label={f.label}
							name={`opex_${f.key}`}
							value={values.opex[f.key]}
							onChange={(v) => updateOpex(f.key, v)}
							hint={f.hint}
						/>
					))}
				</div>
			</section>

			{/* Allocation Preview */}
			<section className="border-border-default bg-surface-2 space-y-4 rounded-lg border p-5">
				<div className="flex items-baseline justify-between">
					<h2 className="text-base font-semibold tracking-tight">
						Alokasi (preview)
					</h2>
					<span
						className={`text-xs font-medium ${
							totals.is_loss ? "text-rose-500" : "text-emerald-500"
						}`}
					>
						{totals.is_loss ? "RUGI — alokasi di-skip" : "PROFIT"}
					</span>
				</div>

				{totals.is_loss ? (
					<div className="border-rose-500/30 bg-rose-500/10 rounded-md border p-3">
						<p className="text-rose-600 dark:text-rose-400 text-sm">
							Net profit ≤ 0. Sinking fund & bagi hasil owner tidak
							dialokasikan. Settlement tetap bisa di-tutup buku sebagai loss
							event.
						</p>
					</div>
				) : (
					<dl className="space-y-2">
						{totals.sinking.map((s) => (
							<div
								key={s.id}
								className="flex items-baseline justify-between text-sm"
							>
								<dt className="text-muted-foreground">
									{s.name}{" "}
									<span className="text-muted-foreground/70 text-xs">
										(
										{s.allocation_type === "percentage"
											? `${s.allocation_value}%`
											: `flat ${formatRupiah(Number(s.allocation_value))}`}
										)
									</span>
								</dt>
								<dd className="tabular text-foreground">
									{formatRupiah(s.amount)}
								</dd>
							</div>
						))}
						<div className="flex items-baseline justify-between border-t border-border-default pt-2 text-sm">
							<dt className="text-muted-foreground">
								Bagi Hasil Owner ({ownerCount} owner ×{" "}
								{formatRupiah(values.owner_pool_per_person)})
							</dt>
							<dd className="tabular text-foreground">
								{formatRupiah(totals.owner_pool_total)}
							</dd>
						</div>
						<div className="flex items-baseline justify-between border-t border-border-default pt-2 text-sm font-medium">
							<dt>Operating Cash</dt>
							<dd className="tabular text-foreground">
								{formatRupiah(totals.operating_cash)}
							</dd>
						</div>
					</dl>
				)}

				<NumberField
					label="Owner pool per orang"
					name="owner_pool_per_person"
					value={values.owner_pool_per_person}
					onChange={(v) => updateRoot("owner_pool_per_person", v)}
					hint={`${ownerCount} owner aktif. Default Rp 50k.`}
				/>
			</section>

			{/* Sticky footer */}
			<div className="border-border-default bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t backdrop-blur md:bottom-0">
				<div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8 md:py-4">
					<dl className="grid grid-cols-3 gap-3 text-xs sm:gap-4">
						<div className="space-y-0.5">
							<dt className="text-muted-foreground uppercase tracking-wider">
								Revenue
							</dt>
							<dd className="tabular text-sm font-semibold">
								{formatRupiah(totals.revenue_net)}
							</dd>
						</div>
						<div className="space-y-0.5">
							<dt className="text-muted-foreground uppercase tracking-wider">
								Biaya
							</dt>
							<dd className="tabular text-sm font-semibold">
								{formatRupiah(totals.total_biaya)}
							</dd>
						</div>
						<div className="space-y-0.5">
							<dt className="text-muted-foreground uppercase tracking-wider">
								Net Profit · Margin
							</dt>
							<dd className={`tabular text-sm font-semibold ${profitClass}`}>
								{formatRupiah(totals.net_profit)}
								<span className="text-muted-foreground ml-1 text-xs">
									· {totals.margin}%
								</span>
							</dd>
						</div>
					</dl>
					<button
						type="submit"
						disabled={pending}
						className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium disabled:opacity-60"
					>
						{pending
							? "Menyimpan…"
							: totals.is_loss
								? "Tutup Buku (Rugi)"
								: "Simpan & Tutup Buku"}
					</button>
				</div>
			</div>

			{/* Auto-HPP snapshot + override flag — passed to RPC as audit trail */}
			<input
				type="hidden"
				name="hpp_auto_snapshot"
				value={JSON.stringify(autoHpp)}
			/>
			<input
				type="hidden"
				name="hpp_was_overridden"
				value={hppWasOverridden ? "true" : "false"}
			/>
		</form>
	);
}

function NumberField({
	label,
	name,
	value,
	onChange,
	hint,
	tone = "default",
	onResetToAuto,
}: {
	label: string;
	name: string;
	value: number;
	onChange: (v: string) => void;
	hint?: string;
	tone?: "default" | "primary" | "amber";
	onResetToAuto?: () => void;
}) {
	const borderClass =
		tone === "amber"
			? "border-amber-500/40"
			: tone === "primary"
				? "border-primary/30"
				: "border-border-default";
	const hintClass =
		tone === "amber"
			? "text-amber-700 dark:text-amber-400"
			: "text-muted-foreground";
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<label htmlFor={name} className="text-sm font-medium">
					{label}
				</label>
				{onResetToAuto && (
					<button
						type="button"
						onClick={onResetToAuto}
						className="text-[10px] font-medium uppercase tracking-wider text-primary hover:underline"
					>
						Reset ke auto
					</button>
				)}
			</div>
			<div className="relative">
				<span className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm">
					Rp
				</span>
				<input
					id={name}
					name={name}
					type="number"
					inputMode="numeric"
					min={0}
					step={1}
					value={value === 0 ? "" : value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="0"
					className={`bg-background text-foreground focus-visible:ring-ring tabular h-10 w-full rounded-md border pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:outline-none ${borderClass}`}
				/>
			</div>
			{hint && <p className={`text-xs ${hintClass}`}>{hint}</p>}
		</div>
	);
}
