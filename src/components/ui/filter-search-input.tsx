"use client";

import { Search } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/**
 * <FilterSearchInput /> — the single canonical search field for every
 * filter bar that sits above a table (Operations, Billing, Warehouse,
 * Akuntansi, Arsip Nota, Kontak, …).
 *
 * Locks the whole app's filter chrome to one spec — 32px height (h-8),
 * 6px radius, white card surface, 13px Inter, and the standard focus ring —
 * so every page reads identically. Patokan: halaman Operations (Event).
 *
 * Two modes:
 *  - Controlled  : pass `value` + `onValueChange` (client-filtered tables).
 *  - Uncontrolled: pass `name` + `defaultValue` (server <form> GET search).
 *
 * `className` styles the (relative) wrapper — use it for width, e.g.
 * `className="flex-1 sm:max-w-xs"` or `className="w-full"`.
 */
type FilterSearchInputProps = {
	/** Width/positioning classes for the `relative` wrapper. */
	className?: string;
	/** Controlled value. Pair with `onValueChange`. */
	value?: string;
	/** Controlled change handler — receives the raw string. */
	onValueChange?: (value: string) => void;
} & Omit<
	ComponentPropsWithoutRef<"input">,
	"value" | "onChange" | "type" | "className" | "size"
>;

export function FilterSearchInput({
	className,
	value,
	onValueChange,
	placeholder,
	"aria-label": ariaLabel,
	...inputProps
}: FilterSearchInputProps) {
	return (
		<div className={cn("relative", className)}>
			<Search
				className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
				aria-hidden
			/>
			<input
				type="search"
				value={value}
				onChange={
					onValueChange ? (e) => onValueChange(e.target.value) : undefined
				}
				placeholder={placeholder}
				aria-label={ariaLabel ?? placeholder}
				className="h-8 w-full rounded-md border border-border-default bg-card pl-8 pr-3 text-[13px] leading-none text-foreground placeholder:text-muted-foreground/70 transition-colors hover:bg-secondary/40 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
				{...inputProps}
			/>
		</div>
	);
}
