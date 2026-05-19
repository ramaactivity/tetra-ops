import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
	return (
		<Container size="xl" className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-28" />
					<Skeleton className="h-4 w-72" />
				</div>
				<Skeleton className="h-9 w-44 rounded-md" />
			</div>

			{/* Tabs */}
			<div className="flex gap-3 border-b border-border-default pb-1">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-8 w-36" />
				<Skeleton className="h-8 w-32" />
			</div>

			{/* Report content area */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`stat-${i}`} className="h-[88px] rounded-lg" />
				))}
			</div>
			<Skeleton className="h-96 rounded-lg" />
		</Container>
	);
}
