import { ArrowLeft, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LoginButton } from "./login-button";

/**
 * Owner login screen — branded "Selamat datang kembali" moment.
 *
 * A2 refactor (sesi 5):
 * - Branded headline uses font-display + text-gradient-sunrise per
 *   design system §12.1.
 * - Card uses surface-2 base, surface-3 muted strip (no hand-rolled
 *   rose gradient header). Glow CTA via shadow-glow-crimson.
 * - Mobile padding cap p-4, fluid type scale throughout.
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
		<div className="w-full max-w-md overflow-hidden rounded-2xl border border-border-default bg-surface-2 shadow-xl">
			{/* Hero band — Sunrise gradient at low opacity for subtle warmth */}
			<div className="relative border-b border-border-subtle px-6 pb-5 pt-6 sm:px-7">
				<div
					aria-hidden
					className="absolute inset-0 -z-10 bg-gradient-sunrise-radial opacity-[0.08] dark:opacity-[0.14]"
				/>
				<Link
					href="/"
					className="absolute left-6 top-6 inline-flex items-center gap-1 text-fluid-caption font-medium text-muted-foreground hover:text-foreground sm:left-7"
				>
					<ArrowLeft className="size-3.5" />
					Landing
				</Link>
				<div className="space-y-3 pt-6">
					<p className="text-fluid-caption font-semibold uppercase tracking-widest text-muted-foreground">
						Owner / Manajemen
					</p>
					<h1 className="font-display text-fluid-h1 font-semibold leading-tight tracking-tight">
						<span className="text-gradient-sunrise">
							Selamat datang kembali
						</span>
					</h1>
					<p className="text-fluid-body leading-relaxed text-muted-foreground">
						Sign in pakai Google account yang sudah terdaftar di sistem Tetra Ops.
					</p>
				</div>
			</div>

			{/* Sign-in body */}
			<div className="space-y-5 px-6 py-6 sm:px-7 sm:py-7">
				<div className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-3 p-3">
					<ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
					<div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center">
						<p className="text-fluid-caption font-medium text-destructive">
							{errorMessage}
						</p>
						{errorDetail && (
							<p className="break-words text-[11px] italic text-destructive/80">
								{errorDetail}
							</p>
						)}
					</div>
				)}
			</div>

			{/* Crew portal link */}
			<div className="border-t border-border-subtle bg-surface-3/50 px-6 py-4 sm:px-7">
				<div className="flex items-center justify-between gap-3">
					<div className="space-y-0.5">
						<p className="text-fluid-caption font-medium text-foreground">
							Crew?
						</p>
						<p className="text-fluid-caption text-muted-foreground">
							Login atau daftar di Crew Portal.
						</p>
					</div>
					<Link
						href="/crew-portal"
						className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium text-foreground hover:bg-surface-4"
					>
						Crew Portal →
					</Link>
				</div>
			</div>

			{/* Brand mark */}
			<div className="flex items-center justify-center border-t border-border-subtle bg-surface-1 py-3">
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
