/**
 * Contoh baris dasbor rekanan untuk vendor yang belum punya acara (DR-050).
 * Tampil berlabel "Contoh" dan tidak bisa dibuka — bukan data siapa pun.
 * Tanggal relatif ke hari ini supaya angka "mendatang/perlu tindakan" hidup.
 */
import type { RekananRow } from "@/lib/portal/vendor";

const shift = (today: string, days: number) =>
	new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
		.toISOString()
		.slice(0, 10);

export function sampleRekananRows(today: string): RekananRow[] {
	const base = {
		eventId: null,
		projectId: null,
		start: "18:00",
		clientInvited: true,
		designDone: true,
		missingData: 0,
		commission: null,
		remaining: null,
		payer: "klien" as const,
	};
	return [
		{
			...base,
			code: "CONTOH-1",
			title: "Resepsi Dinda & Raka",
			date: shift(today, 12),
			venue: "Gedung Pakuan, Bogor",
			status: "resmi",
			designDone: false,
			commission: { amount: 350_000, paidAt: null },
		},
		{
			...base,
			code: "CONTOH-2",
			title: "Ulang tahun Kirana ke-17",
			date: shift(today, 26),
			venue: "Hotel Salak, Bogor",
			status: "draf",
			clientInvited: false,
			missingData: 2,
			payer: "wo",
		},
		{
			...base,
			code: "CONTOH-3",
			title: "Gathering kantor PT Maju",
			date: shift(today, 40),
			venue: "Villa Puncak",
			status: "resmi",
			payer: "wo",
			remaining: 2_250_000,
		},
		{
			...base,
			code: "CONTOH-4",
			title: "Akad Salsa & Fajar",
			date: shift(today, -9),
			venue: "Masjid Raya Bogor",
			status: "selesai",
			commission: { amount: 300_000, paidAt: shift(today, -2) },
		},
	];
}
