"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	postApprovedDrafts,
	upcomingEventsByPhone,
} from "@/lib/payment-drafts/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

type Result = { ok: true } | { ok: false; error: string };

async function setInbox(
	id: string,
	patch: Record<string, unknown>,
	onlyFrom?: string[],
): Promise<Result> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	let q = supabase
		.from("booking_inbox")
		.update({ ...patch, updated_by: me.profile.id })
		.eq("id", id);
	if (onlyFrom) q = q.in("status", onlyFrom);
	const { error } = await q;
	if (error) return { ok: false, error: error.message };
	revalidatePath("/operations/booking-masuk");
	revalidatePath(`/operations/booking-masuk/${id}`);
	return { ok: true };
}

/** Owner mulai membuat event dari item ini (baru → diproses). */
export async function markInboxProcessing(id: string): Promise<Result> {
	return setInbox(id, { status: "diproses" }, ["baru"]);
}

/** Batal = status, bukan hapus. Item yang sudah jadi event tidak bisa dibatalkan. */
export async function cancelInbox(id: string): Promise<Result> {
	return setInbox(id, { status: "dibatalkan" }, ["baru", "diproses"]);
}

/** Owner sudah menyesuaikan event dengan perubahan dari bot. */
export async function ackInboxChanges(id: string): Promise<Result> {
	return setInbox(id, { berubah_setelah_event: false });
}

type RefreshResult =
	| { ok: true; commandId: string }
	| { ok: false; error: string };

/**
 * "Perbarui dari chat": bot membaca ulang seluruh chat klien lalu mengirim
 * POST /api/bot/booking (merge). Tidak ada pesan ke klien. Antrean perintah
 * yang sama dengan send-pdf / followup-draf; perintah sama yang masih pending
 * dipakai ulang (tap ganda tidak menumpuk). Kontrak: sesi hermes-15, 19 Nov.
 */
export async function requestInboxRefresh(id: string): Promise<RefreshResult> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { data: row, error: readErr } = await supabase
		.from("booking_inbox")
		.select("wa_jid, status")
		.eq("id", id)
		.maybeSingle();
	if (readErr) return { ok: false, error: readErr.message };
	if (!row) return { ok: false, error: "Booking tidak ditemukan." };
	if (row.status === "dibatalkan")
		return { ok: false, error: "Booking ini sudah dibatalkan." };
	const command = `booking-perbarui:${JSON.stringify({ jid: row.wa_jid })}`;
	const { data: queued } = await supabase
		.from("bot_commands")
		.select("id")
		.eq("command", command)
		.eq("status", "pending")
		.limit(1)
		.maybeSingle();
	if (queued) return { ok: true, commandId: queued.id as string };
	const { data, error } = await supabase
		.from("bot_commands")
		.insert({ command, status: "pending" })
		.select("id")
		.single();
	if (error) return { ok: false, error: error.message };
	return { ok: true, commandId: data.id as string };
}

/** Status perintah bot (pending / done / error) + teks hasil dari bot. */
export async function checkInboxRefresh(
	commandId: string,
): Promise<{ status: string; result: string | null }> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("bot_commands")
		.select("status, result")
		.eq("id", commandId)
		.maybeSingle();
	if (error) return { status: "error", result: error.message };
	if (!data) return { status: "error", result: "Perintah tidak ditemukan." };
	return {
		status: data.status as string,
		result: (data.result as string) ?? null,
	};
}

/**
 * "Gabungkan" (hermes-ff 25 Nov): kartu dari bot untuk klien yang sudah punya
 * event → tautkan ke event itu, sama seperti saat event dibuat dari Booking
 * Masuk. Bukti transfer kartu ini ikut ke event (eventOfDraft membaca
 * event_id kartu); yang sudah disetujui langsung masuk buku. Hanya kartu
 * yang nomornya memang cocok dengan event itu.
 */
export async function gabungkanInboxKeEvent(
	id: string,
	eventId: string,
): Promise<Result> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	const { data: ib } = await supabase
		.from("booking_inbox")
		.select("client_wa, status, event_id")
		.eq("id", id)
		.maybeSingle();
	if (!ib) return { ok: false, error: "Booking Masuk tidak ditemukan." };
	if (ib.event_id || (ib.status !== "baru" && ib.status !== "diproses"))
		return { ok: false, error: "Kartu ini sudah jadi event atau dibatalkan." };
	const admin = createAdminClient();
	const cocok = await upcomingEventsByPhone(
		admin,
		ib.client_wa as string | null,
	);
	if (!cocok.some((e) => e.id === eventId))
		return {
			ok: false,
			error:
				"Nomor kartu ini tidak cocok dengan event itu — gabungkan manual dari halaman event.",
		};
	const { error } = await supabase
		.from("booking_inbox")
		.update({
			status: "jadi_event",
			event_id: eventId,
			berubah_setelah_event: false,
			updated_by: me.profile.id,
		})
		.eq("id", id)
		.in("status", ["baru", "diproses"]);
	if (error) return { ok: false, error: error.message };
	const dp = await postApprovedDrafts(eventId, me.profile.id);
	if (dp.failed.length)
		console.error("[gabungkanInboxKeEvent] bukti disetujui:", dp.failed);
	revalidatePath("/operations/booking-masuk");
	revalidatePath(`/operations/booking-masuk/${id}`);
	revalidatePath("/billing/uang-masuk");
	return { ok: true };
}
