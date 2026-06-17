import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

const STAT_KEYS = ["total", "active", "category", "price"];
const CARD_KEYS = ["a", "b", "c", "d", "e", "f"];

export default function Loading() {
	return (
		<Container size="xl" className="space-y-6">
			<div className="flex items-end justify-between gap-3">
				<div className="space-y-2">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-8 w-32" />
					<Skeleton className="h-4 w-56" />
				</div>
				<Skeleton className="h-9 w-32 rounded-lg" />
			</div>

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{STAT_KEYS.map((k) => (
					<Skeleton key={k} className="h-[92px] w-full rounded-2xl" />
				))}
			</div>

			<div className="flex items-center justify-between gap-3">
				<Skeleton className="h-9 w-full max-w-xs rounded-lg" />
				<Skeleton className="h-9 w-28 rounded-lg" />
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{CARD_KEYS.map((k) => (
					<Skeleton key={k} className="h-[132px] w-full rounded-2xl" />
				))}
			</div>
		</Container>
	);
}
