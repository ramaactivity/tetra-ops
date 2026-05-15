import {
	AlertCircle,
	CheckCircle2,
	Circle,
	type LucideIcon,
	XCircle,
} from "lucide-react";
import Link from "next/link";

type CheckState = "done" | "pending" | "overdue" | "neutral";

type CheckItem = {
	id: string;
	label: string;
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
	if (state === "overdue") return XCircle;
	if (state === "pending") return AlertCircle;
	return Circle;
}

function pickTone(state: CheckState): string {
	if (state === "done") return "text-emerald-500";
	if (state === "overdue") return "text-rose-500";
	if (state === "pending") return "text-amber-500";
	return "text-muted-foreground/60";
}

type ReadinessInput = {
	projectId: string;
	eventId: string;
	eventDate: string;
	status: string;
	paymentStatus: string;
	totalPaid: number;
	remainingBalance: number;
	crewCount: number;
	designApprovedAt: string | null;
	designDriveUrl: string | null;
	equipmentCount: number;
	rekapSubmitted: boolean;
};

export function EventReadinessCard(props: ReadinessInput) {
	const days = daysUntil(props.eventDate);
	const isPostEvent = days < 0;
	const isCancelledOrCompleted =
		props.status === "cancelled" ||
		props.status === "completed" ||
		props.status === "archived";

	if (isCancelledOrCompleted) {
		return null;
	}

	const items: CheckItem[] = [];

	// DP received (any payment counts)
	const hasDp = props.totalPaid > 0;
	items.push({
		id: "dp",
		label: "DP diterima",
		hint:
			days <= 7 && !hasDp
				? `H-${days} — DP belum masuk`
				: hasDp
					? `Total paid Rp ${props.totalPaid.toLocaleString("id-ID")}`
					: "Belum ada DP",
		state: hasDp ? "done" : days <= 7 ? "overdue" : "pending",
		cta: !hasDp
			? {
					label: "Log payment",
					href: `/operations/${props.projectId}/payments`,
				}
			: undefined,
	});

	// Lunas H-3
	const isLunas = props.remainingBalance <= 0;
	items.push({
		id: "lunas",
		label: "Lunas (H-3)",
		hint: isLunas
			? "Pelunasan complete"
			: days <= 3
				? `Sisa Rp ${props.remainingBalance.toLocaleString("id-ID")} — perlu reminder`
				: `Sisa Rp ${props.remainingBalance.toLocaleString("id-ID")}`,
		state: isLunas ? "done" : days <= 3 && !isPostEvent ? "overdue" : "pending",
		cta: !isLunas
			? {
					label: "Manage payments",
					href: `/operations/${props.projectId}/payments`,
				}
			: undefined,
	});

	// Crew assigned (H-2)
	items.push({
		id: "crew",
		label: "Crew di-assign (H-2)",
		hint:
			props.crewCount === 0
				? "Belum ada crew assigned"
				: `${props.crewCount} crew di-assign`,
		state:
			props.crewCount > 0
				? "done"
				: days <= 2 && !isPostEvent
					? "overdue"
					: "pending",
		cta:
			props.crewCount === 0
				? { label: "Assign crew", href: `/operations/${props.projectId}/crew` }
				: undefined,
	});

	// Design approved (H-1)
	const designDone = !!props.designApprovedAt;
	items.push({
		id: "design",
		label: "Design approved (H-1)",
		hint: designDone
			? "Design final approved"
			: props.designDriveUrl
				? "Brief uploaded — belum approved"
				: "Belum ada design",
		state: designDone
			? "done"
			: days <= 1 && !isPostEvent
				? "overdue"
				: "pending",
		cta: !designDone
			? { label: "Buka design card", href: `/operations/${props.projectId}` }
			: undefined,
	});

	// Equipment checked-out (H-1 idealnya)
	items.push({
		id: "equipment",
		label: "Equipment siap",
		hint:
			props.equipmentCount > 0
				? `${props.equipmentCount} alat di-check-out`
				: "Belum ada alat di-check-out",
		state:
			props.equipmentCount > 0
				? "done"
				: days <= 1 && !isPostEvent
					? "overdue"
					: "neutral",
		cta:
			props.equipmentCount === 0
				? {
						label: "Check-out equipment",
						href: `/operations/${props.projectId}/equipment`,
					}
				: undefined,
	});

	// Post-event: rekap submitted
	if (isPostEvent) {
		items.push({
			id: "rekap",
			label: "Rekap di-submit",
			hint: props.rekapSubmitted
				? "Rekap masuk — siap di-settle"
				: "Belum ada rekap",
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

	let dayLabel: string;
	if (days === 0) dayLabel = "Hari ini";
	else if (days === 1) dayLabel = "Besok (H-1)";
	else if (days > 1) dayLabel = `H-${days}`;
	else dayLabel = `${Math.abs(days)} hari setelah event`;

	return (
		<div className="px-5 py-4">
			<div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
				<p className="text-[12px] text-muted-foreground">
					{dayLabel} ·{" "}
					<span className="tabular font-medium text-foreground">
						{doneCount}/{items.length}
					</span>{" "}
					ready
					{overdueCount > 0 && (
						<span className="ml-1 font-medium text-rose-600 dark:text-rose-400">
							· {overdueCount} overdue
						</span>
					)}
				</p>
				<div
					className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary"
					aria-label="Progress"
				>
					<span
						className={`block h-full transition-all ${
							overdueCount > 0
								? "bg-rose-500"
								: doneCount === items.length
									? "bg-emerald-500"
									: "bg-foreground"
						}`}
						style={{
							width: `${Math.round((doneCount / items.length) * 100)}%`,
						}}
					/>
				</div>
			</div>

			<ul className="divide-y divide-border-subtle">
				{items.map((item) => {
					const Icon = pickIcon(item.state);
					const tone = pickTone(item.state);
					return (
						<li
							key={item.id}
							className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
						>
							<Icon
								className={`${tone} mt-0.5 size-4 shrink-0`}
								strokeWidth={2}
							/>
							<div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
								<div className="space-y-0.5">
									<p className="text-[13px] font-semibold text-foreground">
										{item.label}
									</p>
									<p
										className={`text-[12px] ${
											item.state === "overdue"
												? "text-rose-600 dark:text-rose-400"
												: "text-muted-foreground"
										}`}
									>
										{item.hint}
									</p>
								</div>
								{item.cta && (
									<Link
										href={item.cta.href}
										className="text-[11.5px] font-medium text-[#0070f3] hover:underline"
									>
										{item.cta.label} →
									</Link>
								)}
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
