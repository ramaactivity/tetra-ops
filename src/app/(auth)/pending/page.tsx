import {
	CheckCircle2,
	Clock,
	Hourglass,
	LogOut,
	MessageCircle,
	RefreshCw,
} from "lucide-react";
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

	const firstName = profile.full_name.split(" ")[0];

	return (
		<div className="bg-card border-border w-full max-w-md overflow-hidden rounded-2xl border shadow-xl">
			{/* Hero strip */}
			<div className="bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent dark:from-amber-500/20 dark:via-amber-500/5 border-amber-200/40 dark:border-amber-900/40 relative border-b px-7 pb-6 pt-7">
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
					<div className="bg-amber-500/15 text-amber-700 dark:text-amber-300 inline-flex h-12 w-12 items-center justify-center rounded-2xl">
						<Hourglass className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<p className="text-amber-700 dark:text-amber-400 text-[11px] font-semibold uppercase tracking-widest">
							Menunggu verifikasi
						</p>
						<h1 className="text-foreground text-2xl font-semibold leading-tight tracking-tight">
							Halo, {firstName}.
						</h1>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Akun{" "}
							<span className="text-foreground tabular font-medium">
								{email}
							</span>{" "}
							sudah berhasil daftar. Owner perlu approve dulu sebelum lo bisa
							akses jadwal.
						</p>
					</div>
				</div>
			</div>

			{/* Steps */}
			<div className="space-y-4 px-7 py-6">
				<p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest">
					Yang perlu lo lakuin
				</p>
				<ol className="space-y-3">
					<TimelineStep
						n={1}
						state="done"
						title="Akun terdaftar"
						body="Email lo udah masuk ke sistem."
					/>
					<TimelineStep
						n={2}
						state="active"
						title="Owner verifikasi (≤ 24 jam jam kerja)"
						body="Owner approve role lo & set tier (Senior / Junior). Kalau urgent, WA owner di bawah."
					/>
					<TimelineStep
						n={3}
						state="pending"
						title="Akses jadwal di HP"
						body="Begitu approved, refresh halaman ini — otomatis masuk ke jadwal, alat, fee."
					/>
				</ol>
			</div>

			{/* Actions */}
			<div className="space-y-2 px-7 pb-6">
				{ownerContact?.phone_wa && (
					<a
						href={`https://wa.me/${ownerContact.phone_wa.replace(/^\+|^0/, "62")}?text=${encodeURIComponent(
							`Halo, saya ${profile.full_name} (${email}) — minta verifikasi akun crew di Tetra Ops dong.`,
						)}`}
						target="_blank"
						rel="noopener noreferrer"
						className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-sm transition-colors"
					>
						<MessageCircle className="h-4 w-4" />
						Chat owner via WhatsApp
					</a>
				)}
				<a
					href="/pending"
					className="border-border bg-card hover:bg-muted text-foreground flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors"
				>
					<RefreshCw className="h-3.5 w-3.5" />
					Refresh status
				</a>
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

function TimelineStep({
	n,
	state,
	title,
	body,
}: {
	n: number;
	state: "done" | "active" | "pending";
	title: string;
	body: string;
}) {
	const dotCls =
		state === "done"
			? "bg-emerald-500 text-white"
			: state === "active"
				? "bg-amber-500 text-white ring-amber-500/20 ring-4"
				: "bg-muted text-muted-foreground border-border border";

	return (
		<li className="flex items-start gap-3">
			<div
				className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular ${dotCls}`}
			>
				{state === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
			</div>
			<div className="flex-1 space-y-0.5">
				<p
					className={`text-sm font-medium leading-tight ${
						state === "pending" ? "text-muted-foreground" : "text-foreground"
					}`}
				>
					{title}
				</p>
				<p className="text-muted-foreground text-xs leading-snug">{body}</p>
				{state === "active" && (
					<p className="text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 text-[10px] font-medium">
						<Clock className="h-2.5 w-2.5" />
						In progress
					</p>
				)}
			</div>
		</li>
	);
}
