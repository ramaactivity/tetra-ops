/**
 * Data klien dari dokumen resmi (quotation/invoice) + Booking Masuk — bagian
 * murni tanpa I/O. Dipakai tiga jalur yang harus sama isinya:
 *   - GET /api/bot/klien?wa= (bot WA mengisi form booking sebelum dikirim)
 *   - tool MCP `data_klien` (agent cs-wa Hermes)
 *   - isi otomatis Booking Masuk dari dokumen (kolom kosong saja)
 * Kunci sengaja sama dengan kontrak POST /api/bot/quotation (quotation-plan.ts)
 * supaya pemetaan di bot 1:1. TANPA nominal uang (cs-wa dilarang menyebut angka).
 * Rancangan: konsultasi Hermes t_8843a9c1 (kasus Yessi, 19 Nov 2026).
 */
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import {
	INBOX_DATA_KEYS,
	type InboxData,
	type InboxFill,
	type InboxStatus,
} from "./core";

const PENDING_PREFIX = "Menyusul:";

export type DocLike = {
	id: string;
	doc_type: string;
	doc_number: string;
	status: string;
	issued_at: string;
	created_at: string;
	client: {
		name?: string | null;
		org?: string | null;
		attn?: string | null;
		phone?: string | null;
		email?: string | null;
	} | null;
	event_info: {
		title?: string | null;
		date?: string | null;
		time?: string | null;
		venue?: string | null;
		city?: string | null;
	} | null;
	items: Array<{
		name: string;
		qty: number;
		package_id?: string | null;
		addon_id?: string | null;
		includes?: string[] | null;
	}> | null;
	notes?: string | null;
	origin?: { wa_jid?: string | null; jenis_acara?: string | null } | null;
	event_id?: string | null;
};

export type PackageLite = {
	id: string;
	category: string;
	frame_size: string;
	duration_hours: number;
};

export type InboxLite = {
	id: string;
	status: InboxStatus;
	data: InboxData | null;
};

export type Layanan = {
	kategori: string | null;
	jam: number | null;
	qty: number;
	format: string | null;
	nama: string;
};

export type DataKlien = {
	ditemukan: boolean;
	klien: {
		nama: string | null;
		instansi: string | null;
		attn: string | null;
		email: string | null;
	} | null;
	acara: {
		judul: string | null;
		jenis: string | null;
		tanggal: string | null;
		jam_mulai: string | null;
		jam_selesai: string | null;
		venue: string | null;
		kota: string | null;
		jumlah_tamu: string | null;
	} | null;
	layanan: Layanan[];
	addons: Array<{ nama: string; qty: number }>;
	backdrop: string | null;
	dokumen: Array<{ jenis: string; nomor: string; tanggal: string }>;
	booking_masuk: { id: string; status: InboxStatus; terisi: string[] } | null;
};

const decided = (s: string) => !s.startsWith(PENDING_PREFIX);
const CLASSIC_RE = /^Photobooth Classic Unlimited (\d+) Jam/i;
const EXTRA_RE = /^Tambahan durasi/i;

/** Item dokumen → layanan (paket) + add-on. "Tambahan durasi" dilipat ke jam. */
export function splitItems(
	items: DocLike["items"],
	packages: PackageLite[],
): { layanan: Layanan[]; addons: Array<{ nama: string; qty: number }> } {
	const layanan: Layanan[] = [];
	const addons: Array<{ nama: string; qty: number }> = [];
	for (const it of items ?? []) {
		if (EXTRA_RE.test(it.name)) continue;
		const inc = (it.includes ?? []).filter(decided);
		const total = inc
			.map((s) => /^Total durasi (\d+) jam/i.exec(s)?.[1])
			.find(Boolean);
		const fmtLine = inc.map((s) => /^Format (\w+)/i.exec(s)?.[1]).find(Boolean);
		const pkg = it.package_id
			? packages.find((p) => p.id === it.package_id)
			: undefined;
		const classic = CLASSIC_RE.exec(it.name);
		if (pkg || classic) {
			const frame = pkg && pkg.frame_size !== "none" ? pkg.frame_size : null;
			layanan.push({
				kategori: pkg?.category ?? "photobooth_classic",
				jam: total
					? Number(total)
					: pkg
						? pkg.duration_hours
						: classic
							? Number(classic[1])
							: null,
				qty: it.qty,
				format: (frame ?? fmtLine)?.toLowerCase() ?? null,
				nama: it.name,
			});
		} else addons.push({ nama: it.name, qty: it.qty });
	}
	return { layanan, addons };
}

/** "Backdrop: X" yang sudah diputuskan, atau add-on bernama backdrop. */
export function docBackdrop(items: DocLike["items"]): string | null {
	for (const it of items ?? [])
		for (const s of it.includes ?? []) {
			const m = /^Backdrop:\s*(.+)/.exec(s);
			if (m) return m[1].trim();
		}
	return (items ?? []).find((i) => /backdrop/i.test(i.name))?.name ?? null;
}

/** Kebalikan resolveClient (quotation-plan): ada attn → name = instansi. */
function klienOf(c: DocLike["client"]) {
	if (!c) return null;
	return {
		nama: c.attn ?? c.name ?? null,
		instansi: c.attn ? (c.name ?? null) : (c.org ?? null),
		attn: c.attn ?? null,
		email: c.email ?? null,
	};
}

function jamOf(time?: string | null): [string | null, string | null] {
	const [a, b] = (time ?? "").split(/\s*[–-]\s*/);
	const hm = (s?: string) =>
		s && /^\d{1,2}[:.]\d{2}$/.test(s)
			? s.replace(".", ":").padStart(5, "0")
			: null;
	return [hm(a), hm(b)];
}

const tamuOf = (notes?: string | null) =>
	/Perkiraan tamu:\s*(.+)/.exec(notes ?? "")?.[1]?.trim() ?? null;

/**
 * Dokumen acuan: invoice > quotation, yang bertanggal > tanpa tanggal, terbaru.
 * `date` diisi → hanya dokumen untuk tanggal itu (atau tanpa tanggal).
 */
export function pickPrimaryDoc(
	docs: DocLike[],
	date?: string | null,
): DocLike | null {
	const live = docs.filter(
		(d) =>
			d.status !== "void" &&
			(!date || !d.event_info?.date || d.event_info.date === date),
	);
	const rank = (d: DocLike) =>
		(d.doc_type === "invoice" ? 2 : 0) + (d.event_info?.date ? 1 : 0);
	return (
		[...live].sort(
			(a, b) => rank(b) - rank(a) || b.created_at.localeCompare(a.created_at),
		)[0] ?? null
	);
}

export function buildDataKlien(
	docs: DocLike[],
	inbox: InboxLite | null,
	packages: PackageLite[],
): DataKlien {
	const primary = pickPrimaryDoc(docs, inbox?.data?.tanggal_iso ?? null);
	const d = inbox?.data ?? {};
	const { layanan, addons } = primary
		? splitItems(primary.items, packages)
		: { layanan: [], addons: [] };
	const [mulai, selesai] = jamOf(primary?.event_info?.time);
	const ev = primary?.event_info ?? {};
	return {
		ditemukan: Boolean(primary || inbox),
		klien: primary ? klienOf(primary.client) : null,
		acara:
			primary || inbox
				? {
						judul: ev.title ?? d.nama_acara ?? null,
						jenis:
							d.jenis ??
							docs.find((x) => x.origin?.jenis_acara)?.origin?.jenis_acara ??
							null,
						tanggal: ev.date ?? d.tanggal_iso ?? null,
						jam_mulai: mulai,
						jam_selesai: selesai,
						venue: ev.venue ?? null,
						kota: ev.city ?? null,
						jumlah_tamu: tamuOf(primary?.notes) ?? d.jumlah_tamu ?? null,
					}
				: null,
		layanan,
		addons,
		backdrop:
			(primary ? docBackdrop(primary.items) : null) ?? d.backdrop ?? null,
		dokumen: docs
			.filter((x) => x.status !== "void")
			.map((x) => ({
				jenis: x.doc_type,
				nomor: x.doc_number,
				tanggal: x.issued_at,
			})),
		booking_masuk: inbox
			? {
					id: inbox.id,
					status: inbox.status,
					terisi: INBOX_DATA_KEYS.filter((k) => d[k]?.trim()),
				}
			: null,
	};
}

/** Isian Booking Masuk dari satu dokumen (dipakai hanya untuk kolom kosong). */
export function docToInboxFill(
	doc: DocLike,
	packages: PackageLite[],
): InboxFill {
	const ev = doc.event_info ?? {};
	const { layanan } = splitItems(doc.items, packages);
	const k = klienOf(doc.client);
	const units = layanan.reduce((n, l) => n + l.qty, 0);
	const data: InboxData = {
		nama_acara: ev.title ?? null,
		instansi: k?.instansi ?? null,
		tanggal_iso: ev.date ?? null,
		tanggal: ev.date
			? new Date(`${ev.date}T00:00:00Z`).toLocaleDateString("id-ID", {
					weekday: "long",
					day: "numeric",
					month: "long",
					year: "numeric",
					timeZone: "UTC",
				})
			: null,
		jam: ev.time ?? null,
		lokasi: [ev.venue, ev.city].filter(Boolean).join(", ") || null,
		paket:
			layanan
				.map((l) => (l.qty > 1 ? `${l.qty}× ${l.nama}` : l.nama))
				.join(" + ") || null,
		jumlah_unit: units > 1 ? String(units) : null,
		jumlah_tamu: tamuOf(doc.notes),
		ukuran_frame: layanan.find((l) => l.format)?.format?.toUpperCase() ?? null,
		backdrop: docBackdrop(doc.items),
	};
	const digits = doc.client?.phone?.replace(/\D/g, "") || null;
	return {
		data,
		client_wa: digits && phoneTail(digits).length === 9 ? digits : null,
		client_name: k?.nama ?? null,
	};
}

/**
 * Dokumen yang jadi dasar "Buat Event" dari Booking Masuk: invoice tanpa event
 * didahulukan, lalu quotation yang masih terbuka (belum diterima/ditolak),
 * untuk tanggal acara yang sama. `docs` urut terbaru dulu.
 */
export function openSourceDoc(
	docs: DocLike[],
	date?: string | null,
): DocLike | null {
	const ok = docs.filter(
		(d) =>
			!d.event_id &&
			d.status !== "void" &&
			(d.doc_type === "invoice" ||
				(d.status !== "accepted" && d.status !== "rejected")) &&
			(!date || !d.event_info?.date || d.event_info.date === date),
	);
	return ok.find((d) => d.doc_type === "invoice") ?? ok[0] ?? null;
}
