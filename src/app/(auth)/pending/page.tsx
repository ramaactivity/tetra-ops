import { Clock, Hourglass, LogOut, MessageCircle } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PendingPage() {
	const result = await getCurrentUser();
	if (!result) redirect("/login");
	if (result.profile.role !== "pending_approval") redirect("/");

	const { email, profile } = result;

	// Pending users can't read other users via RLS, so use the admin client
	// to fetch a single owner contact for the WA shortcut.
	const admin = createAdminClient();
	const { data: owners } = await admin
		.from("users")
		.select("full_name, phone_wa")
		.in("role", ["super_admin", "owner"])
		.eq("is_active", true)
		.not("phone_wa", "is", null)
		.limit(1);

	const ownerContact = (owners ?? [])[0] as
		| { full_name: string; phone_wa: string | null }
		| undefined;

	return (
		<div className="bg-card border-border w-full max-w-md space-y-6 rounded-xl border p-7 shadow-lg sm:p-8">
			<div className="flex items-center justify-between">
				<Image
					src="/brand/logo-monochrome-light.png"
					alt="Tetra"
					width={120}
					height={36}
					className="h-6 w-auto opacity-60 dark:hidden"
				/>
				<Image
					src="/brand/logo-monochrome-dark.png"
					alt="Tetra"
					width={120}
					height={36}
					className="hidden h-6 w-auto opacity-60 dark:block"
				/>
				<form action={signOut}>
					<button
						type="submit"
						className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
					>
						<LogOut className="h-3.5 w-3.5" />
						Sign out
					</button>
				</form>
			</div>

			<div className="space-y-3">
				<div className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 inline-flex h-12 w-12 items-center justify-center rounded-xl">
					<Hourglass className="h-5 w-5" />
				</div>
				<div className="space-y-1.5">
					<h1 className="text-foreground text-2xl font-semibold tracking-tight">
						Tunggu verifikasi owner
					</h1>
					<p className="text-muted-foreground text-sm leading-relaxed">
						Halo {profile.full_name.split(" ")[0]}, akun lo{" "}
						<span className="text-foreground font-medium tabular">{email}</span>{" "}
						sudah berhasil daftar. Owner perlu approve dulu sebelum lo bisa
						akses jadwal.
					</p>
				</div>
			</div>

			<div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
				<div className="flex items-center gap-2">
					<Clock className="text-muted-foreground h-4 w-4" />
					<p className="text-foreground text-xs font-semibold uppercase tracking-wider">
						Yang perlu lo lakuin
					</p>
				</div>
				<ol className="text-foreground/80 space-y-1.5 text-xs leading-relaxed">
					<Step n={1}>
						Tunggu owner verify akun lo (biasanya &lt; 24 jam jam kerja).
					</Step>
					<Step n={2}>
						Begitu di-approve, refresh halaman ini — otomatis masuk ke
						jadwal.
					</Step>
					<Step n={3}>
						Kalau urgent, hubungi owner via WA di bawah.
					</Step>
				</ol>
			</div>

			{ownerContact?.phone_wa && (
				<a
					href={`https://wa.me/${ownerContact.phone_wa.replace(/^\+|^0/, "62")}?text=${encodeURIComponent(
						`Halo, saya ${profile.full_name} (${email}) — minta verifikasi akun crew di Tetra Ops dong.`,
					)}`}
					target="_blank"
					rel="noopener noreferrer"
					className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors"
				>
					<MessageCircle className="h-4 w-4" />
					Chat owner via WhatsApp
				</a>
			)}

			<p className="text-muted-foreground/70 text-center text-[11px]">
				Tetra Ops · Crew app
			</p>
		</div>
	);
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
	return (
		<li className="flex items-start gap-2">
			<span className="border-border bg-card text-muted-foreground tabular mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold">
				{n}
			</span>
			<span>{children}</span>
		</li>
	);
}
