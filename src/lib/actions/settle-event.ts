"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

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

export type SettleEventResponse =
	| { ok: true; data: SettleEventResult }
	| { ok: false; error: string; code?: string };

export async function settleEvent(
	eventId: string,
	projectId: string,
): Promise<SettleEventResponse> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return { ok: false, error: "Hanya owner/super_admin yang bisa settle event" };
	}

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

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}/settle`);
	revalidatePath("/operations");
	revalidatePath("/dashboard");
	revalidatePath("/finance");

	return { ok: true, data: data as SettleEventResult };
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
