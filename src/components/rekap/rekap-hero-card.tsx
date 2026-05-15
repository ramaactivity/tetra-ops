import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
};

/**
 * <RekapHeroCard /> — branded hero block shared between crew submit page
 * and owner review page. Status badge auto-derives from approval state.
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
}: Props) {
	return (
		<div className="relative overflow-hidden rounded-2xl border border-border-default bg-card p-5 sm:p-6">
			<div className="relative space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-fluid-caption font-semibold uppercase tracking-widest text-primary">
						{eyebrow}
					</span>
					<StatusBadge isApproved={isApproved} submitted={submitted} />
				</div>
				<div className="space-y-1">
					<h1 className="text-fluid-h1 leading-tight tracking-tight text-foreground">
						{clientName}
					</h1>
					<p className="text-fluid-caption text-muted-foreground">
						<span className="tabular">{projectId}</span> · {formatDateID(eventDate)}
						{venueName ? <> · {venueName}</> : null}
					</p>
				</div>
				{pkg?.name && (
					<div className="flex flex-wrap gap-1.5">
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
			<Badge variant="secondary" className="text-[10px]">
				BELUM SUBMIT
			</Badge>
		);
	}
	if (isApproved === true) {
		return (
			<Badge
				variant="outline"
				className="border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
			>
				<CheckCircle2 className="mr-1 h-3 w-3" />
				Approved
			</Badge>
		);
	}
	if (isApproved === false) {
		return (
			<Badge
				variant="outline"
				className="border-rose-300 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300"
			>
				<XCircle className="mr-1 h-3 w-3" />
				Need revision
			</Badge>
		);
	}
	return (
		<Badge
			variant="outline"
			className="border-amber-300 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300"
		>
			<Clock className="mr-1 h-3 w-3" />
			Menunggu review
		</Badge>
	);
}
