import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * <Container /> — page-level horizontal padding wrapper. Caps content
 * width and applies our mobile-first padding rules (per design system §4).
 *
 * Sizes:
 *   - sm   → max-w-3xl    (text-heavy pages, settings forms)
 *   - md   → max-w-5xl    (default — list pages, dashboards)
 *   - lg   → max-w-6xl    (operations, finance)
 *   - xl   → max-w-7xl    (full data dashboards)
 *   - wide → max-w-[1600px] (2-col forms w/ summary rail — booking form)
 *   - full → no max width
 *
 * Always: px-4 py-3 on mobile (hard cap per DS §4.2),
 *         md:px-6, lg:px-8 on bigger viewports.
 */

const containerVariants = cva("mx-auto w-full px-4 py-3 md:px-6 lg:px-8", {
	variants: {
		size: {
			sm: "max-w-3xl",
			md: "max-w-5xl",
			lg: "max-w-6xl",
			xl: "max-w-7xl",
			wide: "max-w-[1600px]",
			full: "max-w-none",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

interface ContainerProps
	extends React.ComponentProps<"div">,
		VariantProps<typeof containerVariants> {}

export function Container({
	className,
	size,
	...props
}: ContainerProps) {
	return (
		<div
			data-slot="container"
			className={cn(containerVariants({ size }), className)}
			{...props}
		/>
	);
}
