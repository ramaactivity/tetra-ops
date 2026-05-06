import { redirect } from "next/navigation";
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
			/>
			<div className="flex flex-1">
				<OwnerSidebar />
				<main className="flex-1">{children}</main>
			</div>
		</div>
	);
}
