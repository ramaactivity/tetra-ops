/**
 * PostgREST mengembalikan maksimal 1.000 baris per permintaan — `.limit(10000)`
 * TIDAK menembus batas itu, hasilnya diam-diam terpotong di 1.000 (kejadian:
 * Leads tampil "Total 1.000" padahal 1.871). Baca per halaman sampai habis.
 *
 * `page(from, to)` harus membangun query BARU tiap dipanggil dan memasang
 * `.range(from, to)` di ujungnya (urutan .order() wajib stabil).
 */
export async function fetchAllRows<T>(
	page: (
		from: number,
		to: number,
	) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
	label: string,
	pageSize = 1000,
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += pageSize) {
		const { data, error } = await page(from, from + pageSize - 1);
		if (error) throw new Error(`${label}: ${error.message}`);
		const batch = (data ?? []) as T[];
		rows.push(...batch);
		if (batch.length < pageSize) break;
	}
	return rows;
}
