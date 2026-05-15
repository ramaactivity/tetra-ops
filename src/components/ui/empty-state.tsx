import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <EmptyState /> — branded empty state for lists, tables, search results.
 *
 * Usage:
 *   <EmptyState
 *     icon={CalendarDays}
 *     title="Belum ada event terjadwal"
 *     description="Tambah event baru untuk mulai mengatur tim dan equipment."
 *     action={<Button asChild><Link href="/operations/new">Buat event</Link></Button>}
 *   />
 *
 * Variants:
 *   - default: standard list/table empty
 *   - hero: dashboard zero-state with subtle Sunrise gradient bg
 */

const emptyStateVariants = cva(
	"flex flex-col items-center justify-center gap-3 rounded-xl text-center",
	{
		variants: {
			variant: {
				default: "border border-dashed border-border-default bg-surface-2 p-8",
				hero: "relative overflow-hidden border border-border-subtle bg-surface-2 p-12",
			},
			size: {
				default: "min-h-[240px]",
				sm: "min-h-[160px] gap-2 p-6",
				lg: "min-h-[320px] gap-4",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

interface EmptyStateProps
	extends Omit<React.ComponentProps<"div">, "title">,
		VariantProps<typeof emptyStateVariants> {
	icon?: LucideIcon;
	title: React.ReactNode;
	description?: React.ReactNode;
	action?: React.ReactNode;
}

function EmptyState({
	className,
	variant = "default",
	size = "default",
	icon: Icon,
	title,
	description,
	action,
	children,
	...props
}: EmptyStateProps) {
	return (
		<div
			data-slot="empty-state"
			className={cn(emptyStateVariants({ variant, size }), className)}
			{...props}
		>
			{Icon ? (
				<div className="grid size-12 place-items-center rounded-full bg-surface-3 text-muted-foreground">
					<Icon className="size-6" aria-hidden />
				</div>
			) : null}
			<div className="flex flex-col gap-1">
				<h3 className="text-fluid-h3 font-medium text-foreground">{title}</h3>
				{description ? (
					<p className="max-w-sm text-fluid-body text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{action ? <div className="mt-2">{action}</div> : null}
			{children}
		</div>
	);
}

export { EmptyState, emptyStateVariants };
