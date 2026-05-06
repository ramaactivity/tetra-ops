import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function DashboardPage() {
	const result = await getCurrentUser();
	if (!result) return null;

	const { profile } = result;

	return (
		<main className="mx-auto w-full max-w-4xl flex-1 p-8">
			<div className="space-y-6">
				<header className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
						<p className="text-sm text-zinc-600 dark:text-zinc-400">
							{profile.full_name} · {profile.role}
						</p>
					</div>
					<form action={signOut}>
						<button
							type="submit"
							className="h-9 rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
						>
							Sign out
						</button>
					</form>
				</header>
				<div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						Owner dashboard placeholder. Real KPIs, anomaly radar, and ops
						snapshot land in Phase 1 Week 4.
					</p>
				</div>
			</div>
		</main>
	);
}
