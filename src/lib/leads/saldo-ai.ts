/**
 * Kartu "Saldo AI" di /leads (spek Hermes §6). Penjaga Hermes `saldo-sumopod.py`
 * meng-upsert system_config `saldo_ai` tiap jam (menit 23). Merah kalau saldo
 * menipis atau datanya basi > 3 jam (penjaga mati → saldo bisa habis diam-diam,
 * seperti 6 Nov).
 */

export type SaldoAi = {
	sisa_usd: number | null;
	laju_usd_per_hari: number | null;
	hari_tersisa: number | null;
	total_terpakai_usd?: number;
	menipis: boolean;
	diperbarui: string;
};

// ponytail: kurs perkiraan dari top-up SumoPod (Rp201.434 = $11,288 → ±Rp17.850);
// pindah ke system_config kalau selisihnya mulai berarti.
const RUPIAH_PER_USD = 17_850;
const BASI_MS = 3 * 3_600_000;

export type SaldoAiView = {
	value: string;
	hint: string;
	merah: boolean;
	badge?: string;
};

export function saldoAiView(raw: unknown, now = Date.now()): SaldoAiView {
	const s = raw as Partial<SaldoAi> | null;
	if (!s || typeof s !== "object" || !s.diperbarui)
		return {
			value: "—",
			hint: "belum ada laporan dari penjaga Hermes",
			merah: true,
			badge: "Tanpa data",
		};
	const basi = now - new Date(s.diperbarui).getTime() > BASI_MS;
	const rp =
		s.sisa_usd != null
			? `≈ Rp${Math.round(s.sisa_usd * RUPIAH_PER_USD).toLocaleString("id-ID")}`
			: null;
	const cukup =
		s.hari_tersisa != null
			? `cukup ±${Math.max(0, Math.round(s.hari_tersisa))} hari`
			: "laju belum terbaca";
	return {
		value:
			s.sisa_usd != null
				? `$${s.sisa_usd.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
				: "—",
		hint: basi
			? "data lebih dari 3 jam — penjaga Hermes mungkin mati"
			: [rp, cukup].filter(Boolean).join(" · "),
		merah: Boolean(s.menipis) || basi,
		...(basi ? { badge: "Basi" } : s.menipis ? { badge: "Menipis" } : {}),
	};
}
