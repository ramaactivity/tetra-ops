import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Siapa yang dihubungi untuk melengkapi data event (tombol "Minta data").
 * Rama 19 Nov: "ada yang chat langsung ke kliennya, ada yang ke wonya, ada
 * yang ke eonya, ada yang ke picnya. tergantung event ini dibooking oleh siapa".
 * Urutan = prioritas, yang pertama jadi pilihan bawaan: WO/EO (event lewat
 * vendor) → pemesan (kalau bukan nomor klien) → klien → PIC lapangan.
 * Nomor kembar hanya muncul sekali dengan peran pertamanya.
 */
export type PeranPenerima = "wo" | "pemesan" | "klien" | "pic";
export type Penerima = {
	peran: PeranPenerima;
	label: string;
	nama: string | null;
	nomor: string;
};

type Kontak = { name?: string | null; phone?: string | null } | null;
export type EventPenerima = {
	channel?: string | null;
	client_name?: string | null;
	client_wa?: string | null;
	vendor_name?: string | null;
	vendor_pic_name?: string | null;
	vendor_contact?: string | null;
	pic_name?: string | null;
	pic_wa?: string | null;
	booker_contact?: Kontak | Kontak[];
	pic_contact?: Kontak | Kontak[];
};

const satu = (k: Kontak | Kontak[] | undefined): Kontak =>
	(Array.isArray(k) ? k[0] : k) ?? null;
const wa = (n: string | null | undefined): string | null => {
	if (!isLikelyWaPhone(n)) return null;
	const v = toWaPhone(n as string);
	return v.startsWith("628") ? v : null;
};

export function penerimaKelengkapan(ev: EventPenerima): Penerima[] {
	const booker = satu(ev.booker_contact);
	const pic = satu(ev.pic_contact);
	const nomorKlien = wa(ev.client_wa);
	const kandidat: Array<Omit<Penerima, "nomor"> & { nomor: string | null }> =
		[];
	if (ev.channel === "vendor")
		kandidat.push({
			peran: "wo",
			label: "WO/EO",
			nama:
				[ev.vendor_pic_name, ev.vendor_name].filter(Boolean).join(" · ") ||
				null,
			nomor: wa(ev.vendor_contact),
		});
	// Pemesan = klien sendiri (nomor sama) → cukup tampil sebagai Klien.
	if (wa(booker?.phone) !== nomorKlien)
		kandidat.push({
			peran: "pemesan",
			label: "Pemesan",
			nama: booker?.name ?? null,
			nomor: wa(booker?.phone),
		});
	kandidat.push({
		peran: "klien",
		label: "Klien",
		nama: ev.client_name ?? null,
		nomor: nomorKlien,
	});
	kandidat.push({
		peran: "pic",
		label: "PIC lapangan",
		nama: pic?.name ?? ev.pic_name ?? null,
		nomor: wa(pic?.phone ?? ev.pic_wa),
	});
	const sudah = new Set<string>();
	const out: Penerima[] = [];
	for (const k of kandidat) {
		if (!k.nomor || sudah.has(k.nomor)) continue;
		sudah.add(k.nomor);
		out.push({ ...k, nomor: k.nomor });
	}
	return out;
}

/**
 * Nomor lawan bicara bot cocok sebagai apa di event ini (POST /api/bot/klien).
 * Audit Hermes t_288da914 (23 Nov): WO (vendor_contact) tidak pernah dapat fakta
 * acara, dan klien yang chat dari nomor selain client_wa/pic_wa (Shella: tercatat
 * nomor pemesan) dianggap calon klien. WO didahulukan pada event lewat vendor —
 * nomor WO sering juga tercatat sebagai pemesan/PIC.
 */
export type CocokNomor =
	| "vendor"
	| "client_wa"
	| "pic_wa"
	| "pemesan"
	| "extra_pic";
export function cocokNomor(
	ev: EventPenerima & { extra_pics?: unknown },
	tail: string,
): CocokNomor | null {
	if (tail.length !== 9) return null;
	const sama = (n: string | null | undefined) => phoneTail(n) === tail;
	if (ev.channel === "vendor" && sama(ev.vendor_contact)) return "vendor";
	if (sama(ev.client_wa)) return "client_wa";
	if (sama(ev.pic_wa) || sama(satu(ev.pic_contact)?.phone)) return "pic_wa";
	if (sama(satu(ev.booker_contact)?.phone)) return "pemesan";
	const extra = Array.isArray(ev.extra_pics)
		? (ev.extra_pics as Array<{ wa?: string | null }>)
		: [];
	if (extra.some((x) => sama(x?.wa))) return "extra_pic";
	return null;
}
