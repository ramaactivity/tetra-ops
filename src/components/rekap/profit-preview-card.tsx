"use client";

import { ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import type {
	HppBreakdown,
	OpexBreakdown,
	ProfitPreview,
} from "@/lib/actions/profit-preview";

type Props = {
	preview: ProfitPreview;
	className?: string;
};

const HPP_LABELS: Record<keyof Omit<HppBreakdown, "total">, string> = {
	mediaset: "Media Set",
	sleeve: "Sleeve",
	flashdisk: "Flashdisk",
	pouch: "Pouch",
	photomagnet: "Photomagnet",
	keychain: "Keychain",
	bonus: "Bonus klien",
	other: "Lainnya",
};

const OPEX_LABELS: Record<keyof Omit<OpexBreakdown, "total">, string> = {
	fee_lead: "Fee Lead",
	fee_asisten: "Fee Asisten",
	fee_crew_c: "Fee Crew C",
	fee_extra: "Bonus crew",
	reimbursement: "Reimbursement",
	transport: "Transport",
	bensin: "Bensin",
	toll: "Toll",
	parking: "Parkir",
	konsumsi: "Konsumsi",
	misc: "Lain-lain",
};

export function ProfitPreviewCard({ preview, className = "" }: Props) {
	const [showHpp, setShowHpp] = useState(false);
	const [showOpex, setShowOpex] = useState(false);

	const profitClass = preview.is_loss
		? "text-amber-900 dark:text-amber-200"
		: "text-foreground";
	const ProfitIcon = preview.is_loss ? TrendingDown : TrendingUp;

	return (
		<section
			className={`rounded-xl border border-border-default bg-surface-2 p-5 ${className}`}
		>
			<header className="flex items-baseline justify-between border-b border-border-default pb-3">
				<h2 className="text-fluid-h3 font-semibold tracking-tight">
					Profit preview
				</h2>
				<span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground tabular">
					Real-time
				</span>
			</header>

			{/* Revenue */}
			<Row label="Revenue gross" value={preview.revenue_gross} muted />
			{preview.addon_revenue > 0 && (
				<Row label="Add-on revenue" value={preview.addon_revenue} muted />
			)}
			{preview.discount_total > 0 && (
				<Row
					label="Diskon"
					value={-preview.discount_total}
					muted
					sign="−"
				/>
			)}
			<Row label="Revenue net" value={preview.revenue_net} bold />

			{/* HPP */}
			<button
				type="button"
				onClick={() => setShowHpp((v) => !v)}
				className="mt-2 flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm hover:bg-surface-3"
			>
				<span className="text-foreground">
					HPP{" "}
					<span className="ml-1 text-xs text-muted-foreground tabular">
						({formatRupiah(preview.hpp.total)})
					</span>
				</span>
				{showHpp ? (
					<ChevronUp className="h-4 w-4 text-muted-foreground" />
				) : (
					<ChevronDown className="h-4 w-4 text-muted-foreground" />
				)}
			</button>
			{showHpp && (
				<div className="ml-3 space-y-1.5 border-l-2 border-border-default py-1.5 pl-3">
					{(Object.keys(HPP_LABELS) as Array<keyof typeof HPP_LABELS>).map(
						(key) => {
							const v = preview.hpp[key];
							if (v === 0) return null;
							return (
								<Row
									key={key}
									label={HPP_LABELS[key]}
									value={v}
									compact
								/>
							);
						},
					)}
					{preview.hpp.total === 0 && (
						<p className="text-xs text-muted-foreground">
							Belum ada konsumsi tercatat
						</p>
					)}
				</div>
			)}

			{/* OpEx */}
			<button
				type="button"
				onClick={() => setShowOpex((v) => !v)}
				className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm hover:bg-surface-3"
			>
				<span className="text-foreground">
					OpEx{" "}
					<span className="ml-1 text-xs text-muted-foreground tabular">
						({formatRupiah(preview.opex.total)})
					</span>
				</span>
				{showOpex ? (
					<ChevronUp className="h-4 w-4 text-muted-foreground" />
				) : (
					<ChevronDown className="h-4 w-4 text-muted-foreground" />
				)}
			</button>
			{showOpex && (
				<div className="ml-3 space-y-1.5 border-l-2 border-border-default py-1.5 pl-3">
					{(Object.keys(OPEX_LABELS) as Array<keyof typeof OPEX_LABELS>).map(
						(key) => {
							const v = preview.opex[key];
							if (v === 0) return null;
							return (
								<Row
									key={key}
									label={OPEX_LABELS[key]}
									value={v}
									compact
								/>
							);
						},
					)}
					{preview.opex.total === 0 && (
						<p className="text-xs text-muted-foreground">
							Belum ada OpEx tercatat
						</p>
					)}
				</div>
			)}

			<Row label="Total biaya" value={preview.total_biaya} muted />

			{/* Gross profit (revenue net - total biaya BEFORE allocation) */}
			<div className="my-3 border-t border-border-default" />

			<div className="flex items-baseline justify-between py-1">
				<span className="text-sm font-medium text-foreground">
					Net profit (sebelum alokasi)
				</span>
				<span
					className={`tabular text-base font-semibold ${profitClass}`}
				>
					{formatRupiah(preview.net_profit)}
					<span className="ml-2 text-xs font-normal tabular text-muted-foreground">
						· {preview.margin_pct}%
					</span>
				</span>
			</div>

			{!preview.is_loss && (
				<>
					<Row
						label="Alokasi sinking funds (estimasi)"
						value={preview.sinking_estimate}
						sign="−"
						muted
					/>
					<Row
						label="Alokasi owner pool (estimasi)"
						value={preview.owner_pool_estimate}
						sign="−"
						muted
					/>
				</>
			)}

			<div className="my-3 border-t border-border-default" />

			<div className="flex items-baseline justify-between py-2">
				<span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
					<ProfitIcon className="h-4 w-4" />
					{preview.is_loss ? "Loss" : "Operating cash"}
				</span>
				<span className={`tabular text-lg font-bold ${profitClass}`}>
					{formatRupiah(preview.operating_cash_estimate)}
				</span>
			</div>

			{preview.is_loss && (
				<p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
					Event ini rugi. Tidak ada alokasi sinking fund atau owner pool.
					Settlement tetap bisa di-close untuk record-keeping.
				</p>
			)}
		</section>
	);
}

function Row({
	label,
	value,
	muted = false,
	bold = false,
	compact = false,
	sign,
}: {
	label: string;
	value: number;
	muted?: boolean;
	bold?: boolean;
	compact?: boolean;
	sign?: "−";
}) {
	return (
		<div
			className={`flex items-baseline justify-between ${compact ? "py-0.5 text-xs" : "py-1 text-sm"}`}
		>
			<span className={muted ? "text-muted-foreground" : "text-foreground"}>
				{label}
			</span>
			<span
				className={`tabular ${bold ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : "text-foreground"}`}
			>
				{sign === "−" && value > 0 ? "−" : ""}
				{formatRupiah(Math.abs(value))}
			</span>
		</div>
	);
}
