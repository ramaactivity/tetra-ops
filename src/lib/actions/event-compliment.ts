"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Tandai acara compliment / gratis (hadiah dari Tetra, mis. pernikahan owner).
 * Hanya label: crew & biaya tetap dibayar dan dibukukan normal, ditanggung
 * Tetra lewat laba — tampilan & peringatan membacanya sebagai "Biaya
 * compliment", bukan "Rugi event".
 */
export async function setEventCompliment(
	eventId: string,
	projectId: string,
	value: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		return { ok: false, error: "Hanya owner." };
	if (!z.uuid().safeParse(eventId).success)
		return { ok: false, error: "Acara tidak ditemukan." };
	const db = await createClient();
	// Compliment = tanpa bagi hasil owner (keputusan owner); saklar bagi hasil
	// ikut mati/nyala, tetap bisa diubah sendiri lewat setEventOwnerPool.
	const { error } = await db
		.from("events")
		.update({ is_compliment: value, owner_pool_enabled: !value })
		.eq("id", eventId);
	if (error) return { ok: false, error: error.message };
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath("/reports");
	revalidatePath("/finance");
	return { ok: true };
}

/** Saklar bagi hasil owner per acara (bawaan aktif). Mati → tanpa bagi hasil & tunggakan. */
export async function setEventOwnerPool(
	eventId: string,
	projectId: string,
	enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		return { ok: false, error: "Hanya owner." };
	if (!z.uuid().safeParse(eventId).success)
		return { ok: false, error: "Acara tidak ditemukan." };
	const db = await createClient();
	const { data: ev } = await db
		.from("events")
		.select("status")
		.eq("id", eventId)
		.maybeSingle();
	if (ev?.status === "completed")
		return {
			ok: false,
			error:
				"Acara sudah di-settle — reopen settlement dulu untuk mengubah bagi hasil.",
		};
	const { error } = await db
		.from("events")
		.update({ owner_pool_enabled: enabled })
		.eq("id", eventId);
	if (error) return { ok: false, error: error.message };
	revalidatePath(`/operations/${projectId}/rekap`);
	return { ok: true };
}
