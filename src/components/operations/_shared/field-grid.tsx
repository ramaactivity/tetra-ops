"use client";

import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * <FieldGrid.Row /> — label-left, value-right field row.
 *
 * Desktop (≥md): 12-col grid → label spans 4 (col-span-4), value spans
 * 8 (col-span-8). Caption-mono label, tooltip ⓘ next to label when
 * `tooltip` is set. Hint + error appear below the value.
 *
 * Mobile (<md): collapses to stacked (label on top, value below) so
 * narrow viewports stay legible.
 *
 * Compose multiple rows inside a SectionCard body. For paired short
 * fields (Tanggal+Jam) wrap the value cell content in a sub-grid.
 */

interface FieldGridRowProps {
	label: ReactNode;
	name?: string;
	htmlFor?: string;
	hint?: string;
	tooltip?: string;
	error?: string;
	required?: boolean;
	children: ReactNode;
	className?: string;
	/** Override label cell alignment. Default: "items-center" — useful
	 *  when the value is a textarea / multi-line block, set to "items-start". */
	labelAlign?: "start" | "center";
}

function FieldGridRow({
	label,
	name,
	htmlFor,
	hint,
	tooltip,
	error,
	required,
	children,
	className,
	labelAlign = "center",
}: FieldGridRowProps) {
	const targetId = htmlFor ?? name;
	return (
		<div
			className={cn(
				"grid gap-2 md:grid-cols-12 md:gap-4",
				labelAlign === "center" ? "md:items-center" : "md:items-start",
				className,
			)}
			data-slot="field-grid-row"
		>
			<div
				className={cn(
					"flex items-center gap-1.5 md:col-span-4",
					labelAlign === "start" && "md:pt-2",
				)}
			>
				<label
					htmlFor={targetId}
					className="text-[13px] font-medium leading-snug text-foreground"
				>
					{label}
					{required ? (
						<span className="ml-0.5 text-primary">*</span>
					) : null}
				</label>
				{tooltip ? <HelpTooltip text={tooltip} label={String(label)} /> : null}
			</div>
			<div className="space-y-1.5 md:col-span-8">
				{children}
				{error ? (
					<p className="text-[12px] text-destructive">{error}</p>
				) : hint ? (
					<p className="text-[12px] text-muted-foreground">{hint}</p>
				) : null}
			</div>
		</div>
	);
}

function HelpTooltip({ text, label }: { text: string; label: string }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						aria-label={`Penjelasan untuk ${label}`}
						className="press-down inline-grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					>
						<HelpCircle className="size-3.5" aria-hidden />
					</button>
				}
			/>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}

/**
 * <FieldGrid /> — outer container; just establishes the row stack.
 * Use FieldGrid.Row for each label/value row.
 */
interface FieldGridProps {
	children: ReactNode;
	className?: string;
	/** Vertical gap between rows. Default: gap-y-4 */
	gap?: "tight" | "default";
}

export function FieldGrid({
	children,
	className,
	gap = "default",
}: FieldGridProps) {
	return (
		<div
			className={cn(
				"grid",
				gap === "tight" ? "gap-y-3" : "gap-y-4",
				className,
			)}
			data-slot="field-grid"
		>
			{children}
		</div>
	);
}

FieldGrid.Row = FieldGridRow;
