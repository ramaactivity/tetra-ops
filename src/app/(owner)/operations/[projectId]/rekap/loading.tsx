import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<Container size="xl" className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-7 w-72" />
				<Skeleton className="h-4 w-80" />
			</div>
			{/* Profit preview card */}
			<div className="rounded-lg border border-border-default bg-surface-2 p-5 space-y-3">
				<Skeleton className="h-5 w-40" />
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton key={`kpi-${i}`} className="h-16 rounded-lg" />
					))}
				</div>
			</div>
			{/* Recap tabs / sections */}
			<div className="rounded-lg border border-border-default bg-surface-2 p-5 space-y-3">
				<div className="flex gap-2">
					<Skeleton className="h-9 w-24" />
					<Skeleton className="h-9 w-24" />
					<Skeleton className="h-9 w-24" />
				</div>
				<Skeleton className="h-64 w-full" />
			</div>
			<div className="rounded-lg border border-border-default bg-surface-2 p-5 space-y-3">
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-32 w-full" />
			</div>
		</Container>
	);
}
