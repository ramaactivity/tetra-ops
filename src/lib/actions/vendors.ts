"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import {
	VENDOR_COMMISSION_MODES,
	VENDOR_VALUE_TYPES,
	type VendorCommissionMode,
	type VendorCommissionValueType,
} from "@/lib/vendors/types";

/**
 * Vendor master CRUD — operates on contacts table where type='vendor'.
 *
 * Vendors are master entities (not denormalized strings). They power the
 * booking form vendor autocomplete + the /vendors UI + the
 * commission aggregation on /finance/vendors.
 *
 * Schema: see supabase/migrations/20260519_vendor_master.sql
 *   - contacts (type='vendor') with vendor-specific columns
 *   - events.vendor_contact_id FK (snapshot fields kept for back-compat)
 *   - vendor_summary_v view aggregates event_count, commission YTD, etc.
 */

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const VendorInputSchema = z
	.object({
		name: z.string().trim().min(2, "Nama vendor minimal 2 karakter").max(120),
		default_pic_name: z
			.string()
			.trim()
			.max(120)
			.optional()
			.transform((v) => v || null),
		default_pic_contact: z
			.string()
			.trim()
			.max(60)
			.optional()
			.transform((v) => v || null),
		commission_mode: z.enum(VENDOR_COMMISSION_MODES).default("commission"),
		commission_value_type: z.enum(VENDOR_VALUE_TYPES).default("percent"),
		// Single value field interpreted by mode + value_type. For
		// commission+percent it's a % (0-100); for commission+flat and
		// upfront_cut it's rupiah (no upper bound but bounded by NUMERIC(12,2)).
		commission_value_default: z.coerce
			.number()
			.min(0, "Tidak boleh negatif")
			.max(999_999_999.99, "Nilai terlalu besar")
			.optional()
			.nullable(),
		payment_terms: z
			.string()
			.trim()
			.max(200)
			.optional()
			.transform((v) => v || null),
		company_address: z
			.string()
			.trim()
			.max(500)
			.optional()
			.transform((v) => v || null),
		email: z
			.string()
			.trim()
			.email("Format email tidak valid")
			.optional()
			.or(z.literal(""))
			.transform((v) => v || null),
		notes: z
			.string()
			.trim()
			.max(1000)
			.optional()
			.transform((v) => v || null),
	})
	.superRefine((data, ctx) => {
		// commission + percent: max 100
		if (
			data.commission_mode === "commission" &&
			data.commission_value_type === "percent" &&
			data.commission_value_default != null &&
			data.commission_value_default > 100
		) {
			ctx.addIssue({
				code: "custom",
				path: ["commission_value_default"],
				message: "Persentase maksimal 100%",
			});
		}
	});

export type VendorInput = z.infer<typeof VendorInputSchema>;

export type VendorFormState =
	| { ok: true; vendor_id: string }
	| {
			errors: Partial<Record<keyof VendorInput | "_form", string[]>>;
			values: Record<string, string>;
	  }
	| undefined;

function parseFormData(formData: FormData): {
	success: boolean;
	data?: VendorInput;
	errors?: Record<string, string[]>;
} {
	const raw = {
		name: String(formData.get("name") ?? ""),
		default_pic_name: String(formData.get("default_pic_name") ?? ""),
		default_pic_contact: String(formData.get("default_pic_contact") ?? ""),
		commission_mode:
			(formData.get("commission_mode") as string) || "commission",
		commission_value_type:
			(formData.get("commission_value_type") as string) || "percent",
		commission_value_default: String(
			formData.get("commission_value_default") ?? "",
		),
		payment_terms: String(formData.get("payment_terms") ?? ""),
		company_address: String(formData.get("company_address") ?? ""),
		email: String(formData.get("email") ?? ""),
		notes: String(formData.get("notes") ?? ""),
	};

	const parsed = VendorInputSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			success: false,
			errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
		};
	}
	return { success: true, data: parsed.data };
}

function snapshotValues(formData: FormData): Record<string, string> {
	return {
		name: String(formData.get("name") ?? ""),
		default_pic_name: String(formData.get("default_pic_name") ?? ""),
		default_pic_contact: String(formData.get("default_pic_contact") ?? ""),
		commission_mode: String(formData.get("commission_mode") ?? "commission"),
		commission_value_type: String(
			formData.get("commission_value_type") ?? "percent",
		),
		commission_value_default: String(
			formData.get("commission_value_default") ?? "",
		),
		payment_terms: String(formData.get("payment_terms") ?? ""),
		company_address: String(formData.get("company_address") ?? ""),
		email: String(formData.get("email") ?? ""),
		notes: String(formData.get("notes") ?? ""),
	};
}

export async function createVendor(
	_prev: VendorFormState,
	formData: FormData,
): Promise<VendorFormState> {
	await requireOwnerLevel();

	const parsed = parseFormData(formData);
	if (!parsed.success || !parsed.data) {
		return {
			errors: parsed.errors ?? {},
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();

	// Duplicate-name check (case-insensitive) among active vendors
	const { data: existing } = await supabase
		.from("contacts")
		.select("id")
		.eq("type", "vendor")
		.eq("is_active", true)
		.ilike("name", parsed.data.name)
		.maybeSingle();

	if (existing) {
		return {
			errors: {
				name: [`Vendor "${parsed.data.name}" sudah terdaftar.`],
			},
			values: snapshotValues(formData),
		};
	}

	const { data: inserted, error } = await supabase
		.from("contacts")
		.insert({
			type: "vendor",
			name: parsed.data.name,
			phone: parsed.data.default_pic_contact, // phone doubles as primary contact
			email: parsed.data.email,
			notes: parsed.data.notes,
			default_pic_name: parsed.data.default_pic_name,
			default_pic_contact: parsed.data.default_pic_contact,
			commission_mode: parsed.data.commission_mode,
			commission_value_type: parsed.data.commission_value_type,
			commission_value_default: parsed.data.commission_value_default,
			// Back-compat: also write legacy commission_rate_default when
			// mode=commission + type=percent so old aggregation paths keep
			// reading sane values until they migrate to the new fields.
			commission_rate_default:
				parsed.data.commission_mode === "commission" &&
				parsed.data.commission_value_type === "percent"
					? parsed.data.commission_value_default
					: null,
			payment_terms: parsed.data.payment_terms,
			company_address: parsed.data.company_address,
			is_active: true,
		})
		.select("id")
		.single();

	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	revalidatePath("/vendors");
	revalidatePath("/contacts");
	revalidatePath("/operations/new");

	return { ok: true, vendor_id: inserted.id as string };
}

export async function updateVendor(
	id: string,
	_prev: VendorFormState,
	formData: FormData,
): Promise<VendorFormState> {
	await requireOwnerLevel();

	const parsed = parseFormData(formData);
	if (!parsed.success || !parsed.data) {
		return {
			errors: parsed.errors ?? {},
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();

	// Duplicate-name check (excluding self)
	const { data: existing } = await supabase
		.from("contacts")
		.select("id")
		.eq("type", "vendor")
		.eq("is_active", true)
		.neq("id", id)
		.ilike("name", parsed.data.name)
		.maybeSingle();

	if (existing) {
		return {
			errors: {
				name: [`Vendor "${parsed.data.name}" sudah terdaftar.`],
			},
			values: snapshotValues(formData),
		};
	}

	const { error } = await supabase
		.from("contacts")
		.update({
			name: parsed.data.name,
			phone: parsed.data.default_pic_contact,
			email: parsed.data.email,
			notes: parsed.data.notes,
			default_pic_name: parsed.data.default_pic_name,
			default_pic_contact: parsed.data.default_pic_contact,
			commission_mode: parsed.data.commission_mode,
			commission_value_type: parsed.data.commission_value_type,
			commission_value_default: parsed.data.commission_value_default,
			commission_rate_default:
				parsed.data.commission_mode === "commission" &&
				parsed.data.commission_value_type === "percent"
					? parsed.data.commission_value_default
					: null,
			payment_terms: parsed.data.payment_terms,
			company_address: parsed.data.company_address,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("type", "vendor");

	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	revalidatePath("/vendors");
	revalidatePath(`/vendors/${id}`);
	revalidatePath("/contacts");
	revalidatePath("/operations/new");

	return { ok: true, vendor_id: id };
}

/**
 * Soft-archive a vendor. Sets is_active=false. Does NOT touch historical
 * events.vendor_contact_id (preserves audit trail).
 */
export async function archiveVendor(id: string): Promise<{ ok: boolean; error?: string }> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { error } = await supabase
		.from("contacts")
		.update({
			is_active: false,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("type", "vendor");

	if (error) return { ok: false, error: error.message };

	revalidatePath("/vendors");
	revalidatePath("/operations/new");
	return { ok: true };
}

/**
 * Restore an archived vendor.
 */
export async function restoreVendor(id: string): Promise<{ ok: boolean; error?: string }> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { error } = await supabase
		.from("contacts")
		.update({
			is_active: true,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("type", "vendor");

	if (error) return { ok: false, error: error.message };

	revalidatePath("/vendors");
	revalidatePath("/operations/new");
	return { ok: true };
}

/**
 * Auto-upsert a vendor from booking form free-text input. Returns the
 * contact_id (existing or newly created). Used by createBooking/updateBooking
 * to set events.vendor_contact_id when user types a new vendor name.
 *
 * Safe to call from server actions (uses service-role client via SSR).
 */
export async function ensureVendorContact(input: {
	name: string;
	pic_name?: string | null;
	pic_contact?: string | null;
	commission_mode?: VendorCommissionMode | null;
	commission_value_type?: VendorCommissionValueType | null;
	commission_value?: number | null;
}): Promise<string | null> {
	const name = input.name?.trim();
	if (!name) return null;

	const supabase = await createClient();

	// Try find existing (case-insensitive)
	const { data: existing } = await supabase
		.from("contacts")
		.select("id")
		.eq("type", "vendor")
		.eq("is_active", true)
		.ilike("name", name)
		.maybeSingle();

	if (existing) return existing.id as string;

	// Create new vendor master entry. Mode/type/value default to whatever
	// the booking form sent — owner gets a clean record they can refine
	// later in /vendors.
	const mode: VendorCommissionMode = input.commission_mode ?? "commission";
	const valueType: VendorCommissionValueType =
		input.commission_value_type ?? "percent";
	const value = input.commission_value ?? null;

	const { data: created, error } = await supabase
		.from("contacts")
		.insert({
			type: "vendor",
			name,
			phone: input.pic_contact || null,
			default_pic_name: input.pic_name || null,
			default_pic_contact: input.pic_contact || null,
			commission_mode: mode,
			commission_value_type: valueType,
			commission_value_default: value,
			// Back-compat: keep legacy field synced when applicable.
			commission_rate_default:
				mode === "commission" && valueType === "percent" ? value : null,
			is_active: true,
			notes: "Auto-created from booking flow",
		})
		.select("id")
		.single();

	if (error || !created) return null;
	return created.id as string;
}
