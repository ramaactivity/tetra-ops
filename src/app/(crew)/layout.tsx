import { redirect } from "next/navigation";
import { CrewBottomNav } from "@/components/layouts/crew-bottom-nav";
import { TopBar } from "@/components/layouts/topbar";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function CrewLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const result = await getCurrentUser();
	if (!result) redirect("/login");

	const { profile } = result;
	if (profile.role === "super_admin" || profile.role === "owner") {
		redirect("/dashboard");
	}
	if (profile.role === "pending_approval") redirect("/pending");

	return (
		<div className="flex min-h-dvh flex-col bg-background">
			<TopBar
				name={profile.full_name}
				email={result.email}
				role={profile.role}
			/>
			<main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
				{children}
			</main>
			<CrewBottomNav />
		</div>
	);
}
