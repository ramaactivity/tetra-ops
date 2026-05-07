import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * <Cluster /> — horizontal flex row with wrap. For toolbars, button
 * groups, tag chips, breadcrumbs.
 *
 * Reach for <Stack /> if you need vertical column.
 */

const clusterVariants = cva("flex flex-wrap", {
	variants: {
		gap: {
			none: "",
			xs: "gap-1",
			sm: "gap-2",
			md: "gap-3",
			lg: "gap-4",
			xl: "gap-6",
		},
		align: {
			start: "items-start",
			center: "items-center",
			end: "items-end",
			baseline: "items-baseline",
		},
		justify: {
			start: "justify-start",
			center: "justify-center",
			end: "justify-end",
			between: "justify-between",
			around: "justify-around",
		},
	},
	defaultVariants: {
		gap: "sm",
		align: "center",
		justify: "start",
	},
});

interface ClusterProps
	extends React.ComponentProps<"div">,
		VariantProps<typeof clusterVariants> {}

export function Cluster({
	className,
	gap,
	align,
	justify,
	...props
}: ClusterProps) {
	return (
		<div
			data-slot="cluster"
			className={cn(clusterVariants({ gap, align, justify }), className)}
			{...props}
		/>
	);
}
