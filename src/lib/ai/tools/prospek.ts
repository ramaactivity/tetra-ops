import "server-only";

import type { AiTool, AiToolContext } from "@/lib/ai/types";
import {
	alasanTolakDmIg,
	DM_IG_MAKS_HARIAN,
	emailValid,
	kunciProspek,
	type Prospek,
	periksaDraf,
	ringkasStatistik,
	SEGMEN,
	STATUS_PROSPEK,
	sapaHref,
	sapaLinks,
} from "@/lib/prospek";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Tool agent sales (Hermes profil `sales`, token MCP_SALES_TOKEN). Agent
 * mencari dan mencatat prospek; pesan TIDAK dikirim dari sini — Rama yang
 * mengirim lewat link /api/s/<id>. Karena itu tulisan di sini `langsung`
 * (cron agent tak bisa minta izin, dan yang ditulis hanya daftar internal).
 */

const BASE_URL = () =>
	process.env.NEXT_PUBLIC_APP_URL ?? "https://tetra-ops-lac.vercel.app";

const KOLOM =
	"id, nama, segmen, status, area, website, email, telepon, instagram, pic, alasan, draf_subjek, draf_pesan, catatan, disapa_at, created_at";

const str = (v: unknown, max = 2000) =>
	typeof v === "string" ? v.trim().slice(0, max) || null : null;

function denganLink<T extends Prospek>(rows: T[]) {
	return rows.map((r) => ({ ...r, ...sapaLinks(r, BASE_URL()) }));
}

// Jabodetabek kira-kira (Bogor–Tangerang–Bekasi). Places memotong hasil di luar kotak ini.
const JABODETABEK = {
	rectangle: {
		low: { latitude: -6.7, longitude: 106.4 },
		high: { latitude: -6.0, longitude: 107.25 },
	},
};

type Place = {
	id: string;
	displayName?: { text?: string };
	formattedAddress?: string;
	websiteUri?: string;
	nationalPhoneNumber?: string;
	rating?: number;
	userRatingCount?: number;
	primaryTypeDisplayName?: { text?: string };
	businessStatus?: string;
};

export const placesCari: AiTool = {
	name: "places_cari",
	description:
		"Cari tempat/perusahaan di Google Maps area Jabodetabek (mis. 'kantor pusat perusahaan asuransi Sudirman'). " +
		"Mengembalikan nama, alamat, website, telepon, rating, dan `sudah_ada` = sudah tercatat di daftar prospek. " +
		"Satu panggilan = maksimal 20 tempat; hemat kuota, jangan ulang kueri yang sama.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			kueri: { type: "STRING", description: "Kata kunci pencarian Maps." },
			maks: { type: "INTEGER", description: "1–20, default 20." },
		},
		required: ["kueri"],
	},
	async run(args, ctx) {
		const key = process.env.GOOGLE_MAPS_API_KEY;
		if (!key) return { error: "GOOGLE_MAPS_API_KEY belum diisi di Vercel." };
		const kueri = str(args.kueri, 200);
		if (!kueri) return { error: "kueri wajib diisi" };
		const maks =
			typeof args.maks === "number" ? Math.min(Math.max(args.maks, 1), 20) : 20;

		const res = await fetch(
			"https://places.googleapis.com/v1/places:searchText",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Goog-Api-Key": key,
					"X-Goog-FieldMask":
						"places.id,places.displayName,places.formattedAddress,places.websiteUri," +
						"places.nationalPhoneNumber,places.rating,places.userRatingCount," +
						"places.primaryTypeDisplayName,places.businessStatus",
				},
				body: JSON.stringify({
					textQuery: kueri,
					languageCode: "id",
					regionCode: "ID",
					pageSize: maks,
					locationRestriction: JABODETABEK,
				}),
			},
		);
		if (!res.ok)
			return {
				error: `Places API ${res.status}: ${(await res.text()).slice(0, 300)}`,
			};
		const places = (
			((await res.json()) as { places?: Place[] }).places ?? []
		).filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY");

		const ids = places.map((p) => p.id);
		const { data: ada } = ids.length
			? await ctx.supabase
					.from("prospek")
					.select("place_id")
					.in("place_id", ids)
			: { data: [] };
		const sudah = new Set((ada ?? []).map((r) => r.place_id as string));

		return {
			jumlah: places.length,
			tempat: places.map((p) => ({
				place_id: p.id,
				nama: p.displayName?.text ?? "",
				alamat: p.formattedAddress ?? null,
				jenis: p.primaryTypeDisplayName?.text ?? null,
				website: p.websiteUri ?? null,
				telepon: p.nationalPhoneNumber ?? null,
				rating: p.rating ?? null,
				ulasan: p.userRatingCount ?? 0,
				sudah_ada: sudah.has(p.id),
			})),
		};
	},
};

const ITEM_PROPS = {
	nama: { type: "STRING" as const },
	segmen: { type: "STRING" as const, enum: [...SEGMEN] },
	sumber: {
		type: "STRING" as const,
		description: "places | web | threads | instagram | ig_kompetitor | manual",
	},
	place_id: {
		type: "STRING" as const,
		description: "Dari places_cari; kunci anti-duplikat.",
	},
	area: {
		type: "STRING" as const,
		description: "Mis. 'Kuningan, Jakarta Selatan'.",
	},
	website: { type: "STRING" as const },
	email: { type: "STRING" as const },
	telepon: {
		type: "STRING" as const,
		description: "Nomor WA/kantor yang ditemukan.",
	},
	instagram: { type: "STRING" as const },
	pic: {
		type: "STRING" as const,
		description: "Nama/jabatan kontak kalau ketemu.",
	},
	alasan: {
		type: "STRING" as const,
		description: "Kenapa cocok + sinyal spesifik, 1–2 kalimat.",
	},
	draf_subjek: { type: "STRING" as const },
	draf_pesan: { type: "STRING" as const },
	catatan: {
		type: "STRING" as const,
		description:
			'Mis. "kueri: <kueri asal>; musim: <musim aktif>" untuk tinjauan mingguan.',
	},
};

function bersihkan(raw: Record<string, unknown>) {
	const segmen = SEGMEN.includes(raw.segmen as never)
		? (raw.segmen as string)
		: "corporate";
	const email = emailValid(raw.email)
		? (raw.email as string).trim().toLowerCase()
		: null;
	return {
		nama: str(raw.nama, 200),
		segmen,
		sumber: str(raw.sumber, 20) ?? "places",
		place_id: str(raw.place_id, 300),
		area: str(raw.area, 200),
		website: str(raw.website, 500),
		email,
		telepon: str(raw.telepon, 40),
		instagram: str(raw.instagram, 100),
		pic: str(raw.pic, 200),
		alasan: str(raw.alasan, 1000),
		draf_subjek: str(raw.draf_subjek, 200),
		draf_pesan: str(raw.draf_pesan, 3000),
		catatan: str(raw.catatan, 1000),
	};
}

// ponytail: baca seluruh nama+website tiap simpan; cukup sampai ribuan baris,
// pindah ke kolom kunci ber-index kalau daftar prospek membengkak.
async function kunciTercatat(ctx: AiToolContext): Promise<Set<string>> {
	const { data } = await ctx.supabase
		.from("prospek")
		.select("nama, website")
		.limit(10000);
	return new Set((data ?? []).flatMap((r) => kunciProspek(r.nama, r.website)));
}

export const prospekSimpan: AiTool = {
	name: "prospek_simpan",
	description:
		"Catat prospek baru ke daftar (status kandidat) beserta draf sapaannya. Yang sudah ada (place_id, nama, atau domain website sama) dilewati. " +
		"Mengembalikan id + link_email/link_wa untuk dikirim ke Rama; Rama yang menekan kirim.",
	scope: "ops",
	langsung: true,
	parameters: {
		type: "OBJECT",
		properties: {
			prospek: {
				type: "ARRAY",
				items: { type: "OBJECT", properties: ITEM_PROPS, required: ["nama"] },
			},
		},
		required: ["prospek"],
	},
	async run(args, ctx) {
		const r = await simpanUnik(args.prospek, ctx);
		if ("error" in r) return r;
		return {
			tersimpan: r.baru.length,
			dilewati_duplikat: r.dilewati,
			prospek: denganLink(r.baru),
		};
	},
};

async function simpanUnik(
	input: unknown,
	ctx: AiToolContext,
): Promise<
	| { error: string }
	| { baru: (Prospek & Record<string, unknown>)[]; dilewati: number }
> {
	const raw = Array.isArray(input) ? input.slice(0, 30) : [];
	const rows = raw
		.map((r) => bersihkan((r ?? {}) as Record<string, unknown>))
		.filter((r) => r.nama);
	if (!rows.length)
		return { error: "prospek kosong (tiap item wajib punya nama)" };

	const sudah = await kunciTercatat(ctx);
	const unik = rows.filter((r) => {
		const k = kunciProspek(r.nama, r.website);
		if (k.some((x) => sudah.has(x))) return false;
		for (const x of k) sudah.add(x);
		return true;
	});
	if (!unik.length) return { baru: [], dilewati: rows.length };

	const { data, error } = await ctx.supabase
		.from("prospek")
		.upsert(unik, { onConflict: "place_id", ignoreDuplicates: true })
		.select(KOLOM);
	if (error) return { error: error.message };
	const baru = (data ?? []) as unknown as (Prospek & Record<string, unknown>)[];
	return { baru, dilewati: rows.length - baru.length };
}

/** Titip satu pesan WA ke bot (antrean bot_commands); rem 15/hari ada di bot. */
async function titipWa(ctx: AiToolContext, nomor: string, pesan: string) {
	const { data, error } = await ctx.supabase
		.from("bot_commands")
		.insert({
			command: `send-text:${JSON.stringify({ nomor, pesan })}`,
			status: "pending",
		})
		.select("id")
		.single();
	return error ? { error: error.message } : { id: data.id as string };
}

type HasilColdReach = {
	email: string;
	external_ref: string;
	id?: string;
	status: string;
	alasan?: string;
	catatan?: string;
};

/** external_ref → status di Cold Reach (90 hari terakhir); kosong kalau Cold Reach tak terjangkau. */
async function statusColdReach(): Promise<Map<string, string>> {
	const url =
		process.env.COLDREACH_MCP_URL ??
		"https://coldreach-beta.vercel.app/api/mcp";
	const token = process.env.COLDREACH_MCP_TOKEN;
	const peta = new Map<string, string>();
	if (!token) return peta;
	try {
		const sejak = new Date(Date.now() - 90 * 86_400_000)
			.toISOString()
			.slice(0, 10);
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "status_kiriman", arguments: { sejak } },
			}),
		});
		const j = (await res.json()) as {
			result?: { content?: { text?: string }[] };
		};
		const d = JSON.parse(j.result?.content?.[0]?.text ?? "[]") as unknown;
		const baris = Array.isArray(d)
			? d
			: ((Object.values(d as Record<string, unknown>).find(Array.isArray) as
					| unknown[]
					| undefined) ?? []);
		for (const b of baris as { external_ref?: string; status?: string }[])
			if (b.external_ref) peta.set(b.external_ref, b.status ?? "?");
	} catch {
		// Cold Reach tak terjangkau: lanjut tanpa penyaring (draf_kirim tetap idempoten per external_ref).
	}
	return peta;
}

/** Panggil MCP Cold Reach draf_kirim (server-ke-server). */
async function coldReachDrafKirim(
	items: Record<string, unknown>[],
): Promise<{ error: string } | HasilColdReach[]> {
	const url =
		process.env.COLDREACH_MCP_URL ??
		"https://coldreach-beta.vercel.app/api/mcp";
	const token = process.env.COLDREACH_MCP_TOKEN;
	if (!token) return { error: "COLDREACH_MCP_TOKEN belum diisi di Vercel" };
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "draf_kirim", arguments: { items } },
			}),
		});
		const j = (await res.json()) as {
			result?: { content?: { text?: string }[]; isError?: boolean };
		};
		const teks = j.result?.content?.[0]?.text ?? "{}";
		const d = JSON.parse(teks) as { hasil?: HasilColdReach[]; error?: string };
		if (j.result?.isError || d.error)
			return { error: d.error ?? teks.slice(0, 300) };
		return d.hasil ?? [];
	} catch (e) {
		return {
			error: `Cold Reach tidak bisa dihubungi: ${e instanceof Error ? e.message : String(e)}`,
		};
	}
}

export const prospekTambah: AiTool = {
	name: "prospek_tambah",
	description:
		"SATU langkah untuk prospek baru: simpan ke daftar, lalu langsung antrekan sapaannya — yang punya email ke Cold Reach " +
		'(draf_subjek + draf_pesan diakhiri "Salam,"), yang tanpa email tapi punya nomor HP ke bot WA (draf_pesan = teks WA). ' +
		"Mengembalikan `laporan` dari hasil nyata: salin apa adanya ke laporanmu, jangan mengarang status.",
	scope: "ops",
	langsung: true,
	parameters: {
		type: "OBJECT",
		properties: {
			prospek: {
				type: "ARRAY",
				items: { type: "OBJECT", properties: ITEM_PROPS, required: ["nama"] },
			},
		},
		required: ["prospek"],
	},
	async run(args, ctx) {
		const r = await simpanUnik(args.prospek, ctx);
		if ("error" in r) return r;
		const h = await antrekanSapaan(ctx, r);
		return {
			...h,
			laporan: h.laporan.replace(/^(\d+) prospek/, "$1 prospek baru"),
		};
	},
};

export const prospekAntrekan: AiTool = {
	name: "prospek_antrekan",
	description:
		"Antrekan sapaan untuk prospek yang SUDAH tersimpan (status kandidat, punya draf) tapi belum pernah diantrekan " +
		"(mis. Cold Reach sempat gagal). Tanpa `ids` = semua yang tertinggal (maks 30). Mengembalikan `laporan` dari hasil nyata.",
	scope: "ops",
	langsung: true,
	parameters: {
		type: "OBJECT",
		properties: { ids: { type: "ARRAY", items: { type: "STRING" } } },
	},
	async run(args, ctx) {
		let q = ctx.supabase
			.from("prospek")
			.select(KOLOM)
			.eq("status", "kandidat")
			.not("draf_pesan", "is", null)
			.limit(30);
		if (Array.isArray(args.ids) && args.ids.length)
			q = q.in("id", args.ids.map(String).slice(0, 30));
		const { data, error } = await q;
		if (error) return { error: error.message };
		const belum = (
			(data ?? []) as unknown as (Prospek & Record<string, unknown>)[]
		).filter(
			(p) =>
				!/(email diantrekan|WA dititipkan|WA lanjutan|email ditolak)/.test(
					String(p.catatan ?? ""),
				),
		);
		// Yang sudah dikenal Cold Reach (terkirim/dijadwalkan/bounce…) bukan tertinggal:
		// tandai supaya tidak dipindai ulang, jangan diperiksa/antrekan lagi.
		const dikenal = await statusColdReach();
		const tertinggal: typeof belum = [];
		for (const p of belum) {
			const st = dikenal.get(String(p.id));
			if (!st) {
				tertinggal.push(p);
				continue;
			}
			await ctx.supabase
				.from("prospek")
				.update({
					catatan: [
						p.catatan,
						`email diantrekan Cold Reach (status ${st}, dari sinkron)`,
					]
						.filter(Boolean)
						.join("\n"),
					updated_at: new Date().toISOString(),
				})
				.eq("id", String(p.id));
		}
		if (!tertinggal.length)
			return {
				tersimpan: 0,
				laporan: "Tidak ada prospek yang tertinggal antrean.",
			};
		return antrekanSapaan(ctx, { baru: tertinggal, dilewati: 0 });
	},
};

/** Prioritas, segmen, dan kampanye untuk draf_kirim Cold Reach (opsional di sana). */
function metaColdReach(p: Record<string, unknown>) {
	const catatan = String(p.catatan ?? "");
	const klienLama = p.sumber === "klien_lama";
	const musim = catatan.match(/musim:\s*([^;\n]+)/i)?.[1]?.trim();
	return {
		prioritas:
			klienLama || /kueri:\s*radar/i.test(catatan) ? "tinggi" : "normal",
		segmen: SEGMEN.includes(p.segmen as never) ? p.segmen : undefined,
		kampanye: (klienLama
			? "klien lama"
			: musim && musim !== "-"
				? musim
				: undefined
		)?.slice(0, 100),
	};
}

/** Antrekan sapaan untuk prospek tersimpan: email → Cold Reach, HP tanpa email → bot WA. */
async function antrekanSapaan(
	ctx: AiToolContext,
	r: { baru: (Prospek & Record<string, unknown>)[]; dilewati: number },
) {
	const sekarang = () => new Date().toISOString();
	const catat = (
		p: Record<string, unknown>,
		baris: string,
		extra: Record<string, unknown> = {},
	) =>
		ctx.supabase
			.from("prospek")
			.update({
				catatan: [p.catatan, baris].filter(Boolean).join("\n"),
				updated_at: sekarang(),
				...extra,
			})
			.eq("id", p.id as string);

	// Gerbang terakhir: draf yang melanggar aturan tidak diantrekan (semua jalur lewat sini).
	const perbaiki: string[] = [];
	const layak: typeof r.baru = [];
	for (const p of r.baru) {
		if (!p.draf_pesan) {
			layak.push(p);
			continue;
		}
		const salah = periksaDraf({
			email: emailValid(p.email) ? p.email : null,
			website: p.website as string | null,
			subjek: p.draf_subjek,
			isi: p.draf_pesan,
		});
		if (salah.length) {
			await catat(p, `draf perlu diperbaiki: ${salah.join("; ")}`);
			perbaiki.push(`${p.nama} (${salah.join("; ")})`);
		} else layak.push(p);
	}
	const email = layak.filter(
		(p) => emailValid(p.email) && p.draf_subjek && p.draf_pesan,
	);
	const emailOk: string[] = [];
	const emailTolak: string[] = [];
	const lainnya: string[] = [];
	if (email.length) {
		const hasil = await coldReachDrafKirim(
			email.map((p) => ({
				email: p.email,
				nama_perusahaan: p.nama,
				website: p.website ?? undefined,
				telepon: p.telepon ?? undefined,
				nama_pic: p.pic ?? undefined,
				subjek: p.draf_subjek,
				isi: p.draf_pesan,
				external_ref: p.id,
				...metaColdReach(p),
			})),
		);
		if ("error" in hasil) {
			for (const p of email)
				await catat(p, `email belum diantrekan: ${hasil.error}`);
			lainnya.push(
				`⚠️ Cold Reach gagal (${hasil.error}); ${email.length} email belum diantrekan, prospek tetap tersimpan.`,
			);
		} else {
			const perRef = new Map(hasil.map((h) => [h.external_ref, h]));
			for (const p of email) {
				const h = perRef.get(p.id);
				if (
					h &&
					[
						"dijadwalkan",
						"menunggu_persetujuan",
						"tertunda",
						"terkirim",
					].includes(h.status)
				) {
					await catat(
						p,
						`email diantrekan Cold Reach #${(h.id ?? "").slice(0, 4)} (${h.status})`,
					);
					emailOk.push(
						`• ${p.nama} — ${p.email} [#${(h.id ?? "").slice(0, 4)}]${h.catatan ? ` (${h.catatan})` : ""}`,
					);
				} else {
					const alasan =
						h?.alasan ??
						(h ? `status ${h.status}` : "tidak ada hasil dari Cold Reach");
					await catat(p, `email ditolak Cold Reach: ${alasan}`);
					emailTolak.push(`${p.nama} (${alasan})`);
				}
			}
		}
	}

	const waOk: string[] = [];
	const tanpaKontak: string[] = [];
	for (const p of layak.filter((x) => !email.includes(x))) {
		const pesan = String(p.draf_pesan ?? "");
		const href = sapaHref({ ...p, email: null } as Prospek, "wa");
		if (href && pesan.length >= 40) {
			const nomor = new URL(href).pathname.slice(1);
			const t = await titipWa(ctx, nomor, pesan);
			if ("error" in t) {
				lainnya.push(`⚠️ WA ${p.nama} gagal dititipkan: ${t.error}`);
				continue;
			}
			await catat(p, `WA dititipkan ke CS Mintet (cmd ${t.id})`, {
				status: "disapa",
				disapa_at: sekarang(),
			});
			waOk.push(`• ${p.nama} — ${nomor}`);
		} else tanpaKontak.push(p.nama);
	}

	const bagian = [
		emailOk.length
			? `Email diantrekan (${emailOk.length})\n${emailOk.join("\n")}`
			: "",
		waOk.length ? `WA diantrekan (${waOk.length})\n${waOk.join("\n")}` : "",
		emailTolak.length
			? `Email ditolak Cold Reach: ${emailTolak.join(", ")}`
			: "",
		perbaiki.length
			? `Draf perlu diperbaiki, belum diantrekan (${perbaiki.length}): ${perbaiki.join(", ")}`
			: "",
		tanpaKontak.length
			? `Disimpan tanpa kontak (${tanpaKontak.length}): ${tanpaKontak.join(", ")}`
			: "",
		r.dilewati ? `Duplikat dilewati: ${r.dilewati}` : "",
		...lainnya,
	].filter(Boolean);
	return {
		tersimpan: r.baru.length,
		email_diantrekan: emailOk.length,
		wa_diantrekan: waOk.length,
		// id dipakai langkah berikut (mis. prospek_dm_ig) tanpa mencari ulang.
		prospek: r.baru.map((p) => ({ id: p.id, nama: p.nama })),
		laporan: `${r.baru.length} prospek\n\n${bagian.join("\n\n")}`,
	};
}

export const prospekDaftar: AiTool = {
	name: "prospek_daftar",
	description:
		"Lihat daftar prospek. `perlu_follow_up=true` = sudah disapa ≥3 hari dan belum membalas. " +
		"Hasil menyertakan link_email/link_wa berisi draf terbaru.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			status: { type: "STRING", enum: [...STATUS_PROSPEK] },
			segmen: { type: "STRING", enum: [...SEGMEN] },
			cari: { type: "STRING", description: "Potongan nama." },
			perlu_follow_up: { type: "BOOLEAN" },
			cek: {
				type: "ARRAY",
				items: { type: "STRING" },
				description:
					"Nama perusahaan atau website yang mau dicek sebelum diriset; hasil `sudah_ada` berisi yang sudah tercatat.",
			},
			maks: { type: "INTEGER", description: "Default 20, maks 50." },
		},
	},
	async run(args, ctx) {
		if (Array.isArray(args.cek)) {
			const sudah = await kunciTercatat(ctx);
			const daftar = args.cek.filter((x): x is string => typeof x === "string");
			return {
				sudah_ada: daftar.filter((x) =>
					[
						...kunciProspek(x, null),
						...kunciProspek(null, x.includes(".") ? x : null),
					].some((k) => sudah.has(k)),
				),
			};
		}
		const maks =
			typeof args.maks === "number" ? Math.min(Math.max(args.maks, 1), 50) : 20;
		let q = ctx.supabase
			.from("prospek")
			.select(KOLOM)
			.order("created_at", { ascending: false })
			.limit(maks);
		if (args.perlu_follow_up === true) {
			const batas = new Date(Date.now() - 3 * 86_400_000).toISOString();
			q = q.in("status", ["disapa", "follow_up"]).lte("disapa_at", batas);
		} else if (typeof args.status === "string") q = q.eq("status", args.status);
		if (typeof args.segmen === "string") q = q.eq("segmen", args.segmen);
		const cari = str(args.cari, 100);
		if (cari) q = q.ilike("nama", `%${cari}%`);
		const { data, error } = await q;
		if (error) return { error: error.message };
		return {
			jumlah: data?.length ?? 0,
			prospek: denganLink((data ?? []) as unknown as Prospek[]),
		};
	},
};

export const prospekUbah: AiTool = {
	name: "prospek_ubah",
	description:
		"Ubah satu prospek: status (mis. Rama bilang 'sudah kukirim' → disapa), kontak, catatan, atau draf baru " +
		"(mis. draf follow-up). Status disapa/follow_up mencatat waktu sapaan.",
	scope: "ops",
	langsung: true,
	parameters: {
		type: "OBJECT",
		properties: {
			id: { type: "STRING" },
			status: { type: "STRING", enum: [...STATUS_PROSPEK] },
			email: { type: "STRING" },
			telepon: { type: "STRING" },
			pic: { type: "STRING" },
			catatan: { type: "STRING" },
			draf_subjek: { type: "STRING" },
			draf_pesan: { type: "STRING" },
		},
		required: ["id"],
	},
	async run(args, ctx: AiToolContext) {
		const id = str(args.id, 40);
		if (!id) return { error: "id wajib" };
		const patch: Record<string, unknown> = {
			updated_at: new Date().toISOString(),
		};
		if (STATUS_PROSPEK.includes(args.status as never)) {
			patch.status = args.status;
			if (args.status === "disapa" || args.status === "follow_up")
				patch.disapa_at = patch.updated_at;
		}
		if (args.email !== undefined) {
			if (!emailValid(args.email)) return { error: "email tidak valid" };
			patch.email = (args.email as string).trim().toLowerCase();
		}
		for (const k of [
			"telepon",
			"pic",
			"catatan",
			"draf_subjek",
			"draf_pesan",
		] as const) {
			if (args[k] !== undefined) patch[k] = str(args[k], 3000);
		}
		const { data, error } = await ctx.supabase
			.from("prospek")
			.update(patch)
			.eq("id", id)
			.select(KOLOM)
			.maybeSingle();
		if (error) return { error: error.message };
		if (!data) return { error: `prospek ${id} tidak ditemukan` };
		return {
			tersimpan: true,
			prospek: denganLink([data as unknown as Prospek])[0],
		};
	},
};

export const prospekKirimWa: AiTool = {
	name: "prospek_kirim_wa",
	description:
		"Titipkan sapaan WA pertama ke prospek lewat bot WA Tetra (CS Mintet). Hanya untuk prospek berstatus kandidat " +
		"dengan nomor HP. Bot membatasi 15 nomor/hari, Senin–Jumat 09–17 WIB, berjeda; kelebihan otomatis antre ke hari berikutnya.",
	scope: "ops",
	langsung: true,
	parameters: {
		type: "OBJECT",
		properties: {
			id: {
				type: "STRING",
				description: "id prospek dari prospek_simpan/prospek_daftar.",
			},
			pesan: {
				type: "STRING",
				description: "Sapaan WA 40–80 kata, personal, tanpa link.",
			},
			lanjutan: {
				type: "BOOLEAN",
				description:
					"true = WA lanjutan untuk prospek yang sudah di-email ≥7 hari tanpa balasan (status disapa/follow_up), sekali saja.",
			},
		},
		required: ["id", "pesan"],
	},
	async run(args, ctx) {
		const id = str(args.id, 40);
		const pesan = str(args.pesan, 1000);
		if (!id || !pesan || pesan.length < 40)
			return { error: "id dan pesan (min. 40 karakter) wajib" };
		const { data: p } = await ctx.supabase
			.from("prospek")
			.select("id, nama, telepon, status, catatan, disapa_at")
			.eq("id", id)
			.maybeSingle();
		if (!p) return { error: `prospek ${id} tidak ditemukan` };
		const lanjutan = args.lanjutan === true;
		const sudahWa = /WA (dititipkan|lanjutan)/.test(p.catatan ?? "");
		if (lanjutan) {
			const tujuhHari = Date.now() - 7 * 86_400_000;
			if (!["disapa", "follow_up"].includes(p.status) || sudahWa)
				return {
					error: `${p.nama} tidak memenuhi WA lanjutan (status ${p.status}${sudahWa ? ", sudah pernah di-WA" : ""}).`,
				};
			if (!p.disapa_at || Date.parse(p.disapa_at) > tujuhHari)
				return {
					error: `${p.nama} baru disapa kurang dari 7 hari lalu; tunggu dulu.`,
				};
		} else if (p.status !== "kandidat")
			return {
				error: `${p.nama} berstatus ${p.status}, bukan kandidat; tidak disapa ulang.`,
			};
		const href = sapaHref(
			{ ...p, email: null, draf_subjek: null, draf_pesan: pesan } as Prospek,
			"wa",
		);
		if (!href)
			return {
				error: `${p.nama} tidak punya nomor HP (telepon kantor bukan WA).`,
			};
		const nomor = new URL(href).pathname.slice(1);

		const { data: cmd, error } = await ctx.supabase
			.from("bot_commands")
			.insert({
				command: `send-text:${JSON.stringify({ nomor, pesan })}`,
				status: "pending",
			})
			.select("id")
			.single();
		if (error) return { error: `Gagal menitipkan ke bot: ${error.message}` };
		const catatan = [
			p.catatan,
			`${lanjutan ? "WA lanjutan" : "WA dititipkan"} ke CS Mintet (cmd ${cmd.id})`,
		]
			.filter(Boolean)
			.join("\n");
		const sekarang = new Date().toISOString();
		await ctx.supabase
			.from("prospek")
			.update(
				lanjutan
					? { catatan, updated_at: sekarang }
					: {
							status: "disapa",
							disapa_at: sekarang,
							draf_pesan: pesan,
							catatan,
							updated_at: sekarang,
						},
			)
			.eq("id", id);
		return {
			status: "antre",
			nama: p.nama,
			nomor,
			catatan:
				"Bot mengirim sesuai rem (maks 15/hari, jam kerja, berjeda). Nomor yang ternyata tidak ada di WhatsApp ditolak bot.",
		};
	},
};

export const prospekDmIg: AiTool = {
	name: "prospek_dm_ig",
	description:
		"Rem & catatan DM Instagram dari akun Tetra ke prospek perorangan (komentator IG kompetitor). " +
		"aksi 'izin' WAJIB dipanggil tepat sebelum mengetik DM (cek kuota 10/hari — vendor WO/EO/venue maks 5 sebelum 15.00 WIB, sesudahnya boleh sisa kuota — Senin–Sabtu 09–19 WIB, sekali per orang, " +
		"berhenti 48 jam setelah blokir); 'terkirim' setelah DM terkirim; 'gagal' kalau tidak terkirim; " +
		"'diblokir' kalau Instagram menampilkan peringatan/blokir aksi/verifikasi (semua DM berhenti 48 jam).",
	scope: "ops",
	langsung: true,
	parameters: {
		type: "OBJECT",
		properties: {
			aksi: { type: "STRING", enum: ["izin", "terkirim", "gagal", "diblokir"] },
			id: {
				type: "STRING",
				description: "id prospek (segmen personal, ada instagram).",
			},
			teks: {
				type: "STRING",
				description: "Isi DM yang terkirim (aksi terkirim).",
			},
			alasan: {
				type: "STRING",
				description: "Untuk gagal/diblokir: kutipan peringatan Instagram.",
			},
		},
		required: ["aksi", "id"],
	},
	async run(args, ctx) {
		const aksi = str(args.aksi, 20);
		const id = str(args.id, 40);
		if (!aksi || !id) return { error: "aksi dan id wajib" };
		const { data: p } = await ctx.supabase
			.from("prospek")
			.select("id, nama, segmen, instagram, status, catatan")
			.eq("id", id)
			.maybeSingle();
		if (!p) return { error: `prospek ${id} tidak ditemukan` };
		const sekarang = new Date();
		const tambahCatatan = (baris: string, ubah: Record<string, unknown> = {}) =>
			ctx.supabase
				.from("prospek")
				.update({
					catatan: [p.catatan, baris].filter(Boolean).join("\n"),
					updated_at: sekarang.toISOString(),
					...ubah,
				})
				.eq("id", id);

		if (aksi === "izin") {
			if (!p.instagram)
				return {
					boleh: false,
					alasan: `${p.nama} tidak punya username Instagram.`,
				};
			const wib = new Date(sekarang.getTime() + 7 * 3_600_000);
			const awalHariWib = new Date(
				Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) -
					7 * 3_600_000,
			).toISOString();
			const [{ data: hariIni }, { data: blokir }, { data: terakhir }] =
				await Promise.all([
					ctx.supabase
						.from("prospek")
						.select("segmen")
						.ilike("catatan", "%DM IG terkirim%")
						.gte("disapa_at", awalHariWib),
					ctx.supabase
						.from("prospek")
						.select("updated_at")
						.ilike("catatan", "%DM IG diblokir%")
						.order("updated_at", { ascending: false })
						.limit(1),
					ctx.supabase
						.from("prospek")
						.select("draf_pesan")
						.ilike("catatan", "%DM IG terkirim%")
						.order("disapa_at", { ascending: false })
						.limit(30),
				]);
			const count = hariIni?.length ?? 0;
			const vendor = ["eo_wo", "venue"].includes(p.segmen);
			const alasan = alasanTolakDmIg({
				sekarang,
				status: p.status,
				terkirimHariIni: count,
				blokirTerakhir: blokir?.[0] ? new Date(blokir[0].updated_at) : null,
				vendor,
				terkirimVendorHariIni: (hariIni ?? []).filter((r) =>
					["eo_wo", "venue"].includes(r.segmen),
				).length,
			});
			if (alasan) return { boleh: false, alasan: `${p.nama}: ${alasan}` };
			return {
				boleh: true,
				nama: p.nama,
				instagram: p.instagram,
				sisa_kuota_hari_ini: DM_IG_MAKS_HARIAN - count - 1,
				// Penjaga Hermes menolak DM baru yang mirip salah satu teks ini.
				dm_terakhir: (terakhir ?? []).map((r) => r.draf_pesan).filter(Boolean),
			};
		}
		if (aksi === "terkirim") {
			const teks = str(args.teks, 1000);
			if (!teks) return { error: "teks DM wajib untuk aksi terkirim" };
			await tambahCatatan(`DM IG terkirim: ${teks.slice(0, 120)}`, {
				status: "disapa",
				disapa_at: sekarang.toISOString(),
				draf_pesan: teks,
			});
			return { status: "disapa", nama: p.nama };
		}
		if (aksi === "gagal" || aksi === "diblokir") {
			const alasan = str(args.alasan, 300) ?? "-";
			await tambahCatatan(
				`DM IG ${aksi === "diblokir" ? "diblokir" : "gagal"}: ${alasan}`,
			);
			return {
				dicatat: true,
				catatan:
					aksi === "diblokir"
						? "Semua DM IG berhenti 48 jam. Laporkan ke Rama dan hentikan run ini."
						: "Lanjut ke prospek berikutnya kalau kuota masih ada.",
			};
		}
		return { error: "aksi harus izin | terkirim | gagal | diblokir" };
	},
};

const KOLOM_BASIS =
	"id, tab, jenis, nama, perusahaan, jabatan, email, wa, instagram, kategori, area, catatan, status_lama";

export const basisKontakImpor: AiTool = {
	name: "basis_kontak_impor",
	description:
		"Salin baris database lama (Google Sheet Rama) ke tabel basis_kontak. Maks 1000 baris per panggilan; " +
		"baris dengan kunci yang sudah ada dilewati (aman diulang).",
	scope: "ops",
	langsung: true,
	parameters: {
		type: "OBJECT",
		properties: {
			baris: {
				type: "ARRAY",
				items: {
					type: "OBJECT",
					properties: {
						kunci: { type: "STRING" },
						tab: { type: "STRING" },
						jenis: { type: "STRING", enum: ["vendor", "korporat", "hangat"] },
						nama: { type: "STRING" },
						perusahaan: { type: "STRING" },
						jabatan: { type: "STRING" },
						email: { type: "STRING" },
						wa: { type: "STRING" },
						instagram: { type: "STRING" },
						kategori: { type: "STRING" },
						area: { type: "STRING" },
						catatan: { type: "STRING" },
						status_lama: { type: "STRING" },
					},
				},
			},
		},
		required: ["baris"],
	},
	async run(args, ctx) {
		const raw = Array.isArray(args.baris) ? args.baris.slice(0, 1000) : [];
		const rows = raw
			.map((b) => b as Record<string, unknown>)
			.filter(
				(b) =>
					str(b.kunci, 300) &&
					str(b.tab, 60) &&
					["vendor", "korporat", "hangat"].includes(String(b.jenis)),
			)
			.map((b) => ({
				kunci: str(b.kunci, 300),
				tab: str(b.tab, 60),
				jenis: String(b.jenis),
				nama: str(b.nama, 200),
				perusahaan: str(b.perusahaan, 200),
				jabatan: str(b.jabatan, 200),
				email: emailValid(b.email)
					? String(b.email).trim().toLowerCase()
					: null,
				wa: str(b.wa, 20),
				instagram: str(b.instagram, 100),
				kategori: str(b.kategori, 100),
				area: str(b.area, 100),
				catatan: str(b.catatan, 500),
				status_lama: str(b.status_lama, 100),
			}));
		if (!rows.length)
			return { error: "tidak ada baris valid (kunci, tab, jenis wajib)" };
		const { data, error } = await ctx.supabase
			.from("basis_kontak")
			.upsert(rows, { onConflict: "kunci", ignoreDuplicates: true })
			.select("id");
		if (error) return { error: error.message };
		return { diterima: rows.length, baru: data?.length ?? 0 };
	},
};

export const basisKontakDaftar: AiTool = {
	name: "basis_kontak_daftar",
	description:
		"Ambil baris basis_kontak yang BELUM diproses (diproses_at kosong), per jenis, urut waktu impor. Plus jumlah sisa per jenis.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			jenis: { type: "STRING", enum: ["vendor", "korporat", "hangat"] },
			maks: { type: "NUMBER", description: "1–500, default 50." },
			punya: {
				type: "STRING",
				enum: ["email", "wa", "instagram"],
				description: "Hanya baris yang punya kolom ini.",
			},
			tanpa: {
				type: "STRING",
				enum: ["email", "wa", "instagram"],
				description: "Hanya baris yang TIDAK punya kolom ini.",
			},
		},
		required: ["jenis"],
	},
	async run(args, ctx) {
		const jenis = String(args.jenis);
		const maks = Math.min(500, Math.max(1, Number(args.maks) || 50));
		const kolom = ["email", "wa", "instagram"];
		let q = ctx.supabase
			.from("basis_kontak")
			.select(KOLOM_BASIS)
			.eq("jenis", jenis)
			.is("diproses_at", null)
			.order("created_at")
			.order("kunci")
			.limit(maks);
		if (kolom.includes(String(args.punya)))
			q = q.not(String(args.punya), "is", null);
		if (kolom.includes(String(args.tanpa))) q = q.is(String(args.tanpa), null);
		const { data, error } = await q;
		if (error) return { error: error.message };
		const { count } = await ctx.supabase
			.from("basis_kontak")
			.select("id", { count: "exact", head: true })
			.eq("jenis", jenis)
			.is("diproses_at", null);
		return { sisa: count ?? 0, baris: data ?? [] };
	},
};

export const basisKontakTandai: AiTool = {
	name: "basis_kontak_tandai",
	description:
		"Tandai baris basis_kontak sudah diproses (tidak diambil lagi) beserta hasilnya, mis. 'diantrekan' atau 'dilewati: <alasan>'.",
	scope: "ops",
	langsung: true,
	parameters: {
		type: "OBJECT",
		properties: {
			items: {
				type: "ARRAY",
				items: {
					type: "OBJECT",
					properties: { id: { type: "STRING" }, hasil: { type: "STRING" } },
				},
			},
		},
		required: ["items"],
	},
	async run(args, ctx) {
		const items = (Array.isArray(args.items) ? args.items : [])
			.map((i) => i as Record<string, unknown>)
			.filter((i) => str(i.id, 40))
			.slice(0, 500);
		const sekarang = new Date().toISOString();
		let ditandai = 0;
		for (const i of items) {
			const { error } = await ctx.supabase
				.from("basis_kontak")
				.update({
					diproses_at: sekarang,
					hasil: str(i.hasil, 300) ?? "diproses",
				})
				.eq("id", str(i.id, 40) as string);
			if (!error) ditandai++;
		}
		return { ditandai };
	},
};

export const prospekStatistik: AiTool = {
	name: "prospek_statistik",
	description:
		"Angka prospek dalam rentang tanggal (default 7 hari terakhir): total, yang punya kontak, per segmen, per status, " +
		'dan per kueri asal (dari catatan "kueri: …"). Untuk tinjauan mingguan — pakai angka ini, jangan menghitung sendiri.',
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			sejak: {
				type: "STRING",
				description: "YYYY-MM-DD (WIB). Default 7 hari lalu.",
			},
			sampai: {
				type: "STRING",
				description: "YYYY-MM-DD (WIB), inklusif. Default hari ini.",
			},
		},
	},
	async run(args, ctx) {
		const tgl = (v: unknown) =>
			typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
		const sampai = tgl(args.sampai) ?? ctx.todayISO;
		const dari =
			tgl(args.sejak) ??
			new Date(Date.parse(`${ctx.todayISO}T00:00:00+07:00`) - 6 * 86_400_000)
				.toISOString()
				.slice(0, 10);
		const akhir = new Date(
			Date.parse(`${sampai}T00:00:00+07:00`) + 86_400_000,
		).toISOString();
		const { data, error } = await ctx.supabase
			.from("prospek")
			.select("segmen, status, sumber, email, telepon, catatan")
			.gte("created_at", new Date(`${dari}T00:00:00+07:00`).toISOString())
			.lt("created_at", akhir)
			.limit(5000);
		if (error) return { error: error.message };
		return { sejak: dari, sampai, ...ringkasStatistik(data ?? []) };
	},
};

const KATEGORI_KLIEN_LAMA = [
	"corporate",
	"gathering",
	"instansi",
	"event",
	"wisuda",
];

export const klienLama: AiTool = {
	name: "klien_lama",
	description:
		"Klien lama non-pernikahan (korporat, gathering, instansi, event, wisuda) dari event yang sudah selesai, sudah tanpa klien yang datang lewat vendor rekanan: satu baris per klien " +
		"dengan event terakhirnya. Klien yang punya event mendatang tidak ikut. `sudah_prospek` = nomornya sudah ada di daftar prospek. " +
		"Untuk reaktivasi (sapaan hangat) dan mencari perusahaan sejenis.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			minimal_bulan_lalu: {
				type: "INTEGER",
				description: "Event terakhir minimal N bulan lalu. Default 3.",
			},
		},
	},
	async run(args, ctx) {
		const bulan =
			typeof args.minimal_bulan_lalu === "number"
				? Math.max(0, args.minimal_bulan_lalu)
				: 3;
		const batas = new Date(
			Date.parse(`${ctx.todayISO}T00:00:00+07:00`) - bulan * 30 * 86_400_000,
		)
			.toISOString()
			.slice(0, 10);
		const { data: ev, error } = await ctx.supabase
			.from("events")
			.select(
				"client_name, pic_name, client_wa, event_category, event_date, venue_name, venue_city, status, channel",
			)
			.in("event_category", KATEGORI_KLIEN_LAMA)
			.is("deleted_at", null)
			.neq("status", "cancelled")
			.order("event_date", { ascending: false })
			.limit(1000);
		if (error) return { error: error.message };
		const { data: pr } = await ctx.supabase
			.from("prospek")
			.select("telepon")
			.not("telepon", "is", null)
			.limit(10000);
		const sudah = new Set((pr ?? []).map((r) => toWaPhone(String(r.telepon))));

		const perKlien = new Map<
			string,
			Record<string, unknown> & { jumlah_event: number }
		>();
		const aktif = new Set<string>();
		for (const e of ev ?? []) {
			if (!isLikelyWaPhone(e.client_wa)) continue;
			const wa = toWaPhone(String(e.client_wa));
			if (e.status !== "completed") {
				aktif.add(wa);
				continue;
			}
			const ada = perKlien.get(wa);
			if (ada) ada.jumlah_event++;
			else
				perKlien.set(wa, {
					nama: e.client_name,
					pic: e.pic_name,
					wa,
					kategori: e.event_category,
					event_terakhir: e.event_date,
					venue:
						[e.venue_name, e.venue_city].filter(Boolean).join(", ") || null,
					channel: e.channel,
					sudah_prospek: sudah.has(wa),
					jumlah_event: 1,
				});
		}
		const layak = [...perKlien.values()].filter(
			(k) => !aktif.has(String(k.wa)) && String(k.event_terakhir) <= batas,
		);
		// Klien yang datang lewat vendor rekanan (WO/EO) milik relasi vendor itu: jangan disapa langsung.
		const klien = layak.filter((k) => k.channel !== "vendor");
		return {
			jumlah: klien.length,
			dilewati_lewat_vendor: layak.length - klien.length,
			klien,
		};
	},
};

/** Hanya ini yang terbuka untuk MCP_SALES_TOKEN — tanpa data keuangan/klien. */
export const SALES_TOOLS: AiTool[] = [
	placesCari,
	prospekSimpan,
	prospekTambah,
	prospekAntrekan,
	prospekDaftar,
	prospekUbah,
	prospekKirimWa,
	prospekDmIg,
	basisKontakImpor,
	basisKontakDaftar,
	basisKontakTandai,
	prospekStatistik,
	klienLama,
];
