/**
 * Selisih pembulatan persediaan (rekonsiliasi harian).
 *
 * Pemakaian bahan berpecahan (mis. 6,4416 roll media set) × harga rata-rata
 * dibulatkan per jurnal settle, sedangkan rekonsiliasi menilai stok sebagai
 * round(stok × harga rata-rata) per barang — keduanya beda beberapa rupiah dan
 * menumpuk pelan (1-200: Rp −1 Juni → Rp −6 Nov 2026). Selisih sekecil ini
 * dikoreksi otomatis lawan akun HPP-nya; yang lebih besar tetap jadi alarm.
 */

/** Batas pembulatan per akun persediaan. Di atas ini = selisih sungguhan. */
export const INVENTORY_ROUNDING_TOLERANCE = 100;

/** Akun persediaan → akun HPP pasangannya (sama dengan RPC settlement). */
export const INVENTORY_TO_COGS: Readonly<Record<string, string>> = {
	"1-200": "5-100",
	"1-201": "5-101",
	"1-202": "5-102",
	"1-203": "5-103",
	"1-204": "5-104",
	"1-205": "5-105",
	"1-209": "5-109",
};

export type InventoryDrift = { coa: string; drift: number };

/**
 * Pisahkan selisih (GL − nilai stok) per akun: pembulatan kecil dikoreksi,
 * sisanya dilaporkan. Akun tanpa pasangan HPP tidak pernah dikoreksi otomatis.
 */
export function splitInventoryDrift(
	drifts: InventoryDrift[],
	tolerance = INVENTORY_ROUNDING_TOLERANCE,
): { rounding: InventoryDrift[]; alert: InventoryDrift[] } {
	const rounding: InventoryDrift[] = [];
	const alert: InventoryDrift[] = [];
	for (const d of drifts) {
		if (d.drift === 0) continue;
		if (Math.abs(d.drift) <= tolerance && INVENTORY_TO_COGS[d.coa])
			rounding.push(d);
		else alert.push(d);
	}
	return { rounding, alert };
}

/**
 * Baris jurnal koreksi: GL < nilai stok → Dr persediaan / Cr HPP (HPP
 * kelebihan karena pembulatan); GL > nilai stok → kebalikannya. Seimbang.
 */
export function roundingJournalLines(rounding: InventoryDrift[]) {
	const lines: Array<{
		account_code: string;
		debit_amount: number;
		credit_amount: number;
		description: string;
		line_order: number;
	}> = [];
	for (const { coa, drift } of rounding) {
		const amt = Math.abs(drift);
		const cogs = INVENTORY_TO_COGS[coa];
		const inv = {
			account_code: coa,
			description: `Koreksi pembulatan nilai persediaan ${coa}`,
		};
		const hpp = {
			account_code: cogs,
			description: `Koreksi pembulatan HPP ${cogs}`,
		};
		const [dr, cr] = drift < 0 ? [inv, hpp] : [hpp, inv];
		lines.push(
			{
				...dr,
				debit_amount: amt,
				credit_amount: 0,
				line_order: lines.length + 1,
			},
			{
				...cr,
				debit_amount: 0,
				credit_amount: amt,
				line_order: lines.length + 2,
			},
		);
	}
	return lines;
}
