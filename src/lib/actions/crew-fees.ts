"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const FeeRow = z.object({
	assignment_id: z.string().uuid(),
	fee_amount: z.coerce.number().int().nonnegative(),
	bonus_amount: z.coerce.number().int().nonnegative(),
	reimbursement_amount: z.coerce.number().int().nonnegative(),
	payment_notes: z.string().trim().max(500).optional().nullable(),
	payment_proof_url: z.string().url().max(2000).optional().nullable(),
});

const SaveCrewFeesSchema = z.object({
	rows: z.array(FeeRow).min(1, "Minimal 1 crew"),
});

export type SaveCrewFeesResponse =
	| { ok: true; updated: number }
	| { ok: false; error: string };

export async function saveCrewFees(
	eventId: string,
	projectId: string,
	rows: Array<{
		assignment_id: string;
		fee_amount: number | string;
		bonus_amount: number | string;
		reimbursement_amount: number | string;
		payment_notes?: string | null;
		payment_proof_url?: string | null;
	}>,
): Promise<SaveCrewFeesResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return {
			ok: false,
			error: "Hanya owner/super_admin yang bisa update fee crew",
		};
	}

	const parsed = SaveCrewFeesSchema.safeParse({ rows });
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join("; "),
		};
	}

	const supabase = await createClient();

	// Ensure crew_assignment belongs to this event (defence in depth)
	const ids = parsed.data.rows.map((r) => r.assignment_id);
	const { data: existing, error: fetchErr } = await supabase
		.from("crew_assignments")
		.select("id, event_id, payment_proof_url")
		.in("id", ids);
	if (fetchErr) return { ok: false, error: fetchErr.message };

	const mismatch = (existing ?? []).find((r) => r.event_id !== eventId);
	if (mismatch) {
		return {
			ok: false,
			error: "Salah satu crew_assignment tidak match event_id",
		};
	}

	// Each row updates a distinct crew_assignment, so run the updates
	// concurrently (≈1 round-trip wall-clock instead of N sequential) and
	// surface the first failure.
	const feeUpdateResults = await Promise.all(
		parsed.data.rows.map((row) => {
			// Look up existing payment_proof_url to detect new uploads (set uploaded_at)
			const existingRow = (existing ?? []).find(
				(e) => e.id === row.assignment_id,
			);
			const existingProof =
				(existingRow as { payment_proof_url?: string | null } | undefined)
					?.payment_proof_url ?? null;
			const newProof = row.payment_proof_url ?? null;
			const uploadedAt =
				newProof && newProof !== existingProof
					? new Date().toISOString()
					: undefined;

			return supabase
				.from("crew_assignments")
				.update({
					fee_amount: row.fee_amount,
					bonus_amount: row.bonus_amount,
					reimbursement_amount: row.reimbursement_amount,
					payment_notes: row.payment_notes ?? null,
					payment_proof_url: newProof,
					...(uploadedAt ? { payment_proof_uploaded_at: uploadedAt } : {}),
					updated_at: new Date().toISOString(),
				})
				.eq("id", row.assignment_id);
		}),
	);
	const feeUpdateErr = feeUpdateResults.find((r) => r.error)?.error;
	if (feeUpdateErr) return { ok: false, error: feeUpdateErr.message };
	const updated = parsed.data.rows.length;

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	return { ok: true, updated };
}

// ── Per-crew fee payment (one-stop dari form Fee crew) ─────────────────────
// Cash-basis: settlement meng-akrual fee+bonus+field-expense ke 2-100 Hutang
// Crew. Membayar crew = melunasi porsi crew itu → Dr 2-100 / Cr Bank. Biaya
// admin bank (transfer/VA) ditanggung perusahaan → Dr 5-600 terpisah.
//   per-crew total = fee + bonus + reimbursement (= porsi crew di 2-100).

function newJournalRef(date: Date): string {
	const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
	const rand = Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${yyyymmdd}-${rand}`;
}

const PayCrewFeeSchema = z.object({
	assignment_id: z.string().uuid(),
	// project_id = kode proyek human ("PRJ-20260628-30644"), BUKAN UUID. Hanya
	// dipakai untuk revalidatePath, jadi validasi cukup string non-kosong.
	// (Dulu .uuid() → "Invalid UUID" saat klik Bayar / bayar-sambil-settle.)
	project_id: z.string().trim().min(1).max(64),
	bank_account_code: z.string().trim().min(2).max(20),
	admin_fee: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
	payment_date: z.string().trim().min(8),
	payment_notes: z.string().trim().max(500).optional().nullable(),
});

export type PayCrewFeeResponse =
	| { ok: true; journalRef?: string }
	| { ok: false; error: string };

export async function payCrewFee(input: {
	assignment_id: string;
	project_id: string;
	bank_account_code: string;
	admin_fee?: number | string;
	payment_date: string;
	payment_notes?: string | null;
}): Promise<PayCrewFeeResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { ok: false, error: "Hanya owner yang bisa bayar fee crew" };
	}

	const parsed = PayCrewFeeSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join("; "),
		};
	}
	const { assignment_id, project_id, bank_account_code, payment_date } =
		parsed.data;
	const adminFee = parsed.data.admin_fee;

	const supabase = await createClient();

	// Read assignment + crew name
	const { data: a, error: aErr } = await supabase
		.from("crew_assignments")
		.select(
			`id, event_id, fee_amount, bonus_amount, reimbursement_amount, is_paid,
			user:users!crew_assignments_user_id_fkey(full_name)`,
		)
		.eq("id", assignment_id)
		.maybeSingle();
	if (aErr) return { ok: false, error: aErr.message };
	if (!a) return { ok: false, error: "Crew assignment tidak ditemukan" };
	if (a.is_paid) return { ok: false, error: "Fee crew ini sudah dibayar" };

	const total =
		Number(a.fee_amount ?? 0) +
		Number(a.bonus_amount ?? 0) +
		Number(a.reimbursement_amount ?? 0);
	if (total <= 0) {
		return {
			ok: false,
			error: "Total fee crew ini Rp0 — tidak ada yang dibayar",
		};
	}

	// Gate: fee crew WAJIB sudah ter-akrual ke 2-100 Hutang Crew, yaitu event
	// sudah di-settle DI BUKU SEKARANG (punya settlement, closed_at >= finance
	// cutoff, belum di-reopen). Event lama yang ditutup pre-cutoff (frozen, tanpa
	// posting buku) TIDAK punya akrual 2-100 — kalau dibayar dari sini, Dr 2-100
	// bikin saldo Hutang Crew minus + rawan dobel-bayar fee yang sudah dibayar di
	// sistem lama. (Gate lama cuma cek status='completed' → tembus utk event lama.)
	const { data: ev } = await supabase
		.from("events")
		.select("status")
		.eq("id", a.event_id as string)
		.maybeSingle();
	if (!ev || ev.status !== "completed") {
		return {
			ok: false,
			error: "Settle event ini dulu sebelum bayar fee crew.",
		};
	}
	const { data: cutoffCfg } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", "finance_cutoff_date")
		.maybeSingle();
	const cutoff =
		typeof cutoffCfg?.value === "string" && cutoffCfg.value.length > 0
			? cutoffCfg.value
			: null;
	const { data: settlement } = await supabase
		.from("event_settlements")
		.select("closed_at, is_reopened")
		.eq("event_id", a.event_id as string)
		.maybeSingle();
	const closedDay =
		typeof settlement?.closed_at === "string"
			? settlement.closed_at.slice(0, 10)
			: null;
	if (!closedDay || settlement?.is_reopened || (cutoff && closedDay < cutoff)) {
		return {
			ok: false,
			error:
				"Fee crew event ini belum tercatat sebagai Hutang Crew di pembukuan sekarang (event lama / pre-cutoff / sudah di-reopen). Tidak bisa dibayar dari sini.",
		};
	}

	// Validate bank account (kas/bank, aktif)
	const { data: bank, error: bankErr } = await supabase
		.from("chart_of_accounts")
		.select("code, is_active, account_type")
		.eq("code", bank_account_code)
		.maybeSingle();
	if (bankErr || !bank) {
		return {
			ok: false,
			error: `Rekening ${bank_account_code} tidak ditemukan`,
		};
	}
	if (!bank.is_active) {
		return { ok: false, error: `Rekening ${bank_account_code} nonaktif` };
	}
	if (bank.account_type !== "asset") {
		return { ok: false, error: "Rekening pembayaran harus kas/bank" };
	}

	const u = Array.isArray(a.user) ? a.user[0] : a.user;
	const crewName = (u as { full_name?: string } | null)?.full_name ?? "crew";
	const cashOut = total + adminFee;

	// Post journal: Dr 2-100 (total) [+ Dr 5-600 (admin)] / Cr Bank (cashOut)
	const refId = newJournalRef(new Date(payment_date));
	const { data: entry, error: entryErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: refId,
			entry_date: payment_date,
			entry_type: "asset_out",
			description: `Bayar fee crew — ${crewName}`,
			source_type: "crew_payment",
			source_id: assignment_id,
			source_event_id: a.event_id,
			total_amount: cashOut,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (entryErr || !entry) {
		return {
			ok: false,
			error: `Gagal catat jurnal: ${entryErr?.message ?? "unknown"}`,
		};
	}

	const lines: Array<{
		entry_id: string;
		account_code: string;
		debit_amount: number;
		credit_amount: number;
		description: string;
		line_order: number;
	}> = [
		{
			entry_id: entry.id,
			account_code: "2-100",
			debit_amount: total,
			credit_amount: 0,
			description: "Pelunasan fee crew (Hutang Crew turun)",
			line_order: 1,
		},
	];
	if (adminFee > 0) {
		lines.push({
			entry_id: entry.id,
			account_code: "5-600",
			debit_amount: adminFee,
			credit_amount: 0,
			description: "Biaya admin/transfer bank",
			line_order: 2,
		});
	}
	lines.push({
		entry_id: entry.id,
		account_code: bank_account_code,
		debit_amount: 0,
		credit_amount: cashOut,
		description: "Pembayaran kas/bank",
		line_order: lines.length + 1,
	});

	const { error: linesErr } = await supabase
		.from("journal_lines")
		.insert(lines);
	if (linesErr) {
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return { ok: false, error: `Gagal catat jurnal: ${linesErr.message}` };
	}

	// Mark paid + payment metadata
	const { error: updErr } = await supabase
		.from("crew_assignments")
		.update({
			is_paid: true,
			paid_at: new Date().toISOString(),
			paid_via_account: bank_account_code,
			...(parsed.data.payment_notes !== undefined
				? { payment_notes: parsed.data.payment_notes }
				: {}),
			updated_at: new Date().toISOString(),
		})
		.eq("id", assignment_id);
	if (updErr) {
		// Roll back the journal so we never mark-unpaid-but-posted.
		await supabase.from("journal_lines").delete().eq("entry_id", entry.id);
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		return { ok: false, error: `Gagal tandai lunas: ${updErr.message}` };
	}

	revalidatePath(`/operations/${project_id}/rekap`);
	revalidatePath(`/operations/${project_id}`);
	revalidatePath("/finance");
	revalidatePath("/finance/reconciliation");
	return { ok: true, journalRef: refId };
}

export type UnpayCrewFeeResponse = { ok: true } | { ok: false; error: string };

/** Batalkan pembayaran fee crew: reversing journal + buka kembali status. */
export async function unpayCrewFee(input: {
	assignment_id: string;
	project_id: string;
}): Promise<UnpayCrewFeeResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { ok: false, error: "Hanya owner yang bisa batalkan pembayaran" };
	}
	const { assignment_id, project_id } = input;

	const supabase = await createClient();
	const { data: a } = await supabase
		.from("crew_assignments")
		.select("id, is_paid")
		.eq("id", assignment_id)
		.maybeSingle();
	if (!a) return { ok: false, error: "Crew assignment tidak ditemukan" };
	if (!a.is_paid) return { ok: false, error: "Fee crew ini belum dibayar" };

	// Find the (non-reversed) payment journal posted by payCrewFee.
	const { data: entry } = await supabase
		.from("journal_entries")
		.select("id, total_amount, entry_date")
		.eq("source_type", "crew_payment")
		.eq("source_id", assignment_id)
		.eq("is_reversed", false)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (entry) {
		const { data: origLines } = await supabase
			.from("journal_lines")
			.select("account_code, debit_amount, credit_amount, description")
			.eq("entry_id", entry.id);

		const today = new Date().toISOString().slice(0, 10);
		const { data: rev, error: revErr } = await supabase
			.from("journal_entries")
			.insert({
				ref_id: newJournalRef(new Date()),
				entry_date: today,
				entry_type: "reversal",
				description: "Pembatalan bayar fee crew",
				source_type: "crew_payment_reversal",
				source_id: assignment_id,
				source_event_id: null,
				total_amount: entry.total_amount,
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (revErr || !rev) {
			return {
				ok: false,
				error: `Gagal buat jurnal pembalik: ${revErr?.message ?? "unknown"}`,
			};
		}
		// Mirror lines: swap debit ↔ credit.
		const reversed = (origLines ?? []).map((l, i) => ({
			entry_id: rev.id,
			account_code: l.account_code as string,
			debit_amount: Number(l.credit_amount ?? 0),
			credit_amount: Number(l.debit_amount ?? 0),
			description: `Pembalik — ${l.description ?? ""}`.slice(0, 200),
			line_order: i + 1,
		}));
		if (reversed.length > 0) {
			const { error: revLinesErr } = await supabase
				.from("journal_lines")
				.insert(reversed);
			if (revLinesErr) {
				await supabase.from("journal_entries").delete().eq("id", rev.id);
				return {
					ok: false,
					error: `Gagal buat jurnal pembalik: ${revLinesErr.message}`,
				};
			}
		}
		await supabase
			.from("journal_entries")
			.update({ is_reversed: true, reversed_by_entry_id: rev.id })
			.eq("id", entry.id);
	}

	const { error: updErr } = await supabase
		.from("crew_assignments")
		.update({
			is_paid: false,
			paid_at: null,
			paid_via_account: null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", assignment_id);
	if (updErr) return { ok: false, error: updErr.message };

	revalidatePath(`/operations/${project_id}/rekap`);
	revalidatePath(`/operations/${project_id}`);
	revalidatePath("/finance");
	revalidatePath("/finance/reconciliation");
	return { ok: true };
}

const AddonSplitSchema = z.object({
	photomagnet_paid: z.coerce.number().int().nonnegative(),
	photomagnet_bonus: z.coerce.number().int().nonnegative(),
	keychain_paid: z.coerce.number().int().nonnegative(),
	keychain_bonus: z.coerce.number().int().nonnegative(),
});

export type SaveAddonSplitResponse =
	| { ok: true }
	| { ok: false; error: string };

export async function saveAddonSplit(
	recapId: string,
	eventId: string,
	projectId: string,
	input: {
		photomagnet_paid: number | string;
		photomagnet_bonus: number | string;
		keychain_paid: number | string;
		keychain_bonus: number | string;
	},
): Promise<SaveAddonSplitResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return {
			ok: false,
			error: "Hanya owner/super_admin yang bisa update split addon",
		};
	}

	const parsed = AddonSplitSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join("; "),
		};
	}

	const supabase = await createClient();

	// Block update if recap already locked
	const { data: recap, error: fetchErr } = await supabase
		.from("crew_rekap")
		.select("id, locked, event_id")
		.eq("id", recapId)
		.maybeSingle();
	if (fetchErr) return { ok: false, error: fetchErr.message };
	if (!recap) return { ok: false, error: "Recap tidak ditemukan" };
	if (recap.event_id !== eventId)
		return { ok: false, error: "Recap tidak match event" };
	if (recap.locked) {
		return {
			ok: false,
			error: "Recap sudah locked. Reopen settlement dulu kalau perlu edit.",
		};
	}

	const { error } = await supabase
		.from("crew_rekap")
		.update({
			photomagnet_paid: parsed.data.photomagnet_paid,
			photomagnet_bonus: parsed.data.photomagnet_bonus,
			keychain_paid: parsed.data.keychain_paid,
			keychain_bonus: parsed.data.keychain_bonus,
			updated_at: new Date().toISOString(),
		})
		.eq("id", recapId);
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	return { ok: true };
}
