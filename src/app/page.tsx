import {
	ArrowRight,
	Briefcase,
	CalendarDays,
	HardHat,
	Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function HomePage() {
	const result = await getCurrentUser();

	// If signed in, route to the appropriate app surface
	if (result) {
		switch (result.profile.role) {
			case "super_admin":
			case "owner":
				redirect("/dashboard");
			case "crew":
				redirect("/crew");
			case "pending_approval":
				redirect("/pending");
		}
	}

	return (
		<div className="bg-background min-h-screen">
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8 sm:py-12">
				<header className="flex items-center justify-between">
					<Image
						src="/brand/logo-monochrome-light.png"
						alt="Tetra Photobooth"
						width={200}
						height={60}
						className="h-7 w-auto sm:h-9 dark:hidden"
						priority
					/>
					<Image
						src="/brand/logo-monochrome-dark.png"
						alt="Tetra Photobooth"
						width={200}
						height={60}
						className="hidden h-7 w-auto sm:h-9 dark:block"
						priority
					/>
				</header>

				<main className="flex flex-1 flex-col justify-center py-12 sm:py-20">
					<div className="space-y-12 sm:space-y-16">
						{/* Hero */}
						<div className="space-y-3 sm:space-y-4">
							<p className="text-primary text-xs font-medium uppercase tracking-widest sm:text-sm">
								Tetra Ops
							</p>
							<h1 className="text-foreground font-display text-4xl leading-tight tracking-tight sm:text-5xl md:text-6xl">
								Operating system
								<br />
								<span className="text-muted-foreground">
									buat tim photobooth.
								</span>
							</h1>
							<p className="text-muted-foreground max-w-xl text-base leading-relaxed sm:text-lg">
								Satu sistem buat owner kelola event end-to-end + crew tahu
								jadwal, alat, dan fee dari HP.
							</p>
						</div>

						{/* Two paths */}
						<div className="grid gap-4 md:grid-cols-2 md:gap-5">
							<PathCard
								role="owner"
								title="Owner / Manajemen"
								tagline="Login pakai akun yang sudah terdaftar."
								features={[
									{
										icon: CalendarDays,
										label: "Operations: list, calendar, board, design hub",
									},
									{
										icon: Wallet,
										label: "Settlement engine + finance + warehouse",
									},
									{
										icon: Briefcase,
										label: "Master data: package, crew, items, banks",
									},
								]}
								cta="Login sebagai Owner"
								href="/login"
								primary
							/>

							<PathCard
								role="crew"
								title="Crew / Tim Lapangan"
								tagline="Daftar pakai Gmail. Akun di-verifikasi owner sebelum bisa akses jadwal."
								features={[
									{
										icon: CalendarDays,
										label: "Jadwal event lo + PIC contact + venue Maps",
									},
									{
										icon: HardHat,
										label: "Alat ke-checkout per event + kondisi",
									},
									{
										icon: Wallet,
										label: "Histori fee, status paid/unpaid",
									},
								]}
								cta="Daftar sebagai Crew"
								href="/register"
								secondaryHref="/login"
								secondaryLabel="Sudah terdaftar? Login"
							/>
						</div>
					</div>
				</main>

				<footer className="text-muted-foreground/70 flex flex-wrap items-center justify-between gap-2 pt-8 text-xs">
					<p>
						© {new Date().getFullYear()} Tetra Photobooth. Internal ops
						system.
					</p>
					<p className="tabular">v1.0</p>
				</footer>
			</div>
		</div>
	);
}

function PathCard({
	role,
	title,
	tagline,
	features,
	cta,
	href,
	secondaryHref,
	secondaryLabel,
	primary,
}: {
	role: "owner" | "crew";
	title: string;
	tagline: string;
	features: Array<{ icon: typeof Briefcase; label: string }>;
	cta: string;
	href: string;
	secondaryHref?: string;
	secondaryLabel?: string;
	primary?: boolean;
}) {
	return (
		<div
			className={`group border-border bg-card relative flex flex-col gap-5 overflow-hidden rounded-2xl border p-6 sm:p-7 ${
				primary
					? "ring-primary/0 hover:ring-primary/20 ring-2 transition-all"
					: ""
			}`}
		>
			{/* Subtle role accent */}
			<div className="flex items-center gap-2">
				<span
					className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-wider ${
						role === "owner"
							? "bg-primary/10 text-primary"
							: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
					}`}
				>
					{role === "owner" ? <Briefcase className="h-3 w-3" /> : <HardHat className="h-3 w-3" />}
					{role === "owner" ? "OWNER" : "CREW"}
				</span>
			</div>

			<div className="space-y-1.5">
				<h2 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
					{title}
				</h2>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{tagline}
				</p>
			</div>

			<ul className="space-y-2">
				{features.map((f) => {
					const Icon = f.icon;
					return (
						<li
							key={f.label}
							className="text-foreground/80 flex items-start gap-2.5 text-sm"
						>
							<Icon className="text-muted-foreground/70 mt-0.5 h-4 w-4 shrink-0" />
							<span>{f.label}</span>
						</li>
					);
				})}
			</ul>

			<div className="flex flex-col gap-2 pt-1">
				<Link
					href={href}
					className={`inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
						primary
							? "bg-primary text-primary-foreground hover:bg-primary/90"
							: "border-foreground/15 bg-foreground text-background hover:bg-foreground/90 border"
					}`}
				>
					{cta}
					<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
				</Link>
				{secondaryHref && secondaryLabel && (
					<Link
						href={secondaryHref}
						className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center justify-center text-xs font-medium transition-colors"
					>
						{secondaryLabel}
					</Link>
				)}
			</div>
		</div>
	);
}
