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
				<Skeleton className="h-9 w-32" />
			</div>
			<div className="rounded-lg border border-border-default bg-surface-2 p-5 space-y-2">
				<Skeleton className="h-9 w-full" />
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-14 w-full" />
				))}
			</div>
		</Container>
	);
}
