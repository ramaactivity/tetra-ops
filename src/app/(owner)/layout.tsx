import { redirect } from "next/navigation";
import { OwnerBottomNav } from "@/components/layouts/owner-bottom-nav";
import { OwnerSidebar } from "@/components/layouts/owner-sidebar";
import { TopBar } from "@/components/layouts/topbar";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function OwnerLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const result = await getCurrentUser();
	if (!result) redirect("/login");

	const { profile } = result;
	if (profile.role === "crew") redirect("/crew");
	if (profile.role === "pending_approval") redirect("/pending");

	return (
		<div className="bg-background flex min-h-screen flex-col">
			<TopBar
				name={profile.full_name}
				email={result.email}
				role={profile.role}
				withMobileNav={false}
			/>
			<div className="flex flex-1">
				<OwnerSidebar />
				<main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
					{children}
				</main>
			</div>
			<OwnerBottomNav />
		</div>
	);
}
