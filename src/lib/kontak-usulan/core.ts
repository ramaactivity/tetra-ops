/**
 * Kontak belum terdaftar (DR-064, kontrak hermes-ff 25 Nov 2026) — bagian
 * murni: body bot + pencocokan nama kontak WA ke acara. Data event hanya
 * berubah saat owner menekan tombol di Ops.
 */
import { z } from "zod";

const txt = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => v || null);

export const KontakUsulanSchema = z
	.object({
		nomor: z
			.string()
			.nullish()
			.transform((v) => v?.replace(/\D/g, "") || null),
		wa_jid: txt(200),
		nama_kontak: txt(160),
		nama_wa: txt(160),
		alasan: z.enum(["nama_kontak_cocok", "mengaku_booking"]),
		cuplikan: txt(300),
	})
	.refine((b) => b.nomor || b.wa_jid, { message: "nomor atau wa_jid wajib" });
export type KontakUsulanInput = z.output<typeof KontakUsulanSchema>;

export type EventKandidatSrc = {
	id: string;
	project_id: string;
	client_name: string | null;
	event_title?: string | null;
	event_date: string;
	vendor_name?: string | null;
	vendor_pic_name?: string | null;
	pic_name?: string | null;
	booker?: string | null;
};

export type Kandidat = {
	event_id: string;
	project_id: string;
	client_name: string | null;
	event_date: string;
	skor: number;
	alasan: string[];
};

// Kata yang tidak membedakan orang (gelar, jenis acara, sapaan, nama bulan).
const UMUM = new Set(
	"kak kakak mas mbak bu ibu pak bapak dan the and wedding weddings service services wo eo organizer photobooth photo booth tetra klien client booking acara event nikah nikahan resepsi akad lamaran birthday ultah graduation wisuda gathering family new baru lama jan januari feb februari mar maret apr april mei jun juni jul juli agu agt agustus sep september okt oktober nov november des desember".split(
		" ",
	),
);

export function tokens(s: string | null | undefined): string[] {
	return [
		...new Set(
			(s ?? "")
				.toLowerCase()
				.normalize("NFKD")
				.replace(/[^a-z\s]/g, " ")
				.split(/\s+/)
				.filter((t) => t.length >= 3 && !UMUM.has(t)),
		),
	];
}

/** Beda maksimal satu huruf (Ario ↔ Ariyo) untuk kata ≥ 4 huruf. */
function mirip(a: string, b: string): boolean {
	if (a === b) return true;
	if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1)
		return false;
	let i = 0;
	let j = 0;
	let beda = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i++;
			j++;
			continue;
		}
		if (++beda > 1) return false;
		if (a.length > b.length) i++;
		else if (b.length > a.length) j++;
		else {
			i++;
			j++;
		}
	}
	return beda + (a.length - i) + (b.length - j) <= 1;
}

const BULAN: Record<string, number> = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	mei: 5,
	may: 5,
	jun: 6,
	jul: 7,
	agu: 8,
	agt: 8,
	aug: 8,
	sep: 9,
	okt: 10,
	oct: 10,
	nov: 11,
	des: 12,
	dec: 12,
};

/** Tanggal di nama kontak: "26 Des 2026", "26 desember", "26/12/2026", "26-12". */
export function tanggalDiNama(s: string | null | undefined): {
	d: number;
	m: number;
	y: number | null;
} | null {
	const t = (s ?? "").toLowerCase();
	const a = t.match(/\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s*(\d{4})?/);
	if (a && BULAN[a[2]])
		return { d: Number(a[1]), m: BULAN[a[2]], y: a[3] ? Number(a[3]) : null };
	const b = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
	if (b && Number(b[2]) >= 1 && Number(b[2]) <= 12)
		return {
			d: Number(b[1]),
			m: Number(b[2]),
			y: b[3] ? Number(b[3].length === 2 ? `20${b[3]}` : b[3]) : null,
		};
	return null;
}

/**
 * Acara yang mungkin milik kontak ini. Syarat kandidat = ada nama yang cocok;
 * tanggal di nama kontak hanya menambah skor (tanggal acara bisa sudah
 * pindah — Shella 26 → 5 Des).
 */
export function cocokkanKontak(
	k: { nama_kontak: string | null; nama_wa: string | null },
	events: EventKandidatSrc[],
	maks = 5,
): Kandidat[] {
	const kata = [...new Set([...tokens(k.nama_kontak), ...tokens(k.nama_wa)])];
	if (kata.length === 0) return [];
	const tgl = tanggalDiNama(k.nama_kontak);
	const out: Kandidat[] = [];
	for (const e of events) {
		const alasan: string[] = [];
		let skor = 0;
		const cek = (label: string, ...src: Array<string | null | undefined>) => {
			const t = src.flatMap(tokens);
			const kena = kata.filter((x) => t.some((y) => mirip(x, y)));
			if (kena.length) {
				skor += kena.length;
				alasan.push(`${label}: ${kena.join(", ")}`);
			}
		};
		cek("nama klien", e.client_name, e.event_title);
		cek("pemesan", e.booker);
		cek("WO", e.vendor_name, e.vendor_pic_name);
		cek("PIC", e.pic_name);
		if (skor === 0) continue;
		if (tgl) {
			const [y, m, d] = e.event_date.split("-").map(Number);
			if (tgl.d === d && tgl.m === m && (!tgl.y || tgl.y === y)) {
				skor += 2;
				alasan.push("tanggal di nama kontak sama");
			}
		}
		out.push({
			event_id: e.id,
			project_id: e.project_id,
			client_name: e.client_name,
			event_date: e.event_date,
			skor,
			alasan,
		});
	}
	return out
		.sort((a, b) => b.skor - a.skor || a.event_date.localeCompare(b.event_date))
		.slice(0, maks);
}

/** Kunci dedupe: 9 digit terakhir nomor; tanpa nomor → wa_jid. */
export function kunciKontak(b: {
	nomor: string | null;
	wa_jid: string | null;
}): string {
	const d = (b.nomor ?? "").replace(/\D/g, "");
	return d.length >= 9 ? d.slice(-9) : `jid:${b.wa_jid ?? ""}`;
}
