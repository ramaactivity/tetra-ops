import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free chart primitives for the Leads analytics tab.
 * All presentational + server-renderable (CSS bars, no client JS) so the page
 * stays fast and on-brand: ink fills, hairline tracks, tabular figures.
 */

export function ChartCard({
	title,
	subtitle,
	right,
	children,
	className,
}: {
	title: string;
	subtitle?: string;
	right?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)]",
				className,
			)}
		>
			<div className="flex items-start justify-between gap-3 px-5 py-4">
				<div className="min-w-0">
					<h2 className="type-heading text-foreground">{title}</h2>
					{subtitle ? (
						<p className="type-secondary mt-0.5 leading-snug">{subtitle}</p>
					) : null}
				</div>
				{right ? <div className="shrink-0">{right}</div> : null}
			</div>
			<div className="flex-1 border-t border-border-subtle px-5 py-5">
				{children}
			</div>
		</section>
	);
}

function EmptyChart({ label }: { label: string }) {
	return (
		<p className="py-6 text-center text-[12.5px] text-muted-foreground">
			{label}
		</p>
	);
}

export type BarItem = {
	label: string;
	value: number;
	/** Tailwind bg-* class for the fill. Defaults to ink. */
	colorClass?: string;
	/** Optional trailing note after the count (e.g. a percentage). */
	note?: string;
};

/** Horizontal labelled bars — segments, topics, funnel stages. */
export function BarList({
	items,
	emptyLabel = "Belum ada data",
}: {
	items: BarItem[];
	emptyLabel?: string;
}) {
	const max = Math.max(1, ...items.map((i) => i.value));
	if (items.length === 0 || max === 0) return <EmptyChart label={emptyLabel} />;

	return (
		<ul className="space-y-2.5">
			{items.map((it) => (
				<li key={it.label} className="flex items-center gap-3">
					<span className="w-28 shrink-0 truncate text-[12.5px] text-foreground/80">
						{it.label}
					</span>
					<div className="relative h-5 flex-1 overflow-hidden rounded-full bg-secondary">
						<div
							className={cn(
								"h-full rounded-full",
								it.colorClass ?? "bg-foreground",
							)}
							style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
						/>
					</div>
					<span className="tabular w-16 shrink-0 text-right text-[12.5px] font-medium text-foreground">
						{it.value.toLocaleString("id-ID")}
						{it.note ? (
							<span className="ml-1 font-normal text-muted-foreground">
								{it.note}
							</span>
						) : null}
					</span>
				</li>
			))}
		</ul>
	);
}

/** Vertical bars over a fixed 0–23 hour axis (WIB). Peak hour highlighted. */
export function HourHistogram({ counts }: { counts: number[] }) {
	const max = Math.max(1, ...counts);
	const total = counts.reduce((s, c) => s + c, 0);
	if (total === 0) return <EmptyChart label="Belum ada data per jam" />;
	const peak = counts.indexOf(max);
	const bars = counts.map((count, hour) => ({ hour, count }));

	return (
		<div>
			<div
				className="flex items-end gap-[3px] border-b border-border-default"
				style={{ height: 120 }}
			>
				{bars.map(({ hour, count }) => (
					<div
						key={hour}
						className="flex flex-1 items-end justify-center"
						style={{ height: "100%" }}
						title={`${String(hour).padStart(2, "0")}.00 — ${count} lead`}
					>
						{count > 0 ? (
							<div
								className={cn(
									"w-full rounded-t-[3px]",
									hour === peak ? "bg-foreground" : "bg-foreground/30",
								)}
								style={{ height: `${Math.max(3, (count / max) * 116)}px` }}
							/>
						) : null}
					</div>
				))}
			</div>
			<div className="mt-1.5 flex gap-[3px]">
				{bars.map(({ hour }) => (
					<span key={hour} className="flex-1 text-center">
						{hour % 6 === 0 ? (
							<span className="tabular text-[9.5px] text-muted-foreground">
								{String(hour).padStart(2, "0")}
							</span>
						) : null}
					</span>
				))}
			</div>
		</div>
	);
}

/** Vertical bars per day/week; zero buckets stay empty, sparse axis labels. */
export function DayTrend({
	points,
}: {
	points: Array<{ id: number; label: string; value: number }>;
}) {
	const max = Math.max(1, ...points.map((p) => p.value));
	const total = points.reduce((s, p) => s + p.value, 0);
	if (points.length === 0 || total === 0)
		return <EmptyChart label="Belum ada data pada rentang ini" />;

	// Aim for ~6 axis labels regardless of bucket count.
	const step = Math.max(1, Math.ceil(points.length / 6));

	return (
		<div>
			<div
				className="flex items-end gap-[3px] border-b border-border-default"
				style={{ height: 130 }}
			>
				{points.map((p) => (
					<div
						key={p.id}
						className="flex flex-1 items-end justify-center"
						style={{ height: "100%" }}
						title={`${p.label}: ${p.value} lead`}
					>
						{p.value > 0 ? (
							<div
								className="w-full rounded-t-[3px] bg-foreground"
								style={{ height: `${Math.max(3, (p.value / max) * 126)}px` }}
							/>
						) : null}
					</div>
				))}
			</div>
			<div className="mt-1.5 flex gap-[3px]">
				{points.map((p, i) => (
					<span
						key={p.id}
						className="flex-1 truncate text-center text-[9.5px] text-muted-foreground"
					>
						{i % step === 0 ? p.label : ""}
					</span>
				))}
			</div>
		</div>
	);
}
