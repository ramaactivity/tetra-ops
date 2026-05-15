"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <CollapsibleCard /> — Vercel deployment-detail collapsible section.
 *
 * White card surface with hairline border. Trigger row hosts icon +
 * title + optional subtitle + chevron. Body slides open below a hairline
 * separator. Optional `actions` slot in the header for inline links
 * (e.g. "Manage payments →").
 *
 * Use `defaultOpen` for the hero card; leave secondary cards closed so
 * users only expand what they need.
 */

interface CollapsibleCardProps {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	icon?: LucideIcon;
	actions?: React.ReactNode;
	defaultOpen?: boolean;
	className?: string;
	bodyClassName?: string;
	children: React.ReactNode;
}

export function CollapsibleCard({
	title,
	subtitle,
	icon: Icon,
	actions,
	defaultOpen = false,
	className,
	bodyClassName,
	children,
}: CollapsibleCardProps) {
	return (
		<CollapsiblePrimitive.Root
			defaultOpen={defaultOpen}
			className={cn(
				"group/collapsible overflow-hidden rounded-lg border border-border-default bg-card",
				className,
			)}
		>
			<div className="flex items-center gap-3 px-5 py-3.5">
				<CollapsiblePrimitive.Trigger className="flex flex-1 min-w-0 items-center gap-3 text-left outline-none transition-colors hover:text-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card -m-1 p-1 rounded-md">
					{Icon ? (
						<Icon
							className="size-4 shrink-0 text-muted-foreground"
							aria-hidden
							strokeWidth={2}
						/>
					) : null}
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-[14px] font-semibold leading-snug text-foreground">
							{title}
						</span>
						{subtitle ? (
							<span className="text-[12px] leading-snug text-muted-foreground">
								{subtitle}
							</span>
						) : null}
					</div>
					<ChevronDown
						className="size-4 shrink-0 text-muted-foreground/70 transition-transform duration-fast ease-out-expo group-data-[panel-open]/collapsible:rotate-180"
						aria-hidden
						strokeWidth={2}
					/>
				</CollapsiblePrimitive.Trigger>
				{actions ? (
					<div className="flex shrink-0 items-center gap-2">{actions}</div>
				) : null}
			</div>
			<CollapsiblePrimitive.Panel
				className={cn(
					"overflow-hidden",
					"data-[panel-open]:animate-in data-[panel-open]:fade-in-0",
					"data-[panel-closed]:animate-out data-[panel-closed]:fade-out-0",
					"duration-base ease-out-expo",
				)}
			>
				<div
					className={cn(
						"border-t border-border-subtle px-5 py-4",
						bodyClassName,
					)}
				>
					{children}
				</div>
			</CollapsiblePrimitive.Panel>
		</CollapsiblePrimitive.Root>
	);
}
