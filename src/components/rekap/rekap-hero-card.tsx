import {
	Camera,
	CheckCircle2,
	Clock,
	Printer,
	Wallet,
	XCircle,
} from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { FRAME_SIZE_LABELS, formatDateID, formatRupiah } from "@/lib/format";

type Pkg = {
	name: string | null;
	frame_size: string | null;
	duration_hours: number | null;
};

type Props = {
	eyebrow?: string;
	clientName: string;
	projectId: string;
	eventDate: string;
	venueName?: string | null;
	pkg?: Pkg | null;
	isApproved: boolean | null | undefined; // null/undefined = pending or not yet submitted
	submitted: boolean; // true if rekap exists
	hppTotal?: number;
	totalCetak?: number;
	proofCount?: number;
	submittedBy?: string | null;
	reviewedBy?: string | null;
};

/**
 * <RekapHeroCard /> — title block + at-a-glance KPI strip for the rekap page.
 * Top band: eyebrow + status, client name, event meta, package pills. Bottom
 * band (only once submitted): the headline numbers — Estimasi HPP, Total
 * Cetak, Bukti, and who submitted/reviewed — so the key data reads instantly.
 */
export function RekapHeroCard({
	eyebrow = "REKAP CREW",
	clientName,
	projectId,
	eventDate,
	venueName,
	pkg,
	isApproved,
	submitted,
	hppTotal = 0,
	totalCetak = 0,
	proofCount = 0,
	submittedBy,
	reviewedBy,
}: Props) {
	return (
		<div className="overflow-hidden rounded-xl border border-border-default bg-card">
			<div className="space-y-3 p-5 sm:p-6">
				<div className="flex flex-wrap items-center gap-2">
					<span className="eyebrow text-muted-foreground">{eyebrow}</span>
					<StatusBadge isApproved={isApproved} submitted={submitted} />
				</div>
				<div className="space-y-1">
					<h1 className="text-[24px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
						{clientName}
					</h1>
					<p className="text-[12.5px] text-muted-foreground">
						<span className="tabular">{projectId}</span> ·{" "}
						{formatDateID(eventDate)}
						{venueName ? <> · {venueName}</> : null}
					</p>
				</div>
				{pkg?.name && (
					<div className="flex flex-wrap gap-1.5 pt-0.5">
						<Badge
							variant="outline"
							className="border-primary/30 bg-primary/5 text-primary"
						>
							{pkg.name}
						</Badge>
						{pkg.duration_hours ? (
							<Badge variant="outline">{pkg.duration_hours} jam</Badge>
						) : null}
						{pkg.frame_size ? (
							<Badge variant="outline">
								{FRAME_SIZE_LABELS[pkg.frame_size] ?? pkg.frame_size}
							</Badge>
						) : null}
					</div>
				)}
			</div>

			{/* KPI strip — only meaningful once a rekap exists */}
			{submitted && (
				<dl className="grid grid-cols-2 divide-x divide-y divide-border-subtle border-t border-border-subtle sm:grid-cols-4 sm:divide-y-0">
					<Kpi
						icon={Wallet}
						label="Estimasi HPP"
						value={formatRupiah(hppTotal)}
						accent
					/>
					<Kpi
						icon={Printer}
						label="Total cetak"
						value={
							<>
								{totalCetak.toLocaleString("id-ID")}
								<span className="ml-1 text-[12px] font-normal text-muted-foreground">
									pcs
								</span>
							</>
						}
					/>
					<Kpi
						icon={Camera}
						label="Bukti"
						value={
							<>
								{proofCount}
								<span className="ml-1 text-[12px] font-normal text-muted-foreground">
									foto
								</span>
							</>
						}
					/>
					<Kpi
						label="Di-submit"
						value={
							<span className="truncate text-[15px]">{submittedBy ?? "—"}</span>
						}
						sub={reviewedBy ? `Review: ${reviewedBy}` : undefined}
					/>
				</dl>
			)}
		</div>
	);
}

function Kpi({
	icon: Icon,
	label,
	value,
	sub,
	accent = false,
}: {
	icon?: typeof Wallet;
	label: string;
	value: React.ReactNode;
	sub?: string;
	accent?: boolean;
}) {
	return (
		<div className="min-w-0 px-5 py-3.5">
			<dt className="flex items-center gap-1.5">
				{Icon ? (
					<Icon
						className="size-3 text-muted-foreground/70"
						aria-hidden
						strokeWidth={2}
					/>
				) : null}
				<span className="eyebrow text-muted-foreground">{label}</span>
			</dt>
			<dd
				className={`tabular mt-1 truncate text-[18px] font-semibold leading-none ${
					accent ? "text-primary" : "text-foreground"
				}`}
			>
				{value}
			</dd>
			{sub ? (
				<dd className="mt-1 truncate text-[11px] text-muted-foreground">
					{sub}
				</dd>
			) : null}
		</div>
	);
}

function StatusBadge({
	isApproved,
	submitted,
}: {
	isApproved: boolean | null | undefined;
	submitted: boolean;
}) {
	if (!submitted) {
		return (
			<Badge variant="secondary" className="gap-1">
				<Clock className="size-3" aria-hidden />
				Belum submit
			</Badge>
		);
	}
	if (isApproved === true) {
		return (
			<Badge
				variant="outline"
				className="gap-1 border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
			>
				<CheckCircle2 className="size-3" aria-hidden />
				Approved
			</Badge>
		);
	}
	if (isApproved === false) {
		return (
			<Badge
				variant="outline"
				className="gap-1 border-rose-300 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300"
			>
				<XCircle className="size-3" aria-hidden />
				Perlu revisi
			</Badge>
		);
	}
	return (
		<Badge
			variant="outline"
			className="gap-1 border-amber-300 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300"
		>
			<Clock className="size-3" aria-hidden />
			Menunggu review
		</Badge>
	);
}
