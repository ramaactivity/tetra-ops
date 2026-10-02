import "server-only";

import type { AiTool, AiToolContext } from "@/lib/ai/types";
import {
	emailValid,
	kunciProspek,
	type Prospek,
	SEGMEN,
	STATUS_PROSPEK,
	sapaHref,
	sapaLinks,
} from "@/lib/prospek";

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
		description: "places | web | threads | manual",
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
		const raw = Array.isArray(args.prospek) ? args.prospek.slice(0, 30) : [];
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
		if (!unik.length)
			return { tersimpan: 0, dilewati_duplikat: rows.length, prospek: [] };

		const { data, error } = await ctx.supabase
			.from("prospek")
			.upsert(unik, { onConflict: "place_id", ignoreDuplicates: true })
			.select(KOLOM);
		if (error) return { error: error.message };
		const baru = (data ?? []) as unknown as Prospek[];
		return {
			tersimpan: baru.length,
			dilewati_duplikat: rows.length - baru.length,
			prospek: denganLink(baru),
		};
	},
};

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
			.select("id, nama, telepon, status, catatan")
			.eq("id", id)
			.maybeSingle();
		if (!p) return { error: `prospek ${id} tidak ditemukan` };
		if (p.status !== "kandidat")
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
		const catatan = [p.catatan, `WA dititipkan ke CS Mintet (cmd ${cmd.id})`]
			.filter(Boolean)
			.join("\n");
		await ctx.supabase
			.from("prospek")
			.update({
				status: "disapa",
				disapa_at: new Date().toISOString(),
				draf_pesan: pesan,
				catatan,
				updated_at: new Date().toISOString(),
			})
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

/** Hanya ini yang terbuka untuk MCP_SALES_TOKEN — tanpa data keuangan/klien. */
export const SALES_TOOLS: AiTool[] = [
	placesCari,
	prospekSimpan,
	prospekDaftar,
	prospekUbah,
	prospekKirimWa,
];
