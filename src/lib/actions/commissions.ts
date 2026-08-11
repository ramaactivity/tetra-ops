"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { insufficientBalanceError } from "@/lib/finance/balance-guard";
import { createClient } from "@/lib/supabase/server";

/**
 * Bayar komisi vendor/relasi — pola sama dgn payCrewFee (cash-basis). Dua jalur,
 * tergantung event-nya sudah di-settle atau belum:
 *
 *   • SETELAH settle ("pelunasan utang") — settlement sudah meng-akrual komisi
 *     ke 2-103 (vendor) / 2-102 (relasi+sales). Membayar = melunasi utang itu →
 *     Dr 2-103/2-102 / Cr kas-bank.
 *
 *   • SEBELUM settle ("uang muka") — utangnya belum lahir, jadi uang keluar
 *     dicatat sebagai ASET Dr 1-310 Uang Muka Komisi / Cr kas-bank. Saat event
 *     di-settle nanti, _create_settlement_journal otomatis memakai uang muka itu
 *     sebagai lawan beban komisi (Cr 1-310) — jadi TIDAK ada utang ganda dan
 *     tidak perlu jurnal susulan. Lihat 20260805_commission_advance.sql.
 *
 * Biaya admin bank → Dr 5-600 terpisah (dua-duanya). Catatan pembayaran disimpan
 * di commission_payouts (1 aktif per event+kind; reversible).
 *
 * Vendor "Potongan Langsung" (upfront_cut) TIDAK bisa dibayar dari sini —
 * komisinya sudah dipotong di muka dari aliran uang (bukan utang).
 */

// Sales (direct) & relasi berbagi akun utang komisi 2-102 (5-301 "Sales/Relasi").
// Vendor pakai 2-103 (BUKAN 2-101 — itu Hutang Dagang/supplier, control account
// subledger payables; lihat 20260805_commission_advance.sql).
const PAYABLE_COA: Record<"vendor" | "relasi" | "sales", string> = {
	vendor: "2-103",
	relasi: "2-102",
	sales: "2-102",
};

/** Aset "Uang Muka Komisi" — dipakai kalau komisi dibayar sebelum settle. */
const ADVANCE_COA = "1-310";

function newJournalRef(date: Date): string {
	const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
	const rand = randomInt(0, 0xffffffff)
		.toString(16)
		.padStart(8, "0")
		.toUpperCase();
	return `JE-${yyyymmdd}-${rand}`;
}

function payoutRef(date: Date): string {
	const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
	return `KOM-${yyyymmdd}-${String(randomInt(0, 10000)).padStart(4, "0")}`;
}

const PayCommissionSchema = z.object({
	event_id: z.string().uuid(),
	project_id: z.string().trim().min(1).max(64),
	kind: z.enum(["vendor", "relasi", "sales"]),
	bank_account_code: z.string().trim().min(2).max(20),
	admin_fee: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
	payment_date: z.string().trim().min(8),
	proof_url: z.string().url().max(2000).optional().nullable(),
	notes: z.string().trim().max(500).optional().nullable(),
});

export type PayCommissionResponse =
	| { ok: true; journalRef: string }
	| { ok: false; error: string };

export async function payCommission(input: {
	event_id: string;
	project_id: string;
	kind: "vendor" | "relasi" | "sales";
	bank_account_code: string;
	admin_fee?: number | string;
	payment_date: string;
	proof_url?: string | null;
	notes?: string | null;
}): Promise<PayCommissionResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { ok: false, error: "Hanya owner yang bisa bayar komisi" };
	}

	const parsed = PayCommissionSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join("; "),
		};
	}
	const { event_id, project_id, kind, bank_account_code, payment_date } =
		parsed.data;
	const adminFee = parsed.data.admin_fee;

	const supabase = await createClient();

	// Event + komisi amount (server-authoritative, tak percaya angka client).
	const { data: ev, error: evErr } = await supabase
		.from("events")
		.select(
			`id, status, channel, vendor_name, vendor_contact,
			vendor_commission_mode, vendor_commission_amount,
			referrer_user_id, referrer_commission,
			sales_user_id, direct_sales_commission, finance_frozen_at`,
		)
		.eq("id", event_id)
		.maybeSingle();
	if (evErr) return { ok: false, error: evErr.message };
	if (!ev) return { ok: false, error: "Event tidak ditemukan" };

	async function lookupName(
		userId: string | null,
		fallback: string,
	): Promise<string> {
		if (!userId) return fallback;
		const { data } = await supabase
			.from("users")
			.select("full_name")
			.eq("id", userId)
			.maybeSingle();
		return (data?.full_name as string) ?? fallback;
	}

	let amount = 0;
	let payeeName = "";
	let payeeUserId: string | null = null;
	if (kind === "vendor") {
		if (ev.channel !== "vendor") {
			return { ok: false, error: "Event ini bukan channel vendor" };
		}
		if (ev.vendor_commission_mode === "upfront_cut") {
			return {
				ok: false,
				error:
					"Komisi Potongan Langsung sudah dipotong di muka — tak ada yang perlu dibayar.",
			};
		}
		amount = Number(ev.vendor_commission_amount ?? 0);
		payeeName = (ev.vendor_name as string) ?? "Vendor";
	} else if (kind === "relasi") {
		if (ev.channel !== "relasi") {
			return { ok: false, error: "Event ini bukan channel relasi" };
		}
		amount = Number(ev.referrer_commission ?? 0);
		payeeUserId = (ev.referrer_user_id as string | null) ?? null;
		payeeName = await lookupName(payeeUserId, "Relasi");
	} else {
		// Sales Tetra — TIDAK dibatasi channel: event vendor/relasi pun sales yang
		// closing tetap dapat komisinya sendiri (di luar komisi mitra). Nominalnya
		// bisa diisi saat settle; yang dipakai di sini tetap kolom event.
		amount = Number(ev.direct_sales_commission ?? 0);
		payeeUserId = (ev.sales_user_id as string | null) ?? null;
		payeeName = await lookupName(payeeUserId, "Sales Tetra");
	}
	if (amount <= 0) {
		return { ok: false, error: "Nominal komisi Rp0 — tidak ada yang dibayar" };
	}

	// Sudah ter-akrual jadi utang di buku SEKARANG? Ini yang menentukan jalur:
	//   sudah  → pelunasan utang  (Dr 2-103/2-102 / Cr kas)
	//   belum  → uang muka komisi (Dr 1-310        / Cr kas), di-offset otomatis
	//            saat event di-settle nanti.
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
		.eq("event_id", event_id)
		.maybeSingle();
	const closedDay =
		typeof settlement?.closed_at === "string"
			? settlement.closed_at.slice(0, 10)
			: null;
	const isAccrued = Boolean(
		closedDay && !settlement?.is_reopened && (!cutoff || closedDay >= cutoff),
	);
	const isAdvance = !isAccrued;

	if (isAdvance) {
		// Event yang SUDAH ditutup tapi di luar buku sekarang (settle pre-cutoff)
		// tidak boleh: bebannya sudah dibukukan di buku lama & event itu tak akan
		// di-settle lagi, jadi uang mukanya tak akan pernah habis (nyangkut di
		// 1-310 selamanya). Event yang di-reopen boleh — nanti di-settle ulang.
		if (closedDay && !settlement?.is_reopened) {
			return {
				ok: false,
				error:
					"Event ini ditutup sebelum cutoff pembukuan, jadi komisinya tidak tercatat di buku sekarang. Tidak bisa dibayar dari sini.",
			};
		}
		if (ev.finance_frozen_at) {
			return {
				ok: false,
				error:
					"Event ini dibekukan oleh cutoff pembukuan — pembayarannya tidak bisa dicatat di buku sekarang.",
			};
		}
		if (ev.status === "cancelled") {
			return { ok: false, error: "Event batal — komisi tidak perlu dibayar." };
		}
	}

	// Sudah pernah dibayar? (guard aplikasi; unique index sbg backstop.)
	const { data: existing } = await supabase
		.from("commission_payouts")
		.select("id")
		.eq("event_id", event_id)
		.eq("kind", kind)
		.eq("is_reversed", false)
		.maybeSingle();
	if (existing) {
		return { ok: false, error: "Komisi ini sudah dibayar." };
	}

	// Rekening pembayaran (kas/bank aktif).
	const { data: bank, error: bankErr } = await supabase
		.from("chart_of_accounts")
		.select("code, name, is_active, account_type")
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

	const cashOut = amount + adminFee;
	const saldoErr = await insufficientBalanceError(
		supabase,
		bank_account_code,
		(bank.name as string) ?? bank_account_code,
		cashOut,
	);
	if (saldoErr) return { ok: false, error: saldoErr };

	// Cari bank_account_id (commission_payouts butuh FK ke bank_accounts).
	const { data: bankAcct } = await supabase
		.from("bank_accounts")
		.select("id")
		.eq("coa_code", bank_account_code)
		.eq("is_active", true)
		.maybeSingle();
	if (!bankAcct) {
		return {
			ok: false,
			error: `Rekening ${bank_account_code} tidak terhubung ke bank account aktif`,
		};
	}

	// 1) Catatan pembayaran (unique index (event_id,kind) WHERE not reversed
	//    → dobel-bayar barengan gagal di sini).
	const { data: payout, error: payoutErr } = await supabase
		.from("commission_payouts")
		.insert({
			ref_id: payoutRef(new Date(payment_date)),
			event_id,
			kind,
			payee_name: payeeName,
			payee_user_id: payeeUserId,
			amount,
			admin_fee: adminFee,
			payment_date,
			bank_account_id: bankAcct.id,
			proof_url: parsed.data.proof_url ?? null,
			notes: parsed.data.notes ?? null,
			is_advance: isAdvance,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (payoutErr || !payout) {
		const dup = payoutErr?.code === "23505";
		return {
			ok: false,
			error: dup
				? "Komisi ini sudah dibayar."
				: `Gagal catat pembayaran: ${payoutErr?.message ?? "unknown"}`,
		};
	}

	// 2) Jurnal. Sudah ter-akrual → Dr 2-103/2-102 (utang turun). Belum →
	//    Dr 1-310 (uang muka, aset). [+ Dr 5-600 admin] / Cr bank.
	const refId = newJournalRef(new Date(payment_date));
	const kindLabel =
		kind === "vendor" ? "vendor" : kind === "sales" ? "sales" : "relasi";
	const { data: entry, error: entryErr } = await supabase
		.from("journal_entries")
		.insert({
			ref_id: refId,
			entry_date: payment_date,
			entry_type: "asset_out",
			description: isAdvance
				? `Bayar komisi ${kindLabel} di muka (belum settle) — ${payeeName}`
				: `Bayar komisi ${kindLabel} — ${payeeName}`,
			source_type: "commission_payment",
			source_id: payout.id,
			source_event_id: event_id,
			total_amount: cashOut,
			created_by: me.profile.id,
		})
		.select("id")
		.single();
	if (entryErr || !entry) {
		await supabase.from("commission_payouts").delete().eq("id", payout.id);
		return {
			ok: false,
			error: `Gagal catat jurnal: ${entryErr?.message ?? "unknown"}`,
		};
	}

	const lines: Array<Record<string, unknown>> = [
		{
			entry_id: entry.id,
			account_code: isAdvance ? ADVANCE_COA : PAYABLE_COA[kind],
			debit_amount: amount,
			credit_amount: 0,
			description: isAdvance
				? `Uang muka komisi ${kindLabel} (dibayar sebelum event di-settle)`
				: `Pelunasan komisi ${kindLabel} (utang turun)`,
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
		await supabase.from("commission_payouts").delete().eq("id", payout.id);
		return { ok: false, error: `Gagal catat jurnal: ${linesErr.message}` };
	}

	// 3) Tautkan jurnal ke pembayaran.
	const { error: linkErr } = await supabase
		.from("commission_payouts")
		.update({ journal_entry_id: entry.id })
		.eq("id", payout.id);
	if (linkErr) {
		await supabase.from("journal_lines").delete().eq("entry_id", entry.id);
		await supabase.from("journal_entries").delete().eq("id", entry.id);
		await supabase.from("commission_payouts").delete().eq("id", payout.id);
		return { ok: false, error: `Gagal tautkan jurnal: ${linkErr.message}` };
	}

	revalidatePath("/finance/vendors");
	revalidatePath(`/operations/${project_id}`);
	revalidatePath(`/operations/${project_id}/rekap`);
	revalidatePath("/finance");
	revalidatePath("/finance/reconciliation");
	return { ok: true, journalRef: refId };
}

export type UnpayCommissionResponse =
	| { ok: true }
	| { ok: false; error: string };

/** Batalkan pembayaran komisi: jurnal pembalik + tandai payout reversed. */
export async function unpayCommission(input: {
	event_id: string;
	project_id: string;
	kind: "vendor" | "relasi" | "sales";
	reason?: string;
}): Promise<UnpayCommissionResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { ok: false, error: "Hanya owner yang bisa batalkan pembayaran" };
	}
	const { event_id, project_id, kind } = input;

	const supabase = await createClient();
	const { data: payout } = await supabase
		.from("commission_payouts")
		.select("id, journal_entry_id, is_advance")
		.eq("event_id", event_id)
		.eq("kind", kind)
		.eq("is_reversed", false)
		.maybeSingle();
	if (!payout) return { ok: false, error: "Pembayaran komisi tidak ditemukan" };

	// Uang muka yang SUDAH terpakai saat settle: saldo 1-310-nya sudah habis
	// dipakai settlement, jadi membalik apa adanya bikin uang muka jadi minus.
	// Yang benar: uang kembali & komisinya berubah jadi utang lagi →
	// baris 1-310 di jurnal pembalik dialihkan ke 2-103/2-102.
	let advanceRedirect: string | null = null;
	if (payout.is_advance) {
		const [{ data: cutoffCfg }, { data: settlement }] = await Promise.all([
			supabase
				.from("system_config")
				.select("value")
				.eq("key", "finance_cutoff_date")
				.maybeSingle(),
			supabase
				.from("event_settlements")
				.select("closed_at, is_reopened")
				.eq("event_id", event_id)
				.maybeSingle(),
		]);
		const cutoff =
			typeof cutoffCfg?.value === "string" && cutoffCfg.value.length > 0
				? cutoffCfg.value
				: null;
		const closedDay =
			typeof settlement?.closed_at === "string"
				? settlement.closed_at.slice(0, 10)
				: null;
		const consumed = Boolean(
			closedDay && !settlement?.is_reopened && (!cutoff || closedDay >= cutoff),
		);
		if (consumed) advanceRedirect = PAYABLE_COA[kind];
	}

	// Jurnal pembalik (mirror swap debit↔credit).
	if (payout.journal_entry_id) {
		const { data: origLines } = await supabase
			.from("journal_lines")
			.select("account_code, debit_amount, credit_amount, description")
			.eq("entry_id", payout.journal_entry_id as string);
		const { data: origEntry } = await supabase
			.from("journal_entries")
			.select("total_amount, is_reversed")
			.eq("id", payout.journal_entry_id as string)
			.maybeSingle();

		if (origEntry && !origEntry.is_reversed) {
			const today = new Date().toISOString().slice(0, 10);
			const { data: rev, error: revErr } = await supabase
				.from("journal_entries")
				.insert({
					ref_id: newJournalRef(new Date()),
					entry_date: today,
					entry_type: "reversal",
					description: "Pembatalan bayar komisi",
					source_type: "commission_payment_reversal",
					source_id: payout.id,
					source_event_id: event_id,
					total_amount: origEntry.total_amount,
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
			const reversed = (origLines ?? []).map((l, i) => {
				const code = l.account_code as string;
				const redirected =
					advanceRedirect && code === ADVANCE_COA ? advanceRedirect : code;
				return {
					entry_id: rev.id,
					account_code: redirected,
					debit_amount: Number(l.credit_amount ?? 0),
					credit_amount: Number(l.debit_amount ?? 0),
					description: (redirected !== code
						? `Pembalik — uang muka sudah terpakai saat settle, komisi jadi utang lagi`
						: `Pembalik — ${l.description ?? ""}`
					).slice(0, 200),
					line_order: i + 1,
				};
			});
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
				.eq("id", payout.journal_entry_id as string);
		}
	}

	const { error: updErr } = await supabase
		.from("commission_payouts")
		.update({
			is_reversed: true,
			reversed_at: new Date().toISOString(),
			reversal_reason: input.reason ?? null,
		})
		.eq("id", payout.id);
	if (updErr) return { ok: false, error: updErr.message };

	revalidatePath("/finance/vendors");
	revalidatePath(`/operations/${project_id}`);
	revalidatePath(`/operations/${project_id}/rekap`);
	revalidatePath("/finance");
	revalidatePath("/finance/reconciliation");
	return { ok: true };
}
