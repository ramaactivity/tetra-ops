import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<div className="space-y-2">
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-4 w-64" />
				</div>
				<Skeleton className="h-9 w-32" />
			</div>
			<div className="space-y-2">
				<Skeleton className="h-10 w-full" />
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-12 w-full" />
				))}
			</div>
		</div>
	);
}
