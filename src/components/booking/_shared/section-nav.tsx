"use client";

import { AlertCircle, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClusterStatus = "ok" | "error" | "empty";

/**
 * <SectionNav /> — jump nav for booking form clusters. Sticky inside
 * summary panel column on desktop; hidden on mobile (sticky bottom bar
 * handles primary action there).
 *
 * Click → smooth scroll to cluster (CSS `scroll-behavior: smooth` on
 * the form container, plus `scroll-mt-4` on each cluster card).
 */

export interface NavItem {
	id: string; // anchor target (matches ClusterCard id)
	label: string;
	status: ClusterStatus;
	issueCount?: number;
}

const STATUS_ICON: Record<
	ClusterStatus,
	{ icon: typeof Check; className: string }
> = {
	ok: {
		icon: Check,
		className: "text-emerald-600 dark:text-emerald-400",
	},
	error: {
		icon: AlertCircle,
		className: "text-rose-600 dark:text-rose-400",
	},
	empty: {
		icon: Circle,
		className: "text-muted-foreground/50",
	},
};

export function SectionNav({ items }: { items: NavItem[] }) {
	return (
		<nav aria-label="Section navigation" className="space-y-1">
			<p className="eyebrow mb-2">Progress</p>
			<ul className="flex flex-col gap-0.5">
				{items.map((item) => {
					const StatusIcon = STATUS_ICON[item.status].icon;
					return (
						<li key={item.id}>
							<a
								href={`#${item.id}`}
								className={cn(
									"group/nav flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium leading-none transition-colors",
									item.status === "error"
										? "text-rose-700 hover:bg-rose-500/10 dark:text-rose-400"
										: item.status === "ok"
											? "text-foreground/90 hover:bg-secondary"
											: "text-muted-foreground hover:bg-secondary hover:text-foreground",
								)}
							>
								<StatusIcon
									className={cn(
										"size-3.5 shrink-0",
										STATUS_ICON[item.status].className,
									)}
									aria-hidden
									strokeWidth={2.5}
								/>
								<span className="flex-1 truncate">{item.label}</span>
								{item.issueCount && item.issueCount > 0 ? (
									<span className="tabular text-[10px] font-medium text-rose-600 dark:text-rose-400">
										{item.issueCount}
									</span>
								) : null}
							</a>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
