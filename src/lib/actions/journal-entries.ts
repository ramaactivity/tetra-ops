"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const LineSchema = z
	.object({
		account_code: z.string().trim().min(2).max(20),
		debit_amount: z.coerce.number().int().nonnegative(),
		credit_amount: z.coerce.number().int().nonnegative(),
		description: z
			.string()
			.trim()
			.max(200)
			.optional()
			.transform((v) => (v ? v : null)),
	})
	.refine(
		(l) =>
			(l.debit_amount > 0 && l.credit_amount === 0) ||
			(l.credit_amount > 0 && l.debit_amount === 0),
		{
			message:
				"Setiap baris harus punya debit ATAU credit (tidak boleh dua-duanya, tidak boleh kosong)",
		},
	);

const ManualEntrySchema = z.object({
	entry_date: z.string().trim().min(8),
	entry_type: z.enum([
		"revenue",
		"expense",
		"asset_in",
		"asset_out",
		"transfer",
		"adjustment",
	]),
	description: z.string().trim().min(3).max(300),
	lines: z
		.string()
		.transform((v) => {
			try {
				return JSON.parse(v);
			} catch {
				return [];
			}
		})
		.pipe(
			z
				.array(LineSchema)
				.min(2, "Minimal 2 baris (double-entry)")
				.refine(
					(arr) => {
						const totalD = arr.reduce((s, l) => s + l.debit_amount, 0);
						const totalC = arr.reduce((s, l) => s + l.credit_amount, 0);
						return totalD === totalC;
					},
					{
						message:
							"Total debit harus sama dengan total credit (balanced double-entry)",
					},
				)
				.refine(
					(arr) =>
						arr.reduce((s, l) => s + l.debit_amount + l.credit_amount, 0) > 0,
					{ message: "Total entry tidak boleh nol" },
				),
		),
});

type ManualEntryErrors = {
	entry_date?: string[];
	entry_type?: string[];
	description?: string[];
	lines?: string[];
	_form?: string[];
};

export type ManualEntryFormState =
	| {
			errors?: ManualEntryErrors;
			values?: Record<string, string>;
			success?: true;
			refId?: string;
	  }
	| undefined;

function newJournalRef(date: Date): string {
	const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${yyyymmdd}-${rand}`;
}

export async function createManualJournalEntry(
	_prev: ManualEntryFormState,
	formData: FormData,
): Promise<ManualEntryFormState> {
	const me = await requireOwnerLevel();

	const parsed = ManualEntrySchema.safeParse({
		entry_date: formData.get("entry_date"),
		entry_type: formData.get("entry_type"),
		description: formData.get("description"),
		lines: formData.get("lines") ?? "[]",
	});

	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as ManualEntryErrors,
		};
	}

	const supabase = await createClient();

	// Validate that all account_code references exist + active
	const codes = Array.from(
		new Set(parsed.data.lines.map((l) => l.account_code)),
	);
	const { data: coa, error: coaErr } = await supabase
		.from("chart_of_accounts")
		.select("code, is_active")
		.in("code", codes);
	if (coaErr) {
		return { errors: { _form: [coaErr.message] } };
	}
	const found = new Set((coa ?? []).map((c) => c.code as string));
	const missing = codes.filter((c) => !found.has(c));
	if (missing.length > 0) {
		return {
			errors: {
				lines: [`Akun tidak ditemukan: ${missing.join(", ")}`],
			},
		};
	}
	const inactive = (coa ?? [])
		.filter((c) => !c.is_active)
		.map((c) => c.code as string);
	if (inactive.length > 0) {
		return {
			errors: {
				lines: [`Akun nonaktif tidak bisa dipakai: ${inactive.join(", ")}`],
			},
		};
	}

	const totalAmount = parsed.data.lines.reduce(
		(s, l) => s + l.debit_amount,
		0,
	);
	const refId = newJournalRef(new Date(parsed.data.entry_date));

	const { data: entry, error: entryErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: refId,
			entry_date: parsed.data.entry_date,
			entry_type: parsed.data.entry_type,
			description: parsed.data.description,
			source_type: "manual",
			source_id: null,
			total_amount: totalAmount,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (entryErr || !entry) {
		return {
			errors: { _form: [entryErr?.message ?? "Gagal create entry"] },
		};
	}

	const lineRows = parsed.data.lines.map((l, idx) => ({
		entry_id: entry.id,
		account_code: l.account_code,
		debit_amount: l.debit_amount,
		credit_amount: l.credit_amount,
		description: l.description,
		line_order: idx + 1,
	}));
	const { error: linesErr } = await supabase
		.from("journal_lines")
		.insert(lineRows);
	if (linesErr) {
		// Roll back the header — no orphaned entries
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return { errors: { _form: [linesErr.message] } };
	}

	revalidatePath("/finance");
	revalidatePath("/finance/accounting");
	return { success: true, refId };
}

/**
 * Mark a journal entry as reversed by creating a balanced counter-entry
 * (debit↔credit swapped) + setting is_reversed=true on the original.
 * Use case: undo a manual entry that was mis-keyed.
 *
 * Note: not exposed in UI yet — bisa dipakai dari server context kalau perlu.
 */
export async function reverseJournalEntry(
	entryId: string,
	reason: string,
): Promise<
	{ ok: true; reversalRefId: string } | { ok: false; error: string }
> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();

	const { data: existing, error: readErr } = await supabase
		.from("journal_entries")
		.select(
			`id, ref_id, entry_date, entry_type, description, source_type, source_id,
			 is_reversed, total_amount,
			 lines:journal_lines(id, account_code, debit_amount, credit_amount, description, line_order)`,
		)
		.eq("id", entryId)
		.maybeSingle();
	if (readErr || !existing) {
		return { ok: false, error: readErr?.message ?? "Entry tidak ditemukan" };
	}
	if (existing.is_reversed) {
		return { ok: false, error: "Entry ini sudah di-reverse sebelumnya" };
	}
	if (existing.source_type !== "manual") {
		return {
			ok: false,
			error:
				"Hanya entry manual yang bisa di-reverse via flow ini. Entry auto (settlement / pembelian / dll) harus di-reverse via flow asalnya.",
		};
	}

	const reversalRefId = newJournalRef(new Date());
	const { data: reversal, error: revErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: reversalRefId,
			entry_date: new Date().toISOString().slice(0, 10),
			entry_type: "reversal",
			description: `REVERSAL ${existing.ref_id} — ${reason}`,
			source_type: "manual",
			source_id: null,
			total_amount: Number(existing.total_amount),
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (revErr || !reversal) {
		return { ok: false, error: revErr?.message ?? "Gagal create reversal" };
	}

	const reversalLines = ((existing.lines ?? []) as Array<{
		account_code: string;
		debit_amount: number | string;
		credit_amount: number | string;
		description: string | null;
		line_order: number;
	}>).map((l) => ({
		entry_id: reversal.id,
		account_code: l.account_code,
		debit_amount: Number(l.credit_amount),
		credit_amount: Number(l.debit_amount),
		description: l.description ? `REV: ${l.description}` : "REV",
		line_order: l.line_order,
	}));
	const { error: linesErr } = await supabase
		.from("journal_lines")
		.insert(reversalLines);
	if (linesErr) {
		await supabase.from("journal_entries").delete().eq("id", reversal.id);
		return { ok: false, error: linesErr.message };
	}

	await supabase
		.from("journal_entries")
		.update({
			is_reversed: true,
			reversed_by_entry_id: reversal.id,
			reversed_at: new Date().toISOString(),
		})
		.eq("id", entryId);

	revalidatePath("/finance/accounting");
	return { ok: true, reversalRefId };
}
