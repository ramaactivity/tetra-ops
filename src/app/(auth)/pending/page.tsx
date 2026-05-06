import { redirect } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function PendingPage() {
	const result = await getCurrentUser();
	if (!result) redirect("/login");
	if (result.profile.role !== "pending_approval") redirect("/");

	const { email } = result;

	return (
		<div className="bg-card border-border w-full max-w-sm space-y-6 rounded-xl border p-8 shadow-lg">
			<div className="space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Menunggu Persetujuan
				</h1>
				<p className="text-muted-foreground text-sm">
					Akun{" "}
					<span className="text-foreground font-medium">{email}</span>{" "}
					sudah terdaftar. Owner Tetra perlu menyetujui akses sebelum lu bisa
					lanjut.
				</p>
			</div>
			<form action={signOut}>
				<button
					type="submit"
					className="border-border bg-card hover:bg-muted text-foreground h-11 w-full rounded-md border text-sm font-medium transition-colors"
				>
					Sign out
				</button>
			</form>
		</div>
	);
}
