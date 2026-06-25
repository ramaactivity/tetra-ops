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

function newJournalRef(date: Date): string {
	const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${yyyymmdd}-${rand}`;
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
		// ?? undefined: deposit (mode default) tak render field ini → get()=null;
		// optional() cuma izinkan undefined → null bikin Zod tolak tiap deposit.
		target_bank_account_id: formData.get("target_bank_account_id") ?? undefined,
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
	const isWithdrawal = parsed.data.movement_type === "withdrawal";

	const snapshotErr = (msg: string): MovementFormState => ({
		errors: { _form: [msg] },
		values: {
			movement_type: String(formData.get("movement_type") ?? ""),
			amount: String(formData.get("amount") ?? ""),
			description: String(formData.get("description") ?? ""),
			target_bank_account_id: String(
				formData.get("target_bank_account_id") ?? "",
			),
		},
	});

	// Resolve fund → sinking liability COA (2-2xx).
	const { data: fund } = await supabase
		.from("sinking_funds")
		.select("code, name, coa_account")
		.eq("id", parsed.data.fund_id)
		.maybeSingle();
	if (!fund) return snapshotErr("Sinking fund tidak ditemukan");
	const fundCoa = fund.coa_account as string | null;
	if (!fundCoa) {
		return snapshotErr(
			`Fund "${fund.name}" belum punya COA account. Set dulu di edit fund.`,
		);
	}

	// Withdrawal butuh kas/bank tujuan → COA asset untuk sisi kredit.
	let bankCoa: string | null = null;
	let bankName = "";
	if (isWithdrawal) {
		const { data: bank } = await supabase
			.from("bank_accounts")
			.select("coa_code, account_name, is_active")
			.eq("id", parsed.data.target_bank_account_id)
			.maybeSingle();
		if (!bank) return snapshotErr("Kas/bank tujuan tidak ditemukan");
		if (!bank.is_active) return snapshotErr(`${bank.account_name} nonaktif`);
		bankCoa = bank.coa_code as string;
		bankName = bank.account_name as string;
	}

	// GL — mirror settle_event (deposit = appropriate Laba Ditahan → reserve):
	//   deposit:    Dr 3-200 Laba Ditahan        / Cr 2-2xx Sinking liability
	//   withdrawal: Dr 2-2xx Sinking liability    / Cr kas-bank (pakai reserve)
	const refId = newJournalRef(new Date());
	const { data: entry, error: entryErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: refId,
			entry_date: new Date().toISOString().slice(0, 10),
			entry_type: isWithdrawal ? "asset_out" : "transfer",
			description: `Sinking ${fund.name} (${parsed.data.movement_type}) — ${parsed.data.description}`,
			source_type: "sinking_movement",
			source_id: parsed.data.fund_id,
			total_amount: parsed.data.amount,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (entryErr || !entry) {
		return snapshotErr(`Gagal create journal: ${entryErr?.message}`);
	}
	const lines = isWithdrawal
		? [
				{
					entry_id: entry.id,
					account_code: fundCoa,
					debit_amount: parsed.data.amount,
					credit_amount: 0,
					description: `Pakai reserve ${fund.name}`,
					line_order: 1,
				},
				{
					entry_id: entry.id,
					account_code: bankCoa as string,
					debit_amount: 0,
					credit_amount: parsed.data.amount,
					description: `Kas keluar (${bankName})`,
					line_order: 2,
				},
			]
		: [
				{
					entry_id: entry.id,
					account_code: "3-200",
					debit_amount: parsed.data.amount,
					credit_amount: 0,
					description: "Transfer Laba Ditahan → Sinking",
					line_order: 1,
				},
				{
					entry_id: entry.id,
					account_code: fundCoa,
					debit_amount: 0,
					credit_amount: parsed.data.amount,
					description: `Sinking liability: ${fund.code}`,
					line_order: 2,
				},
			];
	const { error: linesErr } = await supabase
		.from("journal_lines")
		.insert(lines);
	if (linesErr) {
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return snapshotErr(`Gagal create journal lines: ${linesErr.message}`);
	}

	const { error } = await supabase.from("sinking_fund_movements").insert({
		fund_id: parsed.data.fund_id,
		movement_type: parsed.data.movement_type,
		amount: parsed.data.amount,
		source_type: "manual",
		target_bank_account_id: isWithdrawal
			? parsed.data.target_bank_account_id
			: null,
		description: parsed.data.description,
		performed_by: me.profile.id,
	});

	if (error) {
		// Roll back the journal so GL & sub-ledger stay in lockstep.
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return snapshotErr(error.message);
	}

	revalidatePath("/finance/sinking-funds");
	revalidatePath(`/finance/sinking-funds/${fundId}/movements`);
	revalidatePath("/finance/accounting");
	return undefined;
}
