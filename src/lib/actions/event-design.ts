"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const DesignBriefSchema = z.object({
	design_drive_folder_url: z
		.string()
		.trim()
		.url("Harus URL valid (https://drive.google.com/...)")
		.max(500),
});

export type DesignFormState =
	| { error?: string; values?: Record<string, string> }
	| undefined;

export async function saveDesignBrief(
	eventId: string,
	projectId: string,
	_prev: DesignFormState,
	formData: FormData,
): Promise<DesignFormState> {
	await requireOwnerLevel();

	const parsed = DesignBriefSchema.safeParse({
		design_drive_folder_url: formData.get("design_drive_folder_url"),
	});
	if (!parsed.success) {
		return {
			error: parsed.error.issues[0]?.message ?? "Invalid input",
			values: {
				design_drive_folder_url: String(
					formData.get("design_drive_folder_url") ?? "",
				),
			},
		};
	}

	const supabase = await createClient();

	const { data: cur } = await supabase
		.from("events")
		.select("design_brief_at, design_status")
		.eq("id", eventId)
		.maybeSingle();

	const updates: Record<string, unknown> = {
		design_drive_folder_url: parsed.data.design_drive_folder_url,
		updated_at: new Date().toISOString(),
	};
	if (!cur?.design_brief_at) {
		updates.design_brief_at = new Date().toISOString();
	}
	// Uploading a design link means work has started — move design status off
	// "belum". Does NOT touch the event lifecycle status anymore.
	if (cur?.design_status === "belum" || !cur?.design_status) {
		updates.design_status = "proses";
	}

	const { error } = await supabase
		.from("events")
		.update(updates)
		.eq("id", eventId);
	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}`);
	revalidatePath("/design");
	return undefined;
}

const DESIGN_STATUSES = ["belum", "proses", "approved"] as const;
export type DesignStatusValue = (typeof DESIGN_STATUSES)[number];

/**
 * Set an event's design workflow status (belum | proses | approved). This is the
 * single entry point for design-status changes — used both on the Asset & Design
 * list and the event detail page. Kept independent of the event lifecycle status.
 * Design timestamps are synced for backward compatibility (readiness card etc.).
 */
export async function setDesignStatus(
	eventId: string,
	projectId: string,
	status: DesignStatusValue,
): Promise<{ error?: string }> {
	await requireOwnerLevel();
	if (!DESIGN_STATUSES.includes(status)) {
		return { error: "Status design tidak valid" };
	}

	const supabase = await createClient();
	const { data: cur } = await supabase
		.from("events")
		.select("design_brief_at")
		.eq("id", eventId)
		.maybeSingle();

	const now = new Date().toISOString();
	const updates: Record<string, unknown> = {
		design_status: status,
		design_approved_at: status === "approved" ? now : null,
		updated_at: now,
	};
	// First-touch timestamp when leaving "belum".
	if (status !== "belum" && !cur?.design_brief_at) {
		updates.design_brief_at = now;
	}

	const { error } = await supabase
		.from("events")
		.update(updates)
		.eq("id", eventId);
	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}`);
	revalidatePath("/design");
	return {};
}
