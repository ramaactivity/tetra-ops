"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createEventFolderInternal } from "@/lib/actions/drive";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isDriveConfigured } from "@/lib/drive/client";
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

const optionalString = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null));

const BookingInputSchema = z.object({
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
	setup_time: z.string().regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM"),
	start_time: z.string().regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM"),
	end_time: z.string().regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM"),
	venue_name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	venue_address: optionalString(255),
	venue_city: optionalString(60),
	google_maps_url: optionalString(500),
	// Channel-specific referrer fields (optional; required by UI based on channel)
	vendor_name: optionalString(120),
	vendor_contact: optionalString(60),
	vendor_commission_rate: z.coerce.number().min(0).max(100).optional().nullable(),
	vendor_commission_amount: z.coerce
		.number()
		.int()
		.min(0)
		.optional()
		.nullable(),
	referrer_user_id: z
		.string()
		.uuid()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	referrer_type: z.enum(["owner", "crew", "external"]).optional().nullable(),
	referrer_commission: z.coerce.number().int().min(0).optional().nullable(),
	// PIC at venue
	pic_name: optionalString(120),
	pic_wa: optionalString(20),
	// Customization (new model — backdrop master)
	backdrop_id: z
		.string()
		.uuid()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	vendor_decor_markup: z.coerce
		.number()
		.int()
		.min(0, "Tidak boleh negatif")
		.default(0),
	include_flashdisk_pouch: z.coerce.boolean(),
	// Financial
	base_price: z.coerce.number().int().min(0, "Tidak boleh negatif").default(0),
	discount_amount: z.coerce
		.number()
		.int()
		.min(0, "Tidak boleh negatif")
		.default(0),
	gross_up_pph_amount: z.coerce
		.number()
		.int()
		.min(0, "Tidak boleh negatif")
		.default(0),
	crew_notes: optionalString(500),
});

export type BookingInput = z.infer<typeof BookingInputSchema>;

type BookingErrors = Partial<Record<keyof BookingInput | "_form", string[]>>;

export type BookingFormState =
	| {
			errors?: BookingErrors;
			values?: Record<string, string>;
	  }
	| undefined;

const FORM_KEYS = [
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
	"google_maps_url",
	"vendor_name",
	"vendor_contact",
	"vendor_commission_rate",
	"vendor_commission_amount",
	"referrer_user_id",
	"referrer_type",
	"referrer_commission",
	"pic_name",
	"pic_wa",
	"backdrop_id",
	"vendor_decor_markup",
	"base_price",
	"discount_amount",
	"gross_up_pph_amount",
	"crew_notes",
] as const;

function parseFormData(formData: FormData) {
	const raw = Object.fromEntries(FORM_KEYS.map((k) => [k, formData.get(k)]));
	return BookingInputSchema.safeParse({
		...raw,
		include_flashdisk_pouch: formData.get("include_flashdisk_pouch") === "on",
	});
}

function snapshotValues(formData: FormData): Record<string, string> {
	return {
		...Object.fromEntries(
			FORM_KEYS.map((k) => [k, String(formData.get(k) ?? "")]),
		),
		include_flashdisk_pouch:
			formData.get("include_flashdisk_pouch") === "on" ? "on" : "",
	};
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

const AddonInputSchema = z.array(
	z.object({
		addon_id: z.uuid(),
		quantity: z.coerce.number().int().positive().max(99),
	}),
);

function parseAddonsJson(formData: FormData) {
	const raw = formData.get("addons_json");
	if (!raw || typeof raw !== "string" || raw === "") return [];
	try {
		return AddonInputSchema.parse(JSON.parse(raw));
	} catch {
		return [];
	}
}

async function snapshotAddons(
	supabase: Awaited<ReturnType<typeof createClient>>,
	raw: Array<{ addon_id: string; quantity: number }>,
): Promise<{
	rows: Array<{
		addon_id: string;
		quantity: number;
		unit_price: number;
		total_price: number;
	}>;
	total: number;
}> {
	if (raw.length === 0) return { rows: [], total: 0 };
	const ids = raw.map((r) => r.addon_id);
	const { data } = await supabase
		.from("addons")
		.select("id, price")
		.in("id", ids);
	const priceMap = new Map(
		(data ?? []).map((a) => [a.id as string, Number(a.price)]),
	);
	const rows = raw
		.map((r) => {
			const unit_price = priceMap.get(r.addon_id) ?? 0;
			return {
				addon_id: r.addon_id,
				quantity: r.quantity,
				unit_price,
				total_price: unit_price * r.quantity,
			};
		})
		.filter((r) => r.unit_price > 0);
	const total = rows.reduce((sum, r) => sum + r.total_price, 0);
	return { rows, total };
}

async function resolveBasePrice(
	supabase: Awaited<ReturnType<typeof createClient>>,
	input: BookingInput,
): Promise<number> {
	// Explicit base_price wins (user override, edit case)
	if (input.base_price > 0) return input.base_price;
	// Snapshot from selected package
	if (input.package_id) {
		const { data: pkg } = await supabase
			.from("packages")
			.select("base_price")
			.eq("id", input.package_id)
			.maybeSingle();
		if (pkg?.base_price) return pkg.base_price as number;
	}
	return 0;
}

function computeGrandTotal({
	base_price,
	addons_total,
	discount_amount,
	gross_up_pph_amount,
}: {
	base_price: number;
	addons_total: number;
	discount_amount: number;
	gross_up_pph_amount: number;
}): number {
	return Math.max(
		0,
		base_price + addons_total - discount_amount + gross_up_pph_amount,
	);
}

function buildEventPayload(
	input: BookingInput,
	basePrice: number,
	addonsTotal: number,
	backdropContribution: number,
) {
	const effectiveAddonsTotal = addonsTotal + backdropContribution;
	const grandTotal = computeGrandTotal({
		base_price: basePrice,
		addons_total: effectiveAddonsTotal,
		discount_amount: input.discount_amount,
		gross_up_pph_amount: input.gross_up_pph_amount,
	});

	return {
		channel: input.channel,
		client_name: input.client_name,
		client_wa: input.client_wa,
		client_email: input.client_email,
		service_type: input.service_type,
		package_id: input.package_id,
		frame_size: input.frame_size,
		event_category: input.event_category,
		event_date: input.event_date,
		setup_time: input.setup_time,
		start_time: input.start_time,
		end_time: input.end_time,
		venue_name: input.venue_name,
		venue_address: input.venue_address,
		venue_city: input.venue_city,
		google_maps_url: input.google_maps_url,
		// Channel referrer
		vendor_name: input.channel === "vendor" ? input.vendor_name : null,
		vendor_contact: input.channel === "vendor" ? input.vendor_contact : null,
		vendor_commission_rate:
			input.channel === "vendor" ? input.vendor_commission_rate : null,
		vendor_commission_amount:
			input.channel === "vendor" ? input.vendor_commission_amount : null,
		referrer_user_id:
			input.channel === "relasi" ? input.referrer_user_id : null,
		referrer_type: input.channel === "relasi" ? input.referrer_type : null,
		referrer_commission:
			input.channel === "relasi" ? input.referrer_commission : null,
		// PIC at venue
		pic_name: input.pic_name,
		pic_wa: input.pic_wa,
		backdrop_id: input.backdrop_id,
		vendor_decor_markup: input.vendor_decor_markup,
		// Legacy columns retained on the events table for back-compat with
		// historical data; new bookings populate them with neutral defaults.
		backdrop_source: "basic_tetra",
		backdrop_color: null,
		include_flashdisk_pouch: input.include_flashdisk_pouch,
		base_price: basePrice,
		addons_total: effectiveAddonsTotal,
		discount_amount: input.discount_amount,
		gross_up_pph_amount: input.gross_up_pph_amount,
		grand_total: grandTotal,
		remaining_balance: grandTotal,
		crew_notes: input.crew_notes,
	};
}

async function resolveBackdropContribution(
	supabase: Awaited<ReturnType<typeof createClient>>,
	input: BookingInput,
): Promise<number> {
	let rental = 0;
	if (input.backdrop_id) {
		const { data: bg } = await supabase
			.from("backdrops")
			.select("type, rental_price")
			.eq("id", input.backdrop_id)
			.maybeSingle();
		if (bg && bg.type === "rental_owned") rental = Number(bg.rental_price ?? 0);
	}
	return rental + (input.vendor_decor_markup ?? 0);
}

export async function createBooking(
	_prev: BookingFormState,
	formData: FormData,
): Promise<BookingFormState> {
	const me = await requireOwnerLevel();

	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as BookingErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();
	const basePrice = await resolveBasePrice(supabase, parsed.data);
	const addonsRaw = parseAddonsJson(formData);
	const { rows: addonRows, total: addonsTotal } = await snapshotAddons(
		supabase,
		addonsRaw,
	);
	const backdropContribution = await resolveBackdropContribution(
		supabase,
		parsed.data,
	);
	const projectId = generateProjectId(parsed.data.event_date);

	const { data: inserted, error } = await supabase
		.from("events")
		.insert({
			project_id: projectId,
			status: "draft",
			created_by: me.authId,
			...buildEventPayload(
				parsed.data,
				basePrice,
				addonsTotal,
				backdropContribution,
			),
		})
		.select("id")
		.single();

	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	if (addonRows.length > 0 && inserted?.id) {
		const { error: addonsError } = await supabase
			.from("event_addons")
			.insert(
				addonRows.map((r) => ({ event_id: inserted.id as string, ...r })),
			);
		if (addonsError) {
			// Event already created; surface error but don't roll back.
			return {
				errors: {
					_form: [
						`Event tersimpan, tapi gagal menyimpan add-ons: ${addonsError.message}`,
					],
				},
				values: snapshotValues(formData),
			};
		}
	}

	// Best-effort: auto-create Drive folder. Failures don't block event creation.
	if (inserted?.id && isDriveConfigured()) {
		try {
			await createEventFolderInternal(inserted.id as string);
		} catch {
			// silent — folder can be created manually from event detail
		}
	}

	revalidatePath("/operations");
	redirect(`/operations/${projectId}`);
}

export async function updateBooking(
	id: string,
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
	const basePrice = await resolveBasePrice(supabase, parsed.data);
	const addonsRaw = parseAddonsJson(formData);
	const { rows: addonRows, total: addonsTotal } = await snapshotAddons(
		supabase,
		addonsRaw,
	);
	const backdropContribution = await resolveBackdropContribution(
		supabase,
		parsed.data,
	);

	const { data: updated, error } = await supabase
		.from("events")
		.update(
			buildEventPayload(
				parsed.data,
				basePrice,
				addonsTotal,
				backdropContribution,
			),
		)
		.eq("id", id)
		.select("project_id")
		.single();

	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	// Replace existing addons with the current selection.
	const { error: deleteError } = await supabase
		.from("event_addons")
		.delete()
		.eq("event_id", id);
	if (deleteError) {
		return {
			errors: {
				_form: [`Gagal menghapus add-ons lama: ${deleteError.message}`],
			},
			values: snapshotValues(formData),
		};
	}
	if (addonRows.length > 0) {
		const { error: addonsError } = await supabase
			.from("event_addons")
			.insert(addonRows.map((r) => ({ event_id: id, ...r })));
		if (addonsError) {
			return {
				errors: {
					_form: [`Gagal menyimpan add-ons baru: ${addonsError.message}`],
				},
				values: snapshotValues(formData),
			};
		}
	}

	revalidatePath("/operations");
	revalidatePath(`/operations/${updated.project_id}`);
	redirect(`/operations/${updated.project_id}`);
}
