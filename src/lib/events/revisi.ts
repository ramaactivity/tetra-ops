import type { BookingFormDefaults } from "@/components/booking/booking-form";
import { formatRupiah as rp } from "@/lib/format";

/**
 * Revisi event dari agent (tool MCP revisi_event): ubah beberapa kolom isian
 * form Edit booking — durasi paket, jam acara, add-on — lalu disimpan lewat
 * inti Edit booking yang sama (updateBookingCore). Murni, tanpa DB.
 *
 * Aturan uang: harga selalu dari pricelist Paket / katalog Add-on; agent tidak
 * pernah mengetik harga, diskon, atau komisi.
 */

export type RevisiArgs = {
	durasi_jam?: number;
	jam_mulai?: string;
	jam_selesai?: string;
	/** jumlah 0 = hapus add-on itu. */
	addons?: Array<{ addon: string; jumlah: number }>;
};

export type RevisiPackage = {
	id: string;
	name: string;
	category: string;
	frame_size: string | null;
	duration_hours: number;
	base_price: number;
	/** false = non-aktif / terhapus: hanya dipakai membaca paket lama. */
	active: boolean;
};

export type RevisiAddon = {
	id: string;
	name: string;
	price: number;
};

type Err = { error: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function parseRevisiArgs(a: Record<string, unknown>): RevisiArgs | Err {
	const out: RevisiArgs = {};
	if (a.durasi_jam !== undefined && a.durasi_jam !== null) {
		const n = Number(a.durasi_jam);
		if (!Number.isInteger(n) || n < 1 || n > 24)
			return { error: "durasi_jam harus bilangan bulat 1–24" };
		out.durasi_jam = n;
	}
	for (const k of ["jam_mulai", "jam_selesai"] as const) {
		const raw = typeof a[k] === "string" ? (a[k] as string).trim() : "";
		if (!raw) continue;
		const v = raw.replace(".", ":");
		const t = /^\d:\d\d$/.test(v) ? `0${v}` : v;
		if (!HHMM.test(t)) return { error: `${k} harus format HH:MM, mis. 11:00` };
		out[k] = t;
	}
	if (Array.isArray(a.addons)) {
		out.addons = [];
		for (const x of a.addons as Array<Record<string, unknown>>) {
			const addon = typeof x?.addon === "string" ? x.addon.trim() : "";
			const jumlah = Number(x?.jumlah);
			if (!addon || !Number.isInteger(jumlah) || jumlah < 0 || jumlah > 99)
				return {
					error:
						"addons: tiap item {addon: nama atau id, jumlah: 0–99} (0 = hapus)",
				};
			out.addons.push({ addon, jumlah });
		}
	}
	if (
		out.durasi_jam === undefined &&
		!out.jam_mulai &&
		!out.jam_selesai &&
		!out.addons?.length
	)
		return {
			error:
				"Tidak ada yang direvisi: isi durasi_jam, jam_mulai/jam_selesai, atau addons.",
		};
	return out;
}

function resolveAddon(list: RevisiAddon[], q: string): RevisiAddon | Err {
	const ql = q.toLowerCase();
	const exact =
		list.find((a) => a.id === q) ??
		list.find((a) => a.name.toLowerCase() === ql);
	if (exact) return exact;
	const hits = list.filter((a) => a.name.toLowerCase().includes(ql));
	if (hits.length === 1) return hits[0];
	return {
		error:
			`Add-on "${q}" ${hits.length === 0 ? "tidak ditemukan" : "ambigu"}. Pilihan: ` +
			(hits.length > 1 ? hits : list).map((a) => a.name).join(", "),
	};
}

const durations = (pkgs: RevisiPackage[]) =>
	[...new Set(pkgs.map((p) => p.duration_hours))]
		.sort((x, y) => x - y)
		.join(", ") || "-";

/** Harga terendah untuk durasi itu — sama dengan resolveBasePrice (paket sementara). */
const minPrice = (pkgs: RevisiPackage[], hours: number) => {
	const prices = pkgs
		.filter((p) => p.duration_hours === hours)
		.map((p) => p.base_price);
	return prices.length ? Math.min(...prices) : null;
};

export function applyRevisi(
	cur: BookingFormDefaults,
	args: RevisiArgs,
	cat: {
		packages: RevisiPackage[];
		addons: RevisiAddon[];
		/** % gross-up PPh (config) — rumus tombol "Auto" di form. */
		grossupRate: number;
	},
): { defaults: BookingFormDefaults; peringatan: string[] } | Err {
	const d: BookingFormDefaults = { ...cur, addons: [...(cur.addons ?? [])] };
	const peringatan: string[] = [];
	const units = Number(d.unit_count) || 1;
	const active = cat.packages.filter(
		(p) => p.active && p.category === d.service_type,
	);
	const curPkg = d.package_id
		? cat.packages.find((p) => p.id === d.package_id)
		: undefined;
	const curPending = d.pending_package_hours
		? Number(d.pending_package_hours)
		: null;
	let hours = curPkg?.duration_hours ?? curPending;

	// ── Durasi paket (ukuran frame tetap) ──
	if (args.durasi_jam !== undefined && args.durasi_jam !== hours) {
		const n = args.durasi_jam;
		let unitPrice: number;
		let oldList: number | null;
		if (curPkg) {
			const same = active.filter((p) => p.frame_size === curPkg.frame_size);
			const target = same.find((p) => p.duration_hours === n);
			if (!target)
				return {
					error: `Tidak ada paket ${n} jam untuk ukuran ${curPkg.frame_size ?? "-"} di pricelist. Durasi yang ada: ${durations(same)} jam.`,
				};
			d.package_id = target.id;
			unitPrice = target.base_price;
			oldList = curPkg.base_price;
		} else if (curPending) {
			const price = minPrice(active, n);
			if (price === null)
				return {
					error: `Tidak ada paket ${n} jam di pricelist. Durasi yang ada: ${durations(active)} jam.`,
				};
			d.pending_package_hours = n;
			unitPrice = price;
			oldList = minPrice(active, curPending);
		} else {
			return {
				error:
					"Event ini memakai paket custom (bukan dari pricelist) — ubah durasinya lewat Edit booking di app.",
			};
		}
		const oldBase = Number(d.base_price) || 0;
		if (oldList !== null && oldBase !== oldList * units)
			peringatan.push(
				`Harga paket lama ${rp(oldBase)} beda dari pricelist ${rp(oldList * units)} (kemungkinan harga nego). Revisi memakai harga pricelist ${rp(unitPrice * units)}.`,
			);
		d.base_price = unitPrice * units;
		const oldGross = Number(d.gross_up_pph_amount) || 0;
		if (oldGross > 0) {
			const r = cat.grossupRate;
			const g = Math.round((d.base_price * r) / (100 - r));
			d.gross_up_pph_amount = g;
			peringatan.push(
				`Gross-up PPh dihitung ulang ${r}% dari harga paket: ${rp(oldGross)} → ${rp(g)}.`,
			);
		}
		hours = n;
		const extend = cat.addons.find(
			(a) =>
				/tambahan durasi/i.test(a.name) &&
				d.addons?.some((x) => x.addon_id === a.id),
		);
		if (extend)
			peringatan.push(
				`Event juga punya add-on "${extend.name}" — pastikan jamnya tidak terhitung dobel dengan paket ${n} jam.`,
			);
		if (!args.jam_mulai && !args.jam_selesai)
			return {
				error: `Durasi berubah jadi ${n} jam: isi jam_mulai dan/atau jam_selesai yang baru (tanyakan ke klien, jangan menebak).`,
			};
	}

	// ── Jam acara ──
	if (args.jam_mulai || args.jam_selesai) {
		if (d.session_segments)
			return {
				error:
					"Acara ini punya jeda (multi-sesi) — jamnya diubah lewat Edit booking di app.",
			};
		const start = args.jam_mulai ?? String(d.start_time ?? "");
		const end = args.jam_selesai ?? String(d.end_time ?? "");
		if (!HHMM.test(start) || !HHMM.test(end))
			return {
				error:
					"Jam acara di event belum lengkap — isi jam_mulai dan jam_selesai.",
			};
		const span = (toMin(end) - toMin(start) + 1440) % 1440;
		if (span === 0)
			return { error: "jam_selesai tidak boleh sama dengan jam_mulai." };
		d.start_time = start;
		d.end_time = end;
		if (hours && span !== hours * 60)
			peringatan.push(
				`Jam acara ${start}–${end} (${span / 60} jam) tidak sama dengan durasi paket ${hours} jam — pastikan memang begitu.`,
			);
		if (d.setup_time && String(d.setup_time) > start)
			peringatan.push(
				`Jam setup ${d.setup_time} sesudah jam mulai baru ${start} — ubah jam setup lewat app kalau perlu.`,
			);
	}

	// ── Add-on ──
	const list = d.addons ?? [];
	for (const it of args.addons ?? []) {
		const a = resolveAddon(cat.addons, it.addon);
		if ("error" in a) return a;
		const i = list.findIndex((x) => x.addon_id === a.id);
		if (it.jumlah === 0) {
			if (i >= 0) list.splice(i, 1);
			continue;
		}
		if (i >= 0) {
			list[i] = { ...list[i], quantity: it.jumlah };
			if (list[i].unit_price)
				peringatan.push(
					`${a.name}: harga kesepakatan ${rp(list[i].unit_price as number)}/unit dipertahankan.`,
				);
			continue;
		}
		if (!(a.price > 0))
			return {
				error: `Harga add-on "${a.name}" belum ada di katalog (diisi admin) — tambahkan lewat Edit booking di app.`,
			};
		list.push({ addon_id: a.id, quantity: it.jumlah });
	}

	return { defaults: d, peringatan };
}
