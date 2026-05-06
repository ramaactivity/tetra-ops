"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const CHANNELS = ["direct", "vendor", "relasi"] as const;
const SERVICE_TYPES = [
	"photobooth_classic",
	"videobooth_360",
	"magazine_combo",
	"magazine_box_only",
	"photostage_only",
	"photostage_combo",
] as const;
const FRAME_SIZES = ["2R", "4R", "polaroid", "none"] as const;

export const BookingInputSchema = z.object({
	channel: z.enum(CHANNELS),
	client_name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	client_wa: z
		.string()
		.trim()
		.min(8, "Nomor WA terlalu pendek")
		.max(20, "Nomor WA terlalu panjang"),
	client_email: z
		.string()
		.trim()
		.email("Format email tidak valid")
		.max(120)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	service_type: z.enum(SERVICE_TYPES),
	package_id: z
		.string()
		.uuid()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	frame_size: z.enum(FRAME_SIZES),
	event_category: z.string().trim().min(2, "Minimal 2 karakter").max(60),
	event_date: z.iso.date("Format tanggal tidak valid"),
	setup_time: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM"),
	start_time: z.string().regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM"),
	end_time: z.string().regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM"),
	venue_name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	venue_address: z
		.string()
		.trim()
		.max(255)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	venue_city: z
		.string()
		.trim()
		.max(60)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
});

export type BookingInput = z.infer<typeof BookingInputSchema>;

type BookingErrors = Partial<Record<keyof BookingInput | "_form", string[]>>;

export type BookingFormState =
	| {
			errors?: BookingErrors;
			values?: Record<string, string>;
	  }
	| undefined;

function parseFormData(formData: FormData) {
	return BookingInputSchema.safeParse({
		channel: formData.get("channel"),
		client_name: formData.get("client_name"),
		client_wa: formData.get("client_wa"),
		client_email: formData.get("client_email"),
		service_type: formData.get("service_type"),
		package_id: formData.get("package_id"),
		frame_size: formData.get("frame_size"),
		event_category: formData.get("event_category"),
		event_date: formData.get("event_date"),
		setup_time: formData.get("setup_time"),
		start_time: formData.get("start_time"),
		end_time: formData.get("end_time"),
		venue_name: formData.get("venue_name"),
		venue_address: formData.get("venue_address"),
		venue_city: formData.get("venue_city"),
	});
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = [
		"channel",
		"client_name",
		"client_wa",
		"client_email",
		"service_type",
		"package_id",
		"frame_size",
		"event_category",
		"event_date",
		"setup_time",
		"start_time",
		"end_time",
		"venue_name",
		"venue_address",
		"venue_city",
	];
	return Object.fromEntries(
		keys.map((k) => [k, String(formData.get(k) ?? "")]),
	);
}

function generateProjectId(eventDateISO: string): string {
	const compact = eventDateISO.replaceAll("-", "");
	const suffix = randomInt(1000, 10000);
	return `PRJ-${compact}-${suffix}`;
}

async function requireOwnerLevel() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");
	if (user.profile.role !== "super_admin" && user.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return user;
}

export async function createBooking(
	_prev: BookingFormState,
	formData: FormData,
): Promise<BookingFormState> {
	await requireOwnerLevel();

	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as BookingErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();
	const projectId = generateProjectId(parsed.data.event_date);

	const { error } = await supabase.from("events").insert({
		project_id: projectId,
		status: "draft",
		channel: parsed.data.channel,
		client_name: parsed.data.client_name,
		client_wa: parsed.data.client_wa,
		client_email: parsed.data.client_email,
		service_type: parsed.data.service_type,
		package_id: parsed.data.package_id,
		frame_size: parsed.data.frame_size,
		event_category: parsed.data.event_category,
		event_date: parsed.data.event_date,
		setup_time: parsed.data.setup_time,
		start_time: parsed.data.start_time,
		end_time: parsed.data.end_time,
		venue_name: parsed.data.venue_name,
		venue_address: parsed.data.venue_address,
		venue_city: parsed.data.venue_city,
	});

	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	revalidatePath("/operations");
	redirect("/operations");
}
