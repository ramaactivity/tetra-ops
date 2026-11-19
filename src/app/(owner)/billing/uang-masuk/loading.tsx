import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function UangMasukLoading() {
	return (
		<Container size="lg" className="space-y-3">
			<div className="space-y-2">
				<Skeleton className="h-7 w-32" />
				<Skeleton className="h-4 w-80" />
			</div>
			<Skeleton className="h-48 w-full rounded-[16px]" />
		</Container>
	);
}
