import { LogOut, UserCog } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Crew onboarding — Step 1 of 2 in the verification flow.
 *
 * A2 refactor (sesi 5): same surface + token treatment as login/pending.
 */
export default async function OnboardingPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");

	if (me.profile.role === "super_admin" || me.profile.role === "owner") {
		redirect("/dashboard");
	}

	const supabase = await createClient();
	const { data: profile } = await supabase
		.from("users")
		.select("full_name, nickname, phone_wa")
		.eq("id", me.profile.id)
		.single();

	const fullName = profile?.full_name ?? me.profile.full_name;
	const nickname = profile?.nickname ?? null;
	const phoneWa = profile?.phone_wa ?? null;

	if (phoneWa && me.profile.role === "pending_approval") {
		redirect("/pending");
	}
	if (phoneWa && me.profile.role === "crew") {
		redirect("/crew");
	}

	const firstName = fullName.split(/\s+/)[0] ?? "";

	return (
		<div className="w-full max-w-md overflow-hidden rounded-2xl border border-border-default bg-surface-2 shadow-xl">
			<div className="relative border-b border-border-subtle px-6 pb-5 pt-6 sm:px-7">
				<div
					aria-hidden
					className="absolute inset-0 -z-10 bg-gradient-sunrise-radial opacity-[0.06] dark:opacity-[0.10]"
				/>
				<form action={signOut} className="absolute right-6 top-6 sm:right-7">
					<button
						type="submit"
						className="inline-flex items-center gap-1 text-fluid-caption font-medium text-muted-foreground hover:text-foreground"
					>
						<LogOut className="size-3.5" />
						Sign out
					</button>
				</form>
				<div className="space-y-3 pt-1">
					<div className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
						<UserCog className="size-5" />
					</div>
					<div className="space-y-1">
						<p className="text-fluid-caption font-semibold uppercase tracking-widest text-primary">
							Step 1 dari 2 · Lengkapi profil
						</p>
						<h1 className="font-display text-fluid-h1 font-semibold leading-tight tracking-tight text-foreground">
							Halo, {firstName}.
						</h1>
						<p className="text-fluid-body leading-relaxed text-muted-foreground">
							Owner butuh info berikut buat verify akun lo. Tier &amp; fee
							di-set owner setelah ini.
						</p>
					</div>
				</div>
			</div>

			<div className="space-y-5 px-6 py-6 sm:px-7">
				<OnboardingForm
					defaultFullName={fullName}
					defaultNickname={nickname}
					defaultPhoneWa={phoneWa}
					submitLabel="Submit & tunggu verifikasi"
				/>
			</div>

			<div className="flex items-center justify-center border-t border-border-subtle bg-surface-3/50 py-3">
				<Image
					src="/brand/logomark-only.png"
					alt="Tetra"
					width={32}
					height={32}
					className="h-5 w-auto opacity-50"
				/>
			</div>
		</div>
	);
}
