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

/**
 * Pending verification screen — shown to crew who registered but
 * haven't been approved yet.
 *
 * A2 refactor (sesi 5):
 * - Hero band uses warm amber accent for the "waiting" tone (semantic
 *   color, not the brand gradient — communicates state clearly).
 * - Surface tokens, fluid type, no hard-coded gradient stops.
 */
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
		<div className="w-full max-w-md overflow-hidden rounded-2xl border border-border-default bg-surface-2 shadow-xl">
			<div className="relative border-b border-border-subtle bg-amber-500/[0.06] px-6 pb-5 pt-6 sm:px-7 dark:bg-amber-500/[0.10]">
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
					<div className="grid size-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
						<Hourglass className="size-5" />
					</div>
					<div className="space-y-1">
						<p className="text-fluid-caption font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
							Menunggu verifikasi
						</p>
						<h1 className="text-fluid-h1 font-semibold leading-tight tracking-tight text-foreground">
							Halo, {firstName}.
						</h1>
						<p className="text-fluid-body leading-relaxed text-muted-foreground">
							Akun{" "}
							<span className="tabular font-medium text-foreground">
								{email}
							</span>{" "}
							sudah berhasil daftar. Owner perlu approve dulu sebelum lo bisa
							akses jadwal.
						</p>
					</div>
				</div>
			</div>

			<div className="space-y-4 px-6 py-6 sm:px-7">
				<p className="text-fluid-caption font-semibold uppercase tracking-widest text-muted-foreground">
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

			<div className="space-y-2 px-6 pb-6 sm:px-7">
				{ownerContact?.phone_wa && (
					<a
						href={`https://wa.me/${ownerContact.phone_wa.replace(/^\+|^0/, "62")}?text=${encodeURIComponent(
							`Halo, saya ${profile.full_name} (${email}) — minta verifikasi akun crew di Tetra Ops dong.`,
						)}`}
						target="_blank"
						rel="noopener noreferrer"
						className="press-down flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-fluid-body font-semibold text-white shadow-md transition-colors hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary"
					>
						<MessageCircle className="size-4" />
						Chat owner via WhatsApp
					</a>
				)}
				<a
					href="/pending"
					className="press-down flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-2 text-fluid-body font-medium text-foreground transition-colors hover:bg-surface-3"
				>
					<RefreshCw className="size-3.5" />
					Refresh status
				</a>
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
				? "bg-amber-500 text-white ring-4 ring-amber-500/20"
				: "border border-border-default bg-surface-3 text-muted-foreground";

	return (
		<li className="flex items-start gap-3">
			<div
				className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular ${dotCls}`}
			>
				{state === "done" ? <CheckCircle2 className="size-3.5" /> : n}
			</div>
			<div className="flex-1 space-y-0.5">
				<p
					className={`text-fluid-body font-medium leading-tight ${
						state === "pending" ? "text-muted-foreground" : "text-foreground"
					}`}
				>
					{title}
				</p>
				<p className="text-fluid-caption leading-snug text-muted-foreground">
					{body}
				</p>
				{state === "active" && (
					<p className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
						<Clock className="size-2.5" />
						In progress
					</p>
				)}
			</div>
		</li>
	);
}
