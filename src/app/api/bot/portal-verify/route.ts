import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { extractWaCode } from "@/lib/portal/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWaPhone } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/portal-verify — bot WA meneruskan pesan klien yang berisi kode
 * verifikasi portal ("TP-XXXXXX"). Bukti kepemilikan nomor = pesan itu datang
 * DARI nomor yang didaftarkan (DR-027). Bot membalas klien dengan `reply` dan
 * tidak meneruskan pesan ini ke AI / hand-off.
 *
 * Body: { text, phone (nomor HP asli hasil resolve LID; boleh kosong), wa_jid }
 */
const Body = z.object({
	text: z.string().max(2000),
	phone: z.string().max(30).nullish(),
	wa_jid: z.string().max(100).nullish(),
});

export async function POST(req: NextRequest) {
	if (!isAuthorizedBot(req)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const parsed = Body.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
	}
	const code = extractWaCode(parsed.data.text);
	if (!code) return NextResponse.json({ ok: false, matched: false });

	const admin = createAdminClient();
	const { data: v } = await admin
		.from("portal_verifications")
		.select("id, phone, expires_at, verified_at")
		.eq("channel", "wa")
		.eq("code", code)
		.maybeSingle();

	const reply = (ok: boolean, text: string) =>
		NextResponse.json({ ok, matched: true, reply: text });

	if (!v || v.verified_at)
		return reply(
			false,
			"Kode verifikasinya tidak dikenali atau sudah dipakai. Coba minta kode baru di halaman booking, ya.",
		);
	if (new Date(v.expires_at) < new Date())
		return reply(
			false,
			"Kode verifikasinya sudah kedaluwarsa. Minta kode baru di halaman booking, ya.",
		);
	const sender = parsed.data.phone ? toWaPhone(parsed.data.phone) : null;
	if (!sender)
		return reply(
			false,
			"Maaf, nomor kamu belum bisa kami baca. Coba verifikasi lewat email di halaman booking, ya.",
		);
	if (sender !== v.phone)
		return reply(
			false,
			"Kode ini didaftarkan untuk nomor lain. Kirim dari nomor WhatsApp yang kamu isi di halaman booking, ya.",
		);

	await admin
		.from("portal_verifications")
		.update({
			verified_at: new Date().toISOString(),
			wa_jid: parsed.data.wa_jid ?? null,
		})
		.eq("id", v.id)
		.is("verified_at", null);
	return reply(
		true,
		"Nomor kamu sudah terverifikasi ✅ Silakan kembali ke halaman booking, ya. Kalau ada pertanyaan, balas saja chat ini.",
	);
}
