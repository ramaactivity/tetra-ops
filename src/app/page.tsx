import { ArrowUpRight, Briefcase, HardHat, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";

/**
 * Public landing page — entry point for unauthenticated visitors.
 *
 * Pass 4 refactor per DESIGN.md (Linear/Stripe/Vercel synthesis):
 * - Hero scales to display-xl (Playfair 72px) with sunrise gradient text
 *   fill on the brand word via background-clip: text.
 * - Dual sunrise + aurora orbs at low opacity create depth without
 *   becoming an "atmospheric gradient in chrome" (DESIGN.md don't).
 * - Role cards rebuilt with .eyebrow utility, generous padding,
 *   surface-2 → surface-3 hover lift, sunrise hairline on hover.
 * - Footer carries privacy/terms links (legal requirement) + brand mark.
 */
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
		<div className="relative min-h-screen overflow-hidden bg-background">
			{/* Decorative orbs — DESIGN.md "gradients only on hero/empty/success" */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
			>
				<div className="absolute -top-32 -right-40 h-[48rem] w-[48rem] rounded-full bg-gradient-sunrise-radial opacity-[0.18] blur-3xl dark:opacity-[0.28]" />
				<div className="absolute -bottom-40 -left-32 h-[40rem] w-[40rem] rounded-full bg-gradient-aurora-radial opacity-[0.10] blur-3xl dark:opacity-[0.18]" />
				<div className="absolute top-1/2 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.04] blur-3xl dark:bg-primary/[0.08]" />
			</div>

			<div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-10">
				{/* Header */}
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
						<span className="text-fluid-body font-semibold tracking-tight text-foreground">
							Tetra Ops
						</span>
					</div>
					<span className="hidden h-7 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2/80 px-3 backdrop-blur sm:inline-flex">
						<span className="relative flex size-1.5">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
							<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
						</span>
						<span className="eyebrow !text-[10px] !tracking-widest !text-muted-foreground">
							v1.0 · Live
						</span>
					</span>
				</header>

				{/* Hero */}
				<main className="flex flex-1 flex-col justify-center py-16 sm:py-24">
					<div className="space-y-12 sm:space-y-16">
						<div className="space-y-6 sm:space-y-8">
							{/* Eyebrow chip */}
							<div className="inline-flex h-8 items-center gap-2 rounded-full border border-border-subtle bg-surface-2/70 px-4 backdrop-blur-md">
								<Sparkles className="size-3.5 text-primary" />
								<span className="eyebrow !text-[10px] !text-foreground/80">
									Operating system · Photobooth team
								</span>
							</div>

							{/* Headline — Playfair display-xl with gradient word fill */}
							<h1 className="max-w-4xl font-display text-[clamp(2.5rem,1.8rem+3.5vw,5rem)] font-semibold leading-[1.02] tracking-[-0.02em] text-foreground">
								Operating system buat tim{" "}
								<span
									className="bg-gradient-sunrise bg-clip-text text-transparent"
									style={{
										WebkitBackgroundClip: "text",
										WebkitTextFillColor: "transparent",
									}}
								>
									photobooth
								</span>
								.
							</h1>

							<p className="max-w-2xl text-fluid-h3 leading-[1.5] text-muted-foreground">
								Owner kelola event dari booking sampai settle. Crew tahu jadwal,
								alat, dan fee dari HP.{" "}
								<span className="text-foreground/85">
									Satu sistem, dua surface.
								</span>
							</p>
						</div>

						{/* Role cards */}
						<div className="grid gap-4 sm:gap-5 md:grid-cols-2">
							<RoleCard
								role="owner"
								eyebrow="Owner · Manajemen"
								title="Masuk halaman owner"
								description="Operations, settlement, finance, master data, reports."
								href="/login"
							/>
							<RoleCard
								role="crew"
								eyebrow="Crew · Tim Lapangan"
								title="Masuk halaman crew"
								description="Login akun yang sudah verified, atau daftar baru — owner yang verifikasi."
								href="/crew-portal"
							/>
						</div>
					</div>
				</main>

				{/* Footer */}
				<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-6 text-fluid-caption text-muted-foreground/80">
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						<p className="tabular">
							© {new Date().getFullYear()} Tetra Photobooth
						</p>
						<Link
							href="/privacy"
							className="underline-offset-4 hover:text-foreground hover:underline"
						>
							Privacy
						</Link>
						<Link
							href="/terms"
							className="underline-offset-4 hover:text-foreground hover:underline"
						>
							Terms
						</Link>
					</div>
					<p className="tabular text-muted-foreground/60">
						Built in Bogor · for the field
					</p>
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
			className="group relative flex flex-col gap-7 overflow-hidden rounded-2xl border border-border-default bg-surface-2/70 p-7 backdrop-blur-sm transition-all duration-base ease-out-expo hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-3 hover:shadow-glow-crimson sm:p-9"
		>
			{/* Sunrise hairline top edge on hover */}
			<div
				aria-hidden="true"
				className="absolute inset-x-0 top-0 h-px bg-gradient-sunrise opacity-0 transition-opacity duration-base ease-out-expo group-hover:opacity-100"
			/>

			{/* Icon + arrow */}
			<div className="flex items-center justify-between">
				<div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-base ease-out-expo group-hover:scale-105 group-hover:bg-primary/15">
					<Icon className="size-5" />
				</div>
				<div className="grid size-9 place-items-center rounded-full bg-surface-3 text-muted-foreground ring-1 ring-border-subtle transition-all duration-base ease-out-expo group-hover:bg-foreground group-hover:text-background group-hover:ring-foreground/30">
					<ArrowUpRight className="size-4 transition-transform duration-base ease-out-expo group-hover:scale-110" />
				</div>
			</div>

			{/* Text */}
			<div className="space-y-2.5">
				<p className="eyebrow !text-[10px]">{eyebrow}</p>
				<h2 className="font-display text-fluid-h1 font-semibold leading-tight tracking-[-0.01em] text-foreground">
					{title}
				</h2>
				<p className="text-fluid-body leading-relaxed text-muted-foreground">
					{description}
				</p>
			</div>
		</Link>
	);
}
