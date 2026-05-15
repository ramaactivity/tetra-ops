import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton — placeholder shape while content loads. Use in loading.tsx
 * route segments and any Suspense boundary.
 *
 * Pattern: render same shape as final content (same height, same flex
 * structure) so the layout doesn't shift on swap.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	// No gradient shimmer per "clean dan seamless" direction.
	// Use a simple opacity pulse on surface-3.
	return (
		<div
			data-slot="skeleton"
			className={cn(
				"animate-pulse rounded-md bg-surface-3",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
