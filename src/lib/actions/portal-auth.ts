"use server";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import {
	clearVerifyNonce,
	clientIp,
	endSession,
	rateLimit,
	setVerifyNonce,
	startSession,
	verifyNonceHash,
} from "@/lib/portal/auth";
import { newWaCode, sha256 } from "@/lib/portal/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Masuk portal tanpa password (DR-027):
 *   WA    — klien MENGIRIM kode ke nomor Tetra; bot meneruskan ke
 *           /api/bot/portal-verify; tab ini polling checkVerification.
 *   email — kode 6 angka dikirim ke email, klien mengetiknya.
 * Kode terikat ke nonce cookie browser yang memintanya.
 */

const TTL_MIN = 10;

type Fail = { ok: false; error: string };

const StartSchema = z.object({
	phone: z.string().trim().min(8).max(20),
	name: z.string().trim().min(2, "Nama minimal 2 huruf").max(80).optional(),
	email: z.email("Format email tidak valid").max(120).optional(),
});

async function guardStart(phone: string): Promise<Fail | null> {
	const ip = await clientIp();
	const ok =
		(await rateLimit(`verif:ip:${ip}`, 10, 3600)) &&
		(await rateLimit(`verif:hp:${phone}`, 5, 3600));
	return ok
		? null
		: {
				ok: false,
				error: "Terlalu banyak percobaan. Coba lagi sebentar lagi, ya.",
			};
}

async function businessWa(): Promise<string | null> {
	const { data } = await createAdminClient()
		.from("system_config")
		.select("value")
		.eq("key", "business_phone")
		.maybeSingle();
	return typeof data?.value === "string" ? toWaPhone(data.value) : null;
}

export async function startWaVerification(input: {
	phone: string;
	name?: string;
}): Promise<{ ok: true; id: string; code: string; waUrl: string } | Fail> {
	const parsed = StartSchema.safeParse(input);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0].message };
	if (!isLikelyWaPhone(parsed.data.phone))
		return {
			ok: false,
			error: "Nomor WhatsApp belum benar. Contoh: 0812 3456 7890",
		};
	const phone = toWaPhone(parsed.data.phone);
	const blocked = await guardStart(phone);
	if (blocked) return blocked;

	const tetra = await businessWa();
	if (!tetra)
		return {
			ok: false,
			error: "Verifikasi WhatsApp belum siap. Coba lewat email, ya.",
		};
	const code = newWaCode();
	const { data, error } = await createAdminClient()
		.from("portal_verifications")
		.insert({
			channel: "wa",
			phone,
			name: parsed.data.name ?? null,
			code,
			nonce_hash: await setVerifyNonce(),
			expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(),
		})
		.select("id")
		.single();
	if (error)
		return { ok: false, error: "Gagal menyiapkan verifikasi. Coba lagi, ya." };
	const text = `Halo Tetra, ini kode verifikasi booking saya: ${code}`;
	return {
		ok: true,
		id: data.id,
		code,
		waUrl: `https://wa.me/${tetra}?text=${encodeURIComponent(text)}`,
	};
}

export async function startEmailVerification(input: {
	phone: string;
	name?: string;
	email: string;
}): Promise<{ ok: true; id: string } | Fail> {
	if (!isEmailConfigured())
		return {
			ok: false,
			error: "Verifikasi email belum aktif. Pakai WhatsApp, ya.",
		};
	const parsed = StartSchema.safeParse(input);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0].message };
	if (!parsed.data.email) return { ok: false, error: "Email wajib diisi" };
	if (!isLikelyWaPhone(parsed.data.phone))
		return {
			ok: false,
			error: "Nomor WhatsApp belum benar. Contoh: 0812 3456 7890",
		};
	const phone = toWaPhone(parsed.data.phone);
	const blocked = await guardStart(phone);
	if (blocked) return blocked;

	// Email hanya membuktikan pemilik EMAIL, bukan pemilik nomor. Jadi lewat
	// email tidak boleh membuka akun nomor yang emailnya lain / sudah
	// diverifikasi lewat WA — kalau tidak, siapa pun bisa mengetik nomor orang
	// lain + emailnya sendiri lalu melihat booking orang itu.
	// ponytail: akun "email saja" yang belakangan diverifikasi WA oleh nomor
	// yang sama tetap satu akun (asumsi: orangnya sama).
	const email = parsed.data.email.toLowerCase();
	const admin = createAdminClient();
	const { data: byPhone } = await admin
		.from("portal_people")
		.select("email, wa_verified_at")
		.eq("phone", phone)
		.maybeSingle();
	if (
		byPhone &&
		(byPhone.email ? byPhone.email !== email : !!byPhone.wa_verified_at)
	)
		return {
			ok: false,
			error: "Nomor ini sudah terdaftar. Masuk lewat WhatsApp, ya.",
		};
	const { data: byEmail } = await admin
		.from("portal_people")
		.select("phone")
		.eq("email", email)
		.maybeSingle();
	if (byEmail && byEmail.phone !== phone)
		return { ok: false, error: "Email ini sudah dipakai nomor lain." };

	const code = String(randomInt(100000, 1000000));
	const { data, error } = await admin
		.from("portal_verifications")
		.insert({
			channel: "email",
			phone,
			email,
			name: parsed.data.name ?? null,
			code: "-",
			code_hash: sha256(code),
			nonce_hash: await setVerifyNonce(),
			expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(),
		})
		.select("id")
		.single();
	if (error)
		return { ok: false, error: "Gagal menyiapkan verifikasi. Coba lagi, ya." };
	const sent = await sendEmail(
		parsed.data.email,
		`Kode masuk Tetra Photobooth: ${code}`,
		`Halo${parsed.data.name ? ` ${parsed.data.name}` : ""},\n\nKode masuk portal Tetra Photobooth kamu: ${code}\nKode ini berlaku ${TTL_MIN} menit. Abaikan email ini kalau kamu tidak sedang booking.\n\nTetra Photobooth`,
	);
	if (!sent)
		return {
			ok: false,
			error: "Email gagal terkirim. Cek alamatnya atau pakai WhatsApp.",
		};
	return { ok: true, id: data.id };
}

type VerifRow = {
	id: string;
	channel: "wa" | "email";
	phone: string;
	email: string | null;
	name: string | null;
	code_hash: string | null;
	nonce_hash: string;
	attempts: number;
	expires_at: string;
	verified_at: string | null;
	consumed_at: string | null;
	wa_jid: string | null;
};

async function loadOwnVerification(id: string): Promise<VerifRow | null> {
	if (!z.uuid().safeParse(id).success) return null;
	const nonce = await verifyNonceHash();
	if (!nonce) return null;
	const { data } = await createAdminClient()
		.from("portal_verifications")
		.select("*")
		.eq("id", id)
		.maybeSingle();
	return data && data.nonce_hash === nonce ? (data as VerifRow) : null;
}

/** Tukar verifikasi yang sudah cocok jadi sesi. Satu kali pakai. */
async function finalize(v: VerifRow): Promise<void> {
	const admin = createAdminClient();
	const { data: claimed } = await admin
		.from("portal_verifications")
		.update({ consumed_at: new Date().toISOString() })
		.eq("id", v.id)
		.is("consumed_at", null)
		.select("id")
		.maybeSingle();
	if (!claimed) throw new Error("Verifikasi sudah dipakai");

	const now = new Date().toISOString();
	const { data: existing } = await admin
		.from("portal_people")
		.select("id, name, email")
		.eq("phone", v.phone)
		.maybeSingle();
	let personId = existing?.id as string | undefined;
	const patch: Record<string, string> =
		v.channel === "wa"
			? { wa_verified_at: now, ...(v.wa_jid ? { wa_jid: v.wa_jid } : {}) }
			: { email_verified_at: now };
	if (existing) {
		if (!existing.name && v.name) patch.name = v.name;
		if (v.email && !existing.email) patch.email = v.email;
		await admin.from("portal_people").update(patch).eq("id", existing.id);
	} else {
		const { data: created, error } = await admin
			.from("portal_people")
			.insert({ phone: v.phone, name: v.name, email: v.email, ...patch })
			.select("id")
			.single();
		if (error) throw new Error(error.message);
		personId = created.id;
	}
	await startSession(personId as string);
	await clearVerifyNonce();
}

/** Dipolling tab yang menunggu klien mengirim kode lewat WA. */
export async function checkVerification(
	id: string,
): Promise<{ status: "menunggu" | "selesai" | "kedaluwarsa" }> {
	if (!(await rateLimit(`poll:${await clientIp()}`, 200, 600)))
		return { status: "menunggu" };
	const v = await loadOwnVerification(id);
	if (!v || v.consumed_at) return { status: "kedaluwarsa" };
	if (!v.verified_at)
		return {
			status: new Date(v.expires_at) < new Date() ? "kedaluwarsa" : "menunggu",
		};
	await finalize(v);
	return { status: "selesai" };
}

export async function submitEmailCode(
	id: string,
	code: string,
): Promise<{ ok: true } | Fail> {
	const v = await loadOwnVerification(id);
	if (
		!v ||
		v.channel !== "email" ||
		v.consumed_at ||
		new Date(v.expires_at) < new Date()
	)
		return {
			ok: false,
			error: "Kode sudah tidak berlaku. Minta kode baru, ya.",
		};
	if (v.attempts >= 5)
		return { ok: false, error: "Terlalu banyak salah. Minta kode baru, ya." };
	const admin = createAdminClient();
	if (sha256(code.trim()) !== v.code_hash) {
		await admin
			.from("portal_verifications")
			.update({ attempts: v.attempts + 1 })
			.eq("id", v.id);
		return { ok: false, error: "Kodenya belum cocok. Cek lagi email kamu." };
	}
	await admin
		.from("portal_verifications")
		.update({ verified_at: new Date().toISOString() })
		.eq("id", v.id);
	await finalize(v);
	return { ok: true };
}

export async function logoutPortal(): Promise<void> {
	await endSession();
}
