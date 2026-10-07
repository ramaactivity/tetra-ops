import "server-only";

import { createHash, createHmac } from "node:crypto";

/**
 * File privat portal klien di Cloudflare R2 (bucket R2_BUCKET, kunci khusus
 * bucket itu saja). Akses lewat endpoint S3 path-style dengan tanda tangan
 * SigV4; URL ke browser selalu bertanda tangan & berumur pendek. Endpoint
 * S3 (bukan r2.dev) dipakai karena *.r2.dev diblokir sebagian ISP.
 * Tanpa SDK: cukup presign GET/PUT + HEAD/GET/DELETE dari server.
 */

const sha256 = (s: string | Uint8Array) =>
	createHash("sha256").update(s).digest("hex");
const hmac = (k: string | Buffer, s: string) =>
	createHmac("sha256", k).update(s).digest();

// RFC 3986 — encodeURIComponent menyisakan !'()* yang wajib di-encode SigV4.
const enc = (s: string) =>
	encodeURIComponent(s).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);

function cfg() {
	const account = process.env.R2_ACCOUNT_ID;
	const key = process.env.R2_ACCESS_KEY_ID;
	const secret = process.env.R2_SECRET_ACCESS_KEY;
	const bucket = process.env.R2_BUCKET;
	if (!account || !key || !secret || !bucket)
		throw new Error("R2 belum dikonfigurasi (R2_* env).");
	return { host: `${account}.r2.cloudflarestorage.com`, key, secret, bucket };
}

type SignInput = {
	method: string;
	path: string;
	/** Header yang ikut ditandatangani (nama huruf kecil). host otomatis. */
	headers?: Record<string, string>;
	/** Presign = tanda tangan di query string (untuk browser). */
	presignSec?: number;
	query?: Record<string, string>;
};

/** SigV4 untuk satu objek. Mengembalikan URL + header yang harus dikirim. */
export function signR2(input: SignInput): {
	url: string;
	headers: Record<string, string>;
} {
	const { host, key, secret, bucket } = cfg();
	const now = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
	const day = now.slice(0, 8);
	const scope = `${day}/auto/s3/aws4_request`;
	const canonPath = `/${bucket}/${input.path.split("/").map(enc).join("/")}`;
	const payload = input.presignSec ? "UNSIGNED-PAYLOAD" : sha256("");

	const headers: Record<string, string> = { host, ...input.headers };
	if (!input.presignSec) {
		headers["x-amz-date"] = now;
		headers["x-amz-content-sha256"] = payload;
	}
	const names = Object.keys(headers)
		.map((h) => h.toLowerCase())
		.sort();
	const signedHeaders = names.join(";");

	const query: Record<string, string> = { ...input.query };
	if (input.presignSec) {
		query["X-Amz-Algorithm"] = "AWS4-HMAC-SHA256";
		query["X-Amz-Credential"] = `${key}/${scope}`;
		query["X-Amz-Date"] = now;
		query["X-Amz-Expires"] = String(input.presignSec);
		query["X-Amz-SignedHeaders"] = signedHeaders;
	}
	const canonQuery = Object.keys(query)
		.sort()
		.map((k) => `${enc(k)}=${enc(query[k])}`)
		.join("&");
	const lower = Object.fromEntries(
		Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
	);
	const canonHeaders = names.map((h) => `${h}:${lower[h]}\n`).join("");
	const canonical = [
		input.method,
		canonPath,
		canonQuery,
		canonHeaders,
		signedHeaders,
		payload,
	].join("\n");
	const toSign = `AWS4-HMAC-SHA256\n${now}\n${scope}\n${sha256(canonical)}`;
	let k = hmac(`AWS4${secret}`, day);
	for (const p of ["auto", "s3", "aws4_request"]) k = hmac(k, p);
	const sig = createHmac("sha256", k).update(toSign).digest("hex");

	const base = `https://${host}${canonPath}`;
	if (input.presignSec)
		return {
			url: `${base}?${canonQuery}&X-Amz-Signature=${sig}`,
			headers: {},
		};
	const { host: _h, ...send } = headers;
	return {
		url: canonQuery ? `${base}?${canonQuery}` : base,
		headers: {
			...send,
			authorization: `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
		},
	};
}

/** URL baca bertanda tangan (default 1 jam). */
export function r2SignedUrl(path: string, seconds = 3600): string {
	return signR2({ method: "GET", path, presignSec: seconds }).url;
}

/**
 * URL upload langsung dari browser (PUT, 15 menit). Content-Type dan
 * Content-Length ikut ditandatangani: browser wajib mengirim file dengan
 * tipe & ukuran persis yang sudah divalidasi server, jadi batas ukuran
 * tetap ditegakkan R2 walau upload tidak lewat server kita.
 */
export function r2UploadUrl(
	path: string,
	contentType: string,
	size: number,
): string {
	return signR2({
		method: "PUT",
		path,
		presignSec: 900,
		headers: { "content-type": contentType, "content-length": String(size) },
	}).url;
}

/** Objek ada? */
export async function r2Exists(path: string): Promise<boolean> {
	const s = signR2({ method: "HEAD", path });
	const r = await fetch(s.url, { method: "HEAD", headers: s.headers });
	return r.ok;
}

/** Unduh objek (opsional sebagian: `range` = jumlah byte pertama). */
export async function r2Get(
	path: string,
	range?: number,
): Promise<{ bytes: Uint8Array; type: string } | null> {
	const s = signR2({
		method: "GET",
		path,
		headers: range ? { range: `bytes=0-${range - 1}` } : undefined,
	});
	const r = await fetch(s.url, { headers: s.headers });
	if (!r.ok) return null;
	return {
		bytes: new Uint8Array(await r.arrayBuffer()),
		type: r.headers.get("content-type") ?? "application/octet-stream",
	};
}

/** Hapus objek (yang tidak ada dianggap sukses). */
export async function r2Delete(paths: string[]): Promise<void> {
	await Promise.all(
		paths.map(async (path) => {
			const s = signR2({ method: "DELETE", path });
			const r = await fetch(s.url, { method: "DELETE", headers: s.headers });
			if (!r.ok && r.status !== 404) throw new Error(`R2 delete ${r.status}`);
		}),
	);
}
