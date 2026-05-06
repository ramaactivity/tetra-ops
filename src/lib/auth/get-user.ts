import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "super_admin" | "owner" | "crew" | "pending_approval";

export type UserProfile = {
	id: string;
	email: string;
	full_name: string;
	role: UserRole;
	is_active: boolean;
};

export type CurrentUser = {
	authId: string;
	email: string;
	profile: UserProfile;
};

export const getCurrentUser = cache(
	async (): Promise<CurrentUser | null> => {
		const supabase = await createClient();
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user) return null;

		const { data: profile } = await supabase
			.from("users")
			.select("id, email, full_name, role, is_active")
			.eq("id", user.id)
			.single<UserProfile>();

		if (!profile) return null;

		return {
			authId: user.id,
			email: user.email ?? profile.email,
			profile,
		};
	},
);
