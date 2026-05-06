import { redirect } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function PendingPage() {
	const result = await getCurrentUser();
	if (!result) redirect("/login");
	if (result.profile.role !== "pending_approval") redirect("/");

	const { email } = result;

	return (
		<div className="w-full max-w-sm space-y-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
			<div className="space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Menunggu Persetujuan
				</h1>
				<p className="text-sm text-zinc-600 dark:text-zinc-400">
					Akun <span className="font-medium">{email}</span> sudah terdaftar.
					Owner Tetra perlu menyetujui akses sebelum lu bisa lanjut.
				</p>
			</div>
			<form action={signOut}>
				<button
					type="submit"
					className="h-11 w-full rounded-md border border-zinc-200 bg-white text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
				>
					Sign out
				</button>
			</form>
		</div>
	);
}
