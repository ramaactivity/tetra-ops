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
				/* DESTRUCTIVE — danger red pill. */
				destructive:
					"bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
				/* SEMANTIC — UpGradely status pills: clearly-colored fill + dark
				   readable text (success=lime, warning=orange, info=sky blue). */
				success:
					"bg-emerald-200 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
				warning:
					"bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
				danger:
					"bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
				info:
					"bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
				/* NEUTRAL — visible against canvas, for read-only labels. */
				neutral:
					"bg-secondary text-foreground/70",
				/* LINK — inline link blue (rare on badges). */
				link:
					"text-link underline-offset-4 hover:underline",
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
