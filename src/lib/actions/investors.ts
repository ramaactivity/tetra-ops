"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

async function requireSuperAdmin() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin") {
		throw new Error("Forbidden — super_admin only");
	}
	return me;
}

const InvestorInputSchema = z.object({
	user_id: z.uuid(),
	share_pct: z
		.union([z.coerce.number().min(0).max(100), z.literal("")])
		.transform((v) => (v === "" ? null : v)),
	capital_contributed: z
		.union([z.coerce.number().int().nonnegative(), z.literal("")])
		.transform((v) => (v === "" ? null : v)),
	capital_contributed_at: z
		.union([z.iso.date(), z.literal("")])
		.transform((v) => (v === "" ? null : v)),
});

export async function updateInvestorShare(
	userId: string,
	formData: FormData,
): Promise<{ error?: string }> {
	await requireSuperAdmin();

	const parsed = InvestorInputSchema.safeParse({
		user_id: userId,
		share_pct: formData.get("share_pct") ?? "",
		capital_contributed: formData.get("capital_contributed") ?? "",
		capital_contributed_at: formData.get("capital_contributed_at") ?? "",
	});

	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("users")
		.update({
			share_pct: parsed.data.share_pct,
			capital_contributed: parsed.data.capital_contributed,
			capital_contributed_at: parsed.data.capital_contributed_at,
			updated_at: new Date().toISOString(),
		})
		.eq("id", parsed.data.user_id);

	if (error) return { error: error.message };

	revalidatePath("/settings/crew");
	return {};
}
