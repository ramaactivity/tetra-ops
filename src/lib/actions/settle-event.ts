"use server";

import { revalidatePath } from "next/cache";
import { payCrewFee } from "@/lib/actions/crew-fees";
import { ensureRekapCommitted } from "@/lib/actions/rekap";
import { notifyEventSettled } from "@/lib/actions/rekap-notifications";
import {
	postSettleQueue,
	type SettleQueueSummary,
} from "@/lib/actions/settle-queue";
import { getCurrentUser } from "@/lib/auth/get-user";
import { revalidateDashboard } from "@/lib/dashboard/stats";
import {
	type ReimbursementSync,
	syncCrewReimbursement,
} from "@/lib/rekap/reimbursement";
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
	| {
			ok: true;
			data: SettleEventResult;
			crewPayment?: CrewPaymentSummary;
			/** Hasil posting antrian (pengeluaran/pemasukan lain, komisi sales). */
			queue?: SettleQueueSummary;
			/** Penyesuaian talangan crew sebelum jurnal dibuat (kalau ada). */
			reimbursement?: ReimbursementSync;
	  }
	| { ok: false; error: string; code?: string };

export async function settleEvent(
	eventId: string,
	projectId: string,
	opts?: {
		/** Kalau di-set: setelah settle, langsung bayar SEMUA fee crew dari
		 *  rekening ini (Dr 2-100 / Cr rekening). Null/undefined = settle saja. */
		payCrewFromAccount?: string | null;
		/**
		 * Biaya admin bank PER TRANSFER saat bayar fee crew (Dr 5-600). Tiap crew
		 * = satu transfer, jadi angka ini dikenakan ke tiap pembayaran, bukan
		 * sekali untuk semua.
		 */
		payCrewAdminFee?: number | null;
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

	// Talangan crew: settle mengkredit 2-100 sebesar OpEx (termasuk biaya yang
	// ditalangi crew), tapi tombol bayar cuma bisa membayar fee+bonus+
	// reimbursement. Kalau reimbursement-nya kosong, selisihnya mengendap di
	// 2-100 tanpa muncul di layar mana pun. Samakan dulu sebelum jurnal lahir.
	const reimbursement = await syncCrewReimbursement(supabase, eventId);
	if (reimbursement?.blocked) {
		console.error(
			`[settle] talangan crew tidak bisa disamakan (${eventId}): ${reimbursement.blocked}`,
		);
	}
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

	// Bekukan siapa dapat berapa. Settlement hanya menyimpan total per PERAN,
	// jadi kalau fee di crew_assignments diubah setelah settle tidak ada jejak
	// apa yang sebenarnya disepakati saat menutup event.
	await snapshotCrewFees(
		supabase,
		eventId,
		(data as SettleEventResult)?.settlement_id,
	);

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
				admin_fee: Math.max(0, Math.trunc(Number(opts?.payCrewAdminFee ?? 0))),
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

	// Antrian dari kartu-kartu di halaman rekap (pengeluaran/pemasukan lain &
	// rencana bayar komisi sales) — baru dibukukan sekarang, setelah settle
	// benar-benar jadi. Best-effort: gagal satu baris tidak membatalkan settle.
	const queue = await postSettleQueue(eventId, projectId);

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath("/operations");
	revalidateDashboard();
	revalidatePath("/finance");
	revalidatePath("/finance/vendors");

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

	return {
		ok: true,
		data: data as SettleEventResult,
		crewPayment,
		queue,
		reimbursement: reimbursement ?? undefined,
	};
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
	revalidateDashboard();
	revalidatePath("/finance");

	return { ok: true, data: data as ReopenResult };
}

/**
 * Bekukan fee tiap crew ke event_settlements.crew_fee_snapshot.
 *
 * Best-effort: settle-nya sendiri sudah berhasil dan jurnalnya sudah lahir —
 * gagal menulis catatan sejarah tidak boleh membatalkan itu, cukup dicatat di
 * log supaya ketahuan kalau berulang.
 */
async function snapshotCrewFees(
	supabase: Awaited<ReturnType<typeof createClient>>,
	eventId: string,
	settlementId: string | undefined,
): Promise<void> {
	if (!settlementId) return;
	try {
		const { data: rows } = await supabase
			.from("crew_assignments")
			.select(
				`user_id, role_in_event, fee_amount, bonus_amount, reimbursement_amount,
				 user:users!crew_assignments_user_id_fkey(full_name, nickname)`,
			)
			.eq("event_id", eventId);
		const snapshot = (rows ?? []).map((r) => {
			const u = Array.isArray(r.user) ? r.user[0] : r.user;
			const fee = Number(r.fee_amount ?? 0);
			const bonus = Number(r.bonus_amount ?? 0);
			const reimbursement = Number(r.reimbursement_amount ?? 0);
			return {
				user_id: r.user_id,
				name: u?.nickname?.trim() || u?.full_name || "Crew",
				role: r.role_in_event,
				fee,
				bonus,
				reimbursement,
				total: fee + bonus + reimbursement,
			};
		});
		const { error } = await supabase
			.from("event_settlements")
			.update({ crew_fee_snapshot: snapshot })
			.eq("id", settlementId);
		if (error) {
			console.error(`[settle] snapshot fee crew gagal: ${error.message}`);
		}
	} catch (e) {
		console.error("[settle] snapshot fee crew gagal:", e);
	}
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
