import { Skeleton } from "@/components/ui/skeleton";

export default function CrewFeeLoading() {
	return (
		<div className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
			<div className="space-y-2">
				<Skeleton className="h-7 w-20" />
				<Skeleton className="h-4 w-56" />
			</div>

			{/* Summary cards */}
			<div className="grid grid-cols-2 gap-3">
				{Array.from({ length: 2 }).map((_, i) => (
					<Skeleton key={`sum-${i}`} className="h-24 rounded-lg" />
				))}
			</div>

			{/* Fee rows */}
			<div className="space-y-3">
				{Array.from({ length: 5 }).map((_, i) => (
					<Skeleton key={`fee-${i}`} className="h-20 rounded-lg" />
				))}
			</div>
		</div>
	);
}
