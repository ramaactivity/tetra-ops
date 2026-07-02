"use server";

import { revalidatePath } from "next/cache";
import { payCrewFee } from "@/lib/actions/crew-fees";
import { ensureRekapCommitted } from "@/lib/actions/rekap";
import { notifyEventSettled } from "@/lib/actions/rekap-notifications";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { notifyTelegramEventSettled } from "@/lib/telegram/notify";

export type SettleEventResult = {
	settlement_id: string;
	journal_entry_id: string;
	stock_batch_id: string;
	revenue_net: number;
	hpp_total: number;
	opex_total: number;
	net_profit: number;
	margin_pct: number;
	is_loss: boolean;
	sinking_total: number;
	owner_pool_total: number;
	operating_cash: number;
};

/** Hasil "bayar sambil settle" (opsional). */
export type CrewPaymentSummary = {
	paid: number;
	failed: number;
	total: number;
	errors: string[];
};

export type SettleEventResponse =
	| { ok: true; data: SettleEventResult; crewPayment?: CrewPaymentSummary }
	| { ok: false; error: string; code?: string };

export async function settleEvent(
	eventId: string,
	projectId: string,
	opts?: {
		/** Kalau di-set: setelah settle, langsung bayar SEMUA fee crew dari
		 *  rekening ini (Dr 2-100 / Cr rekening). Null/undefined = settle saja. */
		payCrewFromAccount?: string | null;
	},
): Promise<SettleEventResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return {
			ok: false,
			error: "Hanya owner/super_admin yang bisa settle event",
		};
	}

	// Owner safety-net: kalau rekap belum commit stok (mis. owner isi sendiri &
	// belum di-approve), commit otomatis dulu — owner tidak perlu approve diri
	// sendiri. No-op kalau sudah committed.
	const committed = await ensureRekapCommitted(eventId);
	if (!committed.ok) return { ok: false, error: committed.error };

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("settle_event", {
		p_event_id: eventId,
		p_owner_user_id: me.authId,
		p_overrides: null,
	});

	if (error) {
		return {
			ok: false,
			error: humanizeRpcError(error.message),
			code: error.code,
		};
	}

	// Opsional: "bayar sambil settle". Event sekarang status=completed, jadi
	// gate payCrewFee lolos. Bayar tiap crew yang belum lunas & total > 0 dari
	// rekening yang dipilih. Bukti transfer yang sudah di-upload tetap tersimpan.
	let crewPayment: CrewPaymentSummary | undefined;
	const acct = opts?.payCrewFromAccount?.trim();
	if (acct) {
		const { data: assigns } = await supabase
			.from("crew_assignments")
			.select("id, fee_amount, bonus_amount, reimbursement_amount, is_paid")
			.eq("event_id", eventId);
		const today = new Date().toISOString().slice(0, 10);
		let paid = 0;
		let failed = 0;
		let total = 0;
		const errors: string[] = [];
		for (const a of assigns ?? []) {
			const amt =
				Number(a.fee_amount ?? 0) +
				Number(a.bonus_amount ?? 0) +
				Number(a.reimbursement_amount ?? 0);
			if (a.is_paid || amt <= 0) continue;
			const r = await payCrewFee({
				assignment_id: a.id as string,
				project_id: projectId,
				bank_account_code: acct,
				payment_date: today,
			});
			if (r.ok) {
				paid += 1;
				total += amt;
			} else {
				failed += 1;
				errors.push(r.error);
			}
		}
		crewPayment = { paid, failed, total, errors };
	}

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath("/operations");
	revalidatePath("/dashboard");
	revalidatePath("/finance");

	// Thank the assigned crew that the event is closed (best-effort).
	await notifyEventSettled(eventId, projectId);

	// Kabari grup Telegram owner lengkap dengan angka (grup owner-only,
	// crew tidak di dalamnya — financials aman).
	const settled = data as SettleEventResult;
	await notifyTelegramEventSettled(eventId, projectId, {
		revenue_net: settled.revenue_net,
		net_profit: settled.net_profit,
		margin_pct: settled.margin_pct,
		is_loss: settled.is_loss,
	});

	return { ok: true, data: data as SettleEventResult, crewPayment };
}

export type ReopenResult = {
	settlement_id: string;
	reversal_journal_id: string | null;
	reversal_stock_batch: string;
	reason: string;
};

export type ReopenResponse =
	| { ok: true; data: ReopenResult }
	| { ok: false; error: string; code?: string };

export async function reopenSettlement(
	eventId: string,
	projectId: string,
	reason: string,
): Promise<ReopenResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin") {
		return {
			ok: false,
			error: "Hanya super_admin yang bisa reopen settlement",
		};
	}
	const trimmed = reason.trim();
	if (trimmed.length < 5) {
		return { ok: false, error: "Alasan reopen minimal 5 karakter" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("reopen_settlement", {
		p_event_id: eventId,
		p_owner_user_id: me.authId,
		p_reason: trimmed,
	});

	if (error) {
		return {
			ok: false,
			error: humanizeRpcError(error.message),
			code: error.code,
		};
	}

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath("/operations");
	revalidatePath("/dashboard");
	revalidatePath("/finance");

	return { ok: true, data: data as ReopenResult };
}

function humanizeRpcError(msg: string): string {
	// Map known patterns to user-friendly Indonesian messages
	if (msg.includes("Stock tidak cukup")) {
		return msg;
	}
	if (msg.includes("already settled") || msg.includes("sudah settle")) {
		return "Event sudah pernah di-settle. Reopen dulu kalau perlu re-settle.";
	}
	if (msg.includes("Rekap belum di-submit")) {
		return "Rekap belum di-submit untuk event ini.";
	}
	if (msg.includes("Rekap belum di-review")) {
		return msg;
	}
	if (msg.includes("Event status must be")) {
		return "Status event harus 'in_progress' atau 'awaiting_settlement' untuk bisa di-settle.";
	}
	if (msg.includes("Forbidden")) {
		return "Akses ditolak. Hanya owner/super_admin yang bisa melakukan aksi ini.";
	}
	if (msg.includes("sudah pernah di-reopen")) {
		return "Settlement ini sudah pernah di-reopen sebelumnya.";
	}
	return msg;
}
