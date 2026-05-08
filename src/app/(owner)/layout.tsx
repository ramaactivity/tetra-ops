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
		<div className="flex min-h-dvh flex-col bg-background">
			<TopBar
				name={profile.full_name}
				email={result.email}
				role={profile.role}
				withMobileNav={false}
			/>
			<div className="flex flex-1">
				<OwnerSidebar />
				{/* min-w-0 on <main> is REQUIRED so the flex item shrinks below
				    intrinsic content width on smaller laptops — otherwise the
				    Container/max-w-* caps push past the viewport. (P0 fix). */}
				<main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
					{children}
				</main>
			</div>
			<OwnerBottomNav />
		</div>
	);
}
