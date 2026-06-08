"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MonthPicker } from "@/components/ui/month-picker";
import { cn } from "@/lib/utils";

/**
 * Month filter for the Asset & Design list — mirrors the Operations (Event)
 * page: a MonthPicker defaulting to the current month + a "Semua / Bulan ini"
 * toggle. Preserves the active design-status chip (`ds`).
 */
export function DesignMonthFilter({
	month,
	showsAll,
	ds,
}: {
	month: string;
	showsAll: boolean;
	ds: string | null;
}) {
	const router = useRouter();

	function href(monthValue: string): string {
		const p = new URLSearchParams();
		if (monthValue) p.set("month", monthValue);
		if (ds) p.set("ds", ds);
		const qs = p.toString();
		return qs ? `/design?${qs}` : "/design";
	}

	return (
		<div className="flex items-center gap-1">
			<div className="w-[160px]">
				<MonthPicker
					value={showsAll ? "" : month}
					onValueChange={(v) => router.push(href(v))}
					placeholder="Semua bulan"
					aria-label="Filter bulan"
				/>
			</div>
			<Link
				href={href(showsAll ? "" : "all")}
				className={cn(
					"inline-flex h-8 items-center rounded-md px-2 text-[12px] font-medium transition-colors",
					showsAll
						? "bg-secondary text-foreground"
						: "text-muted-foreground hover:bg-secondary hover:text-foreground",
				)}
			>
				{showsAll ? "Bulan ini" : "Semua"}
			</Link>
		</div>
	);
}
