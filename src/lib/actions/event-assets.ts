"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { ASSET_TYPES, type AssetType } from "@/lib/event-assets/types";
import { createClient } from "@/lib/supabase/server";

function isAssetType(v: string): v is AssetType {
	return (ASSET_TYPES as readonly string[]).includes(v);
}

function isValidUrl(s: string): boolean {
	try {
		const u = new URL(s);
		return u.protocol === "http:" || u.protocol === "https:";
	} catch {
		return false;
	}
}

export async function addEventAsset(
	eventId: string,
	formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Not authenticated" };

	const assetType = String(formData.get("asset_type") ?? "");
	const label = String(formData.get("label") ?? "").trim();
	const url = String(formData.get("url") ?? "").trim();
	const notes = String(formData.get("notes") ?? "").trim() || null;

	if (!isAssetType(assetType))
		return { ok: false, error: "asset_type tidak valid" };
	if (!label) return { ok: false, error: "Label wajib diisi" };
	if (!url) return { ok: false, error: "URL wajib diisi" };
	if (!isValidUrl(url))
		return { ok: false, error: "URL harus diawali http:// atau https://" };

	const supabase = await createClient();

	// Resolve event id from project_id if needed
	let resolvedEventId = eventId;
	if (!eventId.includes("-") || eventId.startsWith("PRJ-")) {
		const { data: ev } = await supabase
			.from("events")
			.select("id")
			.eq("project_id", eventId)
			.maybeSingle();
		if (!ev) return { ok: false, error: "Event tidak ditemukan" };
		resolvedEventId = ev.id;
	}

	const { error } = await supabase.from("event_assets").insert({
		event_id: resolvedEventId,
		asset_type: assetType,
		label,
		url,
		notes,
		uploaded_by: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	revalidatePath("/design");
	revalidatePath(`/design/${eventId}`);
	revalidatePath(`/operations/${eventId}`);
	return { ok: true };
}

/**
 * Insert a design_frame asset for a file already uploaded to Drive (via the
 * upload route). Owner-level only. Stores drive_file_id for a download link.
 */
export async function addUploadedDesignAsset(
	projectId: string,
	payload: { url: string; fileId: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Not authenticated" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { ok: false, error: "Hanya owner / super_admin" };
	}
	if (!payload.url || !isValidUrl(payload.url)) {
		return { ok: false, error: "URL Drive tidak valid" };
	}
	if (!payload.fileId) return { ok: false, error: "Drive file id kosong" };

	const supabase = await createClient();
	const { data: ev } = await supabase
		.from("events")
		.select("id")
		.eq("project_id", projectId)
		.maybeSingle();
	if (!ev) return { ok: false, error: "Event tidak ditemukan" };

	const { error } = await supabase.from("event_assets").insert({
		event_id: ev.id,
		asset_type: "design_frame",
		label: payload.name || "Design frame",
		url: payload.url,
		drive_file_id: payload.fileId,
		uploaded_by: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	revalidatePath("/design");
	revalidatePath(`/design/${projectId}`);
	return { ok: true };
}

export async function updateEventAsset(
	assetId: string,
	formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Not authenticated" };

	const label = String(formData.get("label") ?? "").trim();
	const url = String(formData.get("url") ?? "").trim();
	const notes = String(formData.get("notes") ?? "").trim() || null;

	if (!label) return { ok: false, error: "Label wajib diisi" };
	if (!url) return { ok: false, error: "URL wajib diisi" };
	if (!isValidUrl(url))
		return { ok: false, error: "URL harus diawali http:// atau https://" };

	const supabase = await createClient();
	const { error } = await supabase
		.from("event_assets")
		.update({ label, url, notes })
		.eq("id", assetId);
	if (error) return { ok: false, error: error.message };

	revalidatePath("/design");
	return { ok: true };
}

export async function deleteEventAsset(
	assetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Not authenticated" };

	const supabase = await createClient();
	const { error } = await supabase
		.from("event_assets")
		.delete()
		.eq("id", assetId);
	if (error) return { ok: false, error: error.message };

	revalidatePath("/design");
	return { ok: true };
}
