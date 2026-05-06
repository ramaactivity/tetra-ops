"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["super_admin", "owner", "crew", "pending_approval"] as const;
const TIERS = ["senior", "junior"] as const;

const RoleUpdateSchema = z
	.object({
		id: z.uuid(),
		role: z.enum(ROLES),
		tier: z.enum(TIERS).nullable(),
	})
	.refine(
		(data) => (data.role === "crew" ? data.tier !== null : data.tier === null),
		"Tier wajib untuk crew, harus null untuk role lain",
	);

export async function updateUserRole(
	id: string,
	role: (typeof ROLES)[number],
	tier: (typeof TIERS)[number] | null,
): Promise<{ error?: string }> {
	const me = await getCurrentUser();
	if (!me) return { error: "Unauthorized" };
	if (me.profile.role !== "super_admin") {
		return { error: "Hanya super_admin yang bisa ubah role" };
	}
	if (me.authId === id) {
		return { error: "Lu gak bisa ubah role lu sendiri" };
	}

	const parsed = RoleUpdateSchema.safeParse({ id, role, tier });
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("users")
		.update({ role: parsed.data.role, tier: parsed.data.tier })
		.eq("id", parsed.data.id);
	if (error) return { error: error.message };

	revalidatePath("/settings/crew");
	return {};
}
