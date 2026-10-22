"use server";

/**
 * Daftar rekanan mandiri (/rekanan/daftar, DR-050). Nomor diambil dari sesi
 * portal — sudah dibuktikan lewat kode WA (DR-027) — bukan dari isian.
 */
import { clientIp, getPortalPerson, rateLimit } from "@/lib/portal/auth";
import { ensureVendorSignup } from "@/lib/portal/vendor-signup";
import { createAdminClient } from "@/lib/supabase/admin";

export async function daftarRekanan(
	raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getPortalPerson();
	if (!me) return { ok: false, error: "Verifikasi nomor WhatsApp dulu, ya." };
	// Nomor harus terbukti lewat WA: nomor yang tercatat sebagai PIC vendor lama
	// langsung ditautkan ke vendor itu (acara & komisinya terbuka). Masuk lewat
	// email tidak membuktikan pemilik nomor.
	const { data: wa } = await createAdminClient()
		.from("portal_people")
		.select("wa_verified_at")
		.eq("id", me.id)
		.maybeSingle();
	if (!wa?.wa_verified_at)
		return {
			ok: false,
			error:
				"Daftar rekanan perlu verifikasi WhatsApp. Keluar dulu, lalu daftar lagi pakai kode WhatsApp, ya.",
		};
	const ok =
		(await rateLimit(`rekanan:ip:${await clientIp()}`, 10, 3600)) &&
		(await rateLimit(`rekanan:hp:${me.phone}`, 5, 3600));
	if (!ok)
		return {
			ok: false,
			error: "Terlalu banyak percobaan. Coba lagi sebentar lagi, ya.",
		};
	const r = await ensureVendorSignup(
		{ ...(raw && typeof raw === "object" ? raw : {}), phone: me.phone },
		{ sumber: "portal" },
	);
	return r.ok ? { ok: true } : { ok: false, error: r.error };
}
