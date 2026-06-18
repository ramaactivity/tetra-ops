import { Calendar, KanbanSquare, List, UsersRound } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * <OperationsViewSwitcher /> — Vercel segmented-tab pattern.
 *
 * 32px tall, 6px radius outer shell on canvas-soft fill. Active tab fills
 * with white card (level-1 elevation) — the "selected" surface lifts out
 * of the inset region. Inactive tabs sit as ghost text.
 */

export type OperationsView = "list" | "calendar" | "board" | "team";

const VIEWS: Array<{
	value: OperationsView;
	label: string;
	href: string;
	icon: typeof List;
}> = [
	{ value: "list", label: "List", href: "/operations", icon: List },
	{
		value: "calendar",
		label: "Calendar",
		href: "/operations/calendar",
		icon: Calendar,
	},
	{
		value: "board",
		label: "Board",
		href: "/operations/board",
		icon: KanbanSquare,
	},
	{
		value: "team",
		label: "Team",
		href: "/operations/team",
		icon: UsersRound,
	},
];

export function OperationsViewSwitcher({
	current,
}: {
	current: OperationsView;
}) {
	return (
		<div
			className="inline-flex h-9 items-center rounded-full border border-border-subtle bg-card p-1 shadow-[var(--shadow-level-1)]"
			role="tablist"
			aria-label="View"
		>
			{VIEWS.map((v) => {
				const Icon = v.icon;
				const active = v.value === current;
				return (
					<Link
						key={v.value}
						href={v.href}
						role="tab"
						aria-selected={active}
						aria-current={active ? "page" : undefined}
						className={cn(
							"inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium leading-none transition-colors",
							active
								? "bg-[#059669] text-white"
								: "text-muted-foreground hover:bg-secondary hover:text-foreground",
						)}
					>
						<Icon className="size-3.5" aria-hidden strokeWidth={2} />
						<span className="hidden sm:inline">{v.label}</span>
					</Link>
				);
			})}
		</div>
	);
}
