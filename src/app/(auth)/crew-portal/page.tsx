import {
	ArrowLeft,
	CalendarDays,
	CheckCircle2,
	HardHat,
	LogIn,
	UserPlus,
	Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LoginButton } from "../login/login-button";

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
		<div className="bg-card border-border w-full max-w-md overflow-hidden rounded-2xl border shadow-xl">
			{/* Header strip */}
			<div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-500/15 dark:via-amber-500/5 border-amber-200/40 dark:border-amber-900/40 relative border-b px-7 pb-6 pt-7">
				<Link
					href="/"
					className="text-muted-foreground hover:text-foreground absolute left-7 top-7 inline-flex items-center gap-1 text-xs font-medium"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					Landing
				</Link>
				<div className="space-y-3 pt-6">
					<div className="bg-amber-500/15 text-amber-700 dark:text-amber-300 inline-flex h-11 w-11 items-center justify-center rounded-xl">
						<HardHat className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest">
							Crew Portal
						</p>
						<h1 className="text-foreground text-2xl font-semibold tracking-tight">
							Halo, crew Tetra
						</h1>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Akun lo udah verified? Login. Belum? Daftar dulu, owner verifikasi.
						</p>
					</div>
				</div>
			</div>

			{/* Tab switcher */}
			<div className="border-border flex border-b">
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

			{/* Tab content */}
			<div className="space-y-5 px-7 py-6 sm:py-7">
				{mode === "login" ? <LoginPanel /> : <RegisterPanel />}

				{errorMessage && (
					<p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-center text-xs font-medium">
						{errorMessage}
					</p>
				)}
			</div>

			{/* Footer */}
			<div className="border-border bg-muted/30 flex items-center justify-between gap-2 border-t px-7 py-3">
				<Image
					src="/brand/logomark-only.png"
					alt="Tetra"
					width={32}
					height={32}
					className="h-5 w-auto opacity-60"
				/>
				<p className="text-muted-foreground/70 text-[10px]">
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
				<h2 className="text-foreground text-base font-semibold">
					Login akun crew
				</h2>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Sudah pernah daftar dan owner sudah approve? Masuk pakai Gmail yang
					lo daftarin.
				</p>
			</div>
			<LoginButton />
			<div className="text-muted-foreground space-y-1 text-center text-[11px] leading-relaxed">
				<p>Akun belum diverifikasi → bakal landing di halaman tunggu.</p>
				<p>
					Belum punya akun?{" "}
					<Link
						href="/crew-portal?mode=register"
						className="text-primary font-medium hover:underline"
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
				<h2 className="text-foreground text-base font-semibold">
					Buat akun crew Tetra
				</h2>
				<p className="text-muted-foreground text-xs leading-relaxed">
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

			<LoginButton />

			<p className="text-muted-foreground text-center text-[11px]">
				Sudah pernah daftar?{" "}
				<Link
					href="/crew-portal?mode=login"
					className="text-primary font-medium hover:underline"
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
			className={`relative inline-flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors ${
				active
					? "text-foreground"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			<Icon className="h-4 w-4" />
			{label}
			{active && (
				<span className="bg-primary absolute inset-x-3 bottom-0 h-0.5 rounded-full" />
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
			<div className="bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
				<Icon className="h-4 w-4" />
			</div>
			<div className="flex-1 space-y-0.5">
				<div className="flex items-baseline gap-2">
					<span className="text-foreground text-sm font-medium leading-tight">
						{title}
					</span>
					<span className="text-muted-foreground/60 tabular text-[10px]">
						{n}/3
					</span>
				</div>
				<p className="text-muted-foreground text-xs leading-snug">{body}</p>
			</div>
		</li>
	);
}
