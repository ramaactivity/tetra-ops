/**
 * Konten & copy booking v4 (docs/design/booking-v4). Satu file supaya copy
 * persis desain mudah dicek. Harga/durasi/format TIDAK di sini — dari katalog
 * DB (loadCatalog). Yang di sini hanya teks tampilan per kategori/add-on.
 */
import type { LucideIcon } from "lucide-react";
import {
	BookHeart,
	BookImage,
	BookOpen,
	Briefcase,
	Cake,
	Camera,
	Clock,
	Coffee,
	Gem,
	GraduationCap,
	Heart,
	House,
	Image,
	KeyRound,
	Landmark,
	Layers,
	Magnet,
	Newspaper,
	PartyPopper,
	Printer,
	Rotate3d,
	Smartphone,
	Sparkles,
	Ticket,
	Timer,
	Tv,
	UsersRound,
} from "lucide-react";

export type EventKind = {
	id: string;
	/** event_types.code yang disimpan. */
	code: string;
	label: string;
	icon: LucideIcon;
	tint: string;
	ph: string;
	kicker: string;
	/** Paket rekomendasi (kategori DB) + label badge. */
	rec: [string, string];
	ideas: string[];
};

export const EVENTS: EventKind[] = [
	{
		id: "wed",
		code: "wedding",
		label: "Wedding",
		icon: Heart,
		tint: "#FCE3C6",
		ph: "Rina & Dimas",
		kicker: "THE WEDDING OF",
		rec: ["photostage_combo", "Cocok untuk wedding"],
		ideas: ["Rina & Dimas", "The Wedding of R & D"],
	},
	{
		id: "eng",
		code: "engagement",
		label: "Engagement",
		icon: Gem,
		tint: "#CEC8F6",
		ph: "Rina & Dimas",
		kicker: "ENGAGEMENT OF",
		rec: ["photobooth_classic", "Cocok untuk engagement"],
		ideas: ["Rina & Dimas", "The Wedding of R & D"],
	},
	{
		id: "bday",
		code: "birthday",
		label: "Ulang tahun / Sweet 17",
		icon: Cake,
		tint: "#D6EEF8",
		ph: "Sweet 17 Karina",
		kicker: "",
		rec: ["magazine_combo", "Cocok untuk ulang tahun"],
		ideas: ["Sweet 17 Karina", "Happy Birthday Alya"],
	},
	{
		id: "corp",
		code: "corporate",
		label: "Corporate",
		icon: Briefcase,
		tint: "#D6F1EA",
		ph: "Gathering PT ABC",
		kicker: "",
		rec: ["videobooth_360", "Cocok untuk acara kantor"],
		ideas: ["Gathering PT ABC", "Annual Meeting 2026"],
	},
	{
		id: "gath",
		code: "gathering",
		label: "Gathering / Family day",
		icon: PartyPopper,
		tint: "#FCE3C6",
		ph: "Family Day PT ABC",
		kicker: "",
		rec: ["videobooth_360", "Cocok untuk gathering"],
		ideas: ["Family Day PT ABC", "Gathering 2026"],
	},
	{
		id: "grad",
		code: "wisuda",
		label: "Wisuda / Kampus",
		icon: GraduationCap,
		tint: "#FCE3C6",
		ph: "Wisuda Angkatan 2026",
		kicker: "",
		rec: ["photobooth_classic", "Cocok untuk wisuda"],
		ideas: ["Rina & Dimas", "The Wedding of R & D"],
	},
	{
		id: "gov",
		code: "instansi",
		label: "Instansi / Pemerintah",
		icon: Landmark,
		tint: "#D6EEF8",
		ph: "HUT Dinas Kota Bogor",
		kicker: "",
		rec: ["photobooth_classic", "Cocok untuk acara instansi"],
		ideas: ["HUT Dinas Kota Bogor", "Rapat Kerja 2026"],
	},
	{
		id: "reuni",
		code: "reuni",
		label: "Reuni",
		icon: UsersRound,
		tint: "#D6F1EA",
		ph: "Reuni SMA 3 Angkatan 2010",
		kicker: "",
		rec: ["photobooth_classic", "Cocok untuk reuni"],
		ideas: ["Reuni SMA 3 Angkatan 2010", "Reuni Akbar 2026"],
	},
	{
		id: "other",
		code: "event",
		label: "Lainnya",
		icon: Sparkles,
		tint: "#CEC8F6",
		ph: "Nama acaramu",
		kicker: "",
		rec: ["photobooth_classic", "Paling laris"],
		ideas: ["Rina & Dimas", "The Wedding of R & D"],
	},
];

export type PkgContent = {
	name: string;
	icon: LucideIcon;
	tint: string;
	/** Format bawaan preview sebelum klien memilih. */
	fmt: Fmt;
	desc: string;
	fit: string;
	points: string[];
};

export const PKG: Record<string, PkgContent> = {
	guest_cam: {
		name: "Guest Cam saja",
		icon: Smartphone,
		tint: "#CEC8F6",
		fmt: "4r",
		desc: "Tanpa booth. Tamu scan QR lalu memotret dari HP sendiri, tanpa install aplikasi. Semua foto, ucapan suara, dan photo frame masuk satu album.",
		fit: "acara yang ingin foto dari sudut pandang tamu, tanpa booth di lokasi",
		points: [
			"Kartu QR dicetak Tetra + 3 papan meja",
			"Album bersama, disimpan 6 bulan",
			"Bisa tambah cetak di lokasi (Print Station)",
		],
	},
	photobooth_classic: {
		name: "Photobooth Cetak",
		icon: Printer,
		tint: "#FCE3C6",
		fmt: "4r",
		desc: "Tamu berfoto di booth, hasilnya langsung tercetak dan bisa dibawa pulang. Cetak tanpa batas selama acara.",
		fit: "semua jenis acara, terutama yang tamunya banyak",
		points: [
			"Cetak unlimited selama acara",
			"Frame custom sesuai tema",
			"QR soft file untuk tamu",
		],
	},
	photostage_combo: {
		name: "Photo Stage + Photobooth",
		icon: Layers,
		tint: "#CEC8F6",
		fmt: "strip",
		desc: "Dua layanan dalam satu paket: Photo Stage untuk foto di pelaminan, plus Photobooth Cetak untuk tamu.",
		fit: "wedding yang mau foto pelaminan dan photobooth sekaligus",
		points: [
			"Photo Stage untuk foto di pelaminan",
			"Photobooth Cetak, cetak unlimited",
			"Frame custom dan QR soft file",
		],
	},
	videobooth_360: {
		name: "Video 360°",
		icon: Rotate3d,
		tint: "#D6EEF8",
		fmt: "polaroid",
		desc: "Tamu berdiri di atas platform, kamera berputar mengelilingi mereka. Hasilnya video pendek yang siap dibagikan ke media sosial.",
		fit: "acara kantor, launching, dan pesta yang ingin konten video",
		points: ["Video berputar 360° untuk tamu"],
	},
	magazine_combo: {
		name: "Magazine Box + Photobooth",
		icon: BookOpen,
		tint: "#D6F1EA",
		fmt: "4r",
		desc: "Magazine Box ditambah Photobooth Cetak. Tamu bisa berfoto dengan properti sampul majalah, lalu mencetak hasil photobooth.",
		fit: "ulang tahun dan sweet 17 yang ingin dua jenis spot foto",
		points: [
			"Magazine Box",
			"Photobooth Cetak, cetak unlimited",
			"Frame custom dan QR soft file",
		],
	},
	magazine_box_only: {
		name: "Magazine Box",
		icon: Newspaper,
		tint: "#D6EEF8",
		fmt: "polaroid",
		desc: "Properti berbentuk sampul majalah ukuran besar. Tamu berfoto seolah menjadi cover majalah.",
		fit: "pesta yang ingin spot foto tematik sepanjang acara",
		points: ["Magazine Box selama 8 jam"],
	},
	photostage_only: {
		name: "Photo Stage (foto pelaminan)",
		icon: Camera,
		tint: "#FCE3C6",
		fmt: "4r",
		desc: "Sesi foto di pelaminan bersama keluarga dan tamu, tanpa booth cetak.",
		fit: "wedding yang sudah punya photobooth atau hanya butuh foto pelaminan",
		points: ["Foto keluarga dan tamu di pelaminan"],
	},
};

export type AddonContent = {
	name: string;
	unit: string;
	icon: LucideIcon;
	tint: string;
	benefit: string;
	desc: string;
	/** Kelipatan per ketukan +/− (default 1). */
	step?: number;
};

/** Kunci = addons.name di DB. Add-on tanpa entri tetap tampil dengan teks dasar. */
export const ADDON: Record<string, AddonContent> = {
	"Tambahan Durasi 1 Jam": {
		name: "Tambah durasi",
		unit: "jam",
		icon: Timer,
		tint: "#FCE3C6",
		benefit: "Booth tetap jalan kalau acara molor.",
		desc: "Menambah jam di luar durasi paket. Dihitung per jam, bisa lebih dari satu.",
	},
	"Tambahan Durasi 1 Jam (3+ crew)": {
		name: "Tambah durasi",
		unit: "jam",
		icon: Timer,
		tint: "#FCE3C6",
		benefit: "Tim tetap bertugas kalau acara molor.",
		desc: "Menambah jam di luar durasi paket untuk paket combo (tim 3 orang atau lebih). Dihitung per jam, bisa lebih dari satu.",
	},
	Photomagnet: {
		name: "Photomagnet",
		unit: "50 cetak",
		icon: Magnet,
		tint: "#D6EEF8",
		benefit: "Cetakan jadi magnet untuk dibawa pulang.",
		desc: "Cetakan diberi lapisan magnet di belakang, jadi bisa ditempel di kulkas. Satu paket untuk 50 cetakan.",
	},
	"Custom Sleeve": {
		name: "Custom sleeve",
		unit: "1.000 lembar",
		icon: Image,
		tint: "#CEC8F6",
		benefit: "Sampul cetakan dengan desain acaramu.",
		desc: "Sampul kertas untuk setiap cetakan, dicetak dengan desain acaramu. Isi 1.000 lembar.",
	},
	"Guest Books Photo": {
		name: "Guest book foto",
		unit: "25 lembar",
		icon: BookHeart,
		tint: "#D6F1EA",
		benefit: "Tamu menempel foto dan menulis ucapan.",
		desc: "Buku tamu tempat tamu menempel cetakan foto dan menulis ucapan. Isi 25 lembar.",
	},
	"Album Photostripe": {
		name: "Album photostrip",
		unit: "20 halaman",
		icon: BookImage,
		tint: "#FCE3C6",
		benefit: "Simpan strip tamu dalam satu album.",
		desc: "Album khusus untuk menyimpan strip foto. Isi 20 halaman.",
	},
	"Break Time": {
		name: "Break time",
		unit: "jam",
		icon: Coffee,
		tint: "#D6EEF8",
		benefit: "Jeda booth saat sesi makan atau ibadah.",
		desc: "Booth berhenti sementara, misalnya saat makan atau ibadah, lalu lanjut lagi. Dihitung per jam.",
	},
	"Voucher Photobooth": {
		name: "Voucher photobooth",
		unit: "100 pcs",
		icon: Ticket,
		tint: "#CEC8F6",
		benefit: "Voucher fisik untuk dibagikan ke tamu.",
		desc: "Voucher fisik yang bisa dibagikan ke tamu. Isi 100 pcs.",
	},
	"Keychain Photobooth Station": {
		name: "Keychain photobooth",
		unit: "pcs",
		step: 10,
		icon: KeyRound,
		tint: "#D6F1EA",
		benefit: "Tamu membuat gantungan kunci dari fotonya.",
		desc: "Stasiun gantungan kunci: foto tamu dicetak lalu dipasang jadi keychain. Dihitung per pcs.",
	},
};

/** Urutan tampil add-on (sama dengan prototipe); sisanya di belakang. */
export const ADDON_ORDER = [
	"Tambahan Durasi 1 Jam",
	"Tambahan Durasi 1 Jam (3+ crew)",
	"Photomagnet",
	"Custom Sleeve",
	"Guest Books Photo",
	"Album Photostripe",
	"Break Time",
	"Voucher Photobooth",
];

const PRINT_LABEL: Record<string, string> = {
	"2R": "strip 2R",
	polaroid: "polaroid",
	"4R": "4R",
};
const guests = (n: number | null | undefined) =>
	n ? `${n} tamu` : "tamu tak terbatas";

/** Teks add-on per grup (tier Guest Cam, cetak, Print Station, TV). null = pakai ADDON[name]. */
export function addonGroupContent(a: {
	addon_group?: string | null;
	max_guests?: number | null;
	print_size?: string | null;
	name: string;
}): AddonContent | null {
	switch (a.addon_group) {
		case "guest_cam":
			return {
				name: `Guest Cam · ${guests(a.max_guests)}`,
				unit: "acara",
				icon: Smartphone,
				tint: "#CEC8F6",
				benefit: "Tamu memotret dari HP-nya, semua masuk satu album.",
				desc: `Untuk ${a.max_guests ? `sampai ${a.max_guests}` : "berapa pun"} tamu. Tamu scan QR lalu memotret dari HP tanpa install aplikasi, bisa kirim ucapan suara dan pakai photo frame. Foto tamu menyatu dengan foto booth di satu album, disimpan 6 bulan. Kartu QR ukuran kartu nama dicetak Tetra + 3 papan meja. Tamu dihitung per HP yang mengirim foto.`,
			};
		case "guest_print":
		case "guest_print_100":
			return {
				name: `Cetak foto tamu · ${PRINT_LABEL[a.print_size ?? ""] ?? a.print_size}`,
				unit: a.addon_group === "guest_print_100" ? "100 tamu" : "acara",
				icon: Printer,
				tint: "#D6EEF8",
				benefit: "Foto dari HP tamu dicetak di lokasi.",
				desc: `Setiap tamu dapat 1 cetakan ${PRINT_LABEL[a.print_size ?? ""] ?? ""} dari foto Guest Cam-nya${a.addon_group === "guest_print_100" ? ", dihitung per 100 tamu" : `, untuk ${guests(a.max_guests)}`}. Bersama photobooth, cetakan masuk antrean printer booth.`,
			};
		case "print_station":
			return {
				name: a.name.endsWith("· Bogor")
					? "Print Station · Bogor"
					: "Print Station · luar Bogor",
				unit: "acara",
				icon: Printer,
				tint: "#FCE3C6",
				benefit: "Wajib untuk cetak foto tamu tanpa booth.",
				desc: "1 crew + laptop + printer di lokasi untuk mencetak foto tamu, maksimal 4 jam. Dipilih otomatis sesuai kota acara.",
			};
		case "print_station_extend":
			return {
				name: "Print Station · tambah jam",
				unit: "jam",
				icon: Timer,
				tint: "#FCE3C6",
				benefit: "Print Station tetap jalan lewat 4 jam.",
				desc: "Menambah jam Print Station di luar 4 jam. Dihitung per jam.",
			};
		case "tv":
			return {
				name: 'TV Live Gallery 55"',
				unit: "acara",
				icon: Tv,
				tint: "#D6F1EA",
				benefit: "Foto booth & tamu tampil langsung di TV.",
				desc: "TV 55 inci dengan stand di venue. Menampilkan foto booth, rombongan Photo Stage, foto Guest Cam, dan QR galeri secara langsung selama acara.",
			};
		default:
			return null;
	}
}

/** Teks tambahan Guest Cam per nama (upsell). */
export const GUEST_EXTRA: Record<string, AddonContent> = {
	"Guest Cam: simpan 1 tahun": {
		name: "Guest Cam · simpan 1 tahun",
		unit: "acara",
		icon: Smartphone,
		tint: "#CEC8F6",
		benefit: "Album Guest Cam disimpan 1 tahun, bukan 6 bulan.",
		desc: "Album foto tamu tetap bisa dibuka dan diunduh selama 1 tahun setelah acara.",
	},
	"Guest Cam: kartu QR tambahan": {
		name: "Kartu QR tambahan",
		unit: "box",
		icon: Ticket,
		tint: "#CEC8F6",
		benefit: "Kartu QR ekstra untuk meja tamu.",
		desc: "Satu box kartu QR Guest Cam ukuran kartu nama, isi 100.",
	},
};

export type Fmt = "strip" | "4r" | "polaroid";
export const FMTS: Array<[Fmt, string]> = [
	["strip", "Strip 2R"],
	["4r", "4R"],
	["polaroid", "Polaroid"],
];
export const FMT_DB: Record<Fmt, string> = {
	strip: "2R",
	"4r": "4R",
	polaroid: "polaroid",
};
export const FMTD: Record<Fmt, [string, string]> = {
	strip: [
		"5 × 15 cm",
		"Strip panjang berisi 3 pose. Gaya photobooth klasik, pas disimpan di dompet.",
	],
	"4r": [
		"10 × 15 cm",
		"Ukuran foto standar. Muat 1–2 foto dengan ruang desain frame lebih luas.",
	],
	polaroid: [
		"bingkai polaroid",
		"Satu foto dengan bingkai putih lebar di bawah, gaya kamera instan.",
	],
};

export const THEMES: Array<[string, string]> = [
	["klasik", "Klasik"],
	["garden", "Garden"],
	["butter", "Butter"],
	["lavender", "Lavender"],
	["sky", "Sky"],
	["peach", "Peach"],
];

export type Backdrop = "tetra" | "client" | "later";
export const BACKDROPS: Array<{
	k: Backdrop;
	label: string;
	sub: string;
	icon: LucideIcon;
	tint: string;
}> = [
	{
		k: "tetra",
		label: "Backdrop kain Tetra",
		sub: "Gratis. Pilih 1 dari 6 warna, tim kami yang pasang.",
		icon: Sparkles,
		tint: "#CEC8F6",
	},
	{
		k: "client",
		label: "Dari klien / dekorasi venue",
		sub: "Kamu atau dekorator yang menyiapkan.",
		icon: House,
		tint: "#FCE3C6",
	},
	{
		k: "later",
		label: "Belum tahu",
		sub: "Bisa diputuskan nanti bersama tim.",
		icon: Clock,
		tint: "#D6EEF8",
	},
];

/** Warna kain Basic. Nama = backdrops.name "Basic <label>" di DB. Hex = perkiraan layar. */
export const BD_COLORS: Array<[string, string, string]> = [
	["red", "Red", "#B3262E"],
	["white", "White", "#FFFFFF"],
	["gold", "Gold", "#C9A24A"],
	["silver", "Silver", "#BFC2C6"],
	["emerald", "Emerald Green", "#1E7A57"],
	["blue", "Blue", "#1F4E9E"],
];

export const TIMES = [
	"09:00",
	"11:00",
	"13:00",
	"15:00",
	"17:00",
	"18:00",
	"19:00",
];
export const CITIES = ["Bogor", "Jakarta", "Depok", "Tangerang", "Bekasi"];
export const GUESTS = ["< 100", "100–300", "300–500", "> 500"];

export const PHASES = ["Acaramu", "Paket", "Tambahan", "Data kamu"];
export const PCOL = ["#CEC8F6", "#FCE3C6", "#D6EEF8", "#D6F1EA"];

export const MONTHS = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];
export const MON3 = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];
export const DAYS = [
	"Minggu",
	"Senin",
	"Selasa",
	"Rabu",
	"Kamis",
	"Jumat",
	"Sabtu",
];
export const DAY3 = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export const REFUND_URL = "https://tetraphoto.com/kebijakan-refund";
export const PRIVACY_URL = "https://tetraphoto.com/privasi";
export const TERMS_URL = "https://tetraphoto.com/syarat-ketentuan";
