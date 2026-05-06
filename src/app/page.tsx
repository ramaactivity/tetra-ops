import { redirect } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect("/login");
	}

	return (
		<main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 p-8 dark:bg-black">
			<div className="w-full max-w-md space-y-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
				<div className="space-y-2 text-center">
					<h1 className="text-2xl font-semibold tracking-tight">Tetra Ops</h1>
					<p className="text-sm text-zinc-600 dark:text-zinc-400">
						You're signed in.
					</p>
				</div>
				<dl className="space-y-2 rounded-md bg-zinc-50 p-4 text-sm dark:bg-zinc-800/50">
					<div className="flex justify-between gap-4">
						<dt className="text-zinc-500 dark:text-zinc-400">Email</dt>
						<dd className="font-medium text-zinc-900 dark:text-zinc-50">
							{user.email}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-zinc-500 dark:text-zinc-400">User ID</dt>
						<dd className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
							{user.id.slice(0, 8)}…
						</dd>
					</div>
				</dl>
				<form action={signOut}>
					<button
						type="submit"
						className="h-11 w-full rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
					>
						Sign out
					</button>
				</form>
			</div>
		</main>
	);
}
