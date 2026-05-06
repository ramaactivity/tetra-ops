import Image from "next/image";
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
		<div className="bg-card border-border w-full max-w-sm space-y-8 rounded-xl border p-8 shadow-lg">
			<div className="flex flex-col items-center space-y-4 text-center">
				<Image
					src="/brand/logo-monochrome-light.png"
					alt="Tetra Photobooth"
					width={200}
					height={60}
					className="h-10 w-auto"
					priority
				/>
				<div className="space-y-1.5">
					<h1 className="font-display text-3xl tracking-tight">Tetra Ops</h1>
					<p className="text-muted-foreground text-sm">
						Sign in to continue
					</p>
				</div>
			</div>
			<LoginButton />
			{errorMessage && (
				<p className="text-destructive text-center text-sm">{errorMessage}</p>
			)}
		</div>
	);
}
