import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

const CLUSTERS = [
	{ rows: 2 },
	{ rows: 4 },
	{ rows: 3 },
	{ rows: 4 },
] as const;

export default function Loading() {
	return (
		<Container size="xl" className="space-y-3">
			{/* PageHeader skeleton */}
			<div className="space-y-3">
				<Skeleton className="h-3.5 w-28" />
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-2">
						<Skeleton className="h-8 w-56" />
						<Skeleton className="h-4 w-80" />
					</div>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
				<div className="space-y-4">
					{CLUSTERS.map((c, i) => (
						<div
							key={`cluster-${i}`}
							className="overflow-hidden rounded-lg border border-border-default bg-card"
						>
							{/* SectionCard header */}
							<div className="flex items-center gap-3 px-5 py-3.5">
								<Skeleton className="size-4 rounded" />
								<div className="flex-1 space-y-1.5">
									<Skeleton className="h-3 w-40" />
									<Skeleton className="h-3 w-72" />
								</div>
								<Skeleton className="size-4 rounded" />
							</div>
							{/* SectionCard body — FieldGrid label-LEFT rows */}
							<div className="space-y-4 border-t border-border-subtle px-5 py-4">
								{Array.from({ length: c.rows }).map((_, r) => (
									<div
										key={`cluster-${i}-row-${r}`}
										className="grid gap-2 md:grid-cols-12 md:gap-4"
									>
										<Skeleton className="h-4 w-24 md:col-span-4 md:mt-2" />
										<Skeleton className="h-10 md:col-span-8" />
									</div>
								))}
							</div>
						</div>
					))}
				</div>
				<aside className="sticky top-4 hidden h-fit w-[280px] flex-col gap-5 rounded-lg border border-border-default bg-card p-5 lg:flex">
					<div className="space-y-2">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3.5 w-32" />
					</div>
					<div className="space-y-2">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-4 w-36" />
					</div>
					<div className="space-y-2">
						<Skeleton className="h-3 w-16" />
						{Array.from({ length: 4 }).map((_, r) => (
							<div
								key={`price-${r}`}
								className="flex items-center justify-between gap-2"
							>
								<Skeleton className="h-3.5 w-20" />
								<Skeleton className="h-3.5 w-16" />
							</div>
						))}
						<div className="flex items-center justify-between gap-2 border-t border-border-default pt-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-24" />
						</div>
					</div>
					<div className="flex flex-col gap-2 border-t border-border-default pt-4">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				</aside>
			</div>
		</Container>
	);
}
