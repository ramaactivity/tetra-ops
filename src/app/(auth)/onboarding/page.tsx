import { LogOut, UserCog } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");

	// Owners go straight to dashboard
	if (me.profile.role === "super_admin" || me.profile.role === "owner") {
		redirect("/dashboard");
	}

	// Pull current profile fields
	const supabase = await createClient();
	const { data: profile } = await supabase
		.from("users")
		.select("full_name, nickname, phone_wa")
		.eq("id", me.profile.id)
		.single();

	const fullName = profile?.full_name ?? me.profile.full_name;
	const nickname = profile?.nickname ?? null;
	const phoneWa = profile?.phone_wa ?? null;

	// If profile already complete and role is pending, skip onboarding
	if (phoneWa && me.profile.role === "pending_approval") {
		redirect("/pending");
	}
	// Already-approved crew with complete profile → straight to /crew
	if (phoneWa && me.profile.role === "crew") {
		redirect("/crew");
	}

	const firstName = fullName.split(/\s+/)[0] ?? "";

	return (
		<div className="bg-card border-border w-full max-w-md overflow-hidden rounded-2xl border shadow-xl">
			{/* Header strip */}
			<div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 relative border-b px-7 pb-6 pt-7">
				<form action={signOut} className="absolute right-7 top-7">
					<button
						type="submit"
						className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
					>
						<LogOut className="h-3.5 w-3.5" />
						Sign out
					</button>
				</form>
				<div className="space-y-3 pt-1">
					<div className="bg-primary/15 text-primary inline-flex h-12 w-12 items-center justify-center rounded-2xl">
						<UserCog className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<p className="text-primary text-[11px] font-semibold uppercase tracking-widest">
							Step 1 dari 2 · Lengkapi profil
						</p>
						<h1 className="text-foreground text-2xl font-semibold leading-tight tracking-tight">
							Halo, {firstName}.
						</h1>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Owner butuh info berikut buat verify akun lo. Tier &amp; fee
							di-set owner setelah ini.
						</p>
					</div>
				</div>
			</div>

			{/* Form */}
			<div className="space-y-5 px-7 py-6">
				<OnboardingForm
					defaultFullName={fullName}
					defaultNickname={nickname}
					defaultPhoneWa={phoneWa}
					submitLabel="Submit & tunggu verifikasi"
				/>
			</div>

			{/* Brand */}
			<div className="border-border bg-muted/30 flex items-center justify-center border-t py-3">
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
