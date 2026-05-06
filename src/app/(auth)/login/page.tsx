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
		<div className="w-full max-w-sm space-y-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
			<div className="space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">Tetra Ops</h1>
				<p className="text-sm text-zinc-600 dark:text-zinc-400">
					Sign in to continue
				</p>
			</div>
			<LoginButton />
			{errorMessage && (
				<p className="text-center text-sm text-red-600 dark:text-red-400">
					{errorMessage}
				</p>
			)}
		</div>
	);
}
