import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function DashboardPage() {
	const result = await getCurrentUser();
	if (!result) return null;

	const { profile } = result;

	return (
		<main className="mx-auto w-full max-w-5xl flex-1 px-8 py-10">
			<div className="space-y-8">
				<header className="flex items-center justify-between">
					<div className="space-y-1">
						<h1 className="text-3xl font-semibold tracking-tight">
							Dashboard
						</h1>
						<p className="text-muted-foreground text-sm">
							{profile.full_name} ·{" "}
							<span className="text-primary font-medium">{profile.role}</span>
						</p>
					</div>
					<form action={signOut}>
						<button
							type="submit"
							className="border-border bg-card hover:bg-muted h-9 rounded-md border px-4 text-sm font-medium"
						>
							Sign out
						</button>
					</form>
				</header>
				<div className="border-border bg-card rounded-xl border border-dashed p-12 text-center">
					<p className="text-muted-foreground text-sm">
						Owner dashboard placeholder. Real KPIs, anomaly radar, and ops
						snapshot land in Phase 1 Week 4.
					</p>
				</div>
			</div>
		</main>
	);
}
