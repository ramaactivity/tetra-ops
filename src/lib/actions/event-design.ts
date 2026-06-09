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

const DesignLinkSchema = z.object({
	url: z
		.string()
		.trim()
		.url("Harus URL valid (https://drive.google.com/...)")
		.max(500),
	label: z.string().trim().max(120).optional(),
});

export type DesignFormState =
	| { error?: string; values?: Record<string, string> }
	| undefined;

/**
 * Add a design link from the Operations event page. This writes to the SAME
 * store as the Asset & Design page — an `event_assets` row of type
 * `design_frame` — so a link added here shows up there and vice versa (single
 * source of truth, no separate `design_drive_folder_url` silo).
 *
 * `events.design_drive_folder_url` is still mirrored to the latest link for
 * backward-compat (crew "Desain" shortcut + legacy readers), and design_status
 * is bumped off "belum" since adding a design means work has started.
 */
export async function addDesignLink(
	eventId: string,
	projectId: string,
	_prev: DesignFormState,
	formData: FormData,
): Promise<DesignFormState> {
	const me = await requireOwnerLevel();

	const parsed = DesignLinkSchema.safeParse({
		url: formData.get("url"),
		label: formData.get("label") ?? undefined,
	});
	if (!parsed.success) {
		return {
			error: parsed.error.issues[0]?.message ?? "Invalid input",
			values: { url: String(formData.get("url") ?? "") },
		};
	}

	const supabase = await createClient();

	const { error: assetErr } = await supabase.from("event_assets").insert({
		event_id: eventId,
		asset_type: "design_frame",
		label: parsed.data.label || "Design link",
		url: parsed.data.url,
		uploaded_by: me.profile.id,
	});
	if (assetErr) return { error: assetErr.message };

	const { data: cur } = await supabase
		.from("events")
		.select("design_brief_at, design_status")
		.eq("id", eventId)
		.maybeSingle();

	const now = new Date().toISOString();
	const updates: Record<string, unknown> = {
		design_drive_folder_url: parsed.data.url,
		updated_at: now,
	};
	if (!cur?.design_brief_at) updates.design_brief_at = now;
	// Adding a design means work has started — move off "belum". Does NOT touch
	// the event lifecycle status.
	if (cur?.design_status === "belum" || !cur?.design_status) {
		updates.design_status = "proses";
	}
	await supabase.from("events").update(updates).eq("id", eventId);

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/design/${projectId}`);
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
	// Invoked from a client startTransition without try/catch — never throw,
	// always resolve with { error } so a failure can't crash the page.
	try {
		const me = await getCurrentUser();
		if (!me) return { error: "Sesi berakhir. Refresh halaman lalu coba lagi." };
		if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
			return { error: "Hanya owner yang bisa mengubah status design." };
		}
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
	} catch (err) {
		return {
			error:
				err instanceof Error ? err.message : "Gagal mengubah status design.",
		};
	}
}
