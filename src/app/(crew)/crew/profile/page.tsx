import { LogOut, Mail, Shield, User as UserIcon } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABELS: Record<string, string> = {
	super_admin: "Super Admin",
	owner: "Owner",
	crew: "Crew",
	pending_approval: "Pending",
};

const TIER_LABELS: Record<string, string> = {
	senior: "Senior",
	junior: "Junior",
};

export default async function CrewProfilePage() {
	const me = await getCurrentUser();
	if (!me) return null;

	const supabase = await createClient();

	// Fetch tier + lifetime stats
	const [{ data: profileExtra }, { count: lifetimeEventsCount }] =
		await Promise.all([
			supabase
				.from("users")
				.select("tier, created_at")
				.eq("id", me.profile.id)
				.maybeSingle(),
			supabase
				.from("crew_assignments")
				.select("event:events!inner(id)", { count: "exact", head: true })
				.eq("user_id", me.profile.id),
		]);

	const tier = profileExtra?.tier ?? null;
	const memberSince = profileExtra?.created_at
		? new Date(profileExtra.created_at).toLocaleDateString("id-ID", {
				month: "long",
				year: "numeric",
			})
		: null;

	const initials = me.profile.full_name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((n: string) => n[0]?.toUpperCase())
		.join("");

	return (
		<div className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
			</header>

			<section className="border-border bg-card flex items-center gap-4 rounded-xl border p-5">
				<div className="bg-primary/15 text-primary flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold">
					{initials || "?"}
				</div>
				<div className="min-w-0 flex-1 space-y-1">
					<p className="text-foreground truncate text-base font-semibold">
						{me.profile.full_name}
					</p>
					<p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
						<Mail className="h-3 w-3" />
						{me.email}
					</p>
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="border-border bg-background text-muted-foreground inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
							<Shield className="h-2.5 w-2.5" />
							{ROLE_LABELS[me.profile.role] ?? me.profile.role}
						</span>
						{tier && (
							<span className="border-border bg-background text-muted-foreground inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
								{TIER_LABELS[tier] ?? tier}
							</span>
						)}
					</div>
				</div>
			</section>

			<section className="border-border bg-card grid grid-cols-2 divide-x rounded-xl border">
				<div className="space-y-0.5 p-4 text-center">
					<dt className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
						Lifetime events
					</dt>
					<dd className="text-foreground tabular text-xl font-semibold">
						{(lifetimeEventsCount ?? 0).toLocaleString("id-ID")}
					</dd>
				</div>
				<div className="space-y-0.5 p-4 text-center">
					<dt className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
						Member sejak
					</dt>
					<dd className="text-foreground text-sm font-semibold">
						{memberSince ?? "—"}
					</dd>
				</div>
			</section>

			<section className="space-y-2">
				<h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
					Akun
				</h2>
				<form action={signOut}>
					<button
						type="submit"
						className="border-border bg-card text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
					>
						<LogOut className="h-4 w-4" />
						Sign out
					</button>
				</form>
			</section>

			<p className="text-muted-foreground/60 text-center text-[10px]">
				Tetra Ops · Crew app
			</p>
		</div>
	);
}
