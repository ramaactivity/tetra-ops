"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { EMONEY_COA_FIRST, EMONEY_COA_LAST } from "@/lib/finance/emoney";
import { createClient } from "@/lib/supabase/server";

/**
 * Kartu e-money (e-toll): buat kartu, isi saldo, cocokkan saldo.
 *
 * Kartu = baris `bank_accounts` (account_kind='emoney') + kode COA di blok
 * 1-140..1-159. Saldonya hidup di jurnal, bukan di kolom — jadi tak ada satu
 * pun angka saldo yang bisa menyimpang dari buku.
 *
 * Semua pergerakan uang lewat RPC (record_balance_transfer /
 * record_emoney_recount) supaya jurnalnya atomik dan penjaga saldo tidak bisa
 * dilewati dari sisi aplikasi.
 */

type Errors = Record<string, string[] | undefined>;
export type EmoneyFormState =
	| {
			ok?: true;
			errors?: Errors;
			values?: Record<string, string>;
			info?: string;
	  }
	| undefined;

async function requireOwner() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");
	if (user.profile.role !== "super_admin" && user.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return user;
}

/** formData.get() mengembalikan null untuk field yang absen — .nullish() wajib. */
const OptionalText = z
	.string()
	.trim()
	.max(120)
	.nullish()
	.transform((v) => (v ? v : null));

const Money = z.coerce.number().int().nonnegative();

const today = () => new Date().toISOString().slice(0, 10);

function fail(errors: Errors, formData: FormData): EmoneyFormState {
	const values: Record<string, string> = {};
	for (const [k, v] of formData.entries()) {
		if (typeof v === "string") values[k] = v;
	}
	return { errors, values };
}

function revalidate() {
	revalidatePath("/finance/bank-accounts");
	revalidatePath("/finance");
	revalidatePath("/finance/akuntansi");
}

// ---------------------------------------------------------------------------
// 1. Buat kartu
// ---------------------------------------------------------------------------

const CardSchema = z.object({
	account_name: z
		.string()
		.trim()
		.min(2, "Minimal 2 karakter")
		.max(80, "Maksimal 80 karakter"),
	card_provider: OptionalText,
	card_number: OptionalText,
	holder_note: OptionalText,
	low_balance_threshold: Money.default(0),
	opening_balance: Money.default(0),
	/**
	 * "existing" = saldo sudah lama ada di kartu; uangnya keluar dari bank di
	 * periode lalu (dan di Tetra Ops sering sudah terlanjur dibebankan), jadi
	 * lawannya 3-101 Modal Awal — kas TIDAK disentuh lagi.
	 * "transfer" = uang baru dipindahkan hari ini dari rekening yang dipilih.
	 */
	opening_source: z.enum(["existing", "transfer"]).default("existing"),
	opening_from_coa: OptionalText,
	opening_date: z
		.string()
		.trim()
		.nullish()
		.transform((v) => (v ? v : today())),
	is_active: z.coerce.boolean(),
});

export async function createEmoneyCard(
	_prev: EmoneyFormState,
	formData: FormData,
): Promise<EmoneyFormState> {
	const user = await requireOwner();

	const parsed = CardSchema.safeParse({
		account_name: formData.get("account_name"),
		card_provider: formData.get("card_provider"),
		card_number: formData.get("card_number"),
		holder_note: formData.get("holder_note"),
		low_balance_threshold: formData.get("low_balance_threshold") || 0,
		opening_balance: formData.get("opening_balance") || 0,
		opening_source: formData.get("opening_source") || "existing",
		opening_from_coa: formData.get("opening_from_coa"),
		opening_date: formData.get("opening_date"),
		is_active: formData.get("is_active") === "on",
	});
	if (!parsed.success) {
		return fail(parsed.error.flatten().fieldErrors as Errors, formData);
	}
	const input = parsed.data;

	if (
		input.opening_balance > 0 &&
		input.opening_source === "transfer" &&
		!input.opening_from_coa
	) {
		return fail(
			{ opening_from_coa: ["Pilih rekening asal uangnya"] },
			formData,
		);
	}

	const supabase = await createClient();

	// Kode COA berikutnya di blok kartu.
	const { data: coaRows, error: coaErr } = await supabase
		.from("chart_of_accounts")
		.select("code, account_type, parent_code")
		.like("code", "1-1%");
	if (coaErr) return fail({ _form: [coaErr.message] }, formData);

	const used = (coaRows ?? [])
		.map((r) => {
			const m = /^1-1(\d{2})$/.exec(r.code as string);
			return m ? Number(`1${m[1]}`) : null;
		})
		.filter(
			(n): n is number =>
				n !== null && n >= EMONEY_COA_FIRST && n <= EMONEY_COA_LAST,
		);
	const next = used.length ? Math.max(...used) + 1 : EMONEY_COA_FIRST;
	if (next > EMONEY_COA_LAST) {
		return fail(
			{
				_form: [
					`Kode akun kartu (1-${EMONEY_COA_FIRST}..1-${EMONEY_COA_LAST}) sudah penuh.`,
				],
			},
			formData,
		);
	}
	const newCode = `1-${next}`;

	const reference =
		(coaRows ?? []).find((r) => r.code === "1-100") ?? (coaRows ?? [])[0];

	const { error: coaInsErr } = await supabase.from("chart_of_accounts").insert({
		code: newCode,
		name: input.account_name,
		account_type: (reference?.account_type as string) ?? "asset",
		parent_code: (reference?.parent_code as string) ?? "1-000",
		is_active: true,
		description: `Kartu e-money${
			input.card_provider ? ` — ${input.card_provider}` : ""
		}`,
	});
	if (coaInsErr) {
		return fail(
			{ _form: [`Gagal membuat kode akun: ${coaInsErr.message}`] },
			formData,
		);
	}

	const { data: inserted, error: cardErr } = await supabase
		.from("bank_accounts")
		.insert({
			account_name: input.account_name,
			bank_name: input.card_provider ?? "E-money",
			account_number: input.card_number,
			coa_code: newCode,
			account_kind: "emoney",
			card_provider: input.card_provider,
			holder_note: input.holder_note,
			low_balance_threshold: input.low_balance_threshold,
			is_default_receive: false,
			is_active: input.is_active,
		})
		.select("id")
		.single();

	if (cardErr || !inserted) {
		// Bersihkan kode akun yatim.
		await supabase.from("chart_of_accounts").delete().eq("code", newCode);
		return fail(
			{ _form: [cardErr?.message ?? "Gagal menyimpan kartu"] },
			formData,
		);
	}

	// Saldo awal — dua jalur, dan bedanya menentukan apakah kas ikut berkurang.
	if (input.opening_balance > 0) {
		const { error: openErr } =
			input.opening_source === "transfer" && input.opening_from_coa
				? await supabase.rpc("record_balance_transfer", {
						p_from_coa: input.opening_from_coa,
						p_to_coa: newCode,
						p_amount: input.opening_balance,
						p_admin_fee: 0,
						p_entry_date: input.opening_date,
						p_note: "Saldo awal kartu",
						p_actor_id: user.profile.id,
					})
				: await supabase.rpc("record_emoney_opening_balance", {
						p_account_id: inserted.id,
						p_amount: input.opening_balance,
						p_entry_date: input.opening_date,
						p_note: null,
						p_actor_id: user.profile.id,
					});
		if (openErr) {
			return {
				ok: true,
				info: `Kartu tersimpan, tapi saldo awal gagal dicatat: ${openErr.message}. Isi lewat tombol Isi saldo.`,
			};
		}
	}

	revalidate();
	return { ok: true };
}

// ---------------------------------------------------------------------------
// 2. Isi saldo (pindah saldo antar rekening)
// ---------------------------------------------------------------------------

const TopupSchema = z.object({
	to_coa: z.string().trim().min(3, "Kartu tujuan wajib dipilih"),
	from_coa: z.string().trim().min(3, "Rekening asal wajib dipilih"),
	amount: Money.refine((n) => n > 0, "Nominal harus lebih dari 0"),
	admin_fee: Money.default(0),
	entry_date: z
		.string()
		.trim()
		.nullish()
		.transform((v) => (v ? v : today())),
	note: OptionalText,
});

export async function topupEmoneyCard(
	_prev: EmoneyFormState,
	formData: FormData,
): Promise<EmoneyFormState> {
	const user = await requireOwner();

	// Biaya admin hanya dihitung kalau centangnya menyala — supaya nominal
	// yang tertinggal di input tidak diam-diam ikut terbukukan.
	const hasFee = formData.get("has_admin_fee") === "on";

	const parsed = TopupSchema.safeParse({
		to_coa: formData.get("to_coa"),
		from_coa: formData.get("from_coa"),
		amount: formData.get("amount") || 0,
		admin_fee: hasFee ? formData.get("admin_fee") || 0 : 0,
		entry_date: formData.get("entry_date"),
		note: formData.get("note"),
	});
	if (!parsed.success) {
		return fail(parsed.error.flatten().fieldErrors as Errors, formData);
	}
	const input = parsed.data;

	if (input.from_coa === input.to_coa) {
		return fail(
			{ from_coa: ["Rekening asal dan kartu tujuan tidak boleh sama"] },
			formData,
		);
	}

	const supabase = await createClient();
	const { error } = await supabase.rpc("record_balance_transfer", {
		p_from_coa: input.from_coa,
		p_to_coa: input.to_coa,
		p_amount: input.amount,
		p_admin_fee: input.admin_fee,
		p_entry_date: input.entry_date,
		p_note: input.note,
		p_actor_id: user.profile.id,
	});
	if (error) return fail({ _form: [error.message] }, formData);

	revalidate();
	return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. Cocokkan saldo
// ---------------------------------------------------------------------------

const RecountSchema = z.object({
	account_id: z.string().uuid("Kartu tidak valid"),
	actual_balance: Money,
	reason: z.enum(["usage", "topup_unrecorded", "unknown"]).default("usage"),
	counterpart_coa: OptionalText,
	expense_coa: OptionalText,
	entry_date: z
		.string()
		.trim()
		.nullish()
		.transform((v) => (v ? v : today())),
	note: OptionalText,
});

export async function recountEmoneyCard(
	_prev: EmoneyFormState,
	formData: FormData,
): Promise<EmoneyFormState> {
	const user = await requireOwner();

	const parsed = RecountSchema.safeParse({
		account_id: formData.get("account_id"),
		actual_balance: formData.get("actual_balance") || 0,
		reason: formData.get("reason") || "usage",
		counterpart_coa: formData.get("counterpart_coa"),
		expense_coa: formData.get("expense_coa"),
		entry_date: formData.get("entry_date"),
		note: formData.get("note"),
	});
	if (!parsed.success) {
		return fail(parsed.error.flatten().fieldErrors as Errors, formData);
	}
	const input = parsed.data;

	if (input.reason === "topup_unrecorded" && !input.counterpart_coa) {
		return fail(
			{ counterpart_coa: ["Pilih rekening asal topupnya"] },
			formData,
		);
	}

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("record_emoney_recount", {
		p_account_id: input.account_id,
		p_actual_balance: input.actual_balance,
		p_reason: input.reason,
		p_counterpart_coa: input.counterpart_coa,
		p_expense_coa: input.expense_coa,
		p_entry_date: input.entry_date,
		p_note: input.note,
		p_actor_id: user.profile.id,
	});
	if (error) return fail({ _form: [error.message] }, formData);

	const diff = Number(
		(data as { difference?: number } | null)?.difference ?? 0,
	);
	revalidate();
	return {
		ok: true,
		info:
			diff === 0
				? "Saldo sudah cocok — tidak ada yang perlu dijurnal."
				: diff < 0
					? `Selisih kurang Rp${Math.abs(diff).toLocaleString("id-ID")} dicatat sebagai beban.`
					: `Selisih lebih Rp${diff.toLocaleString("id-ID")} dicatat sebagai saldo masuk.`,
	};
}
