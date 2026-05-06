import { getCurrentUser } from "@/lib/auth/get-user";

export default async function CrewHomePage() {
	const result = await getCurrentUser();
	if (!result) return null;

	const firstName = result.profile.full_name.split(" ")[0];

	return (
		<div className="mx-auto w-full max-w-md space-y-6 px-4 py-6">
			<div className="space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">
					Halo, {firstName}
				</h1>
				<p className="text-muted-foreground text-sm">
					Crew dashboard. Lu udah sign-in.
				</p>
			</div>
			<div className="border-border bg-card rounded-xl border border-dashed p-8 text-center">
				<p className="text-muted-foreground text-sm">
					Jadwal, alat, fee balance land in Phase 1 Week 6+.
				</p>
			</div>
		</div>
	);
}
