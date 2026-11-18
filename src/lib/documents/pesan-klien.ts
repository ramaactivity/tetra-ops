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
	/** Sudah pernah sampai ke klien → ini kiriman revisi. */
	revisi?: boolean;
}): string {
	const acara = input.tanggalAcara ? ` untuk acara ${input.tanggalAcara}` : "";
	return [
		input.revisi
			? `Halo ${sapaKlien(input.client)}, ini quotation yang sudah kami revisi${acara} ya.`
			: `Halo ${sapaKlien(input.client)}, berikut quotation-nya${acara} ya.`,
		`Totalnya ${input.total}${input.berlakuSampai ? `, berlaku sampai ${input.berlakuSampai}` : ""}. Tanggalnya terkunci setelah DP minimal Rp 500.000.`,
	].join("\n");
}

/**
 * Teks WA pengantar dokumen selain quotation (owner 18 Nov: nomor dokumen tidak dicantumkan di chat; contoh dari owner
 * "Halo Kak Yessi, berikut untuk invoice acara 2 Des 2026. / File PDF terlampir. Silahkan dicek terlebih dahulu. Terima kasih 🙏").
 */
export function teksDokumen(input: {
	client: { name?: string | null; attn?: string | null };
	/** Label dokumen, mis. "Invoice". */
	jenis: string;
	tanggalAcara: string | null;
	revisi?: boolean;
}): string {
	const acara = input.tanggalAcara ? ` acara ${input.tanggalAcara}` : "-nya";
	return [
		`Halo ${sapaKlien(input.client)}, berikut untuk ${input.jenis.toLowerCase()}${acara}${input.revisi ? " yang sudah kami revisi" : ""}.`,
		"File PDF terlampir. Silahkan dicek terlebih dahulu. Terima kasih 🙏",
	].join("\n");
}
