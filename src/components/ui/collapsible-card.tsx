"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";
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
 * NOTE on `icon`: this is a client component (`"use client"`). React
 * Server Components cannot serialize a raw component reference (like
 * `Sparkles` from lucide) when passing it as a prop. Always pass a
 * pre-rendered React element — `icon={<Sparkles className="size-4" />}`
 * — not the component itself.
 */

interface CollapsibleCardProps {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	icon?: React.ReactNode;
	actions?: React.ReactNode;
	defaultOpen?: boolean;
	className?: string;
	bodyClassName?: string;
	children: React.ReactNode;
}

export function CollapsibleCard({
	title,
	subtitle,
	icon,
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
					{icon ? (
						<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
							{icon}
						</span>
					) : null}
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-[14px] font-semibold leading-snug text-foreground">
							{title}
						</span>
						{subtitle ? (
							<span
								className={cn(
									"text-[12px] leading-snug text-muted-foreground",
									// String subtitles carrying digits (e.g. "Grand total
									// Rp 15.200.000") get .tabular so privacy mode blurs them.
									typeof subtitle === "string" &&
										/\d/.test(subtitle) &&
										"tabular",
								)}
							>
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
