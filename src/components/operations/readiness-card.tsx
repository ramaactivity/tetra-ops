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
		<div className="border-border bg-card md:col-span-2 space-y-3 rounded-xl border p-5">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<h3 className="text-sm font-semibold tracking-tight">
						Kesiapan Event
					</h3>
					<p className="text-muted-foreground text-xs">
						{dayLabel} · {doneCount}/{items.length} ready
						{overdueCount > 0 && (
							<span className="text-rose-500 ml-1 font-medium">
								· {overdueCount} overdue
							</span>
						)}
					</p>
				</div>
				<div
					className="h-2 w-32 overflow-hidden rounded-full bg-muted"
					aria-label="Progress"
				>
					<span
						className={`block h-full transition-all ${
							overdueCount > 0
								? "bg-rose-500"
								: doneCount === items.length
									? "bg-emerald-500"
									: "bg-primary"
						}`}
						style={{
							width: `${Math.round((doneCount / items.length) * 100)}%`,
						}}
					/>
				</div>
			</div>

			<ul className="space-y-2">
				{items.map((item) => {
					const Icon = pickIcon(item.state);
					const tone = pickTone(item.state);
					return (
						<li
							key={item.id}
							className="flex items-start gap-3 border-t border-border/60 pt-2 first:border-t-0 first:pt-0"
						>
							<Icon className={`${tone} mt-0.5 h-4 w-4 shrink-0`} />
							<div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
								<div className="space-y-0.5">
									<p className="text-foreground text-sm font-medium">
										{item.label}
									</p>
									<p
										className={`text-xs ${
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
										className="text-primary hover:underline text-xs font-medium underline-offset-2"
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
