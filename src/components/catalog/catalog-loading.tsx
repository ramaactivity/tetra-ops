import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

const STAT_KEYS = ["s1", "s2", "s3", "s4"];
const CHIP_KEYS = ["c1", "c2", "c3", "c4"];
const ROW_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];

/** Shared loading skeleton for the operations catalog list pages. */
export function CatalogListSkeleton({
	showChips = true,
}: {
	showChips?: boolean;
}) {
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

			<Skeleton className="h-9 w-full max-w-xs rounded-lg" />

			{showChips && (
				<div className="flex gap-2">
					{CHIP_KEYS.map((k) => (
						<Skeleton key={k} className="h-8 w-24 rounded-full" />
					))}
				</div>
			)}

			<div className="border-border-default bg-card overflow-hidden rounded-2xl border">
				{ROW_KEYS.map((k) => (
					<div
						key={k}
						className="border-border-subtle border-b px-4 py-3 last:border-0"
					>
						<Skeleton className="h-5 w-full" />
					</div>
				))}
			</div>
		</Container>
	);
}
