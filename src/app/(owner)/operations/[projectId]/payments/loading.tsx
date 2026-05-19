import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<Container size="xl" className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-7 w-64" />
				<Skeleton className="h-4 w-80" />
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={`kpi-${i}`} className="h-[88px] rounded-lg" />
				))}
			</div>
			<div className="rounded-lg border border-border-default bg-surface-2 p-5 space-y-4">
				<Skeleton className="h-5 w-40" />
				{Array.from({ length: 4 }).map((_, i) => (
					<div key={`field-${i}`} className="space-y-1.5">
						<Skeleton className="h-3.5 w-24" />
						<Skeleton className="h-10 w-full" />
					</div>
				))}
				<Skeleton className="h-10 w-32" />
			</div>
			<div className="rounded-lg border border-border-default bg-surface-2 p-5 space-y-2">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-12 w-full" />
				))}
			</div>
		</Container>
	);
}
