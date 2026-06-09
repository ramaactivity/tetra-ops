"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createEventFolderInternal } from "@/lib/actions/drive";
import { ensureVendorContact } from "@/lib/actions/vendors";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isDriveConfigured } from "@/lib/drive/client";
import { computeLifecycleStatus } from "@/lib/event-status";
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
	service_type: z.enum(SERVICE_TYPES),
	package_id: z
		.string()
		.uuid()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	// TBC ("menyusul") = empty string from form → null di DB. Allow karena
	// klien sering kasih booking sebelum pasti frame size.
	frame_size: z
		.enum(FRAME_SIZES)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	event_category: z.string().trim().min(2, "Minimal 2 karakter").max(60),
	event_date: z.iso.date("Format tanggal tidak valid"),
	// TBC waktu — empty = null di DB. Setup/end auto-fill dari start, jadi
	// kalau start TBC, ketiganya umumnya TBC juga (UI yang enforce konsistensi).
	setup_time: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM")
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	start_time: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM")
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	end_time: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "Format waktu HH:MM")
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	booker_name: optionalString(120),
	venue_name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	venue_address: optionalString(255),
	venue_city: optionalString(60),
	venue_province: optionalString(60),
	google_maps_url: optionalString(500),
	// Channel-specific referrer fields (optional; required by UI based on channel)
	vendor_name: optionalString(120),
	vendor_pic_name: optionalString(120),
	vendor_contact: optionalString(60),
	// New commission model (see migration 20260520_vendor_commission_mode.sql)
	vendor_commission_mode: z
		.enum(["commission", "upfront_cut"])
		.optional()
		.nullable()
		.or(z.literal(""))
		.transform((v) => (v === "" || v === undefined ? null : v)),
	vendor_commission_value_type: z
		.enum(["percent", "flat"])
		.optional()
		.nullable()
		.or(z.literal(""))
		.transform((v) => (v === "" || v === undefined ? null : v)),
	vendor_commission_value: z.coerce
		.number()
		.min(0)
		.max(999_999_999.99)
		.optional()
		.nullable(),
	// Legacy fields kept for back-compat — populated automatically from
	// the new fields above when applicable (see buildEventPayload).
	vendor_commission_rate: z.coerce
		.number()
		.min(0)
		.max(100)
		.optional()
		.nullable(),
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
	referrer_type: z
		.enum(["owner", "crew", "external"])
		.optional()
		.nullable()
		.or(z.literal(""))
		.transform((v) => (v === "" || v === undefined ? null : v)),
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
	discount_type: z
		.enum([
			"promo",
			"loyalty",
			"relasi",
			"owner_override",
			"package_deal",
			"other",
		])
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	crew_notes: optionalString(500),
});

export type BookingInput = z.infer<typeof BookingInputSchema>;

type BookingErrors = Partial<Record<keyof BookingInput | "_form", string[]>>;

export type BookingFormState =
	| {
			errors?: BookingErrors;
			values?: Record<string, string>;
	  }
	| {
			ok: true;
			projectId: string;
			isUpdate?: boolean;
	  }
	| undefined;

const FORM_KEYS = [
	"channel",
	"client_name",
	"client_wa",
	"service_type",
	"package_id",
	"frame_size",
	"event_category",
	"event_date",
	"setup_time",
	"start_time",
	"end_time",
	"booker_name",
	"venue_name",
	"venue_address",
	"venue_city",
	"venue_province",
	"google_maps_url",
	"vendor_name",
	"vendor_pic_name",
	"vendor_contact",
	"vendor_commission_mode",
	"vendor_commission_value_type",
	"vendor_commission_value",
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
	"discount_type",
	"crew_notes",
] as const;

function parseFormData(formData: FormData) {
	// Coalesce null → "" so optional-string schemas (which accept "" via
	// .or(z.literal("")) but not null) never fail when a conditional UI
	// section is hidden and its hidden inputs aren't rendered. Without this,
	// e.g. channel=vendor leaves referrer_user_id absent → formData.get returns
	// null → schema rejects.
	const raw = Object.fromEntries(
		FORM_KEYS.map((k) => {
			const v = formData.get(k);
			return [k, v == null ? "" : v];
		}),
	);
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

const BonusInputSchema = z.array(
	z.object({
		addon_id: z.uuid(),
		quantity: z.coerce.number().int().positive().max(99),
		notes: z.string().trim().max(200).optional().nullable(),
	}),
);

function parseBonusesJson(formData: FormData) {
	const raw = formData.get("bonuses_json");
	if (!raw || typeof raw !== "string" || raw === "") return [];
	try {
		return BonusInputSchema.parse(JSON.parse(raw));
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

/**
 * Compute the rupiah amount vendor takes from each event (modelled as a
 * commission expense in Tetra's books, regardless of cash-flow direction).
 *
 * - commission + percent: grand_total × value / 100 (rounded to integer rp)
 * - commission + flat:    value as-is (rounded)
 * - upfront_cut + percent: base_price × value / 100 — a percentage the vendor
 *                          deducts off the package base price (e.g. 10% per
 *                          event). Percent is off base_price, not grand_total,
 *                          to match the "potong dari harga paket" wording in
 *                          the UI (addons/discount/gross-up are Tetra's).
 * - upfront_cut + flat:    value as-is — the fixed rupiah vendor deducts
 *                          from the payment flow (e.g. 500K per event for
 *                          Partner Organizer). Accounting equivalent to a
 *                          flat commission: revenue = grand_total, expense
 *                          = vendor_cut, net cash to Tetra = grand_total -
 *                          vendor_cut. Cash-flow direction (vendor → Tetra
 *                          for upfront_cut vs Tetra → vendor for
 *                          commission) doesn't affect the journal entry.
 *
 * Returns 0 for non-vendor channels or when value is missing.
 */
function computeVendorCommissionAmount(
	input: BookingInput,
	grandTotal: number,
	basePrice: number,
): number {
	if (input.channel !== "vendor") return 0;
	const mode = input.vendor_commission_mode ?? "commission";
	const value = input.vendor_commission_value ?? 0;
	const valueType = input.vendor_commission_value_type ?? "percent";
	if (mode === "upfront_cut") {
		// Potongan langsung — percent is off the package base price, flat is as-is.
		return valueType === "percent"
			? Math.round((basePrice * value) / 100)
			: Math.round(value);
	}
	if (valueType === "percent") {
		return Math.round((grandTotal * value) / 100);
	}
	// commission + flat
	return Math.round(value);
}

function buildEventPayload(
	input: BookingInput,
	basePrice: number,
	addonsTotal: number,
	backdropContribution: number,
	vendorContactId: string | null,
	// Pembayaran yang SUDAH masuk (untuk kasus edit). Saat edit booking,
	// remaining_balance harus = grand_total − total_paid, BUKAN reset ke
	// grand_total (yang membuang progres DP). createBooking pakai default 0.
	existingTotalPaid = 0,
) {
	const effectiveAddonsTotal = addonsTotal + backdropContribution;
	const grandTotal = computeGrandTotal({
		base_price: basePrice,
		addons_total: effectiveAddonsTotal,
		discount_amount: input.discount_amount,
		gross_up_pph_amount: input.gross_up_pph_amount,
	});

	// Commission snapshot fields (mode, type, value) and computed amount.
	// These default to commission/percent/0 when channel=vendor without
	// explicit form values — preserves behavior for callers that haven't
	// migrated to the new mode-aware UI yet.
	const vendorMode =
		input.channel === "vendor"
			? (input.vendor_commission_mode ?? "commission")
			: null;
	const vendorValueType =
		input.channel === "vendor"
			? (input.vendor_commission_value_type ?? "percent")
			: null;
	const vendorValue =
		input.channel === "vendor" ? (input.vendor_commission_value ?? 0) : null;
	const computedCommissionAmount = computeVendorCommissionAmount(
		input,
		grandTotal,
		basePrice,
	);

	return {
		channel: input.channel,
		client_name: input.client_name,
		client_wa: input.client_wa,
		service_type: input.service_type,
		package_id: input.package_id,
		// Custom booking (tanpa paket): simpan harga manual ke custom_package_price
		// supaya konsisten — downstream (settle/PDF/preview) pakai
		// custom_package_price ?? base_price.
		custom_package_price: input.package_id ? null : basePrice,
		frame_size: input.frame_size,
		event_category: input.event_category,
		event_date: input.event_date,
		setup_time: input.setup_time,
		start_time: input.start_time,
		end_time: input.end_time,
		booker_name: input.booker_name,
		venue_name: input.venue_name,
		venue_address: input.venue_address,
		venue_city: input.venue_city,
		venue_province: input.venue_province,
		google_maps_url: input.google_maps_url,
		// Channel referrer
		vendor_name: input.channel === "vendor" ? input.vendor_name : null,
		vendor_pic_name: input.channel === "vendor" ? input.vendor_pic_name : null,
		vendor_contact: input.channel === "vendor" ? input.vendor_contact : null,
		// New commission model — see computeVendorCommissionAmount above.
		vendor_commission_mode: vendorMode,
		vendor_commission_value_type: vendorValueType,
		vendor_commission_value: vendorValue,
		vendor_commission_amount:
			input.channel === "vendor" ? computedCommissionAmount : null,
		// Legacy field: only fill when mode=commission + type=percent so old
		// readers still see a sane % rate. Otherwise null — old readers
		// gracefully fall back to vendor_commission_amount or skip.
		vendor_commission_rate:
			input.channel === "vendor" &&
			vendorMode === "commission" &&
			vendorValueType === "percent"
				? vendorValue
				: null,
		// Vendor master FK — set when channel=vendor AND we successfully
		// upserted/found the contacts row. Source of truth for vendor;
		// vendor_name etc. above retained as snapshot for back-compat.
		vendor_contact_id: input.channel === "vendor" ? vendorContactId : null,
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
		// addons_total = add-on + backdrop (komponen revenue; dipakai settle_event
		// & grand_total — sengaja TIDAK diubah agar mesin settlement stabil).
		// Backdrop dipisah ke kolomnya sendiri supaya laporan bisa pecah:
		//   add-on murni = addons_total − backdrop_rental_total.
		addons_total: effectiveAddonsTotal,
		backdrop_rental_total: backdropContribution,
		discount_amount: input.discount_amount,
		discount_type: input.discount_amount > 0 ? input.discount_type : null,
		gross_up_pph_amount: input.gross_up_pph_amount,
		grand_total: grandTotal,
		remaining_balance: Math.max(0, grandTotal - existingTotalPaid),
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

	// Status is date-driven from the start: a future booking is "upcoming",
	// a same-day booking "in_progress", a back-dated one "awaiting_settlement".
	// The daily status-transition cron keeps it in sync afterwards.
	const todayISO = new Date().toISOString().slice(0, 10);
	const initialStatus = computeLifecycleStatus(parsed.data.event_date, todayISO);

	// Resolve vendor master FK — upsert contacts(type='vendor') if user
	// typed a new vendor name in the free-text combobox. No-op for
	// non-vendor channels.
	let vendorContactId: string | null = null;
	if (parsed.data.channel === "vendor" && parsed.data.vendor_name) {
		vendorContactId = await ensureVendorContact({
			name: parsed.data.vendor_name,
			pic_name: parsed.data.vendor_pic_name,
			pic_contact: parsed.data.vendor_contact,
			commission_mode: parsed.data.vendor_commission_mode,
			commission_value_type: parsed.data.vendor_commission_value_type,
			commission_value: parsed.data.vendor_commission_value,
		});
	}

	const { data: inserted, error } = await supabase
		.from("events")
		.insert({
			project_id: projectId,
			status: initialStatus,
			created_by: me.authId,
			...buildEventPayload(
				parsed.data,
				basePrice,
				addonsTotal,
				backdropContribution,
				vendorContactId,
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

	const bonusesRaw = parseBonusesJson(formData);
	if (bonusesRaw.length > 0 && inserted?.id) {
		const { error: bonusError } = await supabase.from("event_bonuses").insert(
			bonusesRaw.map((b) => ({
				event_id: inserted.id as string,
				addon_id: b.addon_id,
				quantity: b.quantity,
				notes: b.notes || null,
			})),
		);
		if (bonusError) {
			return {
				errors: {
					_form: [
						`Event tersimpan, tapi gagal menyimpan bonus: ${bonusError.message}`,
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
	revalidatePath(`/operations/${projectId}`);
	return { ok: true, projectId };
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

	// Resolve vendor master FK (same pattern as createBooking)
	let vendorContactId: string | null = null;
	if (parsed.data.channel === "vendor" && parsed.data.vendor_name) {
		vendorContactId = await ensureVendorContact({
			name: parsed.data.vendor_name,
			pic_name: parsed.data.vendor_pic_name,
			pic_contact: parsed.data.vendor_contact,
			commission_mode: parsed.data.vendor_commission_mode,
			commission_value_type: parsed.data.vendor_commission_value_type,
			commission_value: parsed.data.vendor_commission_value,
		});
	}

	// Pembayaran yang sudah masuk — supaya remaining_balance tidak ke-reset ke
	// grand_total saat edit (membuang progres DP yang sudah dibayar).
	const { data: curEvent } = await supabase
		.from("events")
		.select("total_paid, status, is_migrated_legacy")
		.eq("id", id)
		.maybeSingle();

	// Re-derive the lifecycle status from the (possibly changed) event date, but
	// only for auto-managed events. Terminal/manual states (completed, cancelled)
	// and legacy rows are left untouched.
	const autoManaged =
		!curEvent?.is_migrated_legacy &&
		(curEvent?.status === "upcoming" ||
			curEvent?.status === "in_progress" ||
			curEvent?.status === "awaiting_settlement");
	const statusPatch = autoManaged
		? {
				status: computeLifecycleStatus(
					parsed.data.event_date,
					new Date().toISOString().slice(0, 10),
				),
			}
		: {};

	const { data: updated, error } = await supabase
		.from("events")
		.update({
			...buildEventPayload(
				parsed.data,
				basePrice,
				addonsTotal,
				backdropContribution,
				vendorContactId,
				Number(curEvent?.total_paid ?? 0),
			),
			...statusPatch,
		})
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

	// Bonuses: replace-all (same pattern as addons)
	const { error: deleteBonusError } = await supabase
		.from("event_bonuses")
		.delete()
		.eq("event_id", id);
	if (deleteBonusError) {
		return {
			errors: {
				_form: [`Gagal menghapus bonus lama: ${deleteBonusError.message}`],
			},
			values: snapshotValues(formData),
		};
	}
	const bonusesRaw = parseBonusesJson(formData);
	if (bonusesRaw.length > 0) {
		const { error: bonusError } = await supabase.from("event_bonuses").insert(
			bonusesRaw.map((b) => ({
				event_id: id,
				addon_id: b.addon_id,
				quantity: b.quantity,
				notes: b.notes || null,
			})),
		);
		if (bonusError) {
			return {
				errors: {
					_form: [`Gagal menyimpan bonus baru: ${bonusError.message}`],
				},
				values: snapshotValues(formData),
			};
		}
	}

	revalidatePath("/operations");
	revalidatePath(`/operations/${updated.project_id}`);
	return { ok: true, projectId: updated.project_id, isUpdate: true };
}

export type DeleteEventResult =
	| { ok: true; projectId: string }
	| { ok: false; error: string };

/**
 * Soft-delete event by setting deleted_at. Blocks deletion when event
 * is already settled (event_settlements row exists) — settled records
 * are audit-relevant and shouldn't disappear from reports.
 *
 * Owner-level only. Pattern matches addons/packages/items soft-delete.
 */
export async function deleteEvent(id: string): Promise<DeleteEventResult> {
	await requireOwnerLevel();

	const supabase = await createClient();

	const { data: event, error: fetchErr } = await supabase
		.from("events")
		.select("project_id, status, deleted_at")
		.eq("id", id)
		.maybeSingle();

	if (fetchErr || !event) {
		return { ok: false, error: fetchErr?.message ?? "Event tidak ditemukan." };
	}
	if (event.deleted_at) {
		return { ok: false, error: "Event sudah dihapus sebelumnya." };
	}

	// Block delete kalau sudah settled — laporan keuangan bergantung sama
	// row event ini. Owner harus reopen settlement dulu kalau mau hapus.
	const { data: settlement } = await supabase
		.from("event_settlements")
		.select("id")
		.eq("event_id", id)
		.maybeSingle();
	if (settlement) {
		return {
			ok: false,
			error:
				"Event sudah di-settle. Reopen settlement dulu sebelum hapus (atau biarkan untuk audit trail).",
		};
	}

	const { error } = await supabase
		.from("events")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id);

	if (error) return { ok: false, error: error.message };

	revalidatePath("/operations");
	revalidatePath(`/operations/${event.project_id}`);
	return { ok: true, projectId: event.project_id };
}
