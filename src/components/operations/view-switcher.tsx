import {
	Calendar,
	KanbanSquare,
	List,
	Palette,
	UsersRound,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * <OperationsViewSwitcher /> — segmented control for Ops view modes.
 *
 * A4 refactor (sesi 5): surface-2 base, primary fill on active, fluid
 * type for labels, transitions tokenized.
 */

export type OperationsView =
	| "list"
	| "calendar"
	| "board"
	| "design"
	| "team";

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
		value: "design",
		label: "Design",
		href: "/operations/design",
		icon: Palette,
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
			className="inline-flex items-center rounded-md border border-border-default bg-surface-2 p-0.5"
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
						className={cn(
							"inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-fluid-caption font-medium transition-colors duration-fast ease-out-expo",
							active
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
						)}
					>
						<Icon className="size-3.5" aria-hidden />
						<span className="hidden sm:inline">{v.label}</span>
					</Link>
				);
			})}
		</div>
	);
}
