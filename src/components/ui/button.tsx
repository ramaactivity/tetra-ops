import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * <Button /> — Vercel two-scale system.
 *
 * **In-app** (default scale, used everywhere except marketing landing):
 * - 6px radius (Vercel `--geist-radius`), 28/32/40px heights, no pill.
 * - `default` = ink primary (#171717 → white). Single CTA color.
 * - `secondary` = white card surface with hairline border.
 * - `ghost` = transparent, hover paints to canvas-soft-2.
 * - `outline` = white surface, hairline border, body text.
 * - `link` = inline link blue, underline on hover.
 * - `destructive` = error red.
 *
 * **Marketing** (reserved for landing hero, NOT operational chrome):
 * - `marketing` variant + `hero` / `hero-lg` size produces the 100px pill.
 *
 * **Decisive financial actions** (Tutup Buku, Submit Rekap, Approve):
 * - Use `decisive` variant — same ink fill, but `lg` size for a bigger
 *   tap target. NO pill, NO glow. Vercel discipline.
 */

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center bg-clip-padding font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				/* INK PRIMARY — the single CTA color. Used everywhere a primary
				   action exists (Save, Submit, Confirm, New booking, …). */
				default:
					"rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
				/* OUTLINE — white card surface with hairline border. Pairs with
				   default for secondary actions. */
				outline:
					"rounded-md border border-border-default bg-card text-foreground hover:bg-secondary aria-expanded:bg-secondary",
				/* SECONDARY — soft inset fill (canvas-soft-2). Used when the
				   action sits inside an already-white card. */
				secondary:
					"rounded-md bg-secondary text-secondary-foreground hover:bg-muted",
				/* GHOST — transparent. Hover paints to soft inset. */
				ghost:
					"rounded-md text-foreground hover:bg-secondary aria-expanded:bg-secondary",
				/* DESTRUCTIVE — Vercel error red tint. */
				destructive:
					"rounded-md bg-destructive text-white hover:bg-destructive/90",
				link: "text-[#0070f3] underline-offset-4 hover:underline",
				/* DECISIVE — ink fill, bigger tap target (use with size="lg").
				   Reserved for irreversible financial commits. NO pill, NO glow. */
				decisive:
					"rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
				"decisive-success":
					"rounded-md bg-emerald-600 text-white hover:bg-emerald-700",
				"decisive-danger":
					"rounded-md bg-destructive text-white hover:bg-destructive/90",
				/* MARKETING — 100px pill, hero scale. ONLY for landing page. */
				marketing:
					"rounded-full bg-primary text-primary-foreground hover:bg-primary/90",
				"marketing-secondary":
					"rounded-full border border-border-default bg-card text-foreground hover:bg-secondary",
			},
			size: {
				/* IN-APP SCALE — 32px default, matches Vercel's --geist-form-height
				   shrunken slightly. The whole chrome (buttons + inputs + filter
				   pills + view switcher tabs) snaps to 32px for visual rhythm. */
				default: "h-8 gap-1.5 px-3 text-[13px] leading-none has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
				xs: "h-6 gap-1 px-2 text-[12px] [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 px-2.5 text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-10 gap-2 px-4 text-[14px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				xl: "h-11 gap-2 px-5 text-[15px] font-semibold",
				/* HERO / HERO-LG — marketing pill scale. Only use with
				   variant="marketing" / "marketing-secondary" on landing. */
				hero: "h-11 gap-2 px-6 text-[15px] font-medium",
				"hero-lg": "h-12 gap-2 px-7 text-[16px] font-medium",
				icon: "size-8 rounded-md",
				"icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
				"icon-lg": "size-10 rounded-md",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
