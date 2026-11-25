/**
 * Salin file bukti/nota/foto lama dari Google Drive ke R2 lalu arahkan
 * link di database ke salinan R2 (DR-066 lanjutan, owner 25 Nov 2026).
 *
 *   node --import tsx --env-file=.env.local scripts/backup-drive-r2.mts           # DRY-RUN
 *   node --import tsx --env-file=.env.local scripts/backup-drive-r2.mts --apply   # setelah owner bilang "jalankan"
 *
 * - Hanya FILE di kolom bukti/nota/foto (daftar SUMBER). Link folder event,
 *   audit_log, dan teks chat tidak disentuh.
 * - R2: berkas/<owner|tim>/arsip-drive/<driveFileId>.<ext> — dibuka lewat
 *   /api/berkas (wajib login; "tim" = owner + crew).
 * - Tiap file dicek MD5 (Drive) + ukuran (R2). Link di baris hanya diganti
 *   untuk file yang tersalin & terverifikasi. Idempoten. Drive TIDAK dihapus.
 */
import { createHash } from "node:crypto";
import Module from "node:module";
import { createClient } from "@supabase/supabase-js";
import { OAuth2Client } from "google-auth-library";

const M = Module as unknown as {
	_load: (r: string, ...a: unknown[]) => unknown;
};
const load = M._load;
M._load = function (r: string, ...a: unknown[]) {
	return r === "server-only" ? {} : load.call(this, r, ...a);
};
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

type Kelompok = "owner" | "tim";
/** [tabel, kolom-kolom, kelompok akses, kolom id-file Drive yang ikut diganti] */
const SUMBER: Array<[string, string[], Kelompok, string?]> = [
	["journal_entries", ["proof_url"], "owner"],
	["payments", ["proof_url"], "owner"],
	["manual_notas", ["drive_url"], "owner", "drive_file_id"],
	["event_settle_queue", ["proof_url"], "owner"],
	["commission_payouts", ["proof_url"], "owner"],
	["crew_assignments", ["payment_proof_url", "payment_proof_urls"], "tim"],
	["uang_jalan", ["proof_url"], "tim"],
	["event_assets", ["url"], "tim", "drive_file_id"],
	[
		"crew_rekap",
		[
			"proof_photo_urls",
			"transport_proof_berangkat_url",
			"transport_proof_pulang_url",
			"lainnya_items",
			"expense_nota_urls",
			"uj_bukti_url",
			"uj_kembali_bukti_url",
		],
		"tim",
	],
];

const URL_RE = /https:\/\/(?:drive|docs)\.google\.com\/[^\s"'<>\\]+/g;
const fileIdOf = (url: string) =>
	url.match(/\/file\/d\/([\w-]{20,})/)?.[1] ??
	url.match(/[?&]id=([\w-]{20,})/)?.[1] ??
	null;

async function drive(path: string) {
	const { token } = await oauth.getAccessToken();
	const r = await fetch(`https://www.googleapis.com/drive/v3/files/${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!r.ok)
		throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 120)}`);
	return r;
}
async function r2Size(path: string): Promise<number | null> {
	const s = signR2({ method: "HEAD", path });
	const r = await fetch(s.url, { method: "HEAD", headers: s.headers });
	return r.ok ? Number(r.headers.get("content-length") ?? -1) : null;
}
const EXT: Record<string, string> = {
	"image/png": "png",
	"image/webp": "webp",
	"image/heic": "heic",
	"image/heif": "heif",
	"image/gif": "gif",
	"application/pdf": "pdf",
};

// 1) Kumpulkan baris + file Drive yang dirujuk.
type Baris = {
	tabel: string;
	kolom: string[];
	idKolom?: string;
	id: string;
	nilai: Record<string, unknown>;
};
const baris: Baris[] = [];
const file = new Map<string, { kelompok: Kelompok; tabel: Set<string> }>();
for (const [tabel, kolom, kelompok, idKolom] of SUMBER) {
	const sel = ["id", ...kolom, ...(idKolom ? [idKolom] : [])].join(", ");
	for (let from = 0; ; from += 1000) {
		const { data, error } = await db
			.from(tabel)
			.select(sel)
			.range(from, from + 999);
		if (error) throw new Error(`${tabel}: ${error.message}`);
		for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
			const ids = kolom.flatMap((k) =>
				[...JSON.stringify(r[k] ?? null).matchAll(URL_RE)]
					.map((m) => fileIdOf(m[0]))
					.filter((x): x is string => Boolean(x)),
			);
			if (ids.length === 0) continue;
			baris.push({ tabel, kolom, idKolom, id: r.id as string, nilai: r });
			for (const id of ids) {
				const f = file.get(id) ?? { kelompok, tabel: new Set<string>() };
				// Dirujuk tim di mana pun → tim (owner tetap bisa membuka).
				if (kelompok === "tim") f.kelompok = "tim";
				f.tabel.add(tabel);
				file.set(id, f);
			}
		}
		if ((data ?? []).length < 1000) break;
	}
}

// 2) Salin per file.
const pindah = new Map<string, { key: string; url: string }>();
const perTabel = new Map<string, { n: number; byte: number }>();
let total = 0;
let lewat = 0;
const gagal: string[] = [];
const contoh: string[] = [];
for (const [id, f] of file) {
	try {
		const m = (await (
			await drive(
				`${id}?fields=size,mimeType,md5Checksum&supportsAllDrives=true`,
			)
		).json()) as { size?: string; mimeType: string; md5Checksum?: string };
		const size = Number(m.size ?? 0);
		total += size;
		for (const t of f.tabel) {
			const s = perTabel.get(t) ?? { n: 0, byte: 0 };
			s.n++;
			s.byte += size;
			perTabel.set(t, s);
		}
		const key = `berkas/${f.kelompok}/arsip-drive/${id}.${EXT[m.mimeType] ?? "jpg"}`;
		const url = `${app}/api/${key}`;
		if (contoh.length < 5)
			contoh.push(
				`${[...f.tabel].join("+")} · ${(size / 1024).toFixed(0)} KB · ${m.mimeType} → ${key}`,
			);
		if (!APPLY) continue;
		if ((await r2Size(key)) === size) lewat++;
		else {
			const body = new Uint8Array(
				await (
					await drive(`${id}?alt=media&supportsAllDrives=true`)
				).arrayBuffer(),
			);
			if (
				m.md5Checksum &&
				createHash("md5").update(body).digest("hex") !== m.md5Checksum
			)
				throw new Error("MD5 tidak cocok dengan Drive");
			await r2Put(key, body, m.mimeType);
			if ((await r2Size(key)) !== body.byteLength)
				throw new Error("ukuran di R2 tidak cocok");
		}
		pindah.set(id, { key, url });
	} catch (e) {
		gagal.push(
			`${id} (${[...f.tabel].join("+")}): ${e instanceof Error ? e.message : e}`,
		);
	}
}

// 3) Arahkan link di baris ke R2 (hanya file yang tersalin).
let diubah = 0;
if (APPLY) {
	for (const b of baris) {
		const patch: Record<string, unknown> = {};
		let satuKey: string | null = null;
		for (const k of b.kolom) {
			const lama = JSON.stringify(b.nilai[k] ?? null);
			const baru = lama.replace(URL_RE, (u) => {
				const p = pindah.get(fileIdOf(u) ?? "");
				if (!p) return u;
				satuKey = p.key;
				return p.url;
			});
			if (baru !== lama) patch[k] = JSON.parse(baru);
		}
		if (Object.keys(patch).length === 0) continue;
		if (b.idKolom && satuKey) patch[b.idKolom] = satuKey;
		const { error } = await db.from(b.tabel).update(patch).eq("id", b.id);
		if (error) gagal.push(`update ${b.tabel} ${b.id}: ${error.message}`);
		else diubah++;
	}
}

console.log(
	APPLY ? "=== APPLY ===" : "=== DRY-RUN (tidak ada yang ditulis) ===",
);
console.log(
	`File unik: ${file.size} · total ${(total / 1024 / 1024).toFixed(1)} MB · baris yang merujuk: ${baris.length}`,
);
for (const [t, s] of [...perTabel].sort((a, b) => b[1].byte - a[1].byte))
	console.log(`  ${t}: ${s.n} file, ${(s.byte / 1024 / 1024).toFixed(1)} MB`);
console.log(`Contoh:\n  ${contoh.join("\n  ")}`);
if (APPLY)
	console.log(
		`Tersalin: ${pindah.size} (sudah ada di R2: ${lewat}) · baris diarahkan ke R2: ${diubah}`,
	);
if (gagal.length)
	console.log(`GAGAL ${gagal.length}:\n  ${gagal.slice(0, 30).join("\n  ")}`);
