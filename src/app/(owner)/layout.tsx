import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OwnerBottomNav } from "@/components/layouts/owner-bottom-nav";
import { OwnerSidebar } from "@/components/layouts/owner-sidebar";
import { OwnerTopBar } from "@/components/layouts/owner-topbar";
import type { Theme } from "@/lib/actions/theme";
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

	const cookieStore = await cookies();
	const theme: Theme =
		cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

	return (
		// UpGradely floating frame: ambient gradient margin around a white
		// sidebar card + a content column (search topbar card + page content).
		<div className="flex min-h-dvh gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
			<OwnerSidebar />
			{/* min-w-0 so the flex item shrinks below intrinsic content width on
			    smaller laptops (otherwise Container max-w caps push past viewport). */}
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<OwnerTopBar
					name={profile.full_name}
					email={result.email}
					role={profile.role}
				/>
				<main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
					{children}
				</main>
			</div>
			<OwnerBottomNav
				name={profile.full_name}
				email={result.email}
				role={profile.role}
				theme={theme}
			/>
		</div>
	);
}
