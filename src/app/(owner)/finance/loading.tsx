import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
	return (
		<Container size="xl" className="space-y-6 md:space-y-8">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-28" />
					<Skeleton className="h-4 w-80" />
				</div>
				<Skeleton className="h-9 w-44 rounded-md" />
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`kpi-${i}`} className="h-[88px] rounded-lg" />
				))}
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-3 lg:col-span-2">
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-72 rounded-lg" />
				</div>
				<div className="space-y-3">
					<Skeleton className="h-5 w-36" />
					<Skeleton className="h-72 rounded-lg" />
				</div>
			</div>
		</Container>
	);
}
