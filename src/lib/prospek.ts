import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Bagian polos (tanpa server-only) dari pipeline prospek outbound, supaya
 * bisa diuji dengan node --test. Tool MCP-nya di lib/ai/tools/prospek.ts.
 */

export const SEGMEN = [
	"corporate",
	"venue",
	"eo_wo",
	"instansi",
	"kampus",
	"personal",
] as const;
export const STATUS_PROSPEK = [
	"kandidat",
	"disapa",
	"follow_up",
	"membalas",
	"deal",
	"tolak",
	"jangan_hubungi",
] as const;

export type Prospek = {
	id: string;
	nama: string;
	email: string | null;
	telepon: string | null;
	draf_subjek: string | null;
	draf_pesan: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function emailValid(e: unknown): e is string {
	return typeof e === "string" && EMAIL_RE.test(e.trim());
}

/** Link aplikasi pengirim berisi draf: mailto untuk email, wa.me untuk WA. */
export function sapaHref(p: Prospek, ke: "email" | "wa"): string | null {
	const pesan = p.draf_pesan ?? "";
	if (ke === "email") {
		if (!emailValid(p.email)) return null;
		const q = new URLSearchParams();
		q.set("subject", p.draf_subjek ?? "");
		q.set("body", pesan);
		// URLSearchParams menulis spasi sebagai "+", mail client butuh %20.
		return `mailto:${p.email.trim()}?${q.toString().replace(/\+/g, "%20")}`;
	}
	// Hanya nomor HP (62 8…): telepon kantor 021/031 dst. tidak ada di WhatsApp.
	if (
		!isLikelyWaPhone(p.telepon) ||
		!toWaPhone(p.telepon as string).startsWith("628")
	)
		return null;
	return `https://wa.me/${toWaPhone(p.telepon as string)}?text=${encodeURIComponent(pesan)}`;
}

/** Link pendek yang dikirim agent ke Telegram; halaman /api/s/<id> membuka draf. */
export function sapaLinks(p: Prospek, baseUrl: string) {
	const base = `${baseUrl.replace(/\/$/, "")}/api/s/${p.id}`;
	return {
		link_email: sapaHref(p, "email") ? `${base}?ke=email` : null,
		link_wa: sapaHref(p, "wa") ? `${base}?ke=wa` : null,
	};
}

/**
 * Kunci anti-duplikat untuk prospek tanpa place_id (hasil web search):
 * nama tanpa badan hukum/tanda baca, dan domain website tanpa www.
 */
export function kunciProspek(
	nama?: string | null,
	website?: string | null,
): string[] {
	const out: string[] = [];
	const n = (nama ?? "")
		.toLowerCase()
		.replace(/\b(pt|cv|tbk|persero|indonesia)\b/g, "")
		.replace(/[^a-z0-9]/g, "");
	if (n.length >= 3) out.push(`n:${n}`);
	try {
		const raw = (website ?? "").trim();
		if (raw) {
			const host = new URL(raw.includes("://") ? raw : `https://${raw}`)
				.hostname;
			out.push(`d:${host.replace(/^www\./, "")}`);
		}
	} catch {}
	return out;
}

type BarisStatistik = {
	segmen: string;
	status: string;
	sumber: string | null;
	email: string | null;
	telepon: string | null;
	catatan: string | null;
};

/** Ringkasan untuk tinjauan mingguan Bruno; kueri asal dibaca dari catatan "kueri: …". */
export function ringkasStatistik(rows: BarisStatistik[]) {
	const hitung = (m: Record<string, number>, k: string) => {
		m[k] = (m[k] ?? 0) + 1;
	};
	const perSegmen: Record<string, number> = {};
	const perStatus: Record<string, number> = {};
	const perKueri: Record<
		string,
		{ total: number; berkontak: number; disapa: number; membalas: number }
	> = {};
	let berkontak = 0;
	let waDititipkan = 0;
	for (const r of rows) {
		hitung(perSegmen, r.segmen);
		hitung(perStatus, r.status);
		const ada = emailValid(r.email) || isLikelyWaPhone(r.telepon);
		if (ada) berkontak++;
		if (/WA (dititipkan|lanjutan)/.test(r.catatan ?? "")) waDititipkan++;
		const kueri =
			r.catatan
				?.match(/kueri:\s*([^;\n]+)/i)?.[1]
				?.trim()
				.toLowerCase() ?? "(tanpa kueri)";
		if (!perKueri[kueri])
			perKueri[kueri] = { total: 0, berkontak: 0, disapa: 0, membalas: 0 };
		const k = perKueri[kueri];
		k.total++;
		if (ada) k.berkontak++;
		if (["disapa", "follow_up", "membalas", "deal"].includes(r.status))
			k.disapa++;
		if (["membalas", "deal"].includes(r.status)) k.membalas++;
	}
	return {
		total: rows.length,
		berkontak,
		wa_dititipkan: waDititipkan,
		per_segmen: perSegmen,
		per_status: perStatus,
		per_kueri: perKueri,
	};
}

const TERLARANG =
	/terkemuka|terdepan|ternama|kebanggaan|menduga|berasumsi|\byakin\b|\btentu\b|\{first_name\}/gi;
const EMAIL_CS =
	/^(helpdesk|help|support|cs|care|customer|customerservice|customercare|custserv|pengaduan|complaint|keluhan|promo|noreply|no-reply)[._-]?\w*@/i;
/** Departemen yang bukan pembuat keputusan acara: salah sasaran. */
const EMAIL_SALAH_DEPT =
	/^(hukum|legal|law|career|careers|karir|karier|recruitment|rekrutmen|hrd\.?recruitment|lowongan|jobs|ir|investor|investor\.?relations?|procurement|pengadaan|tender|finance|keuangan|tax|pajak)[._-]?\w*@/i;
const EMAIL_GRATIS = new Set([
	"gmail.com",
	"yahoo.com",
	"yahoo.co.id",
	"hotmail.com",
	"outlook.com",
	"live.com",
	"icloud.com",
	"ymail.com",
]);

/** "www.hotelkristal.co.id/kontak" → "hotelkristal"; "a@mail.daikin.co.id" → "daikin". */
export function labelMerek(hostAtauEmail: string): string {
	const host = hostAtauEmail
		.toLowerCase()
		.split("@")
		.pop()
		?.replace(/^https?:\/\//, "")
		.split(/[/:?#]/)[0]
		.replace(/^www\./, "");
	const bagian = (host ?? "").split(".").filter(Boolean);
	const sld = new Set([
		"co",
		"ac",
		"or",
		"go",
		"web",
		"my",
		"net",
		"sch",
		"biz",
		"com",
	]);
	const n = bagian.length >= 3 && sld.has(bagian[bagian.length - 2]) ? 3 : 2;
	return bagian[bagian.length - n] ?? "";
}

/**
 * Gerbang terakhir sebelum sapaan diantrekan (semua jalur). Kosong = layak.
 * Email: subjek+isi; WA: isi saja.
 */
export function periksaDraf(d: {
	email?: string | null;
	website?: string | null;
	subjek?: string | null;
	isi?: string | null;
}): string[] {
	const salah: string[] = [];
	const isi = (d.isi ?? "").trim();
	const kata = [
		...new Set(
			[...`${d.subjek ?? ""}\n${isi}`.matchAll(TERLARANG)].map((m) =>
				m[0].toLowerCase(),
			),
		),
	];
	if (kata.length) salah.push(`pujian/tebakan: ${kata.join(", ")}`);
	if (d.email) {
		if (EMAIL_CS.test(d.email)) salah.push("email layanan pelanggan");
		if (EMAIL_SALAH_DEPT.test(d.email))
			salah.push(
				"email departemen salah sasaran (hukum/karir/investor/keuangan)",
			);
		const domain = d.email.split("@").pop()?.toLowerCase() ?? "";
		if (d.website && !EMAIL_GRATIS.has(domain)) {
			const a = labelMerek(d.email);
			const b = labelMerek(d.website);
			if (a && b && !a.includes(b) && !b.includes(a))
				salah.push(`email (${domain}) bukan domain website`);
		}
		if (!isi.endsWith("Salam,")) salah.push('isi tidak diakhiri "Salam,"');
		const n = isi.split(/\s+/).filter(Boolean).length;
		if (n < 50 || n > 160) salah.push(`panjang isi ${n} kata`);
		if ((d.subjek ?? "").split(/\s+/).filter(Boolean).length > 8)
			salah.push("subjek > 8 kata");
	} else if (isi.length < 40) salah.push("pesan WA terlalu pendek");
	return salah;
}

export const DM_IG_MAKS_HARIAN = 10;

/**
 * Rem DM Instagram dari akun Tetra (otomatis lewat browser, keputusan Rama 2 Okt).
 * null = boleh kirim; selain itu alasan ditolak. Jam & hari dihitung WIB.
 */
export function alasanTolakDmIg(a: {
	sekarang: Date;
	status: string;
	terkirimHariIni: number;
	blokirTerakhir: Date | null;
}): string | null {
	const wib = new Date(a.sekarang.getTime() + 7 * 3_600_000);
	const jam = wib.getUTCHours();
	if (a.status !== "kandidat")
		return `berstatus ${a.status}, bukan kandidat; tidak di-DM ulang.`;
	if (
		a.blokirTerakhir &&
		a.sekarang.getTime() - a.blokirTerakhir.getTime() < 48 * 3_600_000
	)
		return "Instagram memblokir aksi dalam 48 jam terakhir; DM dihentikan dulu.";
	if (wib.getUTCDay() === 0 || jam < 9 || jam >= 19)
		return "di luar jam kirim (Senin–Sabtu 09.00–19.00 WIB).";
	if (a.terkirimHariIni >= DM_IG_MAKS_HARIAN)
		return `kuota DM hari ini habis (${DM_IG_MAKS_HARIAN}).`;
	return null;
}
