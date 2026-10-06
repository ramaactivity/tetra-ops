import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Retensi klien B2B: dari sekian klien non-pernikahan, berapa yang memakai
 * Tetra lagi dan berapa yang menghilang. Dipakai halaman Leads › Retensi dan
 * tool agent sales `klien_retensi`. Murni (tanpa I/O) supaya bisa dites.
 *
 * Klien = nomor WA pembooking (atau nama klien kalau nomor kosong).
 * Klien lewat vendor rekanan (channel vendor) milik relasi vendor itu → tidak dihitung.
 */
export const KATEGORI_B2B = [
	"corporate",
	"gathering",
	"instansi",
	"event",
	"wisuda",
] as const;

/** Lewat dari ini tanpa event baru = dianggap menghilang. */
export const BULAN_HILANG = 12;
/** Mulai sekian bulan sejak event terakhir, klien perlu disapa supaya tidak menghilang. */
export const BULAN_RAWAT = 6;

export type EventRetensi = {
	client_wa: string | null;
	client_org?: string | null;
	client_name: string | null;
	pic_name?: string | null;
	event_category: string | null;
	event_date: string | null;
	status: string | null;
	channel?: string | null;
};

export type StatusRetensi =
	| "setia"
	| "kembali"
	| "baru"
	| "menunggu"
	| "hilang";

export type KlienRetensi = {
	kunci: string;
	nama: string;
	pic: string | null;
	wa: string | null;
	kategori: string;
	jumlah_event: number;
	selesai: number;
	mendatang: number;
	pertama: string;
	terakhir: string;
	bulan_sejak_terakhir: number;
	status: StatusRetensi;
};

function bulanAntara(dariISO: string, keISO: string): number {
	const a = new Date(`${dariISO}T00:00:00Z`);
	const b = new Date(`${keISO}T00:00:00Z`);
	return (
		(b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
		(b.getUTCMonth() - a.getUTCMonth()) -
		(b.getUTCDate() < a.getUTCDate() ? 1 : 0)
	);
}

function kunciKlien(e: EventRetensi): string | null {
	if (isLikelyWaPhone(e.client_wa))
		return `wa:${toWaPhone(String(e.client_wa))}`;
	const nama = (e.client_org || e.client_name || "").trim().toLowerCase();
	return nama ? `nama:${nama}` : null;
}

/**
 * setia    = ≥3 event, belum menghilang
 * kembali  = 2 event (termasuk yang dijadwalkan), belum menghilang
 * baru     = baru 1 event, terakhir < BULAN_RAWAT bulan lalu
 * menunggu = baru 1 event, BULAN_RAWAT..BULAN_HILANG bulan lalu → saatnya dirawat
 * hilang   = tidak ada event mendatang dan event terakhir ≥ BULAN_HILANG bulan lalu
 */
export function ringkasRetensi(events: EventRetensi[], todayISO: string) {
	const per = new Map<string, EventRetensi[]>();
	for (const e of events) {
		if (!e.event_date || e.status === "cancelled") continue;
		if (!KATEGORI_B2B.includes(e.event_category as never)) continue;
		if (e.channel === "vendor") continue;
		const k = kunciKlien(e);
		if (!k) continue;
		const daftar = per.get(k) ?? [];
		daftar.push(e);
		per.set(k, daftar);
	}
	const klien: KlienRetensi[] = [];
	for (const [kunci, evs] of per) {
		evs.sort((a, b) =>
			String(a.event_date).localeCompare(String(b.event_date)),
		);
		const selesai = evs.filter((e) => String(e.event_date) < todayISO);
		const mendatang = evs.length - selesai.length;
		const akhir = evs[evs.length - 1];
		const terakhirSelesai = selesai.at(-1)?.event_date ?? null;
		const bulan = terakhirSelesai ? bulanAntara(terakhirSelesai, todayISO) : 0;
		let status: StatusRetensi;
		if (!mendatang && terakhirSelesai && bulan >= BULAN_HILANG)
			status = "hilang";
		else if (evs.length >= 3) status = "setia";
		else if (evs.length === 2) status = "kembali";
		else if (mendatang || bulan < BULAN_RAWAT) status = "baru";
		else status = "menunggu";
		klien.push({
			kunci,
			nama: String(akhir.client_org || akhir.client_name || "").trim(),
			pic: akhir.pic_name ?? null,
			wa: kunci.startsWith("wa:") ? kunci.slice(3) : null,
			kategori: String(akhir.event_category),
			jumlah_event: evs.length,
			selesai: selesai.length,
			mendatang,
			pertama: String(evs[0].event_date),
			terakhir: String(akhir.event_date),
			bulan_sejak_terakhir: bulan,
			status,
		});
	}
	const hitung = (s: StatusRetensi) =>
		klien.filter((k) => k.status === s).length;
	const total = klien.length;
	const pernahKembali = klien.filter((k) => k.jumlah_event >= 2).length;
	const perKategori = KATEGORI_B2B.map((kat) => {
		const ks = klien.filter((k) => k.kategori === kat);
		return {
			kategori: kat,
			klien: ks.length,
			kembali: ks.filter((k) => k.jumlah_event >= 2).length,
		};
	}).filter((x) => x.klien > 0);
	return {
		total,
		pernah_kembali: pernahKembali,
		persen_kembali: total ? Math.round((pernahKembali / total) * 100) : 0,
		per_status: {
			setia: hitung("setia"),
			kembali: hitung("kembali"),
			baru: hitung("baru"),
			menunggu: hitung("menunggu"),
			hilang: hitung("hilang"),
		},
		per_kategori: perKategori,
		klien: klien.sort((a, b) => b.terakhir.localeCompare(a.terakhir)),
	};
}
