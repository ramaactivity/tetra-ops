import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link PDF dokumen tanpa login, untuk bot WA yang mengunduh invoice lalu
 * mengirimnya ke klien. Tanda tangan = HMAC(id + kedaluwarsa) dengan kunci
 * turunan MCP_API_TOKEN, jadi hanya server yang memegang token itu yang bisa
 * membuatnya. Berlaku singkat; bocor pun hanya membuka satu dokumen.
 *
 * ponytail: kunci menumpang MCP_API_TOKEN — rotasi token itu otomatis
 * mematikan link yang beredar. Pisahkan env-nya kalau butuh rotasi terpisah.
 */

function sign(id: string, exp: number, secret: string): string {
	return createHmac("sha256", `pdf-link:${secret}`)
		.update(`${id}.${exp}`)
		.digest("base64url");
}

export function signedPdfQuery(
	id: string,
	ttlSeconds: number,
	secret = process.env.MCP_API_TOKEN,
	now = Date.now(),
): string | null {
	if (!secret) return null;
	const exp = Math.floor(now / 1000) + ttlSeconds;
	return `exp=${exp}&sig=${sign(id, exp, secret)}`;
}

export function verifyPdfSignature(
	id: string,
	exp: string | null,
	sig: string | null,
	secret = process.env.MCP_API_TOKEN,
	now = Date.now(),
): boolean {
	if (!secret || !exp || !sig) return false;
	const expNum = Number(exp);
	if (!Number.isInteger(expNum) || expNum * 1000 < now) return false;
	const want = Buffer.from(sign(id, expNum, secret));
	const got = Buffer.from(sig);
	return want.length === got.length && timingSafeEqual(want, got);
}
