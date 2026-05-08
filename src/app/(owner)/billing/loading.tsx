import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function BillingLoading() {
	return (
		<Container size="xl" className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-7 w-24" />
				<Skeleton className="h-4 w-72" />
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`kpi-${i}`} className="h-[88px] rounded-xl" />
				))}
			</div>

			<Skeleton className="h-9 w-full max-w-md rounded-md" />
			<Skeleton className="h-9 w-72 rounded-md" />

			<div className="space-y-2">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-14 rounded-md" />
				))}
			</div>
		</Container>
	);
}
