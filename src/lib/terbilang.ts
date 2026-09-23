const SATUAN = [
	"",
	"satu",
	"dua",
	"tiga",
	"empat",
	"lima",
	"enam",
	"tujuh",
	"delapan",
	"sembilan",
	"sepuluh",
	"sebelas",
];

function ratusan(n: number): string {
	// n < 1000
	const parts: string[] = [];
	const r = Math.floor(n / 100);
	const sisa = n % 100;
	if (r === 1) parts.push("seratus");
	else if (r > 1) parts.push(`${SATUAN[r]} ratus`);
	if (sisa < 12) {
		if (sisa > 0) parts.push(SATUAN[sisa]);
	} else if (sisa < 20) {
		parts.push(`${SATUAN[sisa - 10]} belas`);
	} else {
		const p = Math.floor(sisa / 10);
		const s = sisa % 10;
		parts.push(`${SATUAN[p]} puluh`);
		if (s > 0) parts.push(SATUAN[s]);
	}
	return parts.join(" ");
}

/** Angka → kata bahasa Indonesia. terbilang(2_000_000) = "dua juta". */
export function terbilang(n: number): string {
	n = Math.floor(Math.abs(n));
	if (n === 0) return "nol";
	const scales: Array<[number, string]> = [
		[1_000_000_000_000, "triliun"],
		[1_000_000_000, "miliar"],
		[1_000_000, "juta"],
		[1_000, "ribu"],
	];
	const parts: string[] = [];
	for (const [div, label] of scales) {
		const q = Math.floor(n / div);
		if (q > 0) {
			// "seribu", bukan "satu ribu"
			parts.push(
				q === 1 && div === 1_000 ? "seribu" : `${ratusan(q)} ${label}`,
			);
			n %= div;
		}
	}
	if (n > 0) parts.push(ratusan(n));
	return parts.join(" ");
}

/** "Dua juta lima ratus ribu rupiah" — kapital di awal, untuk kuitansi. */
export function terbilangRupiah(n: number): string {
	const t = `${terbilang(n)} rupiah`;
	return t.charAt(0).toUpperCase() + t.slice(1);
}
