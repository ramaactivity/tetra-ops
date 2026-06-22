import { Camera, CheckCircle2, Clock, Printer, XCircle } from "lucide-react";
import type * as React from "react";
import { FRAME_SIZE_LABELS, formatDateID } from "@/lib/format";

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
	eventDate,
	venueName,
	pkg,
	isApproved,
	submitted,
	totalCetak = 0,
	proofCount = 0,
	submittedBy,
	reviewedBy,
}: Props) {
	return (
		<div className="overflow-hidden rounded-[20px] bg-[#059669] text-white shadow-[var(--shadow-level-3)]">
			<div className="space-y-3 p-5">
				<div className="flex items-center justify-between gap-2">
					<span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
						{eyebrow}
					</span>
					<StatusBadge isApproved={isApproved} submitted={submitted} />
				</div>
				<div className="space-y-1">
					<h1 className="text-balance text-[28px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[34px]">
						{clientName}
					</h1>
					<p className="text-[13.5px] text-white/70">
						{formatDateID(eventDate)}
						{venueName ? <> · {venueName}</> : null}
					</p>
				</div>
				{pkg?.name &&
					(() => {
						// Avoid redundant pills: package names often already embed the
						// duration & frame (e.g. "2R Unlimited 2 Jam"). Only show those
						// chips when the name doesn't already contain them.
						const nameLower = pkg.name.toLowerCase();
						const frameLabel = pkg.frame_size
							? (FRAME_SIZE_LABELS[pkg.frame_size] ?? pkg.frame_size)
							: null;
						const showDuration =
							!!pkg.duration_hours &&
							!nameLower.includes(`${pkg.duration_hours} jam`) &&
							!nameLower.includes(`${pkg.duration_hours}jam`);
						const showFrame =
							!!frameLabel && !nameLower.includes(frameLabel.toLowerCase());
						return (
							<div className="flex flex-wrap gap-1.5 pt-0.5">
								<HeroPill>{pkg.name}</HeroPill>
								{showDuration ? (
									<HeroPill>{pkg.duration_hours} jam</HeroPill>
								) : null}
								{showFrame ? <HeroPill>{frameLabel}</HeroPill> : null}
							</div>
						);
					})()}
			</div>

			{/* KPI strip — only meaningful once a rekap exists. No HPP/cost here:
			    this is the crew view and material cost is a business secret. */}
			{submitted && (
				<dl className="grid grid-cols-3 divide-x divide-white/15 border-t border-white/15">
					<Kpi
						icon={Printer}
						label="Total cetak"
						value={
							<>
								{totalCetak.toLocaleString("id-ID")}
								<span className="ml-1 text-[12px] font-normal text-white/60">
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
								<span className="ml-1 text-[12px] font-normal text-white/60">
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

/** Translucent-white chip that reads on the emerald hero. */
function HeroPill({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-medium text-white">
			{children}
		</span>
	);
}

function Kpi({
	icon: Icon,
	label,
	value,
	sub,
}: {
	icon?: typeof Printer;
	label: string;
	value: React.ReactNode;
	sub?: string;
}) {
	return (
		<div className="min-w-0 px-5 py-3.5">
			<dt className="flex items-center gap-1.5">
				{Icon ? (
					<Icon className="size-3 text-white/60" aria-hidden strokeWidth={2} />
				) : null}
				<span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70">
					{label}
				</span>
			</dt>
			<dd className="tabular mt-1 truncate text-[18px] font-semibold leading-none text-white">
				{value}
			</dd>
			{sub ? (
				<dd className="mt-1 truncate text-[11px] text-white/60">{sub}</dd>
			) : null}
		</div>
	);
}

/**
 * Status pill rendered on the emerald hero. Translucent white for neutral/positive
 * states; "Perlu revisi" gets a solid white pill with rose text so the call to
 * action pops against the green.
 */
function StatusBadge({
	isApproved,
	submitted,
}: {
	isApproved: boolean | null | undefined;
	submitted: boolean;
}) {
	const base =
		"inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold backdrop-blur-sm";
	if (!submitted) {
		return (
			<span className={`${base} bg-white/15 text-white`}>
				<Clock className="size-3.5" aria-hidden />
				Belum submit
			</span>
		);
	}
	if (isApproved === true) {
		return (
			<span className={`${base} bg-white/20 text-white`}>
				<CheckCircle2 className="size-3.5" aria-hidden />
				Approved
			</span>
		);
	}
	if (isApproved === false) {
		return (
			<span className={`${base} bg-white text-rose-600`}>
				<XCircle className="size-3.5" aria-hidden />
				Perlu revisi
			</span>
		);
	}
	return (
		<span className={`${base} bg-white/15 text-white`}>
			<Clock className="size-3.5" aria-hidden />
			Menunggu review
		</span>
	);
}
