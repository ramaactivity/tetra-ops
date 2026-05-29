"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const ALLOCATION_TYPES = ["percentage", "flat"] as const;

const FundInputSchema = z.object({
	code: z
		.string()
		.trim()
		.min(2, "Minimal 2 karakter")
		.max(40, "Maksimal 40 karakter")
		.regex(/^[a-z0-9_]+$/, "Pakai huruf kecil, angka, dan underscore"),
	name: z.string().trim().min(2, "Minimal 2 karakter").max(80),
	description: z
		.string()
		.trim()
		.max(300)
		.optional()
		.transform((v) => (v ? v : null)),
	allocation_type: z.enum(ALLOCATION_TYPES, "Pilih tipe alokasi"),
	allocation_value: z.coerce
		.number()
		.nonnegative("Tidak boleh negatif")
		.refine((v) => v <= 100_000_000, "Terlalu besar"),
	target_balance: z.coerce
		.number()
		.int()
		.nonnegative()
		.optional()
		.transform((v) => (v && v > 0 ? v : null)),
	coa_account: z
		.string()
		.trim()
		.max(20)
		.optional()
		.transform((v) => (v ? v : null)),
	display_order: z.coerce.number().int().min(0).default(0),
	is_active: z.coerce.boolean(),
});

export type FundInput = z.infer<typeof FundInputSchema>;
type FundErrors = Partial<Record<keyof FundInput | "_form", string[]>>;
export type FundFormState =
	| { errors?: FundErrors; values?: Record<string, string> }
	| undefined;

function parseFundFormData(formData: FormData) {
	return FundInputSchema.safeParse({
		code: formData.get("code"),
		name: formData.get("name"),
		description: formData.get("description"),
		allocation_type: formData.get("allocation_type"),
		allocation_value: formData.get("allocation_value"),
		target_balance: formData.get("target_balance"),
		coa_account: formData.get("coa_account"),
		display_order: formData.get("display_order"),
		is_active: formData.get("is_active") === "on",
	});
}

function snapshotFundValues(formData: FormData): Record<string, string> {
	const keys = [
		"code",
		"name",
		"description",
		"allocation_type",
		"allocation_value",
		"target_balance",
		"coa_account",
		"display_order",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	out.is_active = formData.get("is_active") === "on" ? "on" : "";
	return out;
}

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

export async function createSinkingFund(
	_prev: FundFormState,
	formData: FormData,
): Promise<FundFormState> {
	await requireOwnerLevel();

	const parsed = parseFundFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as FundErrors,
			values: snapshotFundValues(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase.from("sinking_funds").insert(parsed.data);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotFundValues(formData),
		};
	}

	revalidatePath("/finance/sinking-funds");
	redirect("/finance/sinking-funds");
}

export async function updateSinkingFund(
	id: string,
	_prev: FundFormState,
	formData: FormData,
): Promise<FundFormState> {
	await requireOwnerLevel();

	const parsed = parseFundFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as FundErrors,
			values: snapshotFundValues(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("sinking_funds")
		.update({ ...parsed.data, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotFundValues(formData),
		};
	}

	revalidatePath("/finance/sinking-funds");
	revalidatePath(`/finance/sinking-funds/${id}/edit`);
	redirect("/finance/sinking-funds");
}

export async function toggleSinkingFundActive(id: string, nextActive: boolean) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("sinking_funds")
		.update({ is_active: nextActive, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/finance/sinking-funds");
}

const MovementInputSchema = z
	.object({
		fund_id: z.uuid(),
		movement_type: z.enum(["deposit", "withdrawal"]),
		amount: z.coerce.number().int().positive("Jumlah harus > 0"),
		description: z
			.string()
			.trim()
			.min(2, "Minimal 2 karakter")
			.max(300, "Maksimal 300 karakter"),
		target_bank_account_id: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? v : null)),
	})
	.refine(
		(d) => d.movement_type === "deposit" || d.target_bank_account_id !== null,
		{
			message: "Pilih bank tujuan untuk withdrawal",
			path: ["target_bank_account_id"],
		},
	);

export type MovementInput = z.infer<typeof MovementInputSchema>;
type MovementErrors = Partial<Record<keyof MovementInput | "_form", string[]>>;
export type MovementFormState =
	| { errors?: MovementErrors; values?: Record<string, string> }
	| undefined;

export async function addManualMovement(
	fundId: string,
	_prev: MovementFormState,
	formData: FormData,
): Promise<MovementFormState> {
	const me = await requireOwnerLevel();

	const parsed = MovementInputSchema.safeParse({
		fund_id: fundId,
		movement_type: formData.get("movement_type"),
		amount: formData.get("amount"),
		description: formData.get("description"),
		target_bank_account_id: formData.get("target_bank_account_id"),
	});

	if (!parsed.success) {
		const out: Record<string, string> = {};
		for (const k of [
			"movement_type",
			"amount",
			"description",
			"target_bank_account_id",
		]) {
			out[k] = String(formData.get(k) ?? "");
		}
		return {
			errors: parsed.error.flatten().fieldErrors as MovementErrors,
			values: out,
		};
	}

	const supabase = await createClient();
	const { error } = await supabase.from("sinking_fund_movements").insert({
		fund_id: parsed.data.fund_id,
		movement_type: parsed.data.movement_type,
		amount: parsed.data.amount,
		source_type: "manual",
		target_bank_account_id:
			parsed.data.movement_type === "withdrawal"
				? parsed.data.target_bank_account_id
				: null,
		description: parsed.data.description,
		performed_by: me.authId,
	});

	if (error) {
		return {
			errors: { _form: [error.message] },
			values: {
				movement_type: String(formData.get("movement_type") ?? ""),
				amount: String(formData.get("amount") ?? ""),
				description: String(formData.get("description") ?? ""),
				target_bank_account_id: String(
					formData.get("target_bank_account_id") ?? "",
				),
			},
		};
	}

	revalidatePath("/finance/sinking-funds");
	revalidatePath(`/finance/sinking-funds/${fundId}/movements`);
	return undefined;
}
