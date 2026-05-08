import { Skeleton } from "@/components/ui/skeleton";

/**
 * Crew home loading skeleton — mobile-first narrow layout.
 */
export default function CrewLoading() {
	return (
		<div className="mx-auto w-full max-w-md space-y-6 px-4 py-6">
			<div className="space-y-2">
				<Skeleton className="h-7 w-40" />
				<Skeleton className="h-4 w-56" />
			</div>

			<div className="grid grid-cols-2 gap-3">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`stat-${i}`} className="h-[100px] rounded-xl" />
				))}
			</div>

			<div className="space-y-3">
				<Skeleton className="h-5 w-32" />
				<Skeleton className="h-20 rounded-xl" />
				<Skeleton className="h-20 rounded-xl" />
			</div>
		</div>
	);
}
