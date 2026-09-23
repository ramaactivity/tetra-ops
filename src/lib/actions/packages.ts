"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const SERVICE_TYPES = [
	"photobooth_classic",
	"videobooth_360",
	"magazine_combo",
	"magazine_box_only",
	"photostage_only",
	"photostage_combo",
] as const;

const FRAME_SIZES = ["2R", "4R", "polaroid", "none"] as const;

const PackageInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, "Minimal 2 karakter")
		.max(100, "Maksimal 100 karakter"),
	category: z.enum(SERVICE_TYPES, "Pilih kategori"),
	frame_size: z.enum(FRAME_SIZES, "Pilih frame size"),
	duration_hours: z.coerce
		.number()
		.int("Harus bilangan bulat")
		.min(1, "Minimal 1 jam")
		.max(24, "Maksimal 24 jam"),
	base_price: z.coerce
		.number()
		.int("Harus bilangan bulat")
		.min(1, "Harga harus lebih dari 0"),
	description: z
		.string()
		.trim()
		.max(500, "Maksimal 500 karakter")
		.optional()
		.transform((v) => (v ? v : null)),
	// Poin "include" quotation, satu per baris. Kosong = template kategori.
	quotation_includes: z
		.string()
		.max(2000, "Maksimal 2000 karakter")
		.nullish()
		.transform((v) => {
			const lines = (v ?? "")
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			return lines.length ? lines : null;
		}),
	is_active: z.coerce.boolean(),
});

export type PackageInput = z.infer<typeof PackageInputSchema>;

type PackageErrors = Partial<Record<keyof PackageInput | "_form", string[]>>;

export type PackageFormState =
	| {
			errors?: PackageErrors;
			values?: Record<string, string>;
	  }
	| undefined;

function parseFormData(formData: FormData) {
	return PackageInputSchema.safeParse({
		name: formData.get("name"),
		category: formData.get("category"),
		frame_size: formData.get("frame_size"),
		duration_hours: formData.get("duration_hours"),
		base_price: formData.get("base_price"),
		description: formData.get("description"),
		quotation_includes: formData.get("quotation_includes"),
		is_active: formData.get("is_active") === "on",
	});
}

function snapshotValues(formData: FormData): Record<string, string> {
	return {
		name: String(formData.get("name") ?? ""),
		category: String(formData.get("category") ?? ""),
		frame_size: String(formData.get("frame_size") ?? ""),
		duration_hours: String(formData.get("duration_hours") ?? ""),
		base_price: String(formData.get("base_price") ?? ""),
		description: String(formData.get("description") ?? ""),
		quotation_includes: String(formData.get("quotation_includes") ?? ""),
		is_active: formData.get("is_active") === "on" ? "on" : "",
	};
}

async function requireOwnerLevel() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");
	if (user.profile.role !== "super_admin" && user.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return user;
}

export async function createPackage(
	_prev: PackageFormState,
	formData: FormData,
): Promise<PackageFormState> {
	await requireOwnerLevel();

	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as PackageErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase.from("packages").insert(parsed.data);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	revalidatePath("/operations/packages");
	redirect("/operations/packages");
}

export async function updatePackage(
	id: string,
	_prev: PackageFormState,
	formData: FormData,
): Promise<PackageFormState> {
	await requireOwnerLevel();

	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as PackageErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("packages")
		.update(parsed.data)
		.eq("id", id);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	revalidatePath("/operations/packages");
	revalidatePath(`/operations/packages/${id}/edit`);
	redirect("/operations/packages");
}

export async function archivePackage(id: string) {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { error } = await supabase
		.from("packages")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(error.message);

	revalidatePath("/operations/packages");
}
