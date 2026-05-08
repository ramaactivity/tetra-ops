import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard loading skeleton — matches the live page's grid so the
 * layout doesn't shift on swap. Renders during initial SSR streaming
 * + on client navigation while server data fetches.
 */
export default function DashboardLoading() {
	return (
		<Container size="xl" className="space-y-6 md:space-y-8">
			{/* Section header */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-48" />
					<Skeleton className="h-4 w-64" />
				</div>
			</div>

			{/* Hero KPI grid (4 cards) */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton
						key={`kpi-${i}`}
						className="h-[88px] rounded-xl sm:h-24"
					/>
				))}
			</div>

			{/* Anomaly radar */}
			<div className="space-y-3">
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-20 rounded-xl" />
			</div>

			{/* Pipeline */}
			<div className="space-y-3">
				<Skeleton className="h-5 w-32" />
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton
							key={`pipe-${i}`}
							className="h-[100px] rounded-xl"
						/>
					))}
				</div>
			</div>

			{/* Today/Tomorrow + Quick Actions */}
			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-3 lg:col-span-2">
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-20 rounded-xl" />
					<Skeleton className="h-20 rounded-xl" />
				</div>
				<div className="space-y-3">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-[280px] rounded-xl" />
				</div>
			</div>
		</Container>
	);
}
