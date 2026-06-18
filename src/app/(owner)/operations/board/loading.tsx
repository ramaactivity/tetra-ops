import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<Container size="xl" className="space-y-3">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-40" />
					<Skeleton className="h-4 w-64" />
				</div>
				<Skeleton className="h-9 w-44" />
			</div>
			<div className="grid gap-4 lg:grid-cols-5">
				{Array.from({ length: 5 }).map((_, col) => (
					<div key={`col-${col}`} className="space-y-2">
						<Skeleton className="h-5 w-24" />
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={`card-${col}-${i}`} className="h-24 w-full" />
						))}
					</div>
				))}
			</div>
		</Container>
	);
}
