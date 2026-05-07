import { ArrowLeft, ChevronRight } from "lucide-react";
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
		<div className="bg-card border-border w-full max-w-md space-y-6 rounded-xl border p-7 shadow-lg sm:p-8">
			<Link
				href="/"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
			>
				<ArrowLeft className="h-3.5 w-3.5" />
				Balik ke landing
			</Link>

			<div className="flex flex-col items-start gap-4">
				<Image
					src="/brand/logo-monochrome-light.png"
					alt="Tetra Photobooth"
					width={200}
					height={60}
					className="h-9 w-auto dark:hidden"
					priority
				/>
				<Image
					src="/brand/logo-monochrome-dark.png"
					alt="Tetra Photobooth"
					width={200}
					height={60}
					className="hidden h-9 w-auto dark:block"
					priority
				/>
				<div className="space-y-1.5">
					<h1 className="font-display text-foreground text-2xl tracking-tight sm:text-3xl">
						Login Tetra Ops
					</h1>
					<p className="text-muted-foreground text-sm">
						Sign in pakai Google account yang sudah terdaftar.
					</p>
				</div>
			</div>

			<LoginButton />

			{errorMessage && (
				<p className="text-destructive text-center text-sm">{errorMessage}</p>
			)}

			<div className="border-border space-y-2 border-t pt-4">
				<p className="text-muted-foreground text-center text-xs">
					Crew baru?{" "}
					<Link
						href="/register"
						className="text-primary inline-flex items-center gap-0.5 font-medium hover:underline"
					>
						Daftar di sini
						<ChevronRight className="h-3 w-3" />
					</Link>
				</p>
			</div>
		</div>
	);
}
