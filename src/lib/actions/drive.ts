"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { withTimeout } from "@/lib/csv-import/resilience";
import {
	createDriveFolder,
	getDriveConfigErrors,
	isDriveConfigured,
} from "@/lib/drive/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CreateEventFolderResult = {
	ok?: boolean;
	error?: string;
	folder_id?: string;
	folder_url?: string;
	already_existed?: boolean;
};

const FOLDER_CREATE_TIMEOUT_MS = 8_000;

function buildFolderName(projectId: string, clientName: string): string {
	const safe = clientName
		.replace(/[\\/:*?"<>|]/g, " ")
		.trim()
		.slice(0, 80);
	return `${projectId} ${safe}`;
}

/**
 * Idempotent: returns existing folder if event already has one.
 * Internal version: no auth gate — only call from authenticated server actions
 * that gate themselves, or from internal hooks (e.g., right after createBooking
 * inserts the row).
 */
export async function createEventFolderInternal(
	eventId: string,
): Promise<CreateEventFolderResult> {
	if (!isDriveConfigured()) {
		const missing = getDriveConfigErrors();
		return {
			error: `Drive belum di-set di env: ${missing.join(", ")}`,
		};
	}

	const admin = createAdminClient();
	const { data: existing, error: fetchErr } = await admin
		.from("events")
		.select("id, project_id, client_name, drive_folder_id, drive_folder_url")
		.eq("id", eventId)
		.maybeSingle();

	if (fetchErr) return { error: fetchErr.message };
	if (!existing) return { error: "Event tidak ditemukan" };

	if (existing.drive_folder_id && existing.drive_folder_url) {
		return {
			ok: true,
			folder_id: existing.drive_folder_id as string,
			folder_url: existing.drive_folder_url as string,
			already_existed: true,
		};
	}

	const folderName = buildFolderName(
		existing.project_id as string,
		(existing.client_name as string) ?? "Event",
	);

	try {
		const created = await withTimeout(
			() => createDriveFolder(folderName),
			FOLDER_CREATE_TIMEOUT_MS,
			"createEventFolder",
		);

		const { error: updateErr } = await admin
			.from("events")
			.update({
				drive_folder_id: created.id,
				drive_folder_url: created.webViewLink,
				drive_folder_created_at: new Date().toISOString(),
			})
			.eq("id", eventId);

		if (updateErr) {
			return { error: `Folder dibuat tapi gagal save: ${updateErr.message}` };
		}

		revalidatePath(`/operations/${existing.project_id}`);
		return {
			ok: true,
			folder_id: created.id,
			folder_url: created.webViewLink,
			already_existed: false,
		};
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : "Drive create failed",
		};
	}
}

/**
 * User-callable: gates auth (owner / super_admin only) then defers to internal.
 */
export async function createEventFolder(
	projectId: string,
): Promise<CreateEventFolderResult> {
	const me = await getCurrentUser();
	if (!me) return { error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { error: "Hanya owner / super_admin" };
	}

	const supabase = await createClient();
	const { data: event, error } = await supabase
		.from("events")
		.select("id")
		.eq("project_id", projectId)
		.maybeSingle();
	if (error) return { error: error.message };
	if (!event) return { error: "Event tidak ditemukan" };

	return createEventFolderInternal(event.id as string);
}

export async function getDriveStatus(): Promise<{
	configured: boolean;
	missing: string[];
}> {
	return {
		configured: isDriveConfigured(),
		missing: getDriveConfigErrors(),
	};
}
