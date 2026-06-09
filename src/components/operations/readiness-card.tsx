import {
	AlertCircle,
	CheckCircle2,
	Circle,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { DesignStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

type CheckState = "done" | "pending" | "overdue";

type CheckItem = {
	id: string;
	label: string;
	/** Target deadline chip, e.g. "H-3". Omitted when there's no fixed target. */
	deadline?: string;
	hint: string;
	state: CheckState;
	cta?: { label: string; href: string };
};

function daysUntil(eventDate: string): number {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const ev = new Date(eventDate);
	ev.setHours(0, 0, 0, 0);
	return Math.round((ev.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function pickIcon(state: CheckState): LucideIcon {
	if (state === "done") return CheckCircle2;
	if (state === "overdue") return AlertCircle;
	return Circle;
}

function pickIconTone(state: CheckState): string {
	if (state === "done") return "text-emerald-500";
	if (state === "overdue") return "text-amber-500";
	return "text-muted-foreground/40";
}

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

type ReadinessInput = {
	projectId: string;
	eventId: string;
	eventDate: string;
	status: string;
	paymentStatus: string;
	totalPaid: number;
	remainingBalance: number;
	crewCount: number;
	designStatus: DesignStatus;
	rekapSubmitted: boolean;
};

export function EventReadinessCard(props: ReadinessInput) {
	const days = daysUntil(props.eventDate);
	const isPostEvent = days < 0;
	const isCancelledOrCompleted =
		props.status === "cancelled" || props.status === "completed";

	if (isCancelledOrCompleted) {
		return null;
	}

	const items: CheckItem[] = [];

	// 1) DP received (any payment counts)
	const hasDp = props.totalPaid > 0;
	items.push({
		id: "dp",
		label: "DP masuk",
		hint: hasDp
			? `Terbayar ${rupiah(props.totalPaid)}`
			: "Belum ada pembayaran",
		state: hasDp ? "done" : days <= 7 ? "overdue" : "pending",
		cta: !hasDp
			? {
					label: "Catat pembayaran",
					href: `/operations/${props.projectId}/payments`,
				}
			: undefined,
	});

	// 2) Lunas — target H-3
	const isLunas = props.remainingBalance <= 0;
	items.push({
		id: "lunas",
		label: "Pelunasan",
		deadline: "H-3",
		hint: isLunas ? "Sudah lunas" : `Sisa ${rupiah(props.remainingBalance)}`,
		state: isLunas ? "done" : days <= 3 && !isPostEvent ? "overdue" : "pending",
		cta: !isLunas
			? {
					label: "Kelola pembayaran",
					href: `/operations/${props.projectId}/payments`,
				}
			: undefined,
	});

	// 3) Crew assigned — target H-2
	items.push({
		id: "crew",
		label: "Crew di-assign",
		deadline: "H-2",
		hint:
			props.crewCount === 0
				? "Belum ada crew"
				: `${props.crewCount} crew sudah di-assign`,
		state:
			props.crewCount > 0
				? "done"
				: days <= 2 && !isPostEvent
					? "overdue"
					: "pending",
		cta:
			props.crewCount === 0
				? {
						label: "Assign crew",
						href: `/operations/${props.projectId}#crew-manage`,
					}
				: undefined,
	});

	// 4) Design approved — target H-1
	const designDone = props.designStatus === "approved";
	items.push({
		id: "design",
		label: "Design final",
		deadline: "H-1",
		hint: designDone
			? "Sudah approved"
			: props.designStatus === "proses"
				? "Sedang diproses"
				: "Belum ada design",
		state: designDone
			? "done"
			: days <= 1 && !isPostEvent
				? "overdue"
				: "pending",
		cta: !designDone ? { label: "Kelola design", href: "/design" } : undefined,
	});

	// 5) Post-event: rekap submitted
	if (isPostEvent) {
		items.push({
			id: "rekap",
			label: "Rekap masuk",
			hint: props.rekapSubmitted ? "Siap di-settle" : "Belum ada rekap",
			state: props.rekapSubmitted ? "done" : "overdue",
			cta: !props.rekapSubmitted
				? {
						label: "Input rekap",
						href: `/operations/${props.projectId}/rekap`,
					}
				: undefined,
		});
	}

	const doneCount = items.filter((i) => i.state === "done").length;
	const overdueCount = items.filter((i) => i.state === "overdue").length;
	const pct = Math.round((doneCount / items.length) * 100);

	let dayLabel: string;
	if (days === 0) dayLabel = "Hari ini";
	else if (days === 1) dayLabel = "Besok · H-1";
	else if (days > 1) dayLabel = `H-${days}`;
	else dayLabel = `${Math.abs(days)} hari setelah event`;

	return (
		<div className="px-5 py-4">
			{/* Header: timing + progress */}
			<div className="mb-4 flex items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
					<span className="font-semibold text-foreground">{dayLabel}</span>
					<span className="text-muted-foreground/40" aria-hidden>
						·
					</span>
					<span className="text-muted-foreground">
						<span className="tabular font-semibold text-foreground">
							{doneCount}
						</span>{" "}
						dari {items.length} siap
					</span>
					{overdueCount > 0 && (
						<span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
							{overdueCount} perlu perhatian
						</span>
					)}
				</div>
				<div
					className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-secondary"
					role="progressbar"
					aria-valuenow={pct}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={`Progres kesiapan ${pct}%`}
				>
					<span
						className={cn(
							"block h-full transition-all",
							overdueCount > 0
								? "bg-amber-500"
								: doneCount === items.length
									? "bg-emerald-500"
									: "bg-foreground",
						)}
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>

			{/* Checklist */}
			<ul className="divide-y divide-border-subtle">
				{items.map((item) => {
					const Icon = pickIcon(item.state);
					const done = item.state === "done";
					return (
						<li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
							<Icon
								className={cn(
									"mt-px size-[18px] shrink-0",
									pickIconTone(item.state),
								)}
								strokeWidth={2}
								aria-hidden
							/>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-3">
									<div className="flex min-w-0 items-center gap-2">
										<span
											className={cn(
												"text-[13px] font-medium",
												done ? "text-muted-foreground" : "text-foreground",
											)}
										>
											{item.label}
										</span>
										{item.deadline && !done && (
											<span className="shrink-0 rounded bg-secondary px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
												target {item.deadline}
											</span>
										)}
									</div>
									{item.cta && (
										<Link
											href={item.cta.href}
											className="shrink-0 text-[11.5px] font-medium text-[#0070f3] transition-colors hover:underline"
										>
											{item.cta.label} →
										</Link>
									)}
								</div>
								<p
									className={cn(
										"mt-0.5 text-[12px]",
										item.state === "overdue"
											? "text-amber-700 dark:text-amber-400"
											: "text-muted-foreground",
									)}
								>
									{item.hint}
								</p>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
