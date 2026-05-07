import { ArrowUpRight, Briefcase, HardHat, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";

/**
 * Public landing page — entry point for unauthenticated visitors.
 *
 * A2 refactor (sesi 5):
 * - Sunrise + Aurora radial gradient orbs replace hand-rolled rose/amber/
 *   sky/indigo blobs. Decorative only.
 * - Hero headline uses font-display (Playfair) + text-gradient-sunrise on
 *   the highlight word. Mobile shrinks via text-fluid-display.
 * - Role cards rebuilt with surface-2 base + surface-3 hover, lift-on-hover
 *   utility, view-transition anchors per role for navigation morph.
 * - Mobile padding cap px-4 enforced, captions use text-fluid-caption.
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
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
			>
				<div className="absolute -top-40 -right-32 h-[42rem] w-[42rem] rounded-full bg-gradient-sunrise-radial opacity-[0.12] blur-3xl dark:opacity-[0.20]" />
				<div className="absolute -bottom-32 -left-32 h-[36rem] w-[36rem] rounded-full bg-gradient-aurora-radial opacity-[0.08] blur-3xl dark:opacity-[0.14]" />
			</div>

			<div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-10">
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
					<span className="hidden h-7 items-center gap-1 rounded-full border border-border-subtle bg-surface-2/80 px-2.5 text-fluid-caption font-medium uppercase tracking-wider text-muted-foreground backdrop-blur sm:inline-flex">
						<Sparkles className="size-3" />
						v1.0 · Internal
					</span>
				</header>

				<main className="flex flex-1 flex-col justify-center py-10 sm:py-14">
					<div className="space-y-10 sm:space-y-12">
						<div className="space-y-5 sm:space-y-6">
							<div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2/60 px-2.5 text-fluid-caption font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
								<span className="inline-block size-1.5 rounded-full bg-emerald-500" />
								Live in production
							</div>
							<h1 className="max-w-3xl font-display text-fluid-display leading-[1.05] tracking-tight text-foreground">
								Operating system buat tim{" "}
								<span className="text-gradient-sunrise">photobooth</span>.
							</h1>
							<p className="max-w-xl text-fluid-h3 leading-relaxed text-muted-foreground">
								Owner kelola event dari booking sampai settle. Crew tahu jadwal,
								alat, dan fee dari HP. Satu sistem, dua surface.
							</p>
						</div>

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

				<footer className="flex flex-wrap items-center justify-between gap-2 pt-6 text-fluid-caption text-muted-foreground/80">
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
			className="lift-on-hover group relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-border-default bg-surface-2/80 p-6 backdrop-blur-sm transition-colors hover:bg-surface-3 sm:p-8"
		>
			<div
				aria-hidden="true"
				className="absolute inset-x-0 top-0 h-px bg-gradient-sunrise opacity-0 transition-opacity duration-base ease-out-expo group-hover:opacity-100"
			/>

			<div className="flex items-center justify-between">
				<div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
					<Icon className="size-5" />
				</div>
				<div className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
					<ArrowUpRight className="size-4 transition-transform group-hover:scale-110" />
				</div>
			</div>

			<div className="space-y-2">
				<p className="text-fluid-caption font-semibold uppercase tracking-widest text-muted-foreground">
					{eyebrow}
				</p>
				<h2 className="font-display text-fluid-h1 font-semibold tracking-tight text-foreground">
					{title}
				</h2>
				<p className="text-fluid-body leading-relaxed text-muted-foreground">
					{description}
				</p>
			</div>
		</Link>
	);
}
