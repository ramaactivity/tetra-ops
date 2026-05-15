import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * <Badge /> — Vercel `badge-secondary` lineage.
 *
 * Pill-shaped (rounded-full), compact (h-5, px-2), 11-12px caption type.
 * Semantic variants use a soft-tinted bg with a saturated text — the
 * Vercel "status indicator" pattern from the deployments list.
 *
 * `default` collapses to canvas-soft + body tone (no ink fill — that
 * would be too loud for a status pill).
 */

const badgeVariants = cva(
	"group/badge inline-flex h-[20px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2 text-[11px] font-medium leading-none whitespace-nowrap transition-colors has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-2.5!",
	{
		variants: {
			variant: {
				/* DEFAULT — soft canvas-soft fill with body tone. Used for
				   neutral state indicators that should sit quietly. */
				default:
					"bg-secondary text-muted-foreground",
				/* SECONDARY — same shape, slightly more visible. */
				secondary:
					"bg-secondary text-foreground/80",
				/* OUTLINE — transparent fill with hairline border. */
				outline:
					"border border-border-default bg-card text-muted-foreground",
				/* GHOST — transparent, no border. For inline-baseline labels. */
				ghost:
					"text-muted-foreground hover:bg-secondary",
				/* DESTRUCTIVE — error red tint. */
				destructive:
					"bg-rose-500/10 text-rose-600 dark:text-rose-400",
				/* SEMANTIC — Vercel status colors. Soft tint bg + saturated text. */
				success:
					"bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
				warning:
					"bg-amber-500/10 text-amber-700 dark:text-amber-500",
				danger:
					"bg-rose-500/10 text-rose-600 dark:text-rose-400",
				info:
					"bg-[#0070f3]/10 text-[#0070f3] dark:text-[#3b96ff]",
				/* NEUTRAL — visible against canvas, for read-only labels. */
				neutral:
					"bg-secondary text-foreground/70",
				/* LINK — inline link blue (rare on badges). */
				link:
					"text-[#0070f3] underline-offset-4 hover:underline",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant = "default",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant }), className),
			},
			props,
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	});
}

export { Badge, badgeVariants };
