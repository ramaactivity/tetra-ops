import { Skeleton } from "@/components/ui/skeleton";

export default function CrewProfileLoading() {
	return (
		<div className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
			<div className="space-y-2">
				<Skeleton className="h-7 w-32" />
				<Skeleton className="h-4 w-56" />
			</div>

			{/* Avatar + name */}
			<div className="flex items-center gap-3">
				<Skeleton className="size-16 rounded-full" />
				<div className="space-y-2">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-4 w-24" />
				</div>
			</div>

			{/* Form fields */}
			<div className="space-y-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div key={`f-${i}`} className="space-y-2">
						<Skeleton className="h-4 w-20" />
						<Skeleton className="h-10 rounded-md" />
					</div>
				))}
			</div>
		</div>
	);
}
