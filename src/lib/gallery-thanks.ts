/**
 * Ucapan terima kasih + link galeri Booth ke klien setelah acara (permintaan
 * owner 2026-10-09 lewat Hermes, template A). Bagian murni: jadwal, doa,
 * teks, daftar penerima. Pengambil data & pengirim di gallery-thanks-run.ts.
 */
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

const MIN = 60_000;

/**
 * Kirim = max(17.00 WIB hari H, selesai + 60 menit) — malam pun tetap malam itu.
 * Galeri belum ada foto → coba lagi sampai batas: selesai + 4 jam, tapi paling
 * cepat 2 jam setelah jam kirim (acara pagi: jam kirimnya baru 17.00).
 */
export function galleryWindow(
	event_date: string,
	endMs: number,
): { sendAt: number; deadline: number } {
	const five = Date.parse(`${event_date}T17:00:00+07:00`);
	const sendAt = Math.max(five, endMs + 60 * MIN);
	return { sendAt, deadline: Math.max(endMs + 240 * MIN, sendAt + 120 * MIN) };
}

type Kind =
	| "wedding"
	| "engagement"
	| "birthday"
	| "corporate"
	| "wisuda"
	| "lain";

export function kindOf(category: string | null): Kind {
	const c = (category ?? "").toLowerCase();
	if (/wedding|akad|resepsi|nikah/.test(c)) return "wedding";
	if (/engage|lamaran|tunangan/.test(c)) return "engagement";
	if (/birthday|ulang|sweet/.test(c)) return "birthday";
	if (/corporate|gathering|instansi|expo|event|kantor/.test(c))
		return "corporate";
	if (/wisuda|graduat|sekolah|lulus/.test(c)) return "wisuda";
	return "lain";
}

/** Doa netral per jenis acara (tanpa ungkapan agama tertentu). */
export function doaFor(category: string | null, nama: string | null): string {
	switch (kindOf(category)) {
		case "wedding":
			return "Selamat menempuh hidup baru, semoga jadi keluarga yang bahagia, rukun, dan langgeng selalu";
		case "engagement":
			return "Selamat atas pertunangannya, semoga lancar sampai hari pernikahan nanti";
		case "birthday":
			return `Selamat ulang tahun${nama ? ` untuk ${nama}` : ""}, semoga sehat, bahagia, dan makin sukses`;
		case "corporate":
			return `Semoga acaranya berkesan untuk seluruh tim dan sukses selalu${nama ? ` untuk ${nama}` : ""}`;
		case "wisuda":
			return "Selamat atas kelulusannya, semoga sukses di langkah berikutnya";
		default:
			return "Semoga acaranya menyenangkan dan jadi kenangan yang indah";
	}
}

const BULAN = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];
function tanggal(iso: string): string {
	const d = new Date(Date.parse(iso) + 7 * 3600_000);
	return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Kak <nama>", kecuali nama sudah membawa sapaan (Teh Puput, Bu Rina, …). */
export function sapa(nama: string | null): string {
	const n = nama?.trim();
	if (!n) return "Kak";
	return /^(kak|teh|mbak|mba|bu|ibu|pak|bapak|mas|bang|om|tante|kang|ci|ko)\b/i.test(
		n,
	)
		? n
		: `Kak ${n}`;
}

export function composeKlien(input: {
	panggilan: string | null;
	category: string | null;
	nama: string | null;
	galleryUrl: string;
	expiresAt: string | null;
}): string {
	const k = kindOf(input.category);
	const acara =
		k === "wedding" || k === "engagement" ? "hari bahagia kalian" : "acaranya";
	const salam = `Halo ${sapa(input.panggilan)} 👋`;
	return [
		salam,
		"",
		`Terima kasih banyak sudah mempercayakan Tetra Photobooth untuk ${acara} hari ini. ${doaFor(input.category, input.nama)} ✨`,
		"",
		"Semua foto photobooth hari ini sudah bisa dilihat & diunduh di sini:",
		input.galleryUrl,
		"",
		`Di galeri itu Kakak bisa download semua foto sekaligus, tandai favorit, dan bagikan ke keluarga. ${
			input.expiresAt
				? `Galerinya aktif sampai ${tanggal(input.expiresAt)}, jangan lupa disimpan ya 😊`
				: "Jangan lupa disimpan ya 😊"
		}`,
	].join("\n");
}

export function composeWo(input: {
	nama: string | null;
	judul: string;
	galleryUrl: string;
}): string {
	return `Halo ${sapa(input.nama)} 👋 terima kasih sudah kerja bareng Tetra di acara ${input.judul} hari ini 🙏 Ini link galeri foto photobooth-nya, boleh diteruskan ke klien ya: ${input.galleryUrl}`;
}

export type Penerima = {
	phone: string;
	nama: string | null;
	jenis: "klien" | "wo";
};

/**
 * Semua nomor yang ada, satu pesan per nomor. Nomor yang tercatat sebagai
 * WO/vendor selalu dapat teks WO (meski juga tercatat sebagai PIC).
 */
export function penerima(
	list: Array<{
		phone: string | null;
		nama: string | null;
		jenis: "klien" | "wo";
	}>,
): Penerima[] {
	const norm = (p: string | null) =>
		p && isLikelyWaPhone(p) && toWaPhone(p).startsWith("628")
			? toWaPhone(p)
			: null;
	const wo = new Set(
		list
			.filter((x) => x.jenis === "wo")
			.map((x) => norm(x.phone))
			.filter(Boolean),
	);
	const out = new Map<string, Penerima>();
	for (const x of list) {
		const phone = norm(x.phone);
		if (!phone || out.has(phone)) continue;
		const jenis = wo.has(phone) ? "wo" : "klien";
		const nama =
			jenis === x.jenis
				? x.nama
				: (list.find((y) => y.jenis === "wo" && norm(y.phone) === phone)
						?.nama ?? x.nama);
		out.set(phone, { phone, nama, jenis });
	}
	return [...out.values()];
}

const BULAN_PENDEK = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

/** Hari terakhir galeri aktif (WIB). Booth `client_expires_at` = awal hari berikutnya. */
export function lastActiveDay(expiresAt: string): string {
	return new Date(Date.parse(expiresAt) - 1 + 7 * 3600_000)
		.toISOString()
		.slice(0, 10);
}

/**
 * Pengingat galeri mau habis: H-7 & H-1 sebelum hari terakhir, dikirim mulai
 * 10.00 WIB dan hanya di jam 08–20 (praktis 10.00–20.00).
 */
export function expiryKind(
	expiresAt: string,
	nowMs: number,
): "galeri_h7" | "galeri_h1" | null {
	const wib = new Date(nowMs + 7 * 3600_000);
	const min = wib.getUTCHours() * 60 + wib.getUTCMinutes();
	if (min < 10 * 60 || min >= 20 * 60) return null;
	const today = wib.toISOString().slice(0, 10);
	const days = Math.round(
		(Date.parse(`${lastActiveDay(expiresAt)}T00:00:00Z`) -
			Date.parse(`${today}T00:00:00Z`)) /
			86_400_000,
	);
	return days === 7 ? "galeri_h7" : days === 1 ? "galeri_h1" : null;
}

/** Teks pengingat (gaya pendek, tanpa doa). */
export function composeExpiry(input: {
	kind: "galeri_h7" | "galeri_h1";
	panggilan: string | null;
	judul: string;
	url: string;
	expiresAt: string;
}): string {
	const d = lastActiveDay(input.expiresAt);
	const tgl = `${Number(d.slice(8, 10))} ${BULAN_PENDEK[Number(d.slice(5, 7)) - 1]}`;
	return input.kind === "galeri_h7"
		? `Halo ${sapa(input.panggilan)}, mau ngingetin aja, galeri foto photobooth ${input.judul} aktif sampai ${tgl}. Kalau belum sempat, download dulu ya biar fotonya aman 🙏\n${input.url}`
		: `${sapa(input.panggilan)}, galeri foto photobooth ${input.judul} tinggal sampai besok ya. Kalau belum sempat download, sekarang aja biar fotonya nggak hilang 🙏\n${input.url}`;
}
