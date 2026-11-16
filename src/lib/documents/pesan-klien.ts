/**
 * Teks WA yang menemani dokumen ke klien (owner 16 Nov: "Halo Riska 👋 Berikut penawaran harga (quotation)…" terasa
 * template). Gaya admin Tetra: sapa "Kak <nama orang>", satu-dua kalimat, istilah "quotation" (bukan "penawaran"),
 * emoji maks 1, tanpa penutup basa-basi. Murni (tanpa DB) supaya bisa diuji.
 */
import { sapa } from "@/lib/gallery-thanks";

const NAMA_LEMBAGA =
	/^(pt|cv|ud|yayasan|universitas|univ|sekolah|smk|sma|smp|sd|bank|hotel|kementerian|dinas|pemkot|pemkab)\b|resort|convention|ballroom|corp|tbk/i;

/** Sapaan orang: u.p. (attn) dulu; nama lembaga tidak dipakai sebagai sapaan. */
export function sapaKlien(client: {
	name?: string | null;
	attn?: string | null;
}): string {
	const attn = client.attn?.trim();
	if (attn) return sapa(attn);
	const nama = client.name?.trim();
	return nama && !NAMA_LEMBAGA.test(nama) ? sapa(nama) : "Kak";
}

export function teksQuotation(input: {
	client: { name?: string | null; attn?: string | null };
	tanggalAcara: string | null;
	total: string;
	berlakuSampai: string | null;
}): string {
	const acara = input.tanggalAcara ? ` untuk acara ${input.tanggalAcara}` : "";
	return [
		`Halo ${sapaKlien(input.client)}, berikut quotation-nya${acara} ya.`,
		`Totalnya ${input.total}${input.berlakuSampai ? `, berlaku sampai ${input.berlakuSampai}` : ""}. Tanggalnya terkunci setelah DP minimal Rp 500.000.`,
	].join("\n");
}
