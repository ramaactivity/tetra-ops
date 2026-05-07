import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * <Stack /> — vertical flex column with constrained gap scale.
 *
 * Replaces ad-hoc `flex flex-col gap-N` with semantic gap names that
 * match our spacing scale (DS §4.1).
 *
 * Defaults to gap "md" (16px). Use:
 *   - xs (4px): inline label + icon
 *   - sm (8px): related fields in a form
 *   - md (16px): default — between cards or section blocks
 *   - lg (24px): between content blocks within a section
 *   - xl (32px): between major page sections
 *   - 2xl (48px): hero spacing on landing
 */

const stackVariants = cva("flex flex-col", {
	variants: {
		gap: {
			none: "",
			xs: "gap-1",
			sm: "gap-2",
			md: "gap-4",
			lg: "gap-6",
			xl: "gap-8",
			"2xl": "gap-12",
		},
		align: {
			start: "items-start",
			center: "items-center",
			end: "items-end",
			stretch: "items-stretch",
		},
	},
	defaultVariants: {
		gap: "md",
		align: "stretch",
	},
});

interface StackProps
	extends React.ComponentProps<"div">,
		VariantProps<typeof stackVariants> {}

export function Stack({ className, gap, align, ...props }: StackProps) {
	return (
		<div
			data-slot="stack"
			className={cn(stackVariants({ gap, align }), className)}
			{...props}
		/>
	);
}
