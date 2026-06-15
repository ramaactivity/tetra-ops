import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Mobile-native primitives (2026).
 *
 * The vocabulary every crew/owner mobile screen is built from. Replaces the
 * old soup of hand-sized cards + ad-hoc text-[Npx]. Spatial language is
 * iOS/Material-grade: large-title headers, grouped inset lists, soft cards,
 * one enforced type ramp (see globals.css .type-* classes). Server-component
 * friendly (no hooks) so it composes anywhere.
 */

/* ───────────────────────── Screen shell ───────────────────────── */

export function AppScreen({
	children,
	className,
	gutter = true,
}: {
	children: React.ReactNode;
	className?: string;
	/** Apply the fluid horizontal gutter. Off when the screen manages its own. */
	gutter?: boolean;
}) {
	return (
		<div
			className={cn(
				"mx-auto w-full max-w-[30rem] pb-[max(2.5rem,env(safe-area-inset-bottom))]",
				gutter && "app-gutter",
				className,
			)}
		>
			{children}
		</div>
	);
}

/**
 * Native large-title header. A frosted compact bar sticks under the global
 * TopBar; the big title sits below in flow and collapses on scroll (pure CSS
 * scroll-driven, graceful on older iOS). Place at the top of a screen.
 */
export function AppHeader({
	title,
	subtitle,
	backHref,
	actions,
	trailing,
	largeTitle = true,
}: {
	title: string;
	subtitle?: React.ReactNode;
	/** Renders a back arrow linking here. */
	backHref?: string;
	/** Right-aligned controls in the compact bar (icons, menu). */
	actions?: React.ReactNode;
	/** Inline element beside the large title (e.g. a status badge). */
	trailing?: React.ReactNode;
	/**
	 * When false, only the sticky compact bar renders (title always visible) so
	 * the screen can host its own hero below. Default true (large-title pattern).
	 */
	largeTitle?: boolean;
}) {
	return (
		<>
			<header className="lt-hairline sticky top-app-header z-20 -mx-[var(--gutter,0px)] border-b border-transparent bg-background/72 backdrop-blur-xl">
				<div className="app-gutter flex h-12 items-center gap-1">
					{backHref ? (
						<Link
							href={backHref}
							aria-label="Kembali"
							className="press tap -ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-foreground active:bg-surface-4"
						>
							<ArrowLeft className="size-[1.15rem]" strokeWidth={2.25} />
						</Link>
					) : (
						<span className="size-9 shrink-0" />
					)}
					<span
						className={cn(
							"type-heading min-w-0 flex-1 truncate text-center",
							largeTitle && "lt-compact",
						)}
					>
						{title}
					</span>
					<div className="flex shrink-0 items-center justify-end gap-1">
						{actions ?? <span className="size-9" />}
					</div>
				</div>
			</header>
			{largeTitle ? (
				<div className="app-gutter pt-1.5 pb-1">
					<div className="flex items-start justify-between gap-3">
						<h1 className="lt-large type-display min-w-0">{title}</h1>
						{trailing ? (
							<div className="lt-large mt-1 shrink-0">{trailing}</div>
						) : null}
					</div>
					{subtitle ? (
						<div className="lt-large type-secondary mt-1">{subtitle}</div>
					) : null}
				</div>
			) : null}
		</>
	);
}

/* ───────────────────────── Sections ───────────────────────── */

export function Section({
	title,
	action,
	children,
	className,
}: {
	title?: React.ReactNode;
	/** Trailing control aligned to the section title (e.g. "Lihat semua"). */
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("mt-6 first:mt-4", className)}>
			{title ? (
				<div className="mb-2 flex items-center justify-between gap-3 px-1">
					<h2 className="type-heading">{title}</h2>
					{action ? <div className="shrink-0">{action}</div> : null}
				</div>
			) : null}
			{children}
		</section>
	);
}

/* ───────────────────────── Surface (card) ───────────────────────── */

export function Surface({
	children,
	className,
	as: Tag = "div",
	tone = "card",
	pad = true,
}: {
	children: React.ReactNode;
	className?: string;
	as?: React.ElementType;
	/** card = elevated white/ink surface; soft = inset canvas tone. */
	tone?: "card" | "soft";
	pad?: boolean;
}) {
	return (
		<Tag
			className={cn(
				"rounded-[1.25rem] border",
				tone === "card"
					? "border-border-default bg-card shadow-[var(--shadow-level-2)]"
					: "border-transparent bg-surface-3",
				pad && "p-4",
				className,
			)}
		>
			{children}
		</Tag>
	);
}

/* ───────────────────────── Grouped inset list ───────────────────────── */

export function ListGroup({
	children,
	className,
	footnote,
}: {
	children: React.ReactNode;
	className?: string;
	footnote?: React.ReactNode;
}) {
	return (
		<div>
			<div
				className={cn(
					"overflow-hidden rounded-[1.25rem] border border-border-default bg-card shadow-[var(--shadow-level-2)]",
					className,
				)}
			>
				{children}
			</div>
			{footnote ? (
				<p className="type-caption mt-1.5 px-3">{footnote}</p>
			) : null}
		</div>
	);
}

type ListRowProps = {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	/** Leading visual — icon node or avatar. */
	leading?: React.ReactNode;
	/** Trailing content before the chevron — value, badge, time. */
	trailing?: React.ReactNode;
	href?: string;
	chevron?: boolean;
	className?: string;
};

export function ListRow({
	title,
	subtitle,
	leading,
	trailing,
	href,
	chevron,
	className,
}: ListRowProps) {
	const showChevron = chevron ?? Boolean(href);
	const inner = (
		<>
			{leading ? (
				<span className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
					{leading}
				</span>
			) : null}
			<span className="min-w-0 flex-1">
				<span className="type-body-strong block truncate">{title}</span>
				{subtitle ? (
					<span className="type-secondary mt-0.5 block truncate">{subtitle}</span>
				) : null}
			</span>
			{trailing ? (
				<span className="flex shrink-0 items-center gap-1.5 text-right">
					{trailing}
				</span>
			) : null}
			{showChevron ? (
				<ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
			) : null}
		</>
	);

	const base = cn(
		"flex min-h-[3.4rem] items-center gap-3 px-4 py-2.5",
		"border-b border-border-subtle last:border-b-0",
		href && "press transition-colors active:bg-surface-3",
		className,
	);

	if (href) {
		return (
			<Link href={href} className={base}>
				{inner}
			</Link>
		);
	}
	return <div className={base}>{inner}</div>;
}

/* ───────────────────────── Crew avatars ───────────────────────── */

function initialsOf(name: string): string {
	return (
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((n) => n[0]?.toUpperCase())
			.join("") || "?"
	);
}

const AVATAR_SIZE = {
	sm: "size-6 text-[0.625rem]",
	md: "size-8 text-[0.75rem]",
	lg: "size-10 text-[0.875rem]",
} as const;

export function CrewAvatar({
	name,
	src,
	size = "md",
	className,
}: {
	name: string;
	src?: string | null;
	size?: keyof typeof AVATAR_SIZE;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 font-semibold text-foreground ring-2 ring-card",
				AVATAR_SIZE[size],
				className,
			)}
		>
			{src ? (
				// biome-ignore lint/a11y/useAltText: alt provided
				// biome-ignore lint/performance/noImgElement: external avatar URLs (Google/Drive), tiny
				<img src={src} alt={name} className="size-full object-cover" />
			) : (
				initialsOf(name)
			)}
		</span>
	);
}

/** Overlapping crew avatars with a "+N" overflow bubble (reference adoption). */
export function AvatarGroup({
	people,
	max = 3,
	size = "md",
	className,
}: {
	people: Array<{ id?: string; name: string; avatar_url?: string | null }>;
	max?: number;
	size?: keyof typeof AVATAR_SIZE;
	className?: string;
}) {
	if (people.length === 0) return null;
	const shown = people.slice(0, max);
	const extra = people.length - shown.length;
	return (
		<div className={cn("flex items-center", className)}>
			{shown.map((p, i) => (
				<span
					key={p.id ?? `${p.name}-${i}`}
					className={cn(i > 0 && "-ml-2")}
					style={{ zIndex: shown.length - i }}
				>
					<CrewAvatar name={p.name} src={p.avatar_url} size={size} />
				</span>
			))}
			{extra > 0 ? (
				<span
					className={cn(
						"-ml-2 inline-flex shrink-0 items-center justify-center rounded-full bg-surface-4 font-semibold text-muted-foreground ring-2 ring-card",
						AVATAR_SIZE[size],
					)}
				>
					+{extra}
				</span>
			) : null}
		</div>
	);
}

/* ───────────────────────── Stat tile ───────────────────────── */

export function StatTile({
	label,
	value,
	hint,
	tone = "default",
	className,
}: {
	label: React.ReactNode;
	value: React.ReactNode;
	hint?: React.ReactNode;
	tone?: "default" | "positive" | "negative" | "warning";
	className?: string;
}) {
	const valueTone =
		tone === "positive"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "negative"
				? "text-rose-600 dark:text-rose-400"
				: tone === "warning"
					? "text-amber-600 dark:text-amber-400"
					: "text-foreground";
	return (
		<div
			className={cn(
				"rounded-[1.25rem] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]",
				className,
			)}
		>
			<span className="eyebrow">{label}</span>
			<div className={cn("type-num-lg mt-1.5", valueTone)}>{value}</div>
			{hint ? <div className="type-caption mt-0.5">{hint}</div> : null}
		</div>
	);
}
