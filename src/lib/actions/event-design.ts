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

	// Read current state to decide whether to bump status
	const { data: event } = await supabase
		.from("events")
		.select("status, design_brief_at")
		.eq("id", eventId)
		.maybeSingle();

	const updates: Record<string, unknown> = {
		design_drive_folder_url: parsed.data.design_drive_folder_url,
		updated_at: new Date().toISOString(),
	};
	if (!event?.design_brief_at) {
		updates.design_brief_at = new Date().toISOString();
	}
	// Only auto-promote if currently before design phase
	if (event && (event.status === "confirmed" || event.status === "draft")) {
		updates.status = "design_brief";
	}

	const { error } = await supabase
		.from("events")
		.update(updates)
		.eq("id", eventId);
	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}`);
	return undefined;
}

export async function approveDesign(
	eventId: string,
	projectId: string,
): Promise<{ error?: string }> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { data: event } = await supabase
		.from("events")
		.select("status, design_drive_folder_url, design_approved_at")
		.eq("id", eventId)
		.maybeSingle();

	if (!event) return { error: "Event tidak ditemukan" };
	if (!event.design_drive_folder_url) {
		return { error: "Upload design dulu sebelum approve" };
	}
	if (event.design_approved_at) {
		return { error: "Design sudah di-approve sebelumnya" };
	}

	const updates: Record<string, unknown> = {
		design_approved_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};
	if (event.status === "design_brief" || event.status === "confirmed") {
		updates.status = "design_approved";
	}

	const { error } = await supabase
		.from("events")
		.update(updates)
		.eq("id", eventId);
	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}`);
	return {};
}

export async function unapproveDesign(
	eventId: string,
	projectId: string,
): Promise<{ error?: string }> {
	const me = await getCurrentUser();
	if (!me) return { error: "Unauthorized" };
	if (me.profile.role !== "super_admin") {
		return { error: "Hanya super_admin yang bisa unapprove design" };
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("events")
		.update({
			design_approved_at: null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", eventId);
	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}`);
	return {};
}
