import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function RemindersLoading() {
	return (
		<Container size="xl" className="space-y-3">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-56" />
					<Skeleton className="h-4 w-80" />
				</div>
				<Skeleton className="h-7 w-44 rounded-full" />
			</div>

			{/* Bucket tabs */}
			<div className="flex flex-wrap gap-2">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`bucket-${i}`} className="h-9 w-32 rounded-md" />
				))}
			</div>

			{/* Event list */}
			<div className="space-y-2">
				{Array.from({ length: 5 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-20 rounded-xl" />
				))}
			</div>
		</Container>
	);
}
