import { ArrowUpRight, Briefcase, HardHat, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function HomePage() {
	const result = await getCurrentUser();
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
		<div className="bg-background relative min-h-screen overflow-hidden">
			{/* Decorative background — subtle gradient orbs */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
			>
				<div className="absolute -top-40 -right-32 h-[42rem] w-[42rem] rounded-full bg-gradient-to-br from-rose-100 to-amber-100 opacity-50 blur-3xl dark:from-rose-950 dark:to-amber-950 dark:opacity-30" />
				<div className="absolute -bottom-32 -left-32 h-[36rem] w-[36rem] rounded-full bg-gradient-to-tr from-sky-100 to-indigo-100 opacity-40 blur-3xl dark:from-sky-950 dark:to-indigo-950 dark:opacity-25" />
			</div>

			<div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 sm:px-8 sm:py-10">
				{/* Top bar */}
				<header className="flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<Image
							src="/brand/logomark-only.png"
							alt="Tetra"
							width={32}
							height={32}
							className="h-8 w-auto"
							priority
						/>
						<span className="text-foreground text-sm font-semibold tracking-tight">
							Tetra Ops
						</span>
					</div>
					<span className="border-border bg-card/80 text-muted-foreground hidden h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium backdrop-blur sm:inline-flex">
						<Sparkles className="h-3 w-3" />
						v1.0 · Internal
					</span>
				</header>

				{/* Hero + role choice */}
				<main className="flex flex-1 flex-col justify-center py-10 sm:py-14">
					<div className="space-y-10 sm:space-y-12">
						{/* Eyebrow + heading */}
						<div className="space-y-5 sm:space-y-6">
							<div className="bg-foreground/5 border-foreground/10 text-muted-foreground inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium uppercase tracking-wider backdrop-blur">
								<span className="bg-emerald-500 inline-block h-1.5 w-1.5 rounded-full" />
								Live in production
							</div>
							<h1 className="text-foreground font-display max-w-3xl text-5xl leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
								Operating system buat tim{" "}
								<span className="relative inline-block">
									<span className="from-rose-600 to-amber-600 dark:from-rose-400 dark:to-amber-400 bg-gradient-to-r bg-clip-text text-transparent">
										photobooth
									</span>
								</span>
								.
							</h1>
							<p className="text-muted-foreground max-w-xl text-lg leading-relaxed sm:text-xl">
								Owner kelola event dari booking sampai settle. Crew tahu
								jadwal, alat, dan fee dari HP. Satu sistem, dua surface.
							</p>
						</div>

						{/* Two paths */}
						<div className="grid gap-4 md:grid-cols-2 md:gap-5">
							<RoleCard
								role="owner"
								eyebrow="Owner / Manajemen"
								title="Masuk halaman owner"
								description="Operations, settlement, finance, master data, reports."
								href="/login"
							/>
							<RoleCard
								role="crew"
								eyebrow="Crew / Tim Lapangan"
								title="Masuk halaman crew"
								description="Login akun yang sudah verified, atau daftar baru — owner yang verifikasi."
								href="/crew-portal"
							/>
						</div>
					</div>
				</main>

				{/* Footer */}
				<footer className="text-muted-foreground/70 flex flex-wrap items-center justify-between gap-2 pt-6 text-[11px]">
					<p>© {new Date().getFullYear()} Tetra Photobooth.</p>
					<p className="tabular">Built for go-live · Bogor, Indonesia</p>
				</footer>
			</div>
		</div>
	);
}

function RoleCard({
	role,
	eyebrow,
	title,
	description,
	href,
}: {
	role: "owner" | "crew";
	eyebrow: string;
	title: string;
	description: string;
	href: string;
}) {
	const Icon = role === "owner" ? Briefcase : HardHat;
	return (
		<Link
			href={href}
			className="group border-border bg-card/60 hover:border-foreground/20 hover:bg-card relative flex flex-col gap-6 overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all sm:p-8"
		>
			{/* Hover accent gradient */}
			<div
				aria-hidden="true"
				className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-0 transition-opacity group-hover:opacity-100 ${
					role === "owner"
						? "from-transparent via-rose-500 to-transparent"
						: "from-transparent via-amber-500 to-transparent"
				}`}
			/>

			{/* Icon + eyebrow */}
			<div className="flex items-center justify-between">
				<div
					className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
						role === "owner"
							? "bg-rose-500/10 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
							: "bg-amber-500/10 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
					}`}
				>
					<Icon className="h-5 w-5" />
				</div>
				<div
					className={`text-muted-foreground inline-flex h-7 w-7 items-center justify-center rounded-full transition-all group-hover:bg-foreground group-hover:text-background ${
						role === "owner" ? "" : ""
					}`}
				>
					<ArrowUpRight className="h-4 w-4 transition-transform group-hover:scale-110" />
				</div>
			</div>

			{/* Text */}
			<div className="space-y-2">
				<p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest">
					{eyebrow}
				</p>
				<h2 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
					{title}
				</h2>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>
			</div>
		</Link>
	);
}
