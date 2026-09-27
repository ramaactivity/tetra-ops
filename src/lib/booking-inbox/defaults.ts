import type {
	BackdropOption,
	BookingFormDefaults,
	PackageOption,
} from "@/components/booking/booking-form";
import { parseTimeRange } from "@/lib/documents/booking-defaults";
import { formatPhoneLocal } from "@/lib/format";
import type { InboxData, InboxRow } from "./core";

/** Jam dari teks bebas: "11.00 - 14.00" → [11:00, 14:00]; "19.00" → [19:00, ""]. */
export function parseInboxTime(
	raw: string | null | undefined,
): [string, string] {
	const range = parseTimeRange(raw);
	if (range[0]) return range;
	const m = /(\d{1,2})[:.](\d{2})/.exec(raw ?? "");
	return m ? [`${m[1].padStart(2, "0")}:${m[2]}`, ""] : ["", ""];
}

/** "4R" / "polaroid" / "2r landscape" → enum FRAME_SIZES; tak jelas → "". */
export function parseFrameSize(raw: string | null | undefined): string {
	const s = (raw ?? "").toLowerCase();
	if (/polaroid/.test(s)) return "polaroid";
	if (/\b2\s*r\b/.test(s)) return "2R";
	if (/\b4\s*r\b/.test(s)) return "4R";
	return "";
}

/** Kategori paket dari teks paket bot; default photobooth classic. */
function packageCategory(paket: string): string {
	const s = paket.toLowerCase();
	if (/video|360/.test(s)) return "videobooth_360";
	if (/magazine/.test(s)) return "magazine_combo";
	if (/photo\s*stage/.test(s)) return "photostage_combo";
	return "photobooth_classic";
}

const BACKDROP_WORDS: Array<[RegExp, string]> = [
	[/dekor|dari klien|\bklien\b|vendor|sendiri/, "CLIENT-PROVIDED"],
	[/putih|white/, "BG-BASIC-WHITE"],
	[/merah|red/, "BG-BASIC-RED"],
	[/gold|emas/, "BG-BASIC-GOLD"],
	[/silver|perak/, "BG-BASIC-SILVER"],
	[/emerald|hijau|green/, "BG-BASIC-EMERALD"],
	[/biru|blue/, "BG-BASIC-BLUE"],
];

/** Nama backdrop bebas → id backdrop Tetra; "dekorasi acara" → Dari Klien. */
export function matchBackdrop(
	raw: string | null | undefined,
	backdrops: Pick<BackdropOption, "id" | "code">[],
): string {
	const s = (raw ?? "").toLowerCase();
	if (!s) return "";
	const hit = BACKDROP_WORDS.find(([re]) => re.test(s));
	return (hit && backdrops.find((b) => b.code === hit[1])?.id) || "";
}

/** "Dimas 0813-1111-2222" → { name: "Dimas", wa: "081311112222" }. */
export function parsePic(raw: string | null | undefined): {
	name: string;
	wa: string;
} {
	const s = raw ?? "";
	const phone = /(\+?\d[\d\s.-]{7,}\d)/.exec(s)?.[1] ?? "";
	const name = s
		.replace(phone, "")
		.replace(/[()\-–:,/]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return { name, wa: phone ? formatPhoneLocal(phone) : "" };
}

/** Tebakan kategori dari nama acara/catatan; kosong = owner memilih. */
export function guessCategory(data: InboxData): string {
	const s = `${data.nama_acara ?? ""} ${data.catatan ?? ""}`.toLowerCase();
	if (/wedding|nikah|resepsi|akad|pengantin|ngunduh/.test(s)) return "wedding";
	if (/wisuda|graduation|kelulusan|perpisahan/.test(s)) return "wisuda";
	if (/ulang tahun|ultah|birthday|sweet\s*\d+|\b\d{1,2}(th|st|nd)\b/.test(s))
		return "birthday";
	if (/gathering|outing/.test(s)) return "gathering";
	if (/\bpt\b|\bcv\b|corporate|kantor|company|anniversary/.test(s))
		return "corporate";
	// "Rizky & Nadia" — pasangan tanpa kata kunci lain.
	if (/\S\s*&\s*\S/.test(s)) return "wedding";
	return "";
}

const NOTE_KEYS: Array<[keyof InboxData, string]> = [
	["instagram", "Instagram"],
	["jumlah_tamu", "Jumlah tamu"],
	["kontak_wo", "Kontak WO"],
	["orientasi", "Orientasi frame"],
	["desain_frame", "Desain frame"],
	["teks_frame", "Teks frame"],
	["catatan", "Catatan"],
];

/**
 * Isi awal form booking dari item Booking Masuk. Konvensi nama ikut 7128360:
 * pernikahan → klien = nama pengantin; selain itu nama acara = event_title dan
 * klien = yang chat (owner koreksi bila perusahaan). Yang tak bisa dipetakan
 * ke kolom events masuk crew_notes sebagai satu blok "Dari bot WA".
 */
export function inboxToBookingDefaults(
	item: Pick<InboxRow, "client_name" | "client_wa" | "data">,
	packages: PackageOption[],
	backdrops: Pick<BackdropOption, "id" | "code">[],
): BookingFormDefaults {
	const d = item.data ?? {};
	const category = guessCategory(d);
	const namaAcara = d.nama_acara?.trim() ?? "";
	const chatName = item.client_name?.trim() ?? "";
	const [start, end] = parseInboxTime(d.jam);
	const frame = parseFrameSize(d.ukuran_frame);
	const pic = parsePic(d.pic);

	// Paket: jam dari teks ("3 jam") + ukuran frame → paket unlimited yang pas.
	const hours = Number(/(\d+)\s*jam/i.exec(d.paket ?? "")?.[1] ?? 0);
	const serviceType = d.paket ? packageCategory(d.paket) : "";
	const pkg = hours
		? packages.find(
				(p) =>
					p.category === serviceType &&
					p.duration_hours === hours &&
					(p.frame_size === "none" || p.frame_size === frame),
			)
		: undefined;

	// Tanggal: tanpa tanggal_iso atau ditulis "belum pasti/sekitar" → perkiraan.
	const tentative = /belum|kira|sekitar|tentatif|tbc/i.test(d.tanggal ?? "");
	const isEstimate = !d.tanggal_iso || tentative;

	const backdropId = matchBackdrop(d.backdrop, backdrops);
	const notes = NOTE_KEYS.filter(([k]) => d[k]).map(
		([k, label]) => `- ${label}: ${d[k]}`,
	);
	if (d.backdrop && !backdropId)
		notes.push(`- Backdrop diminta: ${d.backdrop}`);
	if (d.paket && !pkg) notes.push(`- Paket diminta: ${d.paket}`);
	if (d.tanggal && isEstimate) notes.push(`- Tanggal dari klien: ${d.tanggal}`);

	const lokasi = d.lokasi?.trim() ?? "";
	const cityPart = lokasi.includes(",") ? lokasi.split(",").pop()?.trim() : "";
	const mapsUrl = /^https?:\/\//i.test(d.maps ?? "") ? (d.maps as string) : "";

	return {
		channel: "direct",
		event_category: category,
		client_org: category === "wedding" ? namaAcara : chatName,
		event_title: category === "wedding" ? "" : namaAcara,
		booker_name: chatName,
		client_wa: item.client_wa ? formatPhoneLocal(item.client_wa) : "",
		event_date: d.tanggal_iso ?? "",
		event_date_is_estimate: isEstimate ? "on" : "",
		start_time: start,
		end_time: end,
		venue_name: cityPart
			? lokasi.slice(0, lokasi.lastIndexOf(",")).trim()
			: lokasi,
		venue_city: cityPart ?? "",
		google_maps_url: mapsUrl,
		service_type: pkg?.category ?? serviceType,
		package_id: pkg?.id ?? "",
		// Durasi sementara hanya sah selama ukuran frame belum pasti
		// (lib/events/frame-package.ts); ukuran pasti tanpa paket cocok → catatan.
		pending_package_hours: !pkg && hours && !frame ? hours : "",
		base_price: pkg?.base_price ?? 0,
		frame_size: frame,
		backdrop_id: backdropId,
		pic_name: pic.name,
		pic_wa: pic.wa,
		crew_notes: notes.length ? `Dari bot WA:\n${notes.join("\n")}` : "",
	};
}
