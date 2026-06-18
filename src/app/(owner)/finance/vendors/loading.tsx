import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function VendorsLoading() {
	return (
		<Container size="xl" className="space-y-3">
			<div className="space-y-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-7 w-64" />
				<Skeleton className="h-4 w-80" />
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`stat-${i}`} className="h-[88px] rounded-xl" />
				))}
			</div>

			<div className="space-y-2">
				{Array.from({ length: 5 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-14 rounded-md" />
				))}
			</div>
		</Container>
	);
}
