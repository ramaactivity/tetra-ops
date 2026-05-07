"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const NonNegInt = z.coerce.number().int().nonnegative().default(0);

const RekapInputSchema = z.object({
	cetak_total: NonNegInt,
	media_set_used: NonNegInt,
	sleeve_used: NonNegInt,
	flashdisk_used: NonNegInt,
	pouch_used: NonNegInt,
	photomagnet_used: NonNegInt,
	keychain_used: NonNegInt,
	proof_photo_urls: z
		.string()
		.trim()
		.transform((v) =>
			v
				? v
						.split(/[\n,]/)
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
		)
		.refine((arr) => arr.length > 0, {
			message: "Minimal 1 URL foto bukti",
		}),
	crew_notes: z
		.string()
		.trim()
		.max(1000)
		.optional()
		.transform((v) => (v ? v : null)),
});

export type RekapInput = z.infer<typeof RekapInputSchema>;
type RekapErrors = Partial<Record<keyof RekapInput | "_form", string[]>>;
export type RekapFormState =
	| { errors?: RekapErrors; values?: Record<string, string>; success?: true }
	| undefined;

async function requireOwnerOrCrew() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (
		me.profile.role !== "super_admin" &&
		me.profile.role !== "owner" &&
		me.profile.role !== "crew"
	) {
		throw new Error("Forbidden");
	}
	return me;
}

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = [
		"cetak_total",
		"media_set_used",
		"sleeve_used",
		"flashdisk_used",
		"pouch_used",
		"photomagnet_used",
		"keychain_used",
		"proof_photo_urls",
		"crew_notes",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	return out;
}

export async function submitRekap(
	eventId: string,
	projectId: string,
	_prev: RekapFormState,
	formData: FormData,
): Promise<RekapFormState> {
	const me = await requireOwnerOrCrew();

	const parsed = RekapInputSchema.safeParse({
		cetak_total: formData.get("cetak_total"),
		media_set_used: formData.get("media_set_used"),
		sleeve_used: formData.get("sleeve_used"),
		flashdisk_used: formData.get("flashdisk_used"),
		pouch_used: formData.get("pouch_used"),
		photomagnet_used: formData.get("photomagnet_used"),
		keychain_used: formData.get("keychain_used"),
		proof_photo_urls: formData.get("proof_photo_urls"),
		crew_notes: formData.get("crew_notes"),
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as RekapErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();

	// Upsert by event_id (UNIQUE)
	const { data: existing } = await supabase
		.from("crew_rekap")
		.select("id")
		.eq("event_id", eventId)
		.maybeSingle();

	const payload = {
		event_id: eventId,
		submitted_by: me.authId,
		cetak_total: parsed.data.cetak_total,
		media_set_used: parsed.data.media_set_used,
		sleeve_used: parsed.data.sleeve_used,
		flashdisk_used: parsed.data.flashdisk_used,
		pouch_used: parsed.data.pouch_used,
		photomagnet_used: parsed.data.photomagnet_used,
		keychain_used: parsed.data.keychain_used,
		proof_photo_urls: parsed.data.proof_photo_urls,
		crew_notes: parsed.data.crew_notes,
	};

	if (existing) {
		const { error } = await supabase
			.from("crew_rekap")
			.update(payload)
			.eq("id", existing.id);
		if (error) {
			return {
				errors: { _form: [error.message] },
				values: snapshotValues(formData),
			};
		}
	} else {
		const { error } = await supabase.from("crew_rekap").insert(payload);
		if (error) {
			return {
				errors: { _form: [error.message] },
				values: snapshotValues(formData),
			};
		}
	}

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/settle`);
	return { success: true };
}

export async function reviewRekap(
	rekapId: string,
	projectId: string,
	approved: boolean,
	notes: string,
): Promise<{ error?: string }> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();

	const { error } = await supabase
		.from("crew_rekap")
		.update({
			is_approved: approved,
			reviewed_by: me.authId,
			reviewed_at: new Date().toISOString(),
			review_notes: notes.trim() || null,
		})
		.eq("id", rekapId);
	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	return {};
}
