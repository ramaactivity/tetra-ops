import { ArrowLeft, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LoginButton } from "./login-button";

/**
 * Owner login screen — Vercel / Linear DNA.
 *
 * Inter at all sizes (no serif). Crimson accent on the brand word only.
 * Card uses surface-2 with hairline border — no painted gradient strip.
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
			<div className="relative overflow-hidden rounded-2xl border border-border-default bg-surface-2 shadow-2xl shadow-black/10 dark:shadow-black/40">
				{/* Single hairline at top — primary, not gradient */}
				<div
					aria-hidden="true"
					className="absolute inset-x-0 top-0 h-px bg-primary/60"
				/>

				{/* Hero band */}
				<div className="relative px-7 pt-9 pb-7 sm:px-8">
					<Link
						href="/"
						className="absolute left-7 top-7 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:left-8"
					>
						<ArrowLeft className="size-3" />
						Landing
					</Link>

					<div className="space-y-4 pt-8">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							owner · manajemen
						</p>

						<h1 className="text-[clamp(1.75rem,1.4rem+1.4vw,2.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
							Selamat datang{" "}
							<span className="text-primary">kembali</span>.
						</h1>

						<p className="text-[14px] leading-relaxed text-muted-foreground">
							Sign in pakai Google account yang sudah terdaftar di sistem Tetra
							Ops.
						</p>
					</div>
				</div>

				{/* Sign-in body */}
				<div className="space-y-4 px-7 py-6 sm:px-8">
					<div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-3 p-3">
						<div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
							<ShieldCheck className="size-3.5" />
						</div>
						<div className="space-y-0.5">
							<p className="text-[13px] font-medium text-foreground">
								Akses owner-level
							</p>
							<p className="text-[12px] leading-relaxed text-muted-foreground">
								Cuma akun yang sudah di-grant role super_admin / owner yang bisa
								masuk dashboard.
							</p>
						</div>
					</div>

					<LoginButton />

					{errorMessage && (
						<div
							role="alert"
							className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
						>
							<p className="text-[12px] font-semibold text-destructive">
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
				<div className="border-t border-border-subtle bg-surface-1/30 px-7 py-4 sm:px-8">
					<div className="flex items-center justify-between gap-3">
						<div className="space-y-0">
							<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
								bukan owner?
							</p>
							<p className="text-[12px] text-muted-foreground">
								Login atau daftar di Crew Portal.
							</p>
						</div>
						<Link
							href="/crew-portal"
							className="press-down inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-[12px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-3"
						>
							Crew Portal →
						</Link>
					</div>
				</div>

				{/* Brand mark */}
				<div className="flex items-center justify-center border-t border-border-subtle bg-surface-1/20 py-3">
					<Image
						src="/brand/logomark-only.png"
						alt="Tetra"
						width={32}
						height={32}
						className="h-4 w-auto opacity-40"
					/>
				</div>
			</div>
		</div>
	);
}
