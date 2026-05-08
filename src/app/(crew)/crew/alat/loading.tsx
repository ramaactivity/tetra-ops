import { Skeleton } from "@/components/ui/skeleton";

export default function CrewAlatLoading() {
	return (
		<div className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
			<div className="space-y-2">
				<Skeleton className="h-7 w-24" />
				<Skeleton className="h-4 w-64" />
			</div>

			<div className="space-y-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`alat-${i}`} className="h-16 rounded-xl" />
				))}
			</div>
		</div>
	);
}
