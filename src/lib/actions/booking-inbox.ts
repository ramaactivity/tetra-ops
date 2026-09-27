"use server";

import { revalidatePath } from "next/cache";
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
