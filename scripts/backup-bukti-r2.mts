/**
 * Salin bukti transfer lama dari Google Drive ke Cloudflare R2 (DR-065,
 * owner 25 Nov 2026: "data / bukti tf sebelumnya minta dibackup juga aja ke r2").
 *
 *   node --import tsx --env-file=.env.local scripts/backup-bukti-r2.mts           # DRY-RUN
 *   node --import tsx --env-file=.env.local scripts/backup-bukti-r2.mts --apply   # setelah owner bilang "jalankan"
 *
 * - payment_drafts (bukti_storage = 'drive') → bukti-bayar/<yyyy-mm>/<draft_id>.<ext>;
 *   setelah tersalin & terverifikasi, baris menunjuk ke R2.
 * - payments.proof_url yang berupa link Drive (bukti yang diunggah manual) →
 *   bukti-bayar/pembayaran/<payment_id>.<ext> sebagai CADANGAN saja (link
 *   pembayaran tetap ke Drive — belum ada route R2 untuk pembayaran).
 * - File di Drive TIDAK dihapus. Idempoten: objek R2 yang sudah ada dengan
 *   ukuran sama dilewati. Tiap file dicek MD5 (Drive) + ukuran (R2).
 */
import { createHash } from "node:crypto";
import Module, { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { OAuth2Client } from "google-auth-library";

// r2.ts memakai "server-only" (penjaga bundel Next) — di skrip cukup dilewati.
const M = Module as unknown as {
	_load: (r: string, ...a: unknown[]) => unknown;
};
const load = M._load;
M._load = function (r: string, ...a: unknown[]) {
	return r === "server-only" ? {} : load.call(this, r, ...a);
};
createRequire(import.meta.url);
const { r2Put, signR2 } = await import("../src/lib/storage/r2");

const APPLY = process.argv.includes("--apply");
const env = (k: string) => {
	const v = process.env[k];
	if (!v) throw new Error(`${k} kosong`);
	return v;
};
const db = createClient(
	env("NEXT_PUBLIC_SUPABASE_URL"),
	env("SUPABASE_SERVICE_ROLE_KEY"),
);
const oauth = new OAuth2Client(
	env("GOOGLE_DRIVE_CLIENT_ID"),
	env("GOOGLE_DRIVE_CLIENT_SECRET"),
);
oauth.setCredentials({ refresh_token: env("GOOGLE_DRIVE_REFRESH_TOKEN") });
const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

async function drive(path: string) {
	const { token } = await oauth.getAccessToken();
	const r = await fetch(`https://www.googleapis.com/drive/v3/files/${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!r.ok)
		throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 120)}`);
	return r;
}
async function meta(id: string) {
	const j = (await (
		await drive(
			`${id}?fields=size,mimeType,md5Checksum,name&supportsAllDrives=true`,
		)
	).json()) as {
		size?: string;
		mimeType: string;
		md5Checksum?: string;
		name: string;
	};
	return {
		size: Number(j.size ?? 0),
		mime: j.mimeType,
		md5: j.md5Checksum,
		name: j.name,
	};
}
async function r2Size(path: string): Promise<number | null> {
	const s = signR2({ method: "HEAD", path });
	const r = await fetch(s.url, { method: "HEAD", headers: s.headers });
	return r.ok ? Number(r.headers.get("content-length") ?? -1) : null;
}
const ext = (mime: string) =>
	mime === "image/png"
		? "png"
		: mime === "image/webp"
			? "webp"
			: mime === "application/pdf"
				? "pdf"
				: "jpg";
const driveId = (url: string) =>
	url.match(/\/d\/([\w-]{20,})/)?.[1] ??
	url.match(/[?&]id=([\w-]{20,})/)?.[1] ??
	null;

type Job = {
	jenis: "draft" | "pembayaran";
	rowId: string;
	fileId: string;
	path: (mime: string) => string;
	label: string;
};
const jobs: Job[] = [];

const { data: drafts, error: dErr } = await db
	.from("payment_drafts")
	.select("id, bukti_file_id, created_at, nama_klien, nominal")
	.eq("bukti_storage", "drive")
	.not("bukti_file_id", "is", null);
if (dErr) throw new Error(dErr.message);
const sudah = new Set<string>();
for (const d of drafts ?? []) {
	sudah.add(d.bukti_file_id as string);
	const bulan = new Date(
		new Date(d.created_at as string).getTime() + 7 * 3600_000,
	)
		.toISOString()
		.slice(0, 7);
	jobs.push({
		jenis: "draft",
		rowId: d.id as string,
		fileId: d.bukti_file_id as string,
		path: (m) => `bukti-bayar/${bulan}/${d.id}.${ext(m)}`,
		label: `${d.nama_klien ?? "?"} Rp${Number(d.nominal ?? 0).toLocaleString("id-ID")}`,
	});
}
const { data: pays, error: pErr } = await db
	.from("payments")
	.select("id, proof_url, amount, payment_date")
	.ilike("proof_url", "%drive.google.com%");
if (pErr) throw new Error(pErr.message);
for (const p of pays ?? []) {
	const id = driveId(p.proof_url as string);
	if (!id || sudah.has(id)) continue;
	sudah.add(id);
	jobs.push({
		jenis: "pembayaran",
		rowId: p.id as string,
		fileId: id,
		path: (m) => `bukti-bayar/pembayaran/${p.id}.${ext(m)}`,
		label: `${p.payment_date} Rp${Number(p.amount).toLocaleString("id-ID")}`,
	});
}

let total = 0;
let ok = 0;
let lewat = 0;
const gagal: string[] = [];
const contoh: string[] = [];
for (const j of jobs) {
	try {
		const m = await meta(j.fileId);
		total += m.size;
		const path = j.path(m.mime);
		if (contoh.length < 5)
			contoh.push(
				`${j.jenis} ${j.label} · ${(m.size / 1024).toFixed(0)} KB · ${m.mime} → ${path}`,
			);
		if (!APPLY) continue;
		const ada = await r2Size(path);
		if (ada !== m.size) {
			const body = new Uint8Array(
				await (
					await drive(`${j.fileId}?alt=media&supportsAllDrives=true`)
				).arrayBuffer(),
			);
			const md5 = createHash("md5").update(body).digest("hex");
			if (m.md5 && md5 !== m.md5)
				throw new Error("MD5 tidak cocok dengan Drive");
			await r2Put(path, body, m.mime);
			const cek = await r2Size(path);
			if (cek !== body.byteLength)
				throw new Error(`ukuran R2 ${cek} ≠ ${body.byteLength}`);
		} else lewat++;
		if (j.jenis === "draft") {
			const { error } = await db
				.from("payment_drafts")
				.update({
					bukti_storage: "r2",
					bukti_file_id: path,
					bukti_url: `${app}/api/payment-drafts/${j.rowId}/bukti`,
				})
				.eq("id", j.rowId)
				.eq("bukti_storage", "drive");
			if (error) throw new Error(error.message);
		}
		ok++;
	} catch (e) {
		gagal.push(
			`${j.jenis} ${j.rowId} (${j.label}): ${e instanceof Error ? e.message : e}`,
		);
	}
}

const drafCount = jobs.filter((j) => j.jenis === "draft").length;
console.log(
	APPLY ? "=== APPLY ===" : "=== DRY-RUN (tidak ada yang ditulis) ===",
);
console.log(
	`Bukti draft (dari bot WA): ${drafCount} file · bukti pembayaran manual (link Drive): ${jobs.length - drafCount} file`,
);
console.log(`Total ukuran: ${(total / 1024 / 1024).toFixed(1)} MB`);
console.log(`Contoh:\n  ${contoh.join("\n  ")}`);
if (APPLY) console.log(`Tersalin/terhubung: ${ok} (sudah ada di R2: ${lewat})`);
if (gagal.length)
	console.log(`GAGAL ${gagal.length}:\n  ${gagal.join("\n  ")}`);
