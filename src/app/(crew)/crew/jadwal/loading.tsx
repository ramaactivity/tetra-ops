import { Skeleton } from "@/components/ui/skeleton";

export default function CrewJadwalLoading() {
	return (
		<div className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
			<div className="space-y-2">
				<Skeleton className="h-7 w-32" />
				<Skeleton className="h-4 w-56" />
			</div>

			{/* Tab switcher */}
			<div className="flex gap-2">
				<Skeleton className="h-9 w-28 rounded-md" />
				<Skeleton className="h-9 w-24 rounded-md" />
			</div>

			{/* Event cards */}
			<div className="space-y-3">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`ev-${i}`} className="h-28 rounded-xl" />
				))}
			</div>
		</div>
	);
}
