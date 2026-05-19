import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<Container size="md" className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-7 w-64" />
			</div>
			<div className="rounded-lg border border-border-default bg-surface-2 p-5 space-y-4">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={`field-${i}`} className="space-y-1.5">
						<Skeleton className="h-3.5 w-24" />
						<Skeleton className="h-10 w-full" />
					</div>
				))}
				<div className="flex gap-2 pt-2">
					<Skeleton className="h-10 w-32" />
					<Skeleton className="h-10 w-24" />
				</div>
			</div>
		</Container>
	);
}
