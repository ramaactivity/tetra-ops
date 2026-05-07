"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["super_admin", "owner", "crew", "pending_approval"] as const;
const TIERS = ["senior", "junior"] as const;

async function requireSuperAdmin() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin") {
		throw new Error("Hanya super_admin yang bisa ubah crew");
	}
	return me;
}

// ─────────────────────────────────────────────────────────────────────────
// Update role + tier
// ─────────────────────────────────────────────────────────────────────────

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
	try {
		const me = await requireSuperAdmin();
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
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Edit profile fields (full_name, nickname, phone_wa, fee_override, notes)
// ─────────────────────────────────────────────────────────────────────────

const ProfileEditSchema = z.object({
	id: z.uuid(),
	full_name: z.string().trim().min(2).max(120),
	nickname: z
		.string()
		.trim()
		.max(60)
		.optional()
		.transform((v) => (v ? v : null)),
	phone_wa: z
		.string()
		.trim()
		.max(40)
		.optional()
		.transform((v) => (v ? v : null)),
	default_fee_override: z
		.union([z.coerce.number().int().nonnegative(), z.literal("")])
		.optional()
		.transform((v) => (typeof v === "number" ? v : null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
});

export type ProfileEditFormState =
	| { ok?: boolean; error?: string }
	| undefined;

export async function updateCrewProfile(
	_prev: ProfileEditFormState,
	formData: FormData,
): Promise<ProfileEditFormState> {
	try {
		await requireSuperAdmin();
		const parsed = ProfileEditSchema.safeParse({
			id: formData.get("id"),
			full_name: String(formData.get("full_name") ?? ""),
			nickname: String(formData.get("nickname") ?? ""),
			phone_wa: String(formData.get("phone_wa") ?? ""),
			default_fee_override: String(
				formData.get("default_fee_override") ?? "",
			),
			notes: String(formData.get("notes") ?? ""),
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

		const { id, ...payload } = parsed.data;
		const supabase = await createClient();
		const { error } = await supabase
			.from("users")
			.update({
				...payload,
				updated_at: new Date().toISOString(),
			})
			.eq("id", id);
		if (error) return { error: error.message };

		revalidatePath("/settings/crew");
		return { ok: true };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Deactivate / reactivate (soft state, keeps history)
// ─────────────────────────────────────────────────────────────────────────

export async function setCrewActive(
	id: string,
	isActive: boolean,
): Promise<{ error?: string }> {
	try {
		const me = await requireSuperAdmin();
		if (me.authId === id && !isActive) {
			return { error: "Lu gak bisa nonaktifin akun lo sendiri" };
		}
		const supabase = await createClient();
		const { error } = await supabase
			.from("users")
			.update({
				is_active: isActive,
				updated_at: new Date().toISOString(),
			})
			.eq("id", id);
		if (error) return { error: error.message };

		revalidatePath("/settings/crew");
		return {};
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
