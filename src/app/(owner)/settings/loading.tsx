import { Skeleton } from "@/components/ui/skeleton";

/**
 * Settings shell loading skeleton — covers all settings sub-pages
 * since the layout's <SettingsTabs> + content area is shared.
 */
export default function SettingsLoading() {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Skeleton className="h-7 w-32" />
				<Skeleton className="h-4 w-72" />
			</div>

			{/* Tabs */}
			<div className="flex gap-2 overflow-x-auto pb-1">
				{Array.from({ length: 8 }).map((_, i) => (
					<Skeleton
						key={`tab-${i}`}
						className="h-8 w-24 shrink-0 rounded-md"
					/>
				))}
			</div>

			{/* Content area — generic table-ish */}
			<div className="space-y-2">
				{Array.from({ length: 8 }).map((_, i) => (
					<Skeleton key={`row-${i}`} className="h-12 rounded-md" />
				))}
			</div>
		</div>
	);
}
