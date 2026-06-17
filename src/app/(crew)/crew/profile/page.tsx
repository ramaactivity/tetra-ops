import { LogOut, Mail, Shield } from "lucide-react";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { AppHeader, AppScreen, Section, Surface } from "@/components/ui/mobile";
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

	const [{ data: profileExtra }, { count: lifetimeEventsCount }] =
		await Promise.all([
			supabase
				.from("users")
				.select("tier, created_at, nickname, phone_wa")
				.eq("id", me.profile.id)
				.maybeSingle(),
			supabase
				.from("crew_assignments")
				.select("event:events!inner(id)", { count: "exact", head: true })
				.eq("user_id", me.profile.id),
		]);

	const tier = profileExtra?.tier ?? null;
	const nickname = profileExtra?.nickname ?? null;
	const phoneWa = profileExtra?.phone_wa ?? null;
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
		<AppScreen>
			<AppHeader title="Profile" />

			<div className="mt-3 space-y-4">
				<Surface className="flex items-center gap-4" pad>
					<div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary type-num-lg">
						{initials || "?"}
					</div>
					<div className="min-w-0 flex-1">
						<p className="type-heading truncate">{me.profile.full_name}</p>
						<p className="type-secondary mt-0.5 inline-flex items-center gap-1">
							<Mail className="size-3.5" />
							<span className="truncate">{me.email}</span>
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-1.5">
							<span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
								<Shield className="size-3" />
								{ROLE_LABELS[me.profile.role] ?? me.profile.role}
							</span>
							{tier ? (
								<span className="inline-flex items-center rounded-full bg-surface-3 px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
									{TIER_LABELS[tier] ?? tier}
								</span>
							) : null}
						</div>
					</div>
				</Surface>

				<div className="grid grid-cols-2 gap-3">
					<Surface className="text-center" pad>
						<span className="eyebrow">Lifetime events</span>
						<p className="type-num-lg mt-1.5">
							{(lifetimeEventsCount ?? 0).toLocaleString("id-ID")}
						</p>
					</Surface>
					<Surface className="text-center" pad>
						<span className="eyebrow">Member sejak</span>
						<p className="type-heading mt-1.5">{memberSince ?? "—"}</p>
					</Surface>
				</div>
			</div>

			<Section title="Edit profil">
				<Surface pad>
					<OnboardingForm
						defaultFullName={me.profile.full_name}
						defaultNickname={nickname}
						defaultPhoneWa={phoneWa}
						submitLabel="Simpan perubahan"
					/>
				</Surface>
				<p className="type-caption mt-2 px-1">
					Tier &amp; fee di-set owner. Hubungi owner kalau perlu update.
				</p>
			</Section>

			<Section title="Akun">
				<form action={signOut}>
					<button
						type="submit"
						className="press tap flex w-full items-center justify-center gap-2 rounded-[16px] border border-border-default bg-card px-4 py-3.5 text-rose-600 shadow-[var(--shadow-level-2)] transition-colors active:bg-rose-50 dark:text-rose-400 dark:active:bg-rose-950/30"
					>
						<LogOut className="size-4" />
						<span className="type-body-strong">Sign out</span>
					</button>
				</form>
			</Section>

			<p className="mt-8 text-center text-[0.6875rem] text-muted-foreground/60">
				Tetra Ops · Crew app
			</p>
		</AppScreen>
	);
}
