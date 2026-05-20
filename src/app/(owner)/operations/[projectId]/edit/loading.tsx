import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

const CLUSTERS = [
	{ rows: 3 },
	{ rows: 4 },
	{ rows: 3 },
	{ rows: 5 },
] as const;

export default function Loading() {
	return (
		<Container size="wide" className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-7 w-64" />
			</div>
			<div className="grid gap-6 lg:grid-cols-[minmax(640px,1fr)_320px] xl:grid-cols-[minmax(640px,1fr)_360px]">
				<div className="space-y-8">
					{CLUSTERS.map((c, i) => (
						<div key={`cluster-${i}`} className="space-y-3">
							<div className="space-y-1">
								<Skeleton className="h-3 w-44" />
								<Skeleton className="h-3.5 w-72" />
							</div>
							<div className="space-y-4">
								{Array.from({ length: c.rows }).map((_, r) => (
									<div
										key={`cluster-${i}-row-${r}`}
										className="grid gap-3 md:grid-cols-2"
									>
										<div className="space-y-1.5">
											<Skeleton className="h-3.5 w-24" />
											<Skeleton className="h-10 w-full" />
										</div>
										<div className="space-y-1.5">
											<Skeleton className="h-3.5 w-28" />
											<Skeleton className="h-10 w-full" />
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
				<aside className="hidden lg:flex sticky top-4 h-fit flex-col gap-5 rounded-lg border border-border-default bg-card p-5">
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
