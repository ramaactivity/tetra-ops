import { ArrowLeft, Briefcase, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LoginButton } from "./login-button";

const ERROR_MESSAGES: Record<string, string> = {
	auth_failed: "Login gagal. Coba lagi.",
	no_code: "Login gagal — tidak ada authorization code dari Google.",
};

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const params = await searchParams;
	const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;

	return (
		<div className="bg-card border-border w-full max-w-md overflow-hidden rounded-2xl border shadow-xl">
			{/* Header strip */}
			<div className="bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-500/15 dark:via-rose-500/5 border-rose-200/40 dark:border-rose-900/40 relative border-b px-7 pb-6 pt-7">
				<Link
					href="/"
					className="text-muted-foreground hover:text-foreground absolute left-7 top-7 inline-flex items-center gap-1 text-xs font-medium"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					Landing
				</Link>
				<div className="space-y-3 pt-6">
					<div className="bg-rose-500/15 text-rose-700 dark:text-rose-300 inline-flex h-11 w-11 items-center justify-center rounded-xl">
						<Briefcase className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest">
							Owner / Manajemen
						</p>
						<h1 className="text-foreground text-2xl font-semibold tracking-tight">
							Login Tetra Ops
						</h1>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Buat owner & super admin. Sign in pakai Google account yang
							sudah terdaftar di sistem.
						</p>
					</div>
				</div>
			</div>

			{/* Sign-in body */}
			<div className="space-y-5 px-7 py-7">
				<div className="border-border bg-muted/30 flex items-start gap-2.5 rounded-lg border p-3">
					<ShieldCheck className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
					<div className="space-y-0.5">
						<p className="text-foreground text-xs font-medium">
							Akses owner-level
						</p>
						<p className="text-muted-foreground text-[11px] leading-relaxed">
							Cuma akun yang sudah di-grant role super_admin / owner yang bisa
							masuk dashboard.
						</p>
					</div>
				</div>

				<LoginButton />

				{errorMessage && (
					<p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-center text-xs font-medium">
						{errorMessage}
					</p>
				)}
			</div>

			{/* Footer — link to crew portal */}
			<div className="border-border bg-muted/30 border-t px-7 py-4">
				<div className="flex items-center justify-between gap-3">
					<div className="space-y-0.5">
						<p className="text-foreground text-xs font-medium">Crew?</p>
						<p className="text-muted-foreground text-[11px]">
							Login atau daftar di Crew Portal.
						</p>
					</div>
					<Link
						href="/crew-portal"
						className="border-border bg-card hover:bg-muted text-foreground inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium"
					>
						Crew Portal →
					</Link>
				</div>
			</div>

			{/* Brand mark */}
			<div className="border-border bg-card flex items-center justify-center border-t py-3">
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
