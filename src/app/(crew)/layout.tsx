import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function CrewLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const result = await getCurrentUser();
	if (!result) redirect("/login");

	const { role } = result.profile;
	if (role === "super_admin" || role === "owner") redirect("/dashboard");
	if (role === "pending_approval") redirect("/pending");

	return (
		<div className="flex min-h-screen flex-1 flex-col bg-zinc-50 dark:bg-black">
			{children}
		</div>
	);
}
