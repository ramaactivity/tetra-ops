/**
 * buat_quotation (B2) — bagian murni tanpa I/O: kontrak input agent/bot,
 * pemetaan layanan → paket master, aturan durasi, isian admin, dan hitungan
 * total. Server (quotation-core.ts) hanya memuat katalog lalu menyimpan.
 *
 * Aturan uang (keputusan Rama 27 Sep 2026):
 *  - harga SELALU dari packages.base_price / addons.price — agent tidak
 *    pernah menentukan harga;
 *  - transport Magazine Box / luar Jabodetabek & backdrop Luxury = isian admin
 *    (unit_price 0 + needs_admin_price) → dokumen tak bisa dikirim sebelum diisi;
 *  - usulan diskon disimpan terpisah, TIDAK mengurangi total.
 */
import { z } from "zod";
import { isJabodetabek } from "@/lib/availability";
import { computeTotals } from "./totals";
import {
	addDays,
	DEFAULT_INCLUDES_BY_CATEGORY,
	type DocClient,
	type DocEventInfo,
	type DocItem,
	defaultTerms,
	type ProposedDiscount,
	QUOTATION_VALID_DAYS,
} from "./types";

/** Tarif tambahan durasi di atas paket (Rp/jam). */
export const EXTRA_HOUR_PRICE = 500_000;
/** DR-041: paket combo (3+ crew) extend Rp750rb/jam. */
export const extraHourPrice = (category: string) =>
	category === "photostage_combo" || category === "magazine_combo"
		? 750_000
		: EXTRA_HOUR_PRICE;

export const SERVICE_CATEGORIES = [
	"photobooth_classic",
	"videobooth_360",
	"magazine_combo",
	"magazine_box_only",
	"photostage_only",
	"photostage_combo",
	"guest_cam",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_LABEL: Record<ServiceCategory, string> = {
	photobooth_classic: "Photobooth Classic",
	videobooth_360: "Videobooth 360",
	magazine_combo: "Magazine Box + Photobooth",
	magazine_box_only: "Magazine Box Only",
	photostage_only: "Photo Stage Only",
	photostage_combo: "Photo Stage + Photobooth",
	guest_cam: "Snapbook (tanpa booth)",
};

const MAGAZINE = new Set<string>(["magazine_combo", "magazine_box_only"]);

const opt = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => v || null);

export const QuotationRequestSchema = z.object({
	klien: z.object({
		nama: z.string().trim().min(1, "klien.nama wajib").max(160),
		organisasi: opt(160),
		attn: opt(160),
		wa: opt(40),
		email: opt(160),
	}),
	bill_to: z.enum(["auto", "client", "booker"]).nullish(),
	acara: z
		.object({
			judul: opt(160),
			jenis: opt(40),
			tanggal: z.iso.date().nullish(),
			jam_mulai: z
				.string()
				.regex(/^\d{1,2}[:.]\d{2}$/)
				.nullish(),
			jam_selesai: z
				.string()
				.regex(/^\d{1,2}[:.]\d{2}$/)
				.nullish(),
			venue: opt(200),
			kota: opt(100),
			jumlah_tamu: opt(60),
		})
		.prefault({}),
	layanan: z
		.array(
			z.object({
				package_id: z.uuid().nullish(),
				kategori: z.enum(SERVICE_CATEGORIES).nullish(),
				jam: z.number().int().min(1).max(24).nullish(),
				format: z
					.string()
					.trim()
					.transform((v) => v.toLowerCase())
					.pipe(z.enum(["2r", "4r", "polaroid"]))
					.nullish(),
				qty: z.number().int().min(1).max(10).default(1),
			}),
		)
		.min(1, "minimal satu layanan")
		.max(6),
	addons: z
		.array(
			z.object({
				addon_id: z.uuid().nullish(),
				nama: opt(120),
				qty: z.number().int().min(1).max(999).default(1),
			}),
		)
		.max(20)
		.default([]),
	backdrop: opt(60),
	gross_up: z.boolean().default(false),
	usulan_diskon: z
		.object({
			persen: z.number().min(0).max(100).nullish(),
			nominal: z.number().int().min(0).nullish(),
			alasan: z.string().trim().min(3).max(300),
		})
		.refine((d) => d.persen != null || d.nominal != null, {
			message: "usulan_diskon butuh persen atau nominal",
		})
		.nullish(),
	catatan: opt(1000),
	sumber: z.object({
		jenis: z.enum(["wa_bot", "telegram"]),
		wa_jid: opt(200),
		lead_id: opt(64),
	}),
});
export type QuotationRequest = z.output<typeof QuotationRequestSchema>;

export type CatalogPackage = {
	id: string;
	name: string;
	category: string;
	frame_size: string;
	duration_hours: number;
	base_price: number;
	is_active?: boolean;
	quotation_includes?: string[] | null;
};
export type CatalogAddon = {
	id: string;
	name: string;
	unit: string | null;
	price: number;
	is_active?: boolean;
	min_qty?: number | null;
};
export type CatalogBackdrop = {
	code: string;
	name: string;
	type: string;
	is_active: boolean;
};
export type Catalog = {
	packages: CatalogPackage[];
	addons: CatalogAddon[];
	backdrops: CatalogBackdrop[];
};

export type QuotationPlan = {
	client: DocClient;
	event_info: DocEventInfo;
	items: DocItem[];
	gross_up_enabled: boolean;
	gross_up_rate: number;
	proposed_discount: ProposedDiscount | null;
	notes: string | null;
	terms: string;
	issued_at: string;
	valid_until: string;
	/** Nama item yang harganya wajib diisi Rama sebelum dikirim. */
	butuh_isian_admin: string[];
	/** Catatan pilihan server (paket 13 jam lebih hemat, format menyusul, …). */
	catatan_server: string[];
	subtotal: number;
	total: number;
	/** Nilai rupiah usulan diskon (informasi; tidak masuk total). */
	usulan_diskon_rp: number | null;
};

type PlanResult =
	| { ok: true; plan: QuotationPlan }
	| { ok: false; error: string };

/**
 * Pilih paket untuk (kategori, format, jam). Paket berdurasi persis = pakai.
 * Selain itu: termurah di antara "paket lebih pendek + tambahan durasi" dan
 * "paket lebih panjang"; seri → paket lebih panjang (baris lebih sedikit).
 * Contoh 2R 12 jam: 8 jam + 4 jam (7 jt) < 13 jam (7,5 jt).
 */
export function pickPackage(
	packages: CatalogPackage[],
	category: string,
	format: string | null,
	hours: number,
): { pkg: CatalogPackage; extraHours: number } | null {
	const fmt = format?.toLowerCase() ?? null;
	const pool = packages.filter(
		(p) =>
			p.is_active !== false &&
			p.category === category &&
			(p.frame_size === "none" ||
				fmt === null ||
				p.frame_size.toLowerCase() === fmt),
	);
	// Format belum dipilih: harga semua format sama per durasi → acuan 4R
	// (2R-only seperti 13 jam tetap boleh bila memang itu satu-satunya).
	const byFormat =
		fmt === null && pool.some((p) => p.frame_size === "4R")
			? pool.filter((p) => p.frame_size === "4R" || p.frame_size === "none")
			: pool;
	if (byFormat.length === 0) return null;
	const exact = byFormat.find((p) => p.duration_hours === hours);
	if (exact) return { pkg: exact, extraHours: 0 };
	let best: { pkg: CatalogPackage; extraHours: number; cost: number } | null =
		null;
	for (const p of byFormat) {
		const extra = Math.max(0, hours - p.duration_hours);
		const cost = p.base_price + extra * extraHourPrice(p.category);
		if (
			!best ||
			cost < best.cost ||
			(cost === best.cost && p.duration_hours > best.pkg.duration_hours)
		)
			best = { pkg: p, extraHours: extra, cost };
	}
	return best ? { pkg: best.pkg, extraHours: best.extraHours } : null;
}

function formatLine(category: string, frame: string, fmt: string | null) {
	if (frame === "none") return null;
	if (category !== "photobooth_classic") return `Format ${frame.toUpperCase()}`;
	if (!fmt) return "Format cetak menyusul (2R/4R/Polaroid)";
	return fmt === "polaroid" ? "Format Polaroid" : `Format ${fmt.toUpperCase()}`;
}

function resolveClient(r: QuotationRequest): DocClient {
	const org = r.klien.organisasi;
	const person = r.klien.nama;
	const mode = r.bill_to ?? "auto";
	const name =
		mode === "booker"
			? person
			: mode === "client"
				? (org ?? person)
				: (org ?? person);
	const attn = mode === "auto" ? (r.klien.attn ?? (org ? person : null)) : null;
	return {
		name,
		org: null,
		attn: attn && attn.toLowerCase() !== name.toLowerCase() ? attn : null,
		phone: r.klien.wa,
		email: r.klien.email,
		address: null,
	};
}

export function planQuotation(
	r: QuotationRequest,
	catalog: Catalog,
	opts: { today: string; grossUpRate: number },
): PlanResult {
	const items: DocItem[] = [];
	const catatan: string[] = [];
	const categories = new Set<string>();

	for (const [i, l] of r.layanan.entries()) {
		let pkg: CatalogPackage | undefined;
		let extraHours = 0;
		let fmt: string | null = l.format ?? null;
		if (l.package_id) {
			pkg = catalog.packages.find((p) => p.id === l.package_id);
			if (!pkg)
				return { ok: false, error: `layanan[${i}]: paket tidak ditemukan` };
			if (pkg.is_active === false)
				return {
					ok: false,
					error: `layanan[${i}]: paket ${pkg.name} nonaktif`,
				};
			if (pkg.frame_size !== "none") fmt = pkg.frame_size.toLowerCase();
		} else {
			if (!l.kategori || !l.jam)
				return {
					ok: false,
					error: `layanan[${i}]: isi package_id, atau kategori + jam`,
				};
			const hit = pickPackage(catalog.packages, l.kategori, fmt, l.jam);
			if (!hit)
				return {
					ok: false,
					error: `layanan[${i}]: tidak ada paket ${SERVICE_LABEL[l.kategori]}${fmt ? ` format ${fmt.toUpperCase()}` : ""} di pricelist`,
				};
			pkg = hit.pkg;
			extraHours = hit.extraHours;
			if (pkg.duration_hours > l.jam)
				catatan.push(
					`${SERVICE_LABEL[l.kategori]} ${l.jam} jam memakai paket ${pkg.name} (lebih hemat dari tambahan durasi).`,
				);
			else if (pkg.duration_hours > 8 && pkg.duration_hours !== l.jam)
				catatan.push(
					`${SERVICE_LABEL[l.kategori]} ${l.jam} jam memakai paket ${pkg.name} + tambahan — tidak lebih mahal dari 8 jam + tambahan.`,
				);
			else if (pkg.duration_hours > 8)
				catatan.push(
					`${SERVICE_LABEL[l.kategori]} ${l.jam} jam memakai paket ${pkg.name} — lebih hemat dari 8 jam + ${l.jam - 8} jam tambahan.`,
				);
		}
		categories.add(pkg.category);
		const fmtLine = formatLine(pkg.category, pkg.frame_size, fmt);
		if (pkg.category === "photobooth_classic" && !fmt)
			catatan.push(
				"Format cetak belum dipilih — harga sama untuk 2R/4R/Polaroid.",
			);
		const base =
			pkg.quotation_includes && pkg.quotation_includes.length > 0
				? pkg.quotation_includes
				: (DEFAULT_INCLUDES_BY_CATEGORY[pkg.category] ?? []);
		const totalHours = pkg.duration_hours + extraHours;
		items.push({
			name:
				pkg.category === "photobooth_classic" && !fmt
					? `Photobooth Classic Unlimited ${pkg.duration_hours} Jam`
					: pkg.name,
			includes: [
				[`Durasi ${totalHours} jam`, fmtLine].filter(Boolean).join(" · "),
				...base.map((s) => s.replace("{hours}", String(pkg.duration_hours))),
			],
			qty: l.qty,
			unit_price: pkg.base_price,
			// Format belum pasti → jangan kunci ke paket ber-ukuran saat Deal.
			package_id: pkg.category === "photobooth_classic" && !fmt ? null : pkg.id,
		});
		if (extraHours > 0)
			items.push({
				name: `Tambahan durasi ${extraHours} jam`,
				includes: [
					`${SERVICE_LABEL[pkg.category as ServiceCategory] ?? pkg.name} · Rp ${extraHourPrice(pkg.category).toLocaleString("id-ID")}/jam`,
				],
				qty: extraHours * l.qty,
				unit_price: extraHourPrice(pkg.category),
			});
	}

	for (const [i, a] of r.addons.entries()) {
		let addon: CatalogAddon | undefined;
		if (a.addon_id) addon = catalog.addons.find((x) => x.id === a.addon_id);
		else if (a.nama) {
			const q = a.nama.toLowerCase();
			const hits = catalog.addons.filter((x) =>
				x.name.toLowerCase().includes(q),
			);
			if (hits.length > 1)
				return {
					ok: false,
					error: `addons[${i}]: "${a.nama}" cocok ke ${hits.map((h) => h.name).join(", ")} — pakai addon_id`,
				};
			addon = hits[0];
		}
		if (!addon)
			return { ok: false, error: `addons[${i}]: add-on tidak ditemukan` };
		if (addon.is_active === false)
			return { ok: false, error: `addons[${i}]: ${addon.name} nonaktif` };
		let qty = a.qty;
		if (addon.min_qty && qty < addon.min_qty) {
			catatan.push(
				`${addon.name}: minimal order ${addon.min_qty} — qty dinaikkan dari ${qty}.`,
			);
			qty = addon.min_qty;
		}
		items.push({
			name: addon.name,
			includes: [
				...(addon.unit ? [`Per ${addon.unit}`] : []),
				...(addon.min_qty ? [`Minimal order ${addon.min_qty}`] : []),
			],
			qty,
			unit_price: addon.price,
			addon_id: addon.id,
		});
	}

	// Backdrop: basic = termasuk paket (catatan di item pertama); Luxury/tema =
	// isian admin; dekorasi klien = catatan saja.
	const bd = r.backdrop?.trim();
	if (bd) {
		const main = items[0];
		if (
			/^dekorasi[_\s]?klien$/i.test(bd) ||
			bd.toUpperCase() === "CLIENT-PROVIDED"
		) {
			main.includes.push("Backdrop: memakai dekorasi dari klien");
		} else {
			const b = catalog.backdrops.find(
				(x) => x.code.toUpperCase() === bd.toUpperCase(),
			);
			if (!b) return { ok: false, error: `backdrop "${bd}" tidak dikenal` };
			if (!b.is_active)
				return { ok: false, error: `backdrop ${b.name} sudah tidak tersedia` };
			if (b.type === "basic_included")
				main.includes.push(`Backdrop: ${b.name}`);
			else
				items.push({
					name: b.name,
					includes: ["Harga diisi admin"],
					qty: 1,
					unit_price: 0,
					needs_admin_price: true,
				});
		}
	}

	// Transport: gratis se-Jabodetabek kecuali Magazine Box; luar area = admin.
	const magazine = [...categories].some((c) => MAGAZINE.has(c));
	const kota = r.acara.kota;
	const luar = !isJabodetabek(kota);
	if (magazine || luar) {
		const why = [
			magazine ? "Magazine Box" : null,
			luar
				? kota
					? `luar Jabodetabek (${kota})`
					: "kota acara belum diketahui"
				: null,
		]
			.filter(Boolean)
			.join(" · ");
		items.push({
			name: "Transport",
			includes: [why, "Harga diisi admin"],
			qty: 1,
			unit_price: 0,
			needs_admin_price: true,
		});
	}

	const totals = computeTotals(items, 0, {
		enabled: r.gross_up,
		ratePct: opts.grossUpRate,
	});
	const ud = r.usulan_diskon ?? null;
	const usulanRp = ud
		? (ud.nominal ?? Math.round((totals.subtotal * (ud.persen ?? 0)) / 100))
		: null;

	const a = r.acara;
	const hm = (t?: string | null) => t?.replace(".", ":").padStart(5, "0") ?? "";
	const time = [hm(a.jam_mulai), hm(a.jam_selesai)].filter(Boolean).join("–");
	const notes = [
		r.catatan,
		a.jumlah_tamu ? `Perkiraan tamu: ${a.jumlah_tamu}` : null,
	]
		.filter(Boolean)
		.join("\n");

	return {
		ok: true,
		plan: {
			client: resolveClient(r),
			event_info: {
				title: a.judul,
				date: a.tanggal ?? null,
				time: time || null,
				venue: a.venue,
				city: a.kota,
			},
			items,
			gross_up_enabled: r.gross_up,
			gross_up_rate: opts.grossUpRate,
			proposed_discount: ud
				? {
						persen: ud.persen ?? null,
						nominal: ud.nominal ?? null,
						alasan: ud.alasan,
					}
				: null,
			notes: notes || null,
			terms: defaultTerms("quotation", r.gross_up, 1, opts.grossUpRate),
			issued_at: opts.today,
			valid_until: addDays(opts.today, QUOTATION_VALID_DAYS),
			butuh_isian_admin: items
				.filter((i) => i.needs_admin_price)
				.map((i) => i.name),
			catatan_server: catatan,
			subtotal: totals.subtotal,
			total: totals.total,
			usulan_diskon_rp: usulanRp,
		},
	};
}
