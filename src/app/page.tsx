import { ArrowUpRight, Briefcase, HardHat, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";

/**
 * Public landing page — Vercel / Linear DNA per DESIGN.md.
 *
 * Inter at display scale (clamp up to 5rem with −4% letter-spacing).
 * No serif anywhere. Crimson accent ONLY on the brand word — no gradient
 * text fill on operational chrome. One subtle sunrise orb in upper-right
 * for atmosphere; Linear-style minimal otherwise.
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
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 sm:px-10 sm:py-8">
				{/* Header */}
				<header className="flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<Image
							src="/brand/logomark-only.png"
							alt="Tetra"
							width={32}
							height={32}
							className="h-7 w-auto"
							priority
						/>
						<span className="text-[15px] font-semibold tracking-tight text-foreground">
							Tetra Ops
						</span>
					</div>
					<div className="hidden items-center gap-3 sm:flex">
						<span className="inline-flex items-center gap-2">
							<span className="relative flex size-1.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
								<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
							</span>
							<span className="text-[12px] font-medium text-muted-foreground">
								Live
							</span>
						</span>
						<span className="text-[12px] text-muted-foreground/50">·</span>
						<span className="font-mono text-[12px] text-muted-foreground">
							v1.0
						</span>
					</div>
				</header>

				{/* Hero */}
				<main className="flex flex-1 flex-col justify-center py-20 sm:py-28">
					<div className="space-y-14 sm:space-y-16">
						<div className="space-y-7">
							{/* Eyebrow */}
							<div className="inline-flex items-center gap-2">
								<Sparkles className="size-3 text-primary" />
								<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
									ops.photobooth/v1
								</span>
							</div>

							{/* Headline — Inter at hero scale, −4% tracking */}
							<h1 className="max-w-4xl text-[clamp(2.5rem,1.6rem+4vw,5rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-foreground">
								Operating system buat tim{" "}
								<span className="text-primary">photobooth</span>.
							</h1>

							<p className="max-w-2xl text-[clamp(1rem,0.9rem+0.5vw,1.25rem)] leading-[1.55] text-muted-foreground">
								Owner kelola event dari booking sampai settle. Crew tahu
								jadwal, alat, dan fee dari HP.{" "}
								<span className="text-foreground">Satu sistem, dua surface.</span>
							</p>
						</div>

						{/* Role cards */}
						<div className="grid gap-3 md:grid-cols-2 md:gap-4">
							<RoleCard
								role="owner"
								eyebrow="OWNER · MANAJEMEN"
								title="Masuk halaman owner"
								description="Operations, settlement, finance, master data, reports."
								href="/login"
							/>
							<RoleCard
								role="crew"
								eyebrow="CREW · TIM LAPANGAN"
								title="Masuk halaman crew"
								description="Login akun yang sudah verified, atau daftar baru — owner yang verifikasi."
								href="/crew-portal"
							/>
						</div>
					</div>
				</main>

				{/* Footer */}
				<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-6 text-[12px] text-muted-foreground/70">
					<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
					<p className="font-mono text-[11px] text-muted-foreground/50">
						Bogor.id
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
			className="group relative flex flex-col gap-6 overflow-hidden rounded-xl border border-border-default bg-surface-2 p-6 transition-all duration-base ease-out-expo hover:border-border-strong hover:bg-surface-3 sm:p-7"
		>
			{/* Hairline accent on hover */}
			<div
				aria-hidden="true"
				className="absolute inset-x-0 top-0 h-px bg-primary opacity-0 transition-opacity duration-base ease-out-expo group-hover:opacity-100"
			/>

			{/* Icon + arrow */}
			<div className="flex items-center justify-between">
				<div className="grid size-9 place-items-center rounded-lg bg-surface-3 text-muted-foreground ring-1 ring-border-subtle transition-colors duration-base ease-out-expo group-hover:bg-primary/10 group-hover:text-primary group-hover:ring-primary/20">
					<Icon className="size-4" />
				</div>
				<ArrowUpRight className="size-4 text-muted-foreground/40 transition-all duration-base ease-out-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
			</div>

			{/* Text */}
			<div className="space-y-2">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					{eyebrow}
				</p>
				<h2 className="text-[clamp(1.25rem,1rem+0.8vw,1.625rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
					{title}
				</h2>
				<p className="text-[14px] leading-relaxed text-muted-foreground">
					{description}
				</p>
			</div>
		</Link>
	);
}
