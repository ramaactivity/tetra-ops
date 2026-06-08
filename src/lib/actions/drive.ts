"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { withTimeout } from "@/lib/csv-import/resilience";
import type { DriveCategory } from "@/lib/drive/categories";
import {
	countFolderFiles,
	ensureEventTree,
	ensureFolder,
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

const FOLDER_CREATE_TIMEOUT_MS = 15_000;

type DriveFolderRef = { id: string; url: string };
type DriveFoldersMap = Record<string, DriveFolderRef>;

/**
 * Idempotent: ensures the structured event folder tree
 * (Parent / Year / Month / Event Name) and persists the root to the event.
 * Internal — no auth gate; call from gated actions or internal hooks (booking).
 */
export async function createEventFolderInternal(
	eventId: string,
): Promise<CreateEventFolderResult> {
	if (!isDriveConfigured()) {
		return {
			error: `Drive belum di-set di env: ${getDriveConfigErrors().join(", ")}`,
		};
	}

	const admin = createAdminClient();
	const { data: existing, error: fetchErr } = await admin
		.from("events")
		.select(
			"id, project_id, client_name, event_date, drive_folder_id, drive_folder_url",
		)
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

	try {
		const created = await withTimeout(
			() =>
				ensureEventTree({
					clientName: (existing.client_name as string) ?? "Event",
					eventDate: (existing.event_date as string | null) ?? null,
				}),
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
 * Ensure (and cache) a per-event category subfolder. Returns its id + url.
 * Caches into events.drive_folders so repeat calls skip Drive entirely.
 * Internal — no auth gate.
 */
export async function ensureEventCategoryFolderInternal(
	eventId: string,
	category: DriveCategory,
): Promise<{ id?: string; url?: string; error?: string }> {
	if (!isDriveConfigured()) {
		return {
			error: `Drive belum di-set: ${getDriveConfigErrors().join(", ")}`,
		};
	}

	const admin = createAdminClient();
	const { data: ev } = await admin
		.from("events")
		.select("id, drive_folder_id, drive_folders")
		.eq("id", eventId)
		.maybeSingle();
	if (!ev) return { error: "Event tidak ditemukan" };

	const cache = (ev.drive_folders ?? {}) as DriveFoldersMap;
	const cached = cache[category];
	if (cached?.id && cached.url) return { id: cached.id, url: cached.url };

	// Ensure the event root exists first.
	let rootId = ev.drive_folder_id as string | null;
	if (!rootId) {
		const root = await createEventFolderInternal(eventId);
		if (root.error || !root.folder_id) {
			return { error: root.error ?? "Gagal membuat folder event" };
		}
		rootId = root.folder_id;
	}

	try {
		const folder = await ensureFolder(category, rootId);
		const next: DriveFoldersMap = {
			...cache,
			[category]: { id: folder.id, url: folder.webViewLink },
		};
		await admin
			.from("events")
			.update({ drive_folders: next })
			.eq("id", eventId);
		return { id: folder.id, url: folder.webViewLink };
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : "Drive subfolder gagal",
		};
	}
}

/** Owner/crew-callable: get a category folder url (e.g. Footage) for an event. */
export async function getEventCategoryFolderUrl(
	projectId: string,
	category: DriveCategory,
): Promise<{ url?: string; error?: string }> {
	const me = await getCurrentUser();
	if (!me) return { error: "Unauthorized" };

	const supabase = await createClient();
	const { data: event } = await supabase
		.from("events")
		.select("id")
		.eq("project_id", projectId)
		.maybeSingle();
	if (!event) return { error: "Event tidak ditemukan" };

	const res = await ensureEventCategoryFolderInternal(
		event.id as string,
		category,
	);
	return res.error ? { error: res.error } : { url: res.url };
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

/** Count files in an event's Footage subfolder (lazy, detail-page only). */
export async function getFootageFileCount(eventId: string): Promise<number> {
	const res = await ensureEventCategoryFolderInternal(eventId, "Footage");
	if (!res.id) return 0;
	return countFolderFiles(res.id);
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
