"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export type SystemConfigFormState =
	| { error?: string; updated?: number }
	| undefined;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

/**
 * Form encoding:
 *   keys[] = list of config keys present in this submit
 *   type__<key> = "number" | "string" | "boolean" | "json"
 *   value__<key> = raw input (string from form; checkbox = "on" | "")
 */
export async function updateSystemConfigBatch(
	_prev: SystemConfigFormState,
	formData: FormData,
): Promise<SystemConfigFormState> {
	const me = await requireOwnerLevel();

	const keys = formData.getAll("keys").map((k) => String(k));
	if (keys.length === 0) return { error: "Tidak ada key untuk disimpan" };

	const supabase = await createClient();
	let updatedCount = 0;
	const errors: string[] = [];

	for (const key of keys) {
		const type = String(formData.get(`type__${key}`) ?? "string");
		const rawValue = formData.get(`value__${key}`);

		let parsedValue: unknown;
		try {
			if (type === "number") {
				const n = Number(rawValue);
				if (!Number.isFinite(n)) {
					errors.push(`${key}: bukan angka valid`);
					continue;
				}
				parsedValue = n;
			} else if (type === "boolean") {
				parsedValue = rawValue === "on" || rawValue === "true";
			} else if (type === "json") {
				const text = String(rawValue ?? "").trim();
				if (!text) {
					errors.push(`${key}: JSON kosong`);
					continue;
				}
				parsedValue = JSON.parse(text);
			} else {
				// string
				parsedValue = String(rawValue ?? "");
			}
		} catch (e) {
			errors.push(`${key}: ${e instanceof Error ? e.message : "parse error"}`);
			continue;
		}

		const { error } = await supabase
			.from("system_config")
			.update({
				value: parsedValue,
				updated_by: me.authId,
				updated_at: new Date().toISOString(),
			})
			.eq("key", key);

		if (error) {
			errors.push(`${key}: ${error.message}`);
		} else {
			updatedCount++;
		}
	}

	revalidatePath("/settings");

	if (errors.length > 0) {
		return {
			error: `${errors.length} error: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}`,
			updated: updatedCount,
		};
	}

	return { updated: updatedCount };
}
