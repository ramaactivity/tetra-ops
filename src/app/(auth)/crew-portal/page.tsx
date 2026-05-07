import {
	ArrowLeft,
	CalendarDays,
	CheckCircle2,
	HardHat,
	LogIn,
	UserPlus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LoginButton } from "../login/login-button";

/**
 * Crew portal — combined Login + Register tabbed flow.
 *
 * A2 refactor (sesi 5):
 * - Header band uses subtle Sunrise gradient instead of hand-rolled
 *   amber blend.
 * - Surface tokens, fluid type, glow CTA via shared LoginButton.
 * - Tab indicator uses primary token, transitions tokenized.
 */

const ERROR_MESSAGES: Record<string, string> = {
	auth_failed: "Login gagal. Coba lagi.",
	no_code: "Login gagal — tidak ada authorization code dari Google.",
};

type Mode = "login" | "register";

export default async function CrewPortalPage({
	searchParams,
}: {
	searchParams: Promise<{ mode?: string; error?: string }>;
}) {
	const params = await searchParams;
	const mode: Mode = params.mode === "register" ? "register" : "login";
	const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;

	return (
		<div className="w-full max-w-md overflow-hidden rounded-2xl border border-border-default bg-surface-2 shadow-xl">
			<div className="relative border-b border-border-subtle px-6 pb-5 pt-6 sm:px-7">
				<div
					aria-hidden
					className="absolute inset-0 -z-10 bg-gradient-sunrise-radial opacity-[0.08] dark:opacity-[0.12]"
				/>
				<Link
					href="/"
					className="absolute left-6 top-6 inline-flex items-center gap-1 text-fluid-caption font-medium text-muted-foreground hover:text-foreground sm:left-7"
				>
					<ArrowLeft className="size-3.5" />
					Landing
				</Link>
				<div className="space-y-3 pt-6">
					<div className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
						<HardHat className="size-5" />
					</div>
					<div className="space-y-1">
						<p className="text-fluid-caption font-semibold uppercase tracking-widest text-muted-foreground">
							Crew Portal
						</p>
						<h1 className="font-display text-fluid-h1 font-semibold tracking-tight text-foreground">
							Halo, crew Tetra
						</h1>
						<p className="text-fluid-body leading-relaxed text-muted-foreground">
							Akun lo udah verified? Login. Belum? Daftar dulu, owner verifikasi.
						</p>
					</div>
				</div>
			</div>

			<div className="flex border-b border-border-subtle">
				<TabLink
					href="/crew-portal?mode=login"
					label="Login"
					icon={LogIn}
					active={mode === "login"}
				/>
				<TabLink
					href="/crew-portal?mode=register"
					label="Daftar baru"
					icon={UserPlus}
					active={mode === "register"}
				/>
			</div>

			<div className="space-y-5 px-6 py-6 sm:px-7 sm:py-7">
				{mode === "login" ? <LoginPanel /> : <RegisterPanel />}

				{errorMessage && (
					<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-fluid-caption font-medium text-destructive">
						{errorMessage}
					</p>
				)}
			</div>

			<div className="flex items-center justify-between gap-2 border-t border-border-subtle bg-surface-3/50 px-6 py-3 sm:px-7">
				<Image
					src="/brand/logomark-only.png"
					alt="Tetra"
					width={32}
					height={32}
					className="h-5 w-auto opacity-60"
				/>
				<p className="text-fluid-caption text-muted-foreground/80">
					Tetra Ops · Crew Portal
				</p>
			</div>
		</div>
	);
}

function LoginPanel() {
	return (
		<>
			<div className="space-y-1.5">
				<h2 className="text-fluid-h3 font-semibold text-foreground">
					Login akun crew
				</h2>
				<p className="text-fluid-caption leading-relaxed text-muted-foreground">
					Sudah pernah daftar dan owner sudah approve? Masuk pakai Gmail yang
					lo daftarin.
				</p>
			</div>
			<LoginButton />
			<div className="space-y-1 text-center text-fluid-caption leading-relaxed text-muted-foreground">
				<p>Akun belum diverifikasi → bakal landing di halaman tunggu.</p>
				<p>
					Belum punya akun?{" "}
					<Link
						href="/crew-portal?mode=register"
						className="font-medium text-primary hover:underline"
					>
						Daftar di sini
					</Link>
				</p>
			</div>
		</>
	);
}

function RegisterPanel() {
	return (
		<>
			<div className="space-y-1.5">
				<h2 className="text-fluid-h3 font-semibold text-foreground">
					Buat akun crew Tetra
				</h2>
				<p className="text-fluid-caption leading-relaxed text-muted-foreground">
					Login pakai Gmail lo. Owner verifikasi akun, baru lo bisa akses
					jadwal dari HP.
				</p>
			</div>

			<ol className="space-y-2.5">
				<Step
					n={1}
					icon={LogIn}
					title="Login pakai Gmail"
					body="Pakai Gmail yang lo dipake sehari-hari (sama yang nanti dipake login)."
				/>
				<Step
					n={2}
					icon={CheckCircle2}
					title="Owner verifikasi (≤ 24 jam)"
					body="Owner approve role lo + set tier (Senior / Junior). Lo bakal landing di halaman tunggu sambil nunggu."
				/>
				<Step
					n={3}
					icon={CalendarDays}
					title="Akses jadwal di HP"
					body="Begitu approved, refresh — masuk ke jadwal, alat, fee, dst."
				/>
			</ol>

			<LoginButton label="Daftar dengan Google" />

			<p className="text-center text-fluid-caption text-muted-foreground">
				Sudah pernah daftar?{" "}
				<Link
					href="/crew-portal?mode=login"
					className="font-medium text-primary hover:underline"
				>
					Login di sini
				</Link>
			</p>
		</>
	);
}

function TabLink({
	href,
	label,
	icon: Icon,
	active,
}: {
	href: string;
	label: string;
	icon: typeof LogIn;
	active: boolean;
}) {
	return (
		<Link
			href={href}
			className={`relative inline-flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-fluid-body font-medium transition-colors duration-fast ease-out-expo ${
				active
					? "text-foreground"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			<Icon className="size-4" />
			{label}
			{active && (
				<span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
			)}
		</Link>
	);
}

function Step({
	n,
	icon: Icon,
	title,
	body,
}: {
	n: number;
	icon: typeof LogIn;
	title: string;
	body: string;
}) {
	return (
		<li className="flex items-start gap-3">
			<div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
				<Icon className="size-4" />
			</div>
			<div className="flex-1 space-y-0.5">
				<div className="flex items-baseline gap-2">
					<span className="text-fluid-body font-medium leading-tight text-foreground">
						{title}
					</span>
					<span className="tabular text-fluid-caption text-muted-foreground/60">
						{n}/3
					</span>
				</div>
				<p className="text-fluid-caption leading-snug text-muted-foreground">
					{body}
				</p>
			</div>
		</li>
	);
}
