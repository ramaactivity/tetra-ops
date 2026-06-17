"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Bank account creation.
 *
 * A bank/cash account in Tetra is two coupled rows:
 *   1. a `chart_of_accounts` ledger code in the 1-11x range (asset, Kas &
 *      Bank group) so journal entries can reference it, and
 *   2. the `bank_accounts` row carrying the human-facing metadata + the
 *      default-receive flag.
 *
 * The COA code is auto-assigned (next free 1-11x) so the owner never has to
 * understand the accounting numbering. Cash is reserved at 1-100; banks
 * start at 1-110.
 */

const BankAccountInputSchema = z.object({
	account_name: z
		.string()
		.trim()
		.min(2, "Minimal 2 karakter")
		.max(80, "Maksimal 80 karakter"),
	bank_name: z
		.string()
		.trim()
		.min(1, "Wajib diisi")
		.max(40, "Maksimal 40 karakter"),
	account_number: z
		.string()
		.trim()
		.max(40, "Maksimal 40 karakter")
		.optional()
		.transform((v) => (v ? v : null)),
	account_holder: z
		.string()
		.trim()
		.max(80, "Maksimal 80 karakter")
		.optional()
		.transform((v) => (v ? v : null)),
	is_default_receive: z.coerce.boolean(),
	is_active: z.coerce.boolean(),
});

export type BankAccountInput = z.infer<typeof BankAccountInputSchema>;

type BankAccountErrors = Partial<
	Record<keyof BankAccountInput | "_form", string[]>
>;

export type BankAccountFormState =
	| {
			ok?: true;
			errors?: BankAccountErrors;
			values?: Record<string, string>;
	  }
	| undefined;

async function requireOwnerLevel() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");
	if (user.profile.role !== "super_admin" && user.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return user;
}

function snapshot(formData: FormData): Record<string, string> {
	return {
		account_name: String(formData.get("account_name") ?? ""),
		bank_name: String(formData.get("bank_name") ?? ""),
		account_number: String(formData.get("account_number") ?? ""),
		account_holder: String(formData.get("account_holder") ?? ""),
		is_default_receive: formData.get("is_default_receive") === "on" ? "on" : "",
		is_active: formData.get("is_active") === "on" ? "on" : "",
	};
}

/** Suffix of a `1-1xx` code as an integer, or null if it doesn't match. */
function bankCoaSuffix(code: string): number | null {
	const m = /^1-1(\d{2})$/.exec(code);
	return m ? Number(`1${m[1]}`) : null;
}

export async function createBankAccount(
	_prev: BankAccountFormState,
	formData: FormData,
): Promise<BankAccountFormState> {
	await requireOwnerLevel();

	const parsed = BankAccountInputSchema.safeParse({
		account_name: formData.get("account_name"),
		bank_name: formData.get("bank_name"),
		account_number: formData.get("account_number"),
		account_holder: formData.get("account_holder"),
		is_default_receive: formData.get("is_default_receive") === "on",
		is_active: formData.get("is_active") === "on",
	});

	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as BankAccountErrors,
			values: snapshot(formData),
		};
	}

	const input = parsed.data;
	const supabase = await createClient();

	// 1. Pick the next free COA code in the Kas & Bank (1-1xx) range.
	const { data: coaRows, error: coaReadErr } = await supabase
		.from("chart_of_accounts")
		.select("code, account_type, parent_code")
		.like("code", "1-1%");

	if (coaReadErr) {
		return {
			errors: { _form: [coaReadErr.message] },
			values: snapshot(formData),
		};
	}

	const suffixes = (coaRows ?? [])
		.map((r) => bankCoaSuffix(r.code as string))
		.filter((n): n is number => n !== null);
	// Cash holds 1-100; banks start at 1-110. Next = max(existing)+1, floored.
	const nextSuffix = Math.max(
		110,
		(suffixes.length ? Math.max(...suffixes) : 109) + 1,
	);
	if (nextSuffix > 199) {
		return {
			errors: { _form: ["Range kode COA bank (1-110..1-199) sudah penuh."] },
			values: snapshot(formData),
		};
	}
	const newCode = `1-${nextSuffix}`;

	// Copy account_type + parent_code from an existing Kas & Bank account so
	// the new ledger code lands in the same group (fallback to sane defaults).
	const reference =
		(coaRows ?? []).find((r) => r.code === "1-100") ?? (coaRows ?? [])[0];
	const accountType = (reference?.account_type as string) ?? "asset";
	const parentCode = (reference?.parent_code as string) ?? "1-000";

	// 2. Insert the ledger code.
	const { error: coaInsertErr } = await supabase
		.from("chart_of_accounts")
		.insert({
			code: newCode,
			name: input.account_name,
			account_type: accountType,
			parent_code: parentCode,
			is_active: true,
			description: `Rekening ${input.bank_name}${
				input.account_holder ? ` — a.n. ${input.account_holder}` : ""
			}`,
		});

	if (coaInsertErr) {
		return {
			errors: { _form: [`Gagal membuat kode akun: ${coaInsertErr.message}`] },
			values: snapshot(formData),
		};
	}

	// 3. If this becomes the default receiver, clear the previous default.
	if (input.is_default_receive) {
		const { error: clearErr } = await supabase
			.from("bank_accounts")
			.update({ is_default_receive: false })
			.eq("is_default_receive", true);
		if (clearErr) {
			await supabase.from("chart_of_accounts").delete().eq("code", newCode);
			return {
				errors: { _form: [clearErr.message] },
				values: snapshot(formData),
			};
		}
	}

	// 4. Insert the bank account row.
	const { error: bankErr } = await supabase.from("bank_accounts").insert({
		account_name: input.account_name,
		bank_name: input.bank_name,
		account_number: input.account_number,
		account_holder: input.account_holder,
		coa_code: newCode,
		is_default_receive: input.is_default_receive,
		is_active: input.is_active,
	});

	if (bankErr) {
		// Roll back the orphan ledger code we just created (best-effort).
		await supabase.from("chart_of_accounts").delete().eq("code", newCode);
		return {
			errors: { _form: [bankErr.message] },
			values: snapshot(formData),
		};
	}

	revalidatePath("/finance/bank-accounts");
	return { ok: true };
}
