import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsLoading() {
	return (
		<Container size="xl" className="space-y-3">
			<div className="space-y-2 px-5">
				<Skeleton className="h-7 w-24" />
				<Skeleton className="h-4 w-80" />
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{["a", "b", "c", "d"].map((k) => (
					<Skeleton key={`kpi-${k}`} className="h-[112px] rounded-2xl" />
				))}
			</div>

			<Skeleton className="h-9 w-full max-w-md rounded-md" />

			<div className="space-y-2">
				{["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"].map((k) => (
					<Skeleton key={k} className="h-14 rounded-md" />
				))}
			</div>
		</Container>
	);
}
