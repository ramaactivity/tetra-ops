"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createInvoiceFromQuotation } from "@/lib/actions/documents";
import {
	getOrCreateInvoice,
	linkInvoiceToEvent,
} from "@/lib/documents/invoice";
import { z } from "zod";
import { createEventFolderInternal } from "@/lib/actions/drive";
import { ensureVendorContact } from "@/lib/actions/vendors";
import { ensureVenue } from "@/lib/actions/venues";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isDriveConfigured } from "@/lib/drive/client";
import { computeLifecycleStatus } from "@/lib/event-status";
import {
	type PackageLike,
	packageFitsFrame,
	packageNeedsFrame,
	pendingPackageLabel,
	resolvePackage,
} from "@/lib/events/frame-package";
import { SERVICE_TYPE_LABELS } from "@/lib/format";
import {
	formatScheduleInline,
	parseSegments,
	segmentsEnvelope,
	trimTime,
	validateSegments,
} from "@/lib/schedule/segments";
import { createClient } from "@/lib/supabase/server";
import { tgEscape } from "@/lib/telegram/client";
import { dateLabel, rp } from "@/lib/telegram/digest";
import {
	notifyTelegramBookingCreated,
	notifyTelegramEventDeleted,
	notifyTelegramEventUpdated,
} from "@/lib/telegram/notify";

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
	// Paket sementara saat ukuran belum pasti: yang disepakati cuma DURASI-nya.
	// package_id tetap kosong sampai ukurannya dipastikan — lihat
	// lib/events/frame-package.ts. Harga per durasi sama untuk semua ukuran,
	// jadi nominal booking tidak berubah saat paket dikunci nanti.
	pending_package_hours: z.coerce
		.number()
		.int()
		.min(1)
		.max(24)
		.optional()
		.nullable()
		.or(z.literal(""))
		.transform((v) => (v === "" || v === undefined ? null : v)),
	event_category: z.string().trim().min(2, "Minimal 2 karakter").max(60),
	// Tanggal tetap WAJIB walau klien belum memastikan — kolom ini kunci
	// partisi cron status, availability, guard bentrok crew, freeze cutoff, dan
	// semua KPI. Yang boleh "menyusul" cuma KEPASTIANNYA, ditandai flag di
	// bawah; owner mengisi tanggal perkiraan supaya mesin tetap bekerja.
	event_date: z.iso.date("Format tanggal tidak valid"),
	event_date_is_estimate: z.coerce.boolean(),
	// Tenggat pelunasan (H-n dari tanggal acara). Kosong → server isi H-1.
	due_date: z
		.string()
		.trim()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null))
		.refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
			message: "Format tanggal tidak valid",
		}),
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
	// Acara dengan JEDA — JSON array window aktif per-sesi. "" / <2 sesi = null
	// (satu blok biasa). Validasi urutan (tak boleh tumpang tindih) di sini juga.
	session_segments: z
		.string()
		.optional()
		.or(z.literal(""))
		.transform((v, ctx) => {
			const parsed = parseSegments(v ?? "");
			if (!parsed || parsed.length < 2) return null;
			const val = validateSegments(parsed);
			if (!val.ok) {
				ctx.addIssue({ code: "custom", message: val.error });
				return z.NEVER;
			}
			return val.segments;
		}),
	booker_name: optionalString(120),
	// TBC lokasi — klien sering booking sebelum tahu tempatnya. NULL = menyusul,
	// konvensi sama dengan start_time/frame_size.
	venue_name: optionalString(120),
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
	// Komisi sales Tetra — berlaku di semua channel (lihat buildEventPayload)
	sales_user_id: z
		.string()
		.uuid()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
	direct_sales_commission: z.coerce.number().int().min(0).optional().nullable(),
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
			"kartu_nama",
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
			/** Terisi kalau booking lahir dari quotation → invoice ikut dibuat. */
			invoiceId?: string;
	  }
	| undefined;

const FORM_KEYS = [
	"channel",
	"client_name",
	"client_wa",
	"service_type",
	"package_id",
	"pending_package_hours",
	"frame_size",
	"event_category",
	"event_date",
	"due_date",
	"setup_time",
	"start_time",
	"end_time",
	"session_segments",
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
	"sales_user_id",
	"direct_sales_commission",
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
		event_date_is_estimate: formData.get("event_date_is_estimate") === "on",
	});
}

function snapshotValues(formData: FormData): Record<string, string> {
	return {
		...Object.fromEntries(
			FORM_KEYS.map((k) => [k, String(formData.get(k) ?? "")]),
		),
		include_flashdisk_pouch:
			formData.get("include_flashdisk_pouch") === "on" ? "on" : "",
		event_date_is_estimate:
			formData.get("event_date_is_estimate") === "on" ? "on" : "",
	};
}

/** yyyy-MM-dd ± n hari (tanpa zona waktu). */
function shiftDate(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
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
	// Paket sementara (durasi saja): ambil harga durasi itu dari pricelist.
	// Harga sama untuk semua ukuran, jadi tidak ada yang berubah saat paket
	// dikunci nanti; kalau ternyata beda, pakai yang terendah supaya event
	// tidak pernah menagih klien lebih dari yang disepakati.
	if (input.pending_package_hours) {
		const { data: pkgs } = await supabase
			.from("packages")
			.select("base_price")
			.eq("category", input.service_type)
			.eq("duration_hours", input.pending_package_hours)
			.is("deleted_at", null)
			.eq("is_active", true);
		const prices = (pkgs ?? []).map((p) => Number(p.base_price));
		if (prices.length > 0) return Math.min(...prices);
	}
	return 0;
}

/**
 * Gerbang "frame size ↔ paket": data event tidak boleh menyimpan paket
 * ber-ukuran sementara ukurannya sendiri belum pasti, dan tidak boleh
 * menyimpan paket yang ukurannya berbeda dari frame size event.
 *
 * Sekaligus MENORMALKAN input:
 *   • ukuran sudah pasti + durasi sementara → ditukar jadi paket konkret
 *   • paket konkret terpilih                → durasi sementara dibuang
 *
 * Dipanggil server-side supaya bug ini tidak bisa lolos lewat form lama,
 * import, atau siapa pun yang mem-POST manual.
 */
type PackageSelection = {
	package_id: string | null;
	pending_package_hours: number | null;
	/** undefined = jangan sentuh kolomnya (mis. nama custom hasil import). */
	custom_package_name?: string | null;
};

async function resolvePackageSelection(
	supabase: Awaited<ReturnType<typeof createClient>>,
	input: BookingInput,
): Promise<
	{ ok: true; value: PackageSelection } | { ok: false; errors: BookingErrors }
> {
	const serviceLabel = SERVICE_TYPE_LABELS[input.service_type] ?? null;

	if (input.package_id) {
		const { data: pkgRow } = await supabase
			.from("packages")
			.select("id, name, category, frame_size, duration_hours, base_price")
			.eq("id", input.package_id)
			.maybeSingle();
		if (!pkgRow) {
			return {
				ok: false,
				errors: { package_id: ["Paket tidak ditemukan — pilih ulang."] },
			};
		}
		const pkg = pkgRow as PackageLike;
		if (packageNeedsFrame(pkg) && !input.frame_size) {
			return {
				ok: false,
				errors: {
					frame_size: [
						`Paket "${pkg.name}" khusus ukuran ${pkg.frame_size}, tapi frame size event masih menyusul. Tanyakan ukurannya ke klien, atau pilih paket berdasarkan durasi saja (${pkg.duration_hours} jam).`,
					],
				},
			};
		}
		if (!packageFitsFrame(pkg.frame_size, input.frame_size)) {
			return {
				ok: false,
				errors: {
					package_id: [
						`Paket "${pkg.name}" untuk ukuran ${pkg.frame_size}, sedangkan frame size event ${input.frame_size}. Samakan dulu — inilah yang bikin salah cetak.`,
					],
				},
			};
		}
		// Paket konkret menang: durasi sementara tidak boleh ikut tersimpan.
		return {
			ok: true,
			value: {
				package_id: pkg.id,
				pending_package_hours: null,
				custom_package_name: null,
			},
		};
	}

	if (input.pending_package_hours) {
		const { data: pkgs } = await supabase
			.from("packages")
			.select("id, name, category, frame_size, duration_hours, base_price")
			.eq("category", input.service_type)
			.eq("duration_hours", input.pending_package_hours)
			.is("deleted_at", null)
			.eq("is_active", true);
		const candidates = (pkgs ?? []) as PackageLike[];
		if (candidates.length === 0) {
			return {
				ok: false,
				errors: {
					pending_package_hours: [
						`Tidak ada paket ${input.pending_package_hours} jam di ${serviceLabel ?? input.service_type}.`,
					],
				},
			};
		}
		// Ukuran sudah pasti → kunci paketnya sekarang juga. Owner tidak perlu
		// ingat untuk kembali menukar (dan tidak bisa lupa).
		const exact = resolvePackage(
			candidates,
			input.service_type,
			input.pending_package_hours,
			input.frame_size,
		);
		if (input.frame_size && exact) {
			return {
				ok: true,
				value: {
					package_id: exact.id,
					pending_package_hours: null,
					custom_package_name: null,
				},
			};
		}
		return {
			ok: true,
			value: {
				package_id: null,
				pending_package_hours: input.pending_package_hours,
				custom_package_name: pendingPackageLabel(
					serviceLabel,
					input.pending_package_hours,
				),
			},
		};
	}

	// Booking custom (tanpa paket & tanpa durasi) — nama custom dibiarkan
	// apa adanya; itu milik jalur import/legacy, bukan urusan gerbang ini.
	return {
		ok: true,
		value: { package_id: null, pending_package_hours: null },
	};
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
	// Hasil gerbang frame↔paket (resolvePackageSelection) — bukan input mentah,
	// supaya paket & ukuran yang tersimpan dijamin tidak saling bertentangan.
	selection: PackageSelection,
	// Pembayaran yang SUDAH masuk (untuk kasus edit). Saat edit booking,
	// remaining_balance harus = grand_total − total_paid, BUKAN reset ke
	// grand_total (yang membuang progres DP). createBooking pakai default 0.
	existingTotalPaid = 0,
) {
	const effectiveAddonsTotal = addonsTotal + backdropContribution;
	// Acara dengan jeda: rentang keseluruhan diturunkan dari sesi (authoritative).
	const scheduleEnvelope = input.session_segments
		? segmentsEnvelope(input.session_segments)
		: null;
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
	// Tagihan efektif: potongan langsung (upfront_cut) dipotong vendor dari
	// payment flow, jadi kas yang ditunggu = grand_total − potongan ("Tetra
	// terima"). remaining_balance harus lawan angka ini, bukan grand_total —
	// kalau tidak, event vendor tak pernah bisa lunas. Mirror
	// recalculate_event_payment_status (migration 20260712).
	const billableTotal = Math.max(
		0,
		grandTotal - (vendorMode === "upfront_cut" ? computedCommissionAmount : 0),
	);

	return {
		channel: input.channel,
		client_name: input.client_name,
		client_wa: input.client_wa,
		service_type: input.service_type,
		package_id: selection.package_id,
		// Paket sementara: durasi sudah disepakati, ukuran menyusul. Namanya
		// ikut ditulis ke custom_package_name supaya semua pembaca lama (PDF,
		// daftar event, halaman crew) menampilkan "2 Jam · ukuran menyusul"
		// alih-alih "—" tanpa perlu tahu kolom baru ini.
		pending_package_hours: selection.pending_package_hours,
		...(selection.custom_package_name !== undefined
			? { custom_package_name: selection.custom_package_name }
			: {}),
		// Custom booking (tanpa paket): simpan harga manual ke custom_package_price
		// supaya konsisten — downstream (settle/PDF/preview) pakai
		// custom_package_price ?? base_price.
		custom_package_price: selection.package_id ? null : basePrice,
		frame_size: input.frame_size,
		event_category: input.event_category,
		event_date: input.event_date,
		event_date_is_estimate: input.event_date_is_estimate,
		// Satu sumber tenggat pelunasan untuk Billing, invoice & agent reminder.
		due_date: input.due_date ?? shiftDate(input.event_date, -1),
		setup_time: input.setup_time,
		// Acara dengan jeda: start/end = envelope (mulai sesi pertama → selesai
		// sesi terakhir) supaya semua pembaca lama tetap benar. Server yang
		// authoritative — hitung ulang dari segmen, jangan percaya client.
		start_time: scheduleEnvelope?.start ?? input.start_time,
		end_time: scheduleEnvelope?.end ?? input.end_time,
		session_segments: input.session_segments,
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
		// Komisi sales Tetra — TIDAK terikat channel: event vendor/relasi pun
		// sales/admin yang closing tetap dapat komisinya sendiri, di luar komisi
		// mitra. (Dulu dinolkan untuk non-direct → komisi yang diisi saat settle
		// ikut terhapus kalau bookingnya di-edit setelah reopen.)
		sales_user_id: input.sales_user_id ?? null,
		// Komisi sales tentatif & tidak wajib: tanpa penerima → nol. Kalau tidak
		// dinolkan, angka default form nyangkut di event tanpa payee dan ikut
		// jadi beban 5-301 saat settle padahal tidak ada yang menerimanya.
		direct_sales_commission: input.sales_user_id
			? (input.direct_sales_commission ?? 0)
			: 0,
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
		remaining_balance: Math.max(0, billableTotal - existingTotalPaid),
		crew_notes: input.crew_notes,
	};
}

type AddonQtyRow = { addon_id: string; quantity: number };

/**
 * Diff snapshot event lama vs payload baru → baris-baris perubahan (HTML
 * Telegram, sudah di-escape) untuk notifyTelegramEventUpdated. Hanya field
 * yang berarti buat owner: tanggal, jam, lokasi, paket, backdrop, add-on,
 * bonus, kategori, frame, klien, PIC venue, dan grand total.
 */
async function buildBookingChangeLines(
	supabase: Awaited<ReturnType<typeof createClient>>,
	before: {
		client_name: string | null;
		event_date: string;
		event_date_is_estimate: boolean | null;
		setup_time: string | null;
		start_time: string | null;
		end_time: string | null;
		session_segments: unknown;
		venue_name: string | null;
		venue_city: string | null;
		package_id: string | null;
		pending_package_hours?: number | null;
		backdrop_id: string | null;
		frame_size: string | null;
		event_category: string | null;
		pic_name: string | null;
		grand_total: number | null;
	},
	after: ReturnType<typeof buildEventPayload>,
	addonDiff: {
		oldAddons: AddonQtyRow[];
		newAddons: AddonQtyRow[];
		oldBonuses: AddonQtyRow[];
		newBonuses: AddonQtyRow[];
	},
): Promise<string[]> {
	const lines: string[] = [];
	const arrow = (a: string, b: string) => `${a} → <b>${b}</b>`;

	if (before.event_date !== after.event_date) {
		lines.push(
			`📅 Tanggal: ${arrow(dateLabel(before.event_date, true), dateLabel(after.event_date, true))}`,
		);
	} else if (
		Boolean(before.event_date_is_estimate) !== after.event_date_is_estimate
	) {
		lines.push(
			after.event_date_is_estimate
				? "📅 Tanggal ditandai jadi perkiraan (TBC)"
				: "📅 Tanggal dikonfirmasi — bukan perkiraan lagi",
		);
	}

	const oldSched = formatScheduleInline(
		before.start_time,
		before.end_time,
		parseSegments(before.session_segments),
	);
	const newSched = formatScheduleInline(
		after.start_time,
		after.end_time,
		after.session_segments,
	);
	if (oldSched !== newSched) {
		lines.push(
			`⏰ Jam: ${arrow(tgEscape(oldSched || "TBC"), tgEscape(newSched || "TBC"))}`,
		);
	}
	const oldSetup = trimTime(before.setup_time);
	const newSetup = trimTime(after.setup_time);
	if (oldSetup !== newSetup) {
		lines.push(`🛠 Setup: ${arrow(oldSetup || "TBC", newSetup || "TBC")}`);
	}

	const place = (name: string | null, city: string | null) =>
		[name, city].filter(Boolean).join(", ");
	const oldPlace = place(before.venue_name, before.venue_city);
	const newPlace = place(after.venue_name, after.venue_city);
	if (oldPlace !== newPlace) {
		lines.push(
			`📍 Lokasi: ${arrow(tgEscape(oldPlace || "TBC"), tgEscape(newPlace || "TBC"))}`,
		);
	}

	const pendingBefore = before.pending_package_hours ?? null;
	const pendingAfter = after.pending_package_hours ?? null;
	if (
		(before.package_id ?? null) !== (after.package_id ?? null) ||
		pendingBefore !== pendingAfter
	) {
		const ids = [before.package_id, after.package_id].filter((v): v is string =>
			Boolean(v),
		);
		const { data: pkgs } = await supabase
			.from("packages")
			.select("id, name")
			.in("id", ids);
		// Paket sementara harus terbaca apa adanya di grup — "Custom (tanpa
		// paket)" menyembunyikan justru fakta yang perlu dikejar owner.
		const pkgName = (pid: string | null, pendingHours: number | null) =>
			pid
				? (((pkgs ?? []).find((p) => p.id === pid)?.name as string) ?? "?")
				: pendingHours
					? `${pendingHours} jam · ukuran menyusul`
					: "Custom (tanpa paket)";
		lines.push(
			`📦 Paket: ${arrow(
				tgEscape(pkgName(before.package_id, pendingBefore)),
				tgEscape(pkgName(after.package_id, pendingAfter)),
			)}`,
		);
	}

	if ((before.backdrop_id ?? null) !== (after.backdrop_id ?? null)) {
		const ids = [before.backdrop_id, after.backdrop_id].filter(
			(v): v is string => Boolean(v),
		);
		const { data: bgs } = await supabase
			.from("backdrops")
			.select("id, name")
			.in("id", ids);
		const bgName = (bid: string | null) =>
			bid
				? (((bgs ?? []).find((b) => b.id === bid)?.name as string) ?? "?")
				: "Tanpa backdrop";
		lines.push(
			`🖼 Backdrop: ${arrow(tgEscape(bgName(before.backdrop_id)), tgEscape(bgName(after.backdrop_id)))}`,
		);
	}

	// Add-on & bonus: bandingkan qty per addon_id, sebut nama barangnya.
	const diffQty = async (
		oldRows: AddonQtyRow[],
		newRows: AddonQtyRow[],
	): Promise<string[]> => {
		const oldMap = new Map(oldRows.map((r) => [r.addon_id, r.quantity]));
		const newMap = new Map(newRows.map((r) => [r.addon_id, r.quantity]));
		const allIds = [...new Set([...oldMap.keys(), ...newMap.keys()])];
		const changedIds = allIds.filter(
			(aid) => (oldMap.get(aid) ?? 0) !== (newMap.get(aid) ?? 0),
		);
		if (changedIds.length === 0) return [];
		const { data: addons } = await supabase
			.from("addons")
			.select("id, name")
			.in("id", changedIds);
		const nameOf = (aid: string) =>
			tgEscape(
				((addons ?? []).find((a) => a.id === aid)?.name as string) ?? "Add-on",
			);
		return changedIds.map((aid) => {
			const o = oldMap.get(aid) ?? 0;
			const n = newMap.get(aid) ?? 0;
			if (o === 0) return `+${nameOf(aid)}${n > 1 ? ` ×${n}` : ""}`;
			if (n === 0) return `−${nameOf(aid)}`;
			return `${nameOf(aid)} ×${o}→×${n}`;
		});
	};
	const addonParts = await diffQty(addonDiff.oldAddons, addonDiff.newAddons);
	if (addonParts.length > 0) lines.push(`➕ Add-on: ${addonParts.join(", ")}`);
	const bonusParts = await diffQty(addonDiff.oldBonuses, addonDiff.newBonuses);
	if (bonusParts.length > 0) lines.push(`🎁 Bonus: ${bonusParts.join(", ")}`);

	if ((before.event_category ?? "") !== after.event_category) {
		lines.push(
			`🏷 Kategori: ${arrow(tgEscape(before.event_category ?? "-"), tgEscape(after.event_category))}`,
		);
	}
	if ((before.frame_size ?? null) !== (after.frame_size ?? null)) {
		lines.push(
			`📐 Frame: ${arrow(before.frame_size ?? "TBC", after.frame_size ?? "TBC")}`,
		);
	}
	if ((before.client_name ?? "") !== after.client_name) {
		lines.push(
			`👤 Nama klien: ${arrow(tgEscape(before.client_name ?? "-"), tgEscape(after.client_name))}`,
		);
	}
	if ((before.pic_name ?? null) !== (after.pic_name ?? null)) {
		lines.push(
			`👤 PIC venue: ${arrow(tgEscape(before.pic_name ?? "-"), tgEscape(after.pic_name ?? "-"))}`,
		);
	}

	const oldTotal = Number(before.grand_total ?? 0);
	if (oldTotal !== after.grand_total) {
		lines.push(`💰 Total: ${arrow(rp(oldTotal), rp(after.grand_total))}`);
	}

	return lines;
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
	// Gerbang frame↔paket dulu, sebelum apa pun disimpan: paket ber-ukuran +
	// frame size "menyusul" adalah kombinasi yang tidak boleh ada.
	const selection = await resolvePackageSelection(supabase, parsed.data);
	if (!selection.ok) {
		return { errors: selection.errors, values: snapshotValues(formData) };
	}
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
	const initialStatus = computeLifecycleStatus(
		parsed.data.event_date,
		todayISO,
	);

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

	// Master venue — sama polanya dengan vendor: yang sudah ada dipakai ulang,
	// yang baru dibuat otomatis, dan kolom yang masih kosong di master ikut
	// terisi dari booking ini.
	const venueId = await ensureVenue({
		name: parsed.data.venue_name ?? "",
		address: parsed.data.venue_address,
		city: parsed.data.venue_city,
		province: parsed.data.venue_province,
		google_maps_url: parsed.data.google_maps_url,
	});

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
				selection.value,
			),
			venue_id: venueId,
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

	// Best-effort: kabari grup Telegram owner ada booking baru.
	if (inserted?.id) {
		await notifyTelegramBookingCreated(inserted.id as string);
	}

	// Setiap event wajib punya invoice. Sumbernya, berurutan:
	//   1. invoice DP yang sudah dibuat sebelum event → DITAUTKAN (nomor tetap)
	//   2. quotation yang di-deal → invoice baru dari isi quotation
	//   3. tanpa sumber → invoice dibuat dari data event
	// Gagal di sini tidak membatalkan booking; invoice masih bisa dibuat/
	// ditautkan dari halaman event.
	let invoiceId: string | undefined;
	const sourceInvoiceId = String(formData.get("source_invoice_id") ?? "");
	const sourceQuotationId = String(formData.get("source_quotation_id") ?? "");
	if (inserted?.id) {
		const eventId = inserted.id as string;
		if (sourceInvoiceId) {
			const res = await linkInvoiceToEvent(supabase, sourceInvoiceId, eventId);
			if (res.ok) invoiceId = sourceInvoiceId;
		} else if (sourceQuotationId) {
			const res = await createInvoiceFromQuotation(sourceQuotationId, eventId);
			if (res.ok) invoiceId = res.id;
		} else {
			const res = await getOrCreateInvoice(
				supabase,
				eventId,
				me.profile.id,
				new Date().toISOString().slice(0, 10),
			);
			// Booking biasa tetap diarahkan ke halaman event (bukan invoice).
			if (!res.ok) console.error("[createBooking] invoice:", res.error);
		}
	}

	revalidatePath("/operations");
	revalidatePath(`/operations/${projectId}`);
	return { ok: true, projectId, invoiceId };
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
	// Gerbang frame↔paket — sama seperti createBooking, supaya edit tidak bisa
	// mengembalikan event ke keadaan "paket 2R, ukuran menyusul".
	const selection = await resolvePackageSelection(supabase, parsed.data);
	if (!selection.ok) {
		return { errors: selection.errors, values: snapshotValues(formData) };
	}
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

	// Master venue — sama polanya dengan vendor: yang sudah ada dipakai ulang,
	// yang baru dibuat otomatis, dan kolom yang masih kosong di master ikut
	// terisi dari booking ini.
	const venueId = await ensureVenue({
		name: parsed.data.venue_name ?? "",
		address: parsed.data.venue_address,
		city: parsed.data.venue_city,
		province: parsed.data.venue_province,
		google_maps_url: parsed.data.google_maps_url,
	});

	// Pembayaran yang sudah masuk — supaya remaining_balance tidak ke-reset ke
	// grand_total saat edit (membuang progres DP yang sudah dibayar).
	// Field lain di-select sebagai snapshot "sebelum" untuk notifikasi
	// perubahan ke grup Telegram owner (diff lama → baru).
	const { data: curEvent, error: curEventErr } = await supabase
		.from("events")
		.select(
			`total_paid, status, is_migrated_legacy,
			client_name, event_date, event_date_is_estimate, setup_time,
			start_time, end_time, session_segments, venue_name, venue_city,
			package_id, pending_package_hours, backdrop_id, frame_size,
			event_category, pic_name, grand_total`,
		)
		.eq("id", id)
		.maybeSingle();

	// Error di sini TIDAK boleh dibuang: curEvent jadi null → total_paid jatuh
	// ke 0 → remaining_balance ditulis ulang sebesar grand_total penuh, yaitu
	// persis hal yang dicegah komentar di atas. Event dengan DP Rp5jt kehilangan
	// seluruh progres pembayarannya hanya karena owner menyunting judulnya.
	// Status lifecycle di bawah juga ikut salah kalau curEvent null.
	if (curEventErr) {
		return {
			errors: {
				_form: [
					`Gagal membaca data pembayaran event: ${curEventErr.message}. Perubahan dibatalkan supaya progres DP tidak hilang.`,
				],
			},
			values: snapshotValues(formData),
		};
	}

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

	// Snapshot add-on & bonus LAMA — harus dibaca SEBELUM replace-all di bawah,
	// dipakai untuk diff notifikasi Telegram.
	const { data: oldAddonRows } = await supabase
		.from("event_addons")
		.select("addon_id, quantity")
		.eq("event_id", id);
	const { data: oldBonusRows } = await supabase
		.from("event_bonuses")
		.select("addon_id, quantity")
		.eq("event_id", id);

	const payload = buildEventPayload(
		parsed.data,
		basePrice,
		addonsTotal,
		backdropContribution,
		vendorContactId,
		selection.value,
		Number(curEvent?.total_paid ?? 0),
	);

	const { data: updated, error } = await supabase
		.from("events")
		.update({
			...payload,
			venue_id: venueId,
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

	// Best-effort: kabari grup Telegram owner perubahan penting (pindah tanggal,
	// ganti paket, pindah lokasi, add-on berubah, dst). Event legacy di-skip —
	// backfill data lama tidak perlu meramaikan grup. Gagal kirim tidak boleh
	// menggagalkan edit yang sudah tersimpan.
	if (curEvent && !curEvent.is_migrated_legacy) {
		try {
			const changes = await buildBookingChangeLines(
				supabase,
				curEvent,
				payload,
				{
					oldAddons: oldAddonRows ?? [],
					newAddons: addonRows,
					oldBonuses: oldBonusRows ?? [],
					newBonuses: bonusesRaw,
				},
			);
			if (changes.length > 0) await notifyTelegramEventUpdated(id, changes);
		} catch (e) {
			console.error("[bookings] telegram update notify:", e);
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
	const me = await requireOwnerLevel();

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

	// Best-effort: kabari grup Telegram owner. Row masih ada (soft-delete),
	// notify fetch sendiri detailnya.
	await notifyTelegramEventDeleted(id, me.profile.full_name);

	revalidatePath("/operations");
	revalidatePath(`/operations/${event.project_id}`);
	return { ok: true, projectId: event.project_id };
}
