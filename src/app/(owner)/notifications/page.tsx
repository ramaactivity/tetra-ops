import { ComingSoonCard } from "@/components/coming-soon-card";

export default function NotificationsPage() {
	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-1">
				<h1 className="text-3xl font-semibold tracking-tight">
					Notifications
				</h1>
				<p className="text-muted-foreground text-sm">
					Anomaly radar, push notifications, in-app alerts.
				</p>
			</div>
			<ComingSoonCard
				title="Notifications & Anomaly Radar"
				when="Phase 3 Week 11"
			/>
		</div>
	);
}
