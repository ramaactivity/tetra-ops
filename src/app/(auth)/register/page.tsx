import { ArrowLeft, ChevronRight, Clock, HardHat } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LoginButton } from "../login/login-button";

const ERROR_MESSAGES: Record<string, string> = {
	auth_failed: "Login gagal. Coba lagi.",
	no_code: "Login gagal — tidak ada authorization code dari Google.",
};

export default async function CrewRegisterPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	const params = await searchParams;
	const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;

	return (
		<div className="bg-card border-border w-full max-w-md space-y-6 rounded-xl border p-7 shadow-lg sm:p-8">
			<Link
				href="/"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
			>
				<ArrowLeft className="h-3.5 w-3.5" />
				Balik ke landing
			</Link>

			<div className="space-y-3">
				<div className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 inline-flex h-12 w-12 items-center justify-center rounded-xl">
					<HardHat className="h-5 w-5" />
				</div>
				<div className="space-y-1.5">
					<h1 className="text-foreground text-2xl font-semibold tracking-tight">
						Daftar sebagai Crew
					</h1>
					<p className="text-muted-foreground text-sm leading-relaxed">
						Login pakai Gmail. Akun lo akan diverifikasi owner sebelum bisa
						akses jadwal.
					</p>
				</div>
			</div>

			<div className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30 space-y-2 rounded-lg border p-3.5">
				<div className="flex items-center gap-2">
					<Clock className="text-amber-700 dark:text-amber-400 h-4 w-4" />
					<p className="text-amber-900 dark:text-amber-200 text-xs font-semibold uppercase tracking-wider">
						Cara kerjanya
					</p>
				</div>
				<ol className="text-foreground/80 space-y-1 text-xs leading-relaxed">
					<Step n={1}>Login pakai Gmail lo (sama yang dipake sehari-hari).</Step>
					<Step n={2}>
						Owner verifikasi akun lo dan set role ke crew (biasanya &lt; 24
						jam).
					</Step>
					<Step n={3}>Begitu di-approve, lo dapat akses jadwal di HP.</Step>
				</ol>
			</div>

			<LoginButton />

			<div className="border-border space-y-3 border-t pt-4">
				<p className="text-muted-foreground text-center text-xs">
					Sudah pernah daftar?{" "}
					<Link
						href="/login"
						className="text-primary inline-flex items-center gap-0.5 font-medium hover:underline"
					>
						Login di sini
						<ChevronRight className="h-3 w-3" />
					</Link>
				</p>
			</div>

			{errorMessage && (
				<p className="text-destructive text-center text-sm">{errorMessage}</p>
			)}

			<div className="flex items-center justify-center pt-2">
				<Image
					src="/brand/logomark-only.png"
					alt="Tetra"
					width={40}
					height={40}
					className="h-6 w-auto opacity-50"
				/>
			</div>
		</div>
	);
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
	return (
		<li className="flex items-start gap-2">
			<span className="bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100 mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular">
				{n}
			</span>
			<span>{children}</span>
		</li>
	);
}
