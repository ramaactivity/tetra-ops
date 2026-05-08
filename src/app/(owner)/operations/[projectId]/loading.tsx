import { Skeleton } from "@/components/ui/skeleton";

/**
 * Event detail page loading skeleton — header + readiness + DetailCard
 * grid + action bar.
 */
export default function EventDetailLoading() {
	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
			{/* Back link + title row */}
			<div className="space-y-3">
				<Skeleton className="h-4 w-32" />
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-2">
						<Skeleton className="h-8 w-64" />
						<Skeleton className="h-3 w-44" />
					</div>
					<div className="flex flex-wrap gap-2">
						<Skeleton className="h-6 w-24 rounded-full" />
						<Skeleton className="h-6 w-20 rounded-full" />
					</div>
				</div>
			</div>

			{/* Action toolbar */}
			<div className="flex flex-wrap gap-2">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`btn-${i}`} className="h-8 w-24 rounded-md" />
				))}
			</div>

			{/* Readiness + DetailCard grid */}
			<div className="grid gap-4 md:grid-cols-2">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`card-${i}`} className="h-48 rounded-xl" />
				))}
			</div>
		</div>
	);
}
