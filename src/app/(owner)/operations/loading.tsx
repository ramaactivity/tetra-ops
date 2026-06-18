import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function OperationsLoading() {
	return (
		<Container size="xl" className="space-y-3">
			{/* Section header + view switcher + actions */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-32" />
					<Skeleton className="h-4 w-72" />
				</div>
				<div className="flex shrink-0 gap-2">
					<Skeleton className="h-9 w-32 rounded-md" />
					<Skeleton className="h-9 w-28 rounded-md" />
				</div>
			</div>

			{/* KPIs */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`kpi-${i}`} className="h-[88px] rounded-xl" />
				))}
			</div>

			{/* Filter bar */}
			<Skeleton className="h-9 w-full rounded-md" />

			{/* Table — 6 rows skeleton */}
			<div className="space-y-2">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-12 rounded-md" />
				))}
			</div>
		</Container>
	);
}
