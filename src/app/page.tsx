import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";

export default async function HomePage() {
	const result = await getCurrentUser();
	if (!result) {
		redirect("/login");
	}

	switch (result.profile.role) {
		case "super_admin":
		case "owner":
			redirect("/dashboard");
		case "crew":
			redirect("/crew");
		case "pending_approval":
			redirect("/pending");
	}
}
