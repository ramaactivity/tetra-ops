import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * users.id owner yang dicatat sebagai pelaku tulisan dari jalur tanpa sesi
 * (MCP Hermes, bot WA). MCP_ACTOR_EMAIL menentukan orangnya; cadangan: owner
 * aktif yang paling lama terdaftar.
 */
export async function resolveOwnerActorId(
	supabase: SupabaseClient,
): Promise<string | null> {
	const email = process.env.MCP_ACTOR_EMAIL?.trim();
	let q = supabase
		.from("users")
		.select("id")
		.in("role", ["owner", "super_admin"])
		.eq("is_active", true);
	q = email ? q.eq("email", email) : q.order("created_at");
	const { data } = await q.limit(1).maybeSingle();
	return (data?.id as string | undefined) ?? null;
}
