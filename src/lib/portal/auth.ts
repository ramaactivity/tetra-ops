import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";
import { newToken, sha256 } from "@/lib/portal/core";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sesi portal klien (DR-027). Bukan Supabase Auth: klien tidak boleh
 * bercampur dengan user owner/crew. Token acak di cookie httpOnly; DB hanya
 * menyimpan hash-nya, jadi bocornya tabel tidak membuka sesi siapa pun.
 */

export const SESSION_COOKIE = "tp_sesi";
export const VERIFY_COOKIE = "tp_verif";
const SESSION_DAYS = 60;

export type PortalPerson = {
	id: string;
	phone: string;
	name: string | null;
	email: string | null;
};

const cookieBase = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
};

export const getPortalPerson = cache(async (): Promise<PortalPerson | null> => {
	const token = (await cookies()).get(SESSION_COOKIE)?.value;
	if (!token) return null;
	const admin = createAdminClient();
	const { data } = await admin
		.from("portal_sessions")
		.select(
			"id, expires_at, revoked_at, person:portal_people(id, phone, name, email)",
		)
		.eq("token_hash", sha256(token))
		.maybeSingle();
	if (!data || data.revoked_at || new Date(data.expires_at) < new Date())
		return null;
	// to-one embed → object.
	return (data.person as unknown as PortalPerson) ?? null;
});

export async function startSession(personId: string): Promise<void> {
	const token = newToken();
	const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
	const admin = createAdminClient();
	const { error } = await admin.from("portal_sessions").insert({
		person_id: personId,
		token_hash: sha256(token),
		expires_at: expires.toISOString(),
	});
	if (error) throw new Error(error.message);
	(await cookies()).set(SESSION_COOKIE, token, { ...cookieBase, expires });
}

export async function endSession(): Promise<void> {
	const jar = await cookies();
	const token = jar.get(SESSION_COOKIE)?.value;
	if (token) {
		await createAdminClient()
			.from("portal_sessions")
			.update({ revoked_at: new Date().toISOString() })
			.eq("token_hash", sha256(token));
	}
	jar.delete(SESSION_COOKIE);
}

/** Nonce browser untuk satu percobaan verifikasi (berlaku 15 menit). */
export async function setVerifyNonce(): Promise<string> {
	const nonce = newToken();
	(await cookies()).set(VERIFY_COOKIE, nonce, {
		...cookieBase,
		maxAge: 15 * 60,
	});
	return sha256(nonce);
}

export async function verifyNonceHash(): Promise<string | null> {
	const nonce = (await cookies()).get(VERIFY_COOKIE)?.value;
	return nonce ? sha256(nonce) : null;
}

export async function clearVerifyNonce(): Promise<void> {
	(await cookies()).delete(VERIFY_COOKIE);
}

/** IP pemanggil untuk rate limit (Vercel mengisi x-forwarded-for). */
export async function clientIp(): Promise<string> {
	const h = await headers();
	return (
		h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		h.get("x-real-ip") ||
		"unknown"
	);
}

/** true = boleh lanjut. Gagal hubungi DB = tolak (fail closed). */
export async function rateLimit(
	key: string,
	limit: number,
	windowSec: number,
): Promise<boolean> {
	const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
		p_key: key,
		p_limit: limit,
		p_window_sec: windowSec,
	});
	return !error && data === true;
}
