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

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
	const supabase = await createClient();
	// getClaims() verifies the JWT signature locally against the project's
	// asymmetric (ES256) signing key — no network round-trip to the Auth
	// server like getUser() does. Wrapped in React cache() so layout + page
	// + topbar share one call per render. Authoritative authorization still
	// flows from the `users` row below (role + is_active) and RLS at the DB.
	// Fails closed: any verification error → null → treated as signed-out.
	const { data: claimsData } = await supabase.auth.getClaims();
	const claims = claimsData?.claims;
	if (!claims?.sub) return null;

	const { data: profile } = await supabase
		.from("users")
		.select("id, email, full_name, role, is_active")
		.eq("id", claims.sub)
		.single<UserProfile>();

	if (!profile) return null;

	return {
		authId: claims.sub,
		email:
			(typeof claims.email === "string" ? claims.email : null) ?? profile.email,
		profile,
	};
});
