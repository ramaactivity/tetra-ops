import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
	return (
		<Container size="md" className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-40" />
					<Skeleton className="h-4 w-72" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-9 w-28 rounded-md" />
					<Skeleton className="h-9 w-32 rounded-md" />
				</div>
			</div>

			{/* Push subscribe banner */}
			<Skeleton className="h-16 rounded-lg" />

			{/* Notification list */}
			<div className="space-y-2">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={`notif-${i}`} className="h-20 rounded-xl" />
				))}
			</div>
		</Container>
	);
}
