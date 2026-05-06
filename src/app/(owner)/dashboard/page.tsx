import { getCurrentUser } from "@/lib/auth/get-user";

export default async function DashboardPage() {
	const result = await getCurrentUser();
	if (!result) return null;

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-1">
				<h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground text-sm">
					Selamat datang kembali, {result.profile.full_name.split(" ")[0]}.
				</p>
			</div>
			<div className="border-border bg-card rounded-xl border border-dashed p-12 text-center">
				<p className="text-muted-foreground text-sm">
					Owner dashboard placeholder. Real KPIs, anomaly radar, and ops
					snapshot land in Phase 1 Week 4.
				</p>
			</div>
		</div>
	);
}
