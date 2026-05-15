import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LoginButton } from "./login-button";

/**
 * Owner login screen.
 *
 * Pass 4 refactor per DESIGN.md:
 * - Sunrise + aurora orbs match landing for cohesive entry experience.
 * - Card uses surface-2/70 + backdrop-blur, hairline border, no painted
 *   gradient strip (DESIGN.md don't: gradient as card fill).
 * - Hero copy uses Playfair display-xl with sunrise gradient on the
 *   accent word (background-clip text) — matches landing brand DNA.
 * - Error rendered with semantic danger color + icon, structured copy.
 * - Spacing scales: section gap 32px, copy gap 12px, generous padding.
 */

const ERROR_MESSAGES: Record<string, string> = {
	auth_failed: "Login gagal. Coba lagi.",
	no_code: "Login gagal — tidak ada authorization code dari Google.",
	access_denied: "Lo cancel di consent screen Google. Coba lagi.",
	server_error:
		"Google error saat handshake. Coba beberapa saat lagi atau cek konfigurasi OAuth.",
};

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; detail?: string }>;
}) {
	const params = await searchParams;
	const errorMessage = params.error
		? (ERROR_MESSAGES[params.error] ??
			`Login gagal (${params.error}). Coba lagi.`)
		: null;
	const errorDetail = params.detail ?? null;

	return (
		<div className="relative w-full max-w-md">
			{/* Card */}
			<div className="relative overflow-hidden rounded-3xl border border-border-default bg-surface-2/80 shadow-xl backdrop-blur-xl">
				{/* Top sunrise hairline */}
				<div
					aria-hidden="true"
					className="absolute inset-x-0 top-0 h-px bg-gradient-sunrise opacity-60"
				/>

				{/* Hero band */}
				<div className="relative px-7 pt-8 pb-6 sm:px-9 sm:pt-10">
					<Link
						href="/"
						className="absolute left-7 top-7 inline-flex items-center gap-1.5 text-fluid-caption font-medium text-muted-foreground transition-colors hover:text-foreground sm:left-9 sm:top-9"
					>
						<ArrowLeft className="size-3.5" />
						Landing
					</Link>

					<div className="space-y-5 pt-10">
						<div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-3/70 px-3 backdrop-blur-md">
							<Sparkles className="size-3 text-primary" />
							<span className="eyebrow !text-[10px] !text-foreground/80">
								Owner · Manajemen
							</span>
						</div>

						<h1 className="font-display text-[clamp(2rem,1.6rem+1.6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground">
							Selamat datang{" "}
							<span
								className="bg-gradient-sunrise bg-clip-text text-transparent"
								style={{
									WebkitBackgroundClip: "text",
									WebkitTextFillColor: "transparent",
								}}
							>
								kembali
							</span>
							.
						</h1>

						<p className="text-fluid-body leading-relaxed text-muted-foreground">
							Sign in pakai Google account yang sudah terdaftar di sistem Tetra
							Ops.
						</p>
					</div>
				</div>

				{/* Sign-in body */}
				<div className="space-y-5 px-7 py-6 sm:px-9 sm:py-7">
					<div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-3/60 p-3.5 backdrop-blur-sm">
						<div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
							<ShieldCheck className="size-3.5" />
						</div>
						<div className="space-y-0.5">
							<p className="text-fluid-caption font-medium text-foreground">
								Akses owner-level
							</p>
							<p className="text-fluid-caption leading-relaxed text-muted-foreground">
								Cuma akun yang sudah di-grant role super_admin / owner yang bisa
								masuk dashboard.
							</p>
						</div>
					</div>

					<LoginButton />

					{errorMessage && (
						<div
							role="alert"
							className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
						>
							<p className="text-fluid-caption font-semibold text-destructive">
								{errorMessage}
							</p>
							{errorDetail && (
								<p className="break-words font-mono text-[11px] leading-relaxed text-destructive/75">
									{errorDetail}
								</p>
							)}
						</div>
					)}
				</div>

				{/* Crew portal link */}
				<div className="border-t border-border-subtle bg-surface-1/50 px-7 py-5 sm:px-9">
					<div className="flex items-center justify-between gap-3">
						<div className="space-y-0.5">
							<p className="eyebrow !text-[10px]">Bukan owner?</p>
							<p className="text-fluid-caption text-muted-foreground">
								Login atau daftar di Crew Portal.
							</p>
						</div>
						<Link
							href="/crew-portal"
							className="press-down inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border-default bg-surface-2 px-4 text-fluid-caption font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-3"
						>
							Crew Portal →
						</Link>
					</div>
				</div>

				{/* Brand mark */}
				<div className="flex items-center justify-center border-t border-border-subtle bg-surface-1/40 py-4">
					<Image
						src="/brand/logomark-only.png"
						alt="Tetra"
						width={32}
						height={32}
						className="h-5 w-auto opacity-50"
					/>
				</div>
			</div>
		</div>
	);
}
