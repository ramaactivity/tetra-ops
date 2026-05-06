import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function CrewHomePage() {
	const result = await getCurrentUser();
	if (!result) return null;

	const { profile } = result;

	return (
		<main className="mx-auto w-full max-w-md flex-1 px-6 py-8">
			<div className="space-y-6">
				<header className="flex items-center justify-between">
					<div className="space-y-1">
						<h1 className="text-xl font-semibold tracking-tight">
							Halo, {profile.full_name.split(" ")[0]}
						</h1>
						<p className="text-muted-foreground text-xs">
							Crew · <span className="text-primary">{profile.role}</span>
						</p>
					</div>
					<form action={signOut}>
						<button
							type="submit"
							className="border-border bg-card hover:bg-muted h-9 rounded-md border px-3 text-xs font-medium"
						>
							Sign out
						</button>
					</form>
				</header>
				<div className="border-border bg-card rounded-xl border border-dashed p-8 text-center">
					<p className="text-muted-foreground text-sm">
						Crew dashboard placeholder. Jadwal, alat, fee balance land in
						Phase 1 Week 6+.
					</p>
				</div>
			</div>
		</main>
	);
}
