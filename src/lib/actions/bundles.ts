"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { generateInventorySku } from "@/lib/inventory/sku-generator";
import { createClient } from "@/lib/supabase/server";

/**
 * Bill of Materials (BOM) bundle actions.
 *
 * Bundle = parent SKU + komponen list. Tidak punya stok sendiri. Saat
 * dipakai event, sistem resolve ke komponen + deduct stok masing-masing.
 *
 * Fase ini cuma CRUD bundle definition. Integrasi ke rekap event di fase
 * berikut (akan butuh expand bundle saat planRekapDeduction).
 */

const SKU_REGEX = /^[A-Z0-9_-]+$/;

const ComponentSchema = z.object({
	item_id: z.uuid("Item tidak valid"),
	qty: z.coerce.number().positive("Qty harus > 0"),
	notes: z
		.string()
		.trim()
		.max(120)
		.optional()
		.nullable()
		.transform((v) => (v ? v : null)),
});

const BundleInputSchema = z
	.object({
		name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
		sku_override: z
			.string()
			.trim()
			.max(40)
			.optional()
			.transform((v) => (v ? v.toUpperCase() : ""))
			.refine((v) => v === "" || SKU_REGEX.test(v), {
				message: "SKU: huruf kapital, angka, hyphen, underscore",
			}),
		notes: z
			.string()
			.trim()
			.max(500)
			.optional()
			.transform((v) => (v ? v : null)),
		is_active: z.coerce.boolean(),
		components: z
			.string()
			.transform((v): z.infer<typeof ComponentSchema>[] => {
				try {
					const parsed = JSON.parse(v);
					if (!Array.isArray(parsed)) return [];
					return parsed
						.map((c) => ComponentSchema.safeParse(c))
						.filter((r) => r.success)
						.map((r) => (r as { success: true; data: z.infer<typeof ComponentSchema> }).data);
				} catch {
					return [];
				}
			})
			.refine((arr) => arr.length > 0, {
				message: "Minimal 1 komponen",
			}),
	})
	.refine(
		(d) => {
			const ids = d.components.map((c) => c.item_id);
			return new Set(ids).size === ids.length;
		},
		{
			message: "Komponen duplikat (item sama 2x)",
			path: ["components"],
		},
	);

export type BundleInput = z.infer<typeof BundleInputSchema>;
type Errors = Partial<Record<keyof BundleInput | "_form", string[]>>;
export type BundleFormState =
	| { errors?: Errors; values?: Record<string, string> }
	| undefined;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function safeReturnTo(raw: FormDataEntryValue | null): string {
	const s = typeof raw === "string" ? raw : "";
	const allowed = new Set(["/warehouse/bundles", "/warehouse"]);
	return allowed.has(s) ? s : "/warehouse/bundles";
}

function parse(formData: FormData) {
	return BundleInputSchema.safeParse({
		name: formData.get("name"),
		sku_override: formData.get("sku_override"),
		notes: formData.get("notes"),
		is_active: formData.get("is_active") === "on",
		components: formData.get("components") ?? "[]",
	});
}

function snapshot(formData: FormData): Record<string, string> {
	const out: Record<string, string> = {};
	for (const k of ["name", "sku_override", "notes", "components"]) {
		out[k] = String(formData.get(k) ?? "");
	}
	out.is_active = formData.get("is_active") === "on" ? "on" : "";
	return out;
}

function bundleSkuFromName(name: string): string {
	const generated = generateInventorySku(name);
	// Replace "ITM-" prefix with "BUNDLE-" for clarity; keep mapped prefixes
	return generated.startsWith("ITM-")
		? generated.replace(/^ITM-/, "BUNDLE-")
		: `BUNDLE-${generated}`;
}

async function ensureUniqueBundleSku(
	supabase: Awaited<ReturnType<typeof createClient>>,
	baseSku: string,
): Promise<string> {
	let candidate = baseSku;
	for (let attempt = 1; attempt < 100; attempt++) {
		const { data } = await supabase
			.from("item_bundles")
			.select("id")
			.eq("sku", candidate)
			.maybeSingle();
		if (!data) return candidate;
		attempt++;
		candidate = `${baseSku}-${attempt}`;
	}
	throw new Error(`Tidak bisa generate SKU unik untuk "${baseSku}"`);
}

export async function createBundle(
	_prev: BundleFormState,
	formData: FormData,
): Promise<BundleFormState> {
	await requireOwnerLevel();
	const parsed = parse(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as Errors,
			values: snapshot(formData),
		};
	}
	const data = parsed.data;
	const supabase = await createClient();

	const baseSku = data.sku_override || bundleSkuFromName(data.name);
	const sku = await ensureUniqueBundleSku(supabase, baseSku);

	const { data: inserted, error: insErr } = await supabase
		.from("item_bundles")
		.insert({
			sku,
			name: data.name,
			notes: data.notes,
			is_active: data.is_active,
		})
		.select("id")
		.single();
	if (insErr || !inserted) {
		return {
			errors: { _form: [insErr?.message ?? "Gagal create bundle"] },
			values: snapshot(formData),
		};
	}

	const componentRows = data.components.map((c, idx) => ({
		bundle_id: inserted.id,
		item_id: c.item_id,
		qty: c.qty,
		line_order: idx + 1,
		notes: c.notes,
	}));
	const { error: compErr } = await supabase
		.from("bundle_components")
		.insert(componentRows);
	if (compErr) {
		await supabase.from("item_bundles").delete().eq("id", inserted.id);
		return {
			errors: { _form: [`Gagal insert komponen: ${compErr.message}`] },
			values: snapshot(formData),
		};
	}

	revalidatePath("/warehouse/bundles");
	revalidatePath("/warehouse");
	redirect(safeReturnTo(formData.get("return_to")));
}

export async function updateBundle(
	id: string,
	_prev: BundleFormState,
	formData: FormData,
): Promise<BundleFormState> {
	await requireOwnerLevel();
	const parsed = parse(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as Errors,
			values: snapshot(formData),
		};
	}
	const data = parsed.data;
	const supabase = await createClient();

	const { error: baseErr } = await supabase
		.from("item_bundles")
		.update({
			name: data.name,
			notes: data.notes,
			is_active: data.is_active,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);
	if (baseErr) {
		return {
			errors: { _form: [baseErr.message] },
			values: snapshot(formData),
		};
	}

	// Replace strategy: delete all components, re-insert. Sederhana + audit
	// via updated_at di header. Bundle masih jarang berubah jadi acceptable.
	await supabase.from("bundle_components").delete().eq("bundle_id", id);

	const componentRows = data.components.map((c, idx) => ({
		bundle_id: id,
		item_id: c.item_id,
		qty: c.qty,
		line_order: idx + 1,
		notes: c.notes,
	}));
	const { error: compErr } = await supabase
		.from("bundle_components")
		.insert(componentRows);
	if (compErr) {
		return {
			errors: { _form: [`Gagal update komponen: ${compErr.message}`] },
			values: snapshot(formData),
		};
	}

	revalidatePath("/warehouse/bundles");
	revalidatePath(`/warehouse/bundles/${id}/edit`);
	revalidatePath("/warehouse");
	redirect(safeReturnTo(formData.get("return_to")));
}

export async function archiveBundle(id: string) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("item_bundles")
		.update({ deleted_at: new Date().toISOString(), is_active: false })
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/warehouse/bundles");
	revalidatePath("/warehouse");
}
