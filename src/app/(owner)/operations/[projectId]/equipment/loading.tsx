import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<Container size="xl" className="space-y-3">
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-7 w-64" />
				<Skeleton className="h-4 w-80" />
			</div>
			<div className="rounded-lg border border-border-default bg-surface-2 p-5 space-y-3">
				<Skeleton className="h-5 w-48" />
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-12 w-full" />
				))}
			</div>
		</Container>
	);
}
