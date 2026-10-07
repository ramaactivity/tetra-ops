/**
 * Konten tampilan katalog booking (label ramah klien, foto, isi paket,
 * rekomendasi per jenis acara). Statis dulu (brief booking UX 7 Okt 2026);
 * pindah ke kolom `packages` kalau owner perlu mengubahnya sendiri.
 * Isi paket diambil dari pricelist publik 2026. Foto = cetakan asli dari
 * website tetraphoto.com (public/portal/).
 */

export type ProductContent = {
	label: string;
	tagline: string;
	points: string[];
	image: string;
	/** Kode event_types yang paling cocok → label "Cocok untuk …". */
	recommend: string[];
	/** Label kecil di kartu, mis. "Paling laris". */
	badge?: string;
};

export const PRODUCT_CONTENT: Record<string, ProductContent> = {
	photobooth_classic: {
		label: "Photobooth Cetak",
		tagline: "Cetak unlimited, langsung dibawa pulang tamu.",
		points: [
			"Cetak unlimited 2R strip, 4R, atau polaroid",
			"Frame didesain custom sesuai acara",
			"Softfile lewat QR + flashdisk kayu",
		],
		image: "/portal/g-strip1.webp",
		recommend: ["wedding", "birthday", "wisuda", "gathering", "reuni"],
		badge: "Paling laris",
	},
	photostage_combo: {
		label: "Photo Stage + Photobooth",
		tagline: "Foto di pelaminan plus cetak instan untuk tamu.",
		points: [
			"Fotografer di pelaminan, tamu unduh lewat QR",
			"Pilihan cetak instan di photobooth",
			"Semua file di satu link khusus klien",
		],
		image: "/portal/g-wed2.webp",
		recommend: ["wedding"],
		badge: "Paket hemat",
	},
	photostage_only: {
		label: "Photo Stage (foto pelaminan)",
		tagline: "Tamu foto bersama pengantin tanpa antre.",
		points: [
			"Layout desain custom 4R, 1–2 pose",
			"QR A2 di samping pelaminan untuk unduh",
			"Crew mengarahkan tamu",
		],
		image: "/portal/g-wed3.webp",
		recommend: ["wedding"],
	},
	videobooth_360: {
		label: "Video 360°",
		tagline: "Video berputar yang langsung bisa dibagikan.",
		points: [
			"Platform 360 untuk 2–4 orang",
			"Template video & musik sesuai acara",
			"Kirim lewat AirDrop atau QR",
		],
		image: "/portal/g-corp1.webp",
		recommend: ["corporate", "event", "gathering", "birthday"],
	},
	magazine_combo: {
		label: "Magazine Box + Photobooth",
		tagline: "Sampul majalah raksasa plus cetak unlimited.",
		points: [
			"Magazine box dengan gaya editorial",
			"Cetak unlimited 2R, 4R, polaroid",
			"Indoor, butuh area ±4×5 meter",
		],
		image: "/portal/g-corp2.webp",
		recommend: ["corporate", "event"],
	},
	magazine_box_only: {
		label: "Magazine Box",
		tagline: "Spot foto sampul majalah, tanpa crew standby.",
		points: [
			"Instalasi magazine box 8 jam",
			"Sticker standar Tetra",
			"Indoor only",
		],
		image: "/portal/g-corp2.webp",
		recommend: ["corporate"],
	},
};

/** Kartu jenis acara di langkah 1 (kode = event_types.code). */
export const EVENT_KINDS: Array<{
	code: string;
	label: string;
	image: string;
}> = [
	{ code: "wedding", label: "Wedding", image: "/portal/g-wed1.webp" },
	{ code: "corporate", label: "Corporate", image: "/portal/g-corp1.webp" },
	{ code: "birthday", label: "Ulang tahun", image: "/portal/g-bday1.webp" },
	{ code: "wisuda", label: "Wisuda", image: "/portal/g-grad1.webp" },
	{ code: "event", label: "Lainnya", image: "/portal/g-strip2.webp" },
];

/** Satu kalimat manfaat per add-on (cocokkan dengan nama di tabel addons). */
export const ADDON_BENEFIT: Record<string, string> = {
	"Voucher Photobooth": "Kartu voucher untuk dibagikan ke tamu.",
	"Break Time": "Jeda di tengah acara tanpa memotong durasi.",
	"Album Photostripe": "Album untuk mengumpulkan strip foto tamu.",
	"Guest Books Photo": "Buku tamu berisi foto dan ucapan.",
	Photomagnet: "Cetakan magnet untuk oleh-oleh tamu.",
	"Custom Sleeve": "Sampul cetakan dengan desain acaramu.",
	"Keychain Photobooth Station": "Tamu membuat gantungan kunci dari fotonya.",
	"Tambahan Durasi 1 Jam": "Booth tetap jalan satu jam lebih lama.",
};

export const CLIENT_LOGOS = [
	{ src: "/portal/logos/mandiri.svg", alt: "Bank Mandiri" },
	{ src: "/portal/logos/pertamina.svg", alt: "Pertamina" },
	{ src: "/portal/logos/jw-marriott.svg", alt: "JW Marriott" },
	{ src: "/portal/logos/danantara.svg", alt: "Danantara" },
	{ src: "/portal/logos/united-tractors.svg", alt: "United Tractors" },
	{ src: "/portal/logos/seabank.svg", alt: "SeaBank" },
];
