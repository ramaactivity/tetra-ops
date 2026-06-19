"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <Switch /> — the one on/off toggle the app shares.
 *
 * UpGradely DNA: green (#059669) track when on, neutral hairline track when
 * off, white thumb. Two sizes so a master toggle can read louder than an
 * inline per-row toggle. Controlled — pass `checked` + `onCheckedChange`.
 *
 * Replaces the hand-rolled `role="switch"` buttons that copy-pasted the
 * `bg-[#059669]` track + translate math at every callsite.
 */

interface SwitchProps {
	checked: boolean;
	onCheckedChange?: () => void;
	disabled?: boolean;
	/** `default` = inline row toggle (44×24). `lg` = master toggle (48×28). */
	size?: "default" | "lg";
	"aria-label"?: string;
}

export function Switch({
	checked,
	onCheckedChange,
	disabled,
	size = "default",
	...props
}: SwitchProps) {
	const lg = size === "lg";
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={onCheckedChange}
			className={cn(
				"relative inline-flex shrink-0 items-center rounded-full transition-colors outline-none disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
				lg ? "h-7 w-12" : "h-6 w-11",
				checked ? "bg-[#059669]" : "bg-border-strong",
			)}
			{...props}
		>
			<span
				className={cn(
					"inline-block transform rounded-full bg-white shadow-sm transition-transform",
					lg ? "size-5" : "size-4",
					checked ? "translate-x-6" : "translate-x-1",
				)}
			/>
		</button>
	);
}
