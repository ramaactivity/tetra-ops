"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const PHONE_REGEX = /^[\d\s\-+()]{8,20}$/;

const ProfileSchema = z.object({
	full_name: z.string().trim().min(2, "min. 2 karakter").max(120),
	nickname: z
		.string()
		.trim()
		.max(60)
		.optional()
		.transform((v) => (v ? v : null)),
	phone_wa: z
		.string()
		.trim()
		.regex(PHONE_REGEX, "format nomor invalid")
		.transform((v) => v.replace(/[\s\-()]/g, "")),
});

export type OnboardingFormState =
	| { error?: string; ok?: boolean }
	| undefined;

export async function completeCrewProfile(
	_prev: OnboardingFormState,
	formData: FormData,
): Promise<OnboardingFormState> {
	const me = await getCurrentUser();
	if (!me) return { error: "Unauthorized" };
	if (me.profile.role !== "pending_approval" && me.profile.role !== "crew") {
		return { error: "Profile onboarding only for crew" };
	}

	const parsed = ProfileSchema.safeParse({
		full_name: String(formData.get("full_name") ?? ""),
		nickname: String(formData.get("nickname") ?? ""),
		phone_wa: String(formData.get("phone_wa") ?? ""),
	});

	if (!parsed.success) {
		return {
			error: parsed.error.issues
				.map((iss) =>
					iss.path.length
						? `${iss.path.join(".")}: ${iss.message}`
						: iss.message,
				)
				.join("; "),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("users")
		.update({
			full_name: parsed.data.full_name,
			nickname: parsed.data.nickname,
			phone_wa: parsed.data.phone_wa,
			updated_at: new Date().toISOString(),
		})
		.eq("id", me.profile.id);

	if (error) return { error: error.message };

	revalidatePath("/onboarding");
	revalidatePath("/pending");
	revalidatePath("/crew/profile");
	revalidatePath("/settings/crew");

	// Crew with completed profile → /pending (waiting for owner approval).
	// Already-approved crew (edited via /crew/profile) → /crew.
	const next = me.profile.role === "crew" ? "/crew" : "/pending";
	redirect(next);
}
