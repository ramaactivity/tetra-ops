"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { parseExtraPics } from "@/lib/events/extra-pics";
import { selesaikanNotif } from "@/lib/kontak-usulan/server";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Keputusan owner atas "Kontak belum terdaftar" (DR-064). Hanya di sini data
 * event berubah; tidak ada pesan ke siapa pun. Tulis lewat admin client
 * (RLS kontak_usulan hanya membuka SELECT owner).
 */

type Hasil = { ok: true } | { ok: false; error: string; gantiDari?: string };

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner")
		throw new Error("Forbidden — owner-level only");
	return me;
}

/** 628xxx → 08xxx (format events.client_wa). */
const lokal = (n: string) => (n.startsWith("62") ? `0${n.slice(2)}` : n);

async function loadTerbuka(id: string) {
	const { data } = await createAdminClient()
		.from("kontak_usulan")
		.select("id, nomor, nama_kontak, nama_wa, status")
		.eq("id", id)
		.maybeSingle();
	if (!data) return "Usulan tidak ditemukan.";
	if (data.status !== "terbuka") return "Usulan ini sudah diputuskan.";
	if (!data.nomor)
		return "Nomor WA kontak ini tidak diketahui bot (hanya ID WhatsApp) — tambahkan manual dari halaman event.";
	return data as {
		id: string;
		nomor: string;
		nama_kontak: string | null;
		nama_wa: string | null;
	};
}

/**
 * Jadikan nomor klien (events.client_wa) atau PIC cadangan (extra_pics).
 * Nomor klien yang sudah terisi nomor lain hanya diganti dengan `ganti`.
 */
export async function tambahkanKontak(
	id: string,
	eventId: string,
	peran: "klien" | "pic",
	ganti = false,
): Promise<Hasil> {
	const me = await requireOwnerLevel();
	const u = await loadTerbuka(id);
	if (typeof u === "string") return { ok: false, error: u };
	const admin = createAdminClient();
	const { data: ev } = await admin
		.from("events")
		.select("id, project_id, client_wa, extra_pics, status, deleted_at")
		.eq("id", eventId)
		.maybeSingle();
	if (!ev || ev.deleted_at || ev.status === "cancelled")
		return { ok: false, error: "Event tidak ditemukan atau sudah dibatalkan." };
	const nomor = lokal(u.nomor);

	if (peran === "klien") {
		const lama = (ev.client_wa as string | null)?.trim() || null;
		if (lama && phoneTail(lama) !== phoneTail(nomor) && !ganti)
			return {
				ok: false,
				error: `Event ini sudah punya nomor klien ${lama}.`,
				gantiDari: lama,
			};
		const { error } = await admin
			.from("events")
			.update({ client_wa: nomor })
			.eq("id", eventId);
		if (error) return { ok: false, error: error.message };
	} else {
		const pics = parseExtraPics(ev.extra_pics);
		if (!pics.some((p) => phoneTail(p.wa) === phoneTail(nomor))) {
			if (pics.length >= 5)
				return {
					ok: false,
					error: "PIC cadangan event ini sudah 5 — hapus salah satu dulu.",
				};
			pics.push({
				name: (u.nama_kontak ?? u.nama_wa ?? "Kontak WA").slice(0, 120),
				wa: nomor,
			});
			const { error } = await admin
				.from("events")
				.update({ extra_pics: pics })
				.eq("id", eventId);
			if (error) return { ok: false, error: error.message };
		}
	}
	const { error } = await admin
		.from("kontak_usulan")
		.update({
			status: "ditambahkan",
			event_id: eventId,
			peran,
			ditutup_oleh: me.profile.id,
			ditutup_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);
	if (error) return { ok: false, error: error.message };
	await selesaikanNotif(admin, id);
	revalidatePath("/operations/booking-masuk");
	revalidatePath(`/operations/${ev.project_id}`);
	return { ok: true };
}

/** Bukan klien → ditutup dan tidak diusulkan lagi untuk nomor ini. */
export async function tandaiBukanKlien(id: string): Promise<Hasil> {
	const me = await requireOwnerLevel();
	const admin = createAdminClient();
	const { error } = await admin
		.from("kontak_usulan")
		.update({
			status: "bukan_klien",
			ditutup_oleh: me.profile.id,
			ditutup_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("status", "terbuka");
	if (error) return { ok: false, error: error.message };
	await selesaikanNotif(admin, id);
	revalidatePath("/operations/booking-masuk");
	return { ok: true };
}
