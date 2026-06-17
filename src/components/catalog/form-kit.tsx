"use client";

import { AlertCircle, ChevronLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Back link + eyebrow + display title for a catalog create/edit page. */
export function CatalogFormHeader({
	backHref,
	backLabel,
	eyebrow,
	title,
	description,
}: {
	backHref: string;
	backLabel: string;
	eyebrow: string;
	title: string;
	description: string;
}) {
	return (
		<div className="space-y-3">
			<Link
				href={backHref}
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
			>
				<ChevronLeft className="size-4" />
				{backLabel}
			</Link>
			<div className="space-y-1">
				<span className="eyebrow text-muted-foreground">{eyebrow}</span>
				<h1 className="type-display text-foreground">{title}</h1>
				<p className="type-secondary">{description}</p>
			</div>
		</div>
	);
}

/** Card chrome wrapping a catalog form. */
export function CatalogFormCard({ children }: { children: React.ReactNode }) {
	return (
		<div className="border-border-default bg-card rounded-2xl border p-4 shadow-[var(--shadow-level-2)] sm:p-6">
			{children}
		</div>
	);
}

/**
 * Shared form primitives for the operations catalog forms (Paket, Add-on,
 * Backdrop) so they stay visually consistent: labeled sections with a left
 * description column, hairline dividers, affix-aware inputs, a segmented
 * status toggle, and a sticky action footer.
 */

export const fieldInputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring focus-visible:border-border-strong h-10 w-full rounded-lg border px-3 text-base md:text-sm placeholder:text-muted-foreground/60 transition-colors focus-visible:ring-2 focus-visible:outline-none read-only:opacity-70";

export function FormError({ message }: { message?: string }) {
	if (!message) return null;
	return (
		<div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm font-medium">
			<AlertCircle className="mt-0.5 size-4 shrink-0" />
			<span>{message}</span>
		</div>
	);
}

export function FormSection({
	eyebrow,
	title,
	description,
	children,
}: {
	eyebrow: string;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section className="grid gap-5 md:grid-cols-[200px_1fr] md:gap-8">
			<div className="space-y-1">
				<span className="eyebrow text-muted-foreground">{eyebrow}</span>
				<h3 className="text-foreground text-[15px] font-semibold">{title}</h3>
				<p className="type-caption text-muted-foreground leading-snug">
					{description}
				</p>
			</div>
			<div className="space-y-5">{children}</div>
		</section>
	);
}

export function FormDivider() {
	return <div className="border-border-subtle border-t" />;
}

export function Field({
	label,
	name,
	hint,
	error,
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
	error?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-foreground text-sm font-medium">
				{label}
				{required && <span className="text-destructive ml-0.5">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-destructive flex items-center gap-1 text-xs">
					<AlertCircle className="size-3 shrink-0" />
					{error}
				</p>
			) : hint ? (
				<p className="text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}

/** Input with an inline prefix or suffix affix (e.g. "Rp", "jam"). */
export function AffixInput({
	prefix,
	suffix,
	className,
	...props
}: React.ComponentProps<"input"> & {
	prefix?: string;
	suffix?: string;
}) {
	return (
		<div className="relative">
			{prefix && (
				<span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium">
					{prefix}
				</span>
			)}
			<input
				className={cn(
					fieldInputClass,
					prefix && "pl-9",
					suffix && "pr-12",
					className,
				)}
				{...props}
			/>
			{suffix && (
				<span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
					{suffix}
				</span>
			)}
		</div>
	);
}

/**
 * Two-state segmented toggle (e.g. Aktif / Arsip). Controlled by the parent.
 *
 * Both segments are equal width and a fixed height, so two StatusToggles
 * placed side by side always line up — the contextual hint is rendered as a
 * single line BELOW the control (reflecting the current selection) rather
 * than inside each segment, which is what used to make heights drift when
 * one hint wrapped to two lines.
 */
export function StatusToggle({
	active,
	onChange,
	activeLabel = "Aktif",
	inactiveLabel = "Arsip",
	activeHint,
	inactiveHint,
}: {
	active: boolean;
	onChange: (v: boolean) => void;
	activeLabel?: string;
	inactiveLabel?: string;
	activeHint?: string;
	inactiveHint?: string;
}) {
	const hint = active ? activeHint : inactiveHint;
	const hasHints = Boolean(activeHint || inactiveHint);
	return (
		<div className="w-full max-w-sm space-y-1.5">
			<div className="border-border-default bg-card grid grid-cols-2 gap-1 rounded-xl border p-1">
				<ToggleSegment
					active={active}
					dot="emerald"
					onClick={() => onChange(true)}
					label={activeLabel}
				/>
				<ToggleSegment
					active={!active}
					dot="muted"
					onClick={() => onChange(false)}
					label={inactiveLabel}
				/>
			</div>
			{hasHints ? (
				<p className="text-muted-foreground min-h-4 text-xs leading-4">
					{hint}
				</p>
			) : null}
		</div>
	);
}

function ToggleSegment({
	active,
	onClick,
	label,
	dot,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	dot: "emerald" | "muted";
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
				active
					? "bg-secondary text-foreground shadow-[var(--shadow-level-1)]"
					: "text-muted-foreground hover:bg-secondary/50",
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full transition-colors",
					!active
						? "bg-transparent"
						: dot === "emerald"
							? "bg-emerald-500"
							: "bg-muted-foreground",
				)}
			/>
			{label}
		</button>
	);
}

export function StickyFormFooter({
	cancelHref,
	submitLabel,
	pending,
	pendingLabel = "Menyimpan…",
}: {
	cancelHref: string;
	submitLabel: string;
	pending: boolean;
	pendingLabel?: string;
}) {
	return (
		<div className="border-border-subtle bg-card/80 sticky bottom-0 -mx-4 -mb-4 flex items-center justify-end gap-3 border-t px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:-mb-6 sm:px-6">
			<Link
				href={cancelHref}
				className="border-border-default bg-card hover:bg-secondary inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
			>
				Cancel
			</Link>
			<button
				type="submit"
				disabled={pending}
				className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 dark:bg-primary dark:hover:bg-primary"
			>
				{pending ? pendingLabel : submitLabel}
			</button>
		</div>
	);
}

/** Shared chrome for a trailing icon action button (edit / archive / toggle). */
export const iconActionClass =
	"text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50";

export function EditLink({ href, label }: { href: string; label: string }) {
	return (
		<Link
			href={href}
			title="Edit"
			aria-label={`Edit ${label}`}
			className={iconActionClass}
		>
			<Pencil className="size-4" />
		</Link>
	);
}
