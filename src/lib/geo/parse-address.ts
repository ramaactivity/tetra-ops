/**
 * Membaca alamat yang di-COPY langsung dari Google Maps dan memecahnya jadi
 * kolom-kolom form (alamat, kota/kabupaten, provinsi).
 *
 * Kenapa ada: auto-fill dari koordinat hanya seakurat sumber datanya. Tanpa API
 * key berbayar, sumbernya OpenStreetMap — dan untuk banyak venue Indonesia OSM
 * tidak punya nama jalan/nomornya. Padahal alamat versi Google sudah terpampang
 * di layar owner dan tinggal disalin. Menempelkannya = akurasi Google, tanpa
 * billing, tanpa API key.
 *
 * Bentuk baku Google (Indonesia):
 *   "Jl. Raya Kalimulya No.30, Jatimulya, Kec. Cilodong, Kota Depok, Jawa Barat 16413"
 *    └── baris alamat ──────────────────────────────────┘ └─ kota ─┘ └ provinsi ┘└pos┘
 *
 * Modul polos (bukan "use server") supaya bisa dipakai di form (client) juga.
 */

export type ParsedAddress = {
	address: string | null;
	city: string | null;
	province: string | null;
	postcode: string | null;
};

/**
 * 38 provinsi (termasuk pemekaran Papua). Dipakai sebagai jangkar: kalau tidak
 * ada satu pun yang cocok, teks itu kemungkinan bukan alamat lengkap — lebih
 * baik dibiarkan apa adanya daripada dipecah asal-asalan.
 */
const PROVINCES = [
	"Aceh",
	"Sumatera Utara",
	"Sumatera Barat",
	"Riau",
	"Kepulauan Riau",
	"Jambi",
	"Sumatera Selatan",
	"Kepulauan Bangka Belitung",
	"Bengkulu",
	"Lampung",
	"Banten",
	"Jakarta",
	"Jawa Barat",
	"Jawa Tengah",
	"DI Yogyakarta",
	"Daerah Istimewa Yogyakarta",
	"Jawa Timur",
	"Bali",
	"Nusa Tenggara Barat",
	"Nusa Tenggara Timur",
	"Kalimantan Barat",
	"Kalimantan Tengah",
	"Kalimantan Selatan",
	"Kalimantan Timur",
	"Kalimantan Utara",
	"Sulawesi Utara",
	"Gorontalo",
	"Sulawesi Tengah",
	"Sulawesi Barat",
	"Sulawesi Selatan",
	"Sulawesi Tenggara",
	"Maluku",
	"Maluku Utara",
	"Papua",
	"Papua Barat",
	"Papua Barat Daya",
	"Papua Tengah",
	"Papua Pegunungan",
	"Papua Selatan",
];

/** Singkatan kota yang dipakai Google supaya barisnya pendek. */
const CITY_ABBREV: Record<string, string> = {
	bks: "Bekasi",
	bgr: "Bogor",
	jkt: "Jakarta",
	tng: "Tangerang",
	dpk: "Depok",
	sby: "Surabaya",
	bdg: "Bandung",
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Cocokkan satu potongan teks dengan daftar provinsi. */
function matchProvince(segment: string): string | null {
	const s = norm(segment).replace(/\d{5}/g, "").trim();
	if (!s) return null;
	for (const p of PROVINCES) {
		const np = norm(p);
		if (s === np || s.includes(np)) {
			// Jakarta punya banyak variasi ("Daerah Khusus Ibukota Jakarta",
			// "DKI Jakarta") — semuanya dinormalkan jadi satu bentuk.
			if (np === "jakarta") return "DKI Jakarta";
			if (np.includes("yogyakarta")) return "DI Yogyakarta";
			return p;
		}
	}
	return null;
}

/** "Kota Bks" → "Kota Bekasi"; "Kabupaten Bogor" tetap. */
function expandCity(segment: string): string {
	const cleaned = segment.replace(/\d{5}/g, "").trim();
	const m = cleaned.match(/^(kota|kab\.?|kabupaten)\s+(.+)$/i);
	if (!m) return cleaned;
	const prefix = /^kab/i.test(m[1]) ? "Kabupaten" : "Kota";
	const rest = m[2].trim();
	const expanded = CITY_ABBREV[norm(rest)];
	return `${prefix} ${expanded ?? rest}`;
}

/** Apakah potongan ini terlihat seperti nama kota/kabupaten? */
function looksLikeCity(segment: string): boolean {
	return /^(kota|kab\.?|kabupaten)\s+/i.test(segment.trim());
}

/**
 * Pecah alamat Google jadi kolom form. Mengembalikan semua null kalau teksnya
 * jelas bukan alamat Indonesia (biar pemanggil bisa membiarkannya apa adanya).
 */
export function parseIndonesianAddress(raw: string): ParsedAddress {
	const text = raw.replace(/\s+/g, " ").trim();
	if (!text || text.length < 8) {
		return { address: null, city: null, province: null, postcode: null };
	}

	const postcode = text.match(/\b(\d{5})\b/)?.[1] ?? null;

	// Buang ekor "Indonesia" — Google memakainya di beberapa format.
	const segments = text
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s && norm(s) !== "indonesia");

	if (segments.length === 0) {
		return { address: null, city: null, province: null, postcode };
	}

	// Provinsi dicari dari BELAKANG: nama provinsi kadang juga muncul di nama
	// jalan ("Jl. Raya Jawa Barat"), dan yang benar selalu yang paling akhir.
	let provinceIdx = -1;
	let province: string | null = null;
	for (let i = segments.length - 1; i >= 0; i--) {
		const hit = matchProvince(segments[i]);
		if (hit) {
			province = hit;
			provinceIdx = i;
			break;
		}
	}

	if (!province) {
		// Tanpa provinsi, teksnya belum tentu alamat — jangan dipaksa dipecah.
		return { address: null, city: null, province: null, postcode };
	}

	// Kota = potongan tepat sebelum provinsi (biasanya "Kota X" / "Kabupaten X").
	let city: string | null = null;
	let cityIdx = -1;
	for (let i = provinceIdx - 1; i >= 0; i--) {
		if (looksLikeCity(segments[i])) {
			city = expandCity(segments[i]);
			cityIdx = i;
			break;
		}
	}
	// Google kadang menulis kotanya tanpa awalan ("Bogor" saja) — ambil potongan
	// persis sebelum provinsi selama itu bukan kecamatan/kelurahan.
	if (!city && provinceIdx > 0) {
		const candidate = segments[provinceIdx - 1].replace(/\d{5}/g, "").trim();
		if (
			candidate &&
			!/^(kec\.?|kecamatan|kel\.?|kelurahan|desa)\s/i.test(candidate)
		) {
			city = candidate;
			cityIdx = provinceIdx - 1;
		}
	}

	// Sisanya (sebelum kota) = baris alamat: jalan + nomor, kelurahan, kecamatan.
	const addressEnd = cityIdx >= 0 ? cityIdx : provinceIdx;
	const addressParts = segments.slice(0, addressEnd).map((s) => s.trim());
	const address = addressParts.length > 0 ? addressParts.join(", ") : null;

	return { address, city, province, postcode };
}

/**
 * Teks ini layak diperlakukan sebagai alamat lengkap yang bisa dipecah?
 * Dipakai form untuk memutuskan apakah paste-nya perlu "dicerdasi" atau cukup
 * dimasukkan mentah ke kolom alamat.
 */
export function looksLikeFullAddress(raw: string): boolean {
	const parsed = parseIndonesianAddress(raw);
	return Boolean(parsed.province && (parsed.city || parsed.address));
}
