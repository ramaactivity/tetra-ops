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

const CheckOutSchema = z.object({
	item_id: z.uuid(),
	event_id: z.uuid(),
	to_crew_id: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	notes: z
		.string()
		.trim()
		.max(300)
		.optional()
		.transform((v) => (v ? v : null)),
});

export async function checkOutEquipment(
	itemId: string,
	eventId: string,
	projectId: string,
	formData: FormData,
): Promise<{ error?: string }> {
	const me = await requireOwnerLevel();

	const parsed = CheckOutSchema.safeParse({
		item_id: itemId,
		event_id: eventId,
		to_crew_id: formData.get("to_crew_id"),
		notes: formData.get("notes"),
	});
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	const supabase = await createClient();

	const { data: item, error: itemErr } = await supabase
		.from("inventory_items")
		.select("id, category, current_location, current_event_id")
		.eq("id", itemId)
		.maybeSingle();

	if (itemErr) return { error: itemErr.message };
	if (!item) return { error: "Item tidak ditemukan" };
	if (item.category !== "equipment") {
		return { error: "Item bukan equipment" };
	}
	if (item.current_event_id && item.current_event_id !== eventId) {
		return { error: "Equipment masih di-check-out ke event lain" };
	}

	const fromLocation = item.current_location ?? "gudang_pusat";
	const toLocation = parsed.data.to_crew_id ? "crew_carry" : "event";

	const { error: moveErr } = await supabase.from("equipment_movements").insert({
		item_id: itemId,
		from_location: fromLocation,
		to_location: toLocation,
		to_event_id: eventId,
		to_crew_id: parsed.data.to_crew_id,
		movement_type: "check_out",
		notes: parsed.data.notes,
		performed_by: me.authId,
	});
	if (moveErr) return { error: moveErr.message };

	const { error: updErr } = await supabase
		.from("inventory_items")
		.update({
			current_location: toLocation,
			current_event_id: eventId,
			current_crew_id: parsed.data.to_crew_id,
			updated_at: new Date().toISOString(),
		})
		.eq("id", itemId);
	if (updErr) return { error: updErr.message };

	revalidatePath(`/operations/${projectId}/equipment`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath("/warehouse");
	return {};
}

export async function checkInEquipment(
	itemId: string,
	eventId: string,
	projectId: string,
): Promise<{ error?: string }> {
	const me = await requireOwnerLevel();

	const supabase = await createClient();

	const { data: item, error: itemErr } = await supabase
		.from("inventory_items")
		.select("id, current_location, current_event_id, current_crew_id")
		.eq("id", itemId)
		.maybeSingle();

	if (itemErr) return { error: itemErr.message };
	if (!item) return { error: "Item tidak ditemukan" };
	if (item.current_event_id !== eventId) {
		return { error: "Equipment tidak terdaftar di event ini" };
	}

	const { error: moveErr } = await supabase.from("equipment_movements").insert({
		item_id: itemId,
		from_location: item.current_location ?? "event",
		to_location: "gudang_pusat",
		from_event_id: eventId,
		from_crew_id: item.current_crew_id,
		movement_type: "check_in",
		notes: null,
		performed_by: me.authId,
	});
	if (moveErr) return { error: moveErr.message };

	const { error: updErr } = await supabase
		.from("inventory_items")
		.update({
			current_location: "gudang_pusat",
			current_event_id: null,
			current_crew_id: null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", itemId);
	if (updErr) return { error: updErr.message };

	revalidatePath(`/operations/${projectId}/equipment`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath("/warehouse");
	return {};
}

const IncidentSchema = z.object({
	item_id: z.uuid(),
	event_id: z.uuid(),
	severity: z.enum(["minor", "major", "total"], "Pilih severity"),
	description: z
		.string()
		.trim()
		.min(5, "Minimal 5 karakter")
		.max(500, "Maksimal 500 karakter"),
	what_happened: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	location_of_incident: z
		.string()
		.trim()
		.max(200)
		.optional()
		.transform((v) => (v ? v : null)),
	witnesses: z
		.string()
		.trim()
		.max(300)
		.optional()
		.transform((v) => (v ? v : null)),
	photo_urls: z
		.string()
		.trim()
		.optional()
		.transform((v) =>
			v
				? v
						.split(/[\n,]/)
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
		),
	mark_condition: z.enum(["normal", "service", "damaged", "lost"]).optional(),
});

export type IncidentFormState =
	| { error?: string; values?: Record<string, string> }
	| undefined;

export async function reportEquipmentIncident(
	itemId: string,
	eventId: string,
	projectId: string,
	_prev: IncidentFormState,
	formData: FormData,
): Promise<IncidentFormState> {
	const me = await requireOwnerLevel();

	const parsed = IncidentSchema.safeParse({
		item_id: itemId,
		event_id: eventId,
		severity: formData.get("severity"),
		description: formData.get("description"),
		what_happened: formData.get("what_happened"),
		location_of_incident: formData.get("location_of_incident"),
		witnesses: formData.get("witnesses"),
		photo_urls: formData.get("photo_urls"),
		mark_condition: formData.get("mark_condition") || undefined,
	});

	if (!parsed.success) {
		const out: Record<string, string> = {};
		for (const k of [
			"severity",
			"description",
			"what_happened",
			"location_of_incident",
			"witnesses",
			"photo_urls",
			"mark_condition",
		]) {
			out[k] = String(formData.get(k) ?? "");
		}
		return {
			error: parsed.error.issues[0]?.message ?? "Invalid input",
			values: out,
		};
	}

	const supabase = await createClient();
	const { error: insErr } = await supabase.from("equipment_incidents").insert({
		item_id: itemId,
		event_id: eventId,
		reported_by: me.authId,
		severity: parsed.data.severity,
		description: parsed.data.description,
		what_happened: parsed.data.what_happened,
		location_of_incident: parsed.data.location_of_incident,
		witnesses: parsed.data.witnesses,
		photo_urls: parsed.data.photo_urls,
	});

	if (insErr) return { error: insErr.message };

	// Optional: update item condition
	if (parsed.data.mark_condition) {
		await supabase
			.from("inventory_items")
			.update({
				condition: parsed.data.mark_condition,
				updated_at: new Date().toISOString(),
			})
			.eq("id", itemId);
	}

	revalidatePath(`/operations/${projectId}/equipment`);
	revalidatePath(`/operations/${projectId}`);
	return undefined;
}
