import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Creates an admin Supabase client using the service-role key, bypassing RLS.
 * NEVER import or use this in client components, browser code, or any path
 * that could ship to the client. Server-only.
 */
export function createAdminClient() {
	return createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!,
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		},
	);
}
