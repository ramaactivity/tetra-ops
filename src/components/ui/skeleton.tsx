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
	return (
		<div
			data-slot="skeleton"
			className={cn(
				"relative overflow-hidden rounded-md bg-surface-3",
				"after:absolute after:inset-0 after:-translate-x-full after:animate-[skeleton-shimmer_1.5s_var(--ease-out-quart)_infinite]",
				"after:bg-gradient-to-r after:from-transparent after:via-white/[0.03] after:to-transparent",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
