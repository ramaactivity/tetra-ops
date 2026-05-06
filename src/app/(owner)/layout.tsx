import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function OwnerLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const result = await getCurrentUser();
	if (!result) redirect("/login");

	const { role } = result.profile;
	if (role === "crew") redirect("/crew");
	if (role === "pending_approval") redirect("/pending");

	return (
		<div className="bg-background flex min-h-screen flex-1 flex-col">
			{children}
		</div>
	);
}
