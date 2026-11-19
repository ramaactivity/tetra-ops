import "server-only";

import type { UpdateBookingCoreResult } from "@/lib/actions/bookings";
import type { AiTool, AiToolContext } from "@/lib/ai/types";
import { parseGrossUpRate } from "@/lib/documents/types";
import {
	BOOKING_EDIT_SELECT,
	bookingDefaultsFromEvent,
	bookingFormData,
} from "@/lib/events/booking-defaults";
import { applyRevisi, parseRevisiArgs } from "@/lib/events/revisi";
import { type EventTagihan, tagihanEvent } from "@/lib/finance/tagihan";
import { formatRupiah as rp } from "@/lib/format";

/**
 * revisi_event: ubah durasi paket / jam / add-on event yang sudah ada, lalu
 * invoice & nota aktif ikut diperbarui di tempat (nomor sama) — persis tombol
 * "Simpan perubahan" di Edit booking, karena memang lewat inti yang sama
 * (updateBookingCore). Tidak pernah mengirim apa pun ke klien.
 */

type Ok<T> = Exclude<T, { ok: false }>;
type Doc = {
	doc_number: string;
	doc_type: string;
	delivered_at: string | null;
};
type Prepared = {
	ev: Record<string, unknown> & EventTagihan & { id: string };
	formData: FormData;
	peringatan: string[];
	docs: Doc[];
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Dimuat saat dipanggil: bookings → payment-drafts → ai/hermes → registry →
// tool ini membentuk lingkaran import; import statis bisa membuat registry
// membaca revisiEvent sebelum terdefinisi.
const updateBookingCore: typeof import("@/lib/actions/bookings").updateBookingCore =
	async (...a) =>
		(await import("@/lib/actions/bookings")).updateBookingCore(...a);

const plain = (html: string) =>
	html
		.replace(/<[^>]+>/g, "")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");

async function prepare(
	args: Record<string, unknown>,
	ctx: AiToolContext,
): Promise<Prepared | { error: string }> {
	const parsed = parseRevisiArgs(args);
	if ("error" in parsed) return parsed;
	const pid = str(args.project_id);
	if (!pid) return { error: "project_id wajib, mis. PRJ-20261122-9433" };

	const { data: ev, error } = await ctx.supabase
		.from("events")
		.select(`${BOOKING_EDIT_SELECT}, status, total_paid, grand_total`)
		.eq("project_id", pid)
		.is("deleted_at", null)
		.maybeSingle();
	if (error) return { error: `Gagal membaca event: ${error.message}` };
	if (!ev) return { error: `Event ${pid} tidak ditemukan` };
	if (ev.status === "cancelled" || ev.status === "completed")
		return {
			error: `Event ${pid} sudah ${ev.status === "cancelled" ? "dibatalkan" : "selesai"} — tidak bisa direvisi lewat agent.`,
		};

	const [settled, pkgs, addons, cfg, docs] = await Promise.all([
		ctx.supabase
			.from("event_settlements")
			.select("id")
			.eq("event_id", ev.id)
			.maybeSingle(),
		ctx.supabase
			.from("packages")
			.select(
				"id, name, category, frame_size, duration_hours, base_price, is_active, deleted_at",
			)
			.eq("category", ev.service_type),
		ctx.supabase
			.from("addons")
			.select("id, name, price, is_active, deleted_at"),
		ctx.supabase
			.from("system_config")
			.select("value")
			.eq("key", "tax.default_grossup_rate_pct")
			.maybeSingle(),
		ctx.supabase
			.from("documents")
			.select("doc_number, doc_type, delivered_at")
			.eq("event_id", ev.id)
			.in("doc_type", ["invoice", "nota_lunas"])
			.neq("status", "void"),
	]);
	if (settled.data)
		return {
			error:
				"Event sudah di-settle — revisi lewat app setelah settlement dibuka ulang.",
		};
	if (pkgs.error || addons.error)
		return {
			error: `Gagal membaca pricelist: ${(pkgs.error ?? addons.error)?.message}`,
		};

	const cur = bookingDefaultsFromEvent(ev);
	const onEvent = new Set((cur.addons ?? []).map((a) => a.addon_id));
	const r = applyRevisi(cur, parsed, {
		packages: (pkgs.data ?? []).map((p) => ({
			id: p.id,
			name: p.name,
			category: p.category,
			frame_size: p.frame_size,
			duration_hours: Number(p.duration_hours),
			base_price: Number(p.base_price),
			active: p.is_active === true && !p.deleted_at,
		})),
		// Katalog aktif + add-on yang sudah ada di event (supaya bisa dihapus/diubah
		// walau sudah dinonaktifkan dari katalog).
		addons: (addons.data ?? [])
			.filter((a) => (a.is_active && !a.deleted_at) || onEvent.has(a.id))
			.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) })),
		grossupRate: parseGrossUpRate(cfg.data?.value),
	});
	if ("error" in r) return r;
	return {
		ev,
		formData: bookingFormData(r.defaults),
		peringatan: r.peringatan,
		docs: (docs.data ?? []) as Doc[],
	};
}

function formErrors(errors: Record<string, string[] | undefined>): string {
	return Object.entries(errors)
		.map(([k, v]) => `${k === "_form" ? "" : `${k}: `}${(v ?? []).join(", ")}`)
		.join("; ");
}

async function dryRun(p: Prepared, ctx: AiToolContext) {
	const res = await updateBookingCore(
		ctx.supabase as never,
		p.ev.id,
		p.formData,
		{
			dryRun: true,
		},
	);
	if (!res.ok) return { error: formErrors(res.errors) };
	if (res.changes.length === 0)
		return {
			error:
				"Tidak ada perubahan dibanding data event sekarang (mungkin revisi ini sudah tersimpan).",
		};
	return res;
}

function summary(
	p: Prepared,
	res: Ok<UpdateBookingCoreResult>,
	changes: string[],
) {
	const a = res.after;
	const t = tagihanEvent({ ...a, total_paid: res.before.total_paid });
	const peringatan = [...p.peringatan];
	if (t.terbayar > t.billable)
		peringatan.push(
			`Sudah dibayar ${rp(t.terbayar)} melebihi tagihan baru ${rp(t.billable)} — kelebihan ${rp(t.terbayar - t.billable)} perlu diatur owner.`,
		);
	const label = (t: string) => (t === "invoice" ? "invoice" : "nota lunas");
	return {
		event: `${p.ev.client_name} · ${p.ev.project_id} · ${p.ev.event_date}`,
		perubahan: changes.map(plain),
		total_lama: rp(res.before.grand_total),
		total_baru: rp(a.grand_total),
		sudah_dibayar: rp(t.terbayar),
		sisa_tagihan_lama: rp(tagihanEvent(p.ev).sisa),
		sisa_tagihan_baru: rp(t.sisa),
		dokumen_ikut_diperbarui: p.docs.map(
			(d) =>
				`${d.doc_number} (${label(d.doc_type)}, nomor tetap${d.delivered_at ? "; sudah pernah terkirim → kirim ulang berlabel revisi" : ""})`,
		),
		...(peringatan.length ? { peringatan } : {}),
	};
}

export const revisiEvent: AiTool = {
	name: "revisi_event",
	description:
		"Revisi event yang sudah ada: ganti durasi paket (ukuran frame tetap), jam acara, atau add-on. " +
		"Klien menambah jam sebelum acara = durasi_jam (paket baru), bukan add-on 'Tambahan Durasi'. " +
		"Harga otomatis dari pricelist Paket/Add-on (jangan menyebut harga sendiri). Invoice & nota aktif ikut " +
		"diperbarui dengan NOMOR SAMA. Pratinjau menunjukkan total baru, sudah dibayar, dan sisa tagihan. " +
		"TIDAK mengirim apa pun ke klien — kirim invoice revisi lewat kirim_dokumen_usulan setelahnya. " +
		"Tanggal, lokasi, diskon, dan harga nego diubah owner lewat app.",
	scope: "finance",
	mutates: true,
	parameters: {
		type: "OBJECT",
		properties: {
			project_id: {
				type: "STRING",
				description: "Kode event, mis. PRJ-20261122-9433 (lihat cari_event).",
			},
			durasi_jam: {
				type: "INTEGER",
				nullable: true,
				description:
					"Durasi paket baru dalam jam. Kalau berubah, jam_mulai/jam_selesai wajib diisi.",
			},
			jam_mulai: {
				type: "STRING",
				nullable: true,
				description: "HH:MM. Kosong = tetap.",
			},
			jam_selesai: {
				type: "STRING",
				nullable: true,
				description: "HH:MM. Kosong = tetap.",
			},
			addons: {
				type: "ARRAY",
				nullable: true,
				description:
					"Add-on yang berubah saja. jumlah = jumlah akhir; 0 = hapus. Add-on lain tetap.",
				items: {
					type: "OBJECT",
					properties: {
						addon: { type: "STRING", description: "Nama atau id add-on." },
						jumlah: { type: "INTEGER" },
					},
					required: ["addon", "jumlah"],
				},
			},
		},
		required: ["project_id"],
	},
	async preview(args, ctx) {
		const p = await prepare(args, ctx);
		if ("error" in p) return p;
		const res = await dryRun(p, ctx);
		if ("error" in res) return res;
		return {
			...summary(p, res, res.changes),
			catatan:
				"Belum tersimpan dan tidak ada yang terkirim ke klien. Tunjukkan ke owner dulu.",
		};
	},
	async run(args, ctx) {
		if (!ctx.actorId)
			return { error: "Permukaan ini tidak boleh menulis data." };
		const p = await prepare(args, ctx);
		if ("error" in p) return p;
		const dry = await dryRun(p, ctx);
		if ("error" in dry) return dry;
		const res = await updateBookingCore(
			ctx.supabase as never,
			p.ev.id,
			p.formData,
		);
		if (!res.ok) return { error: formErrors(res.errors) };
		const inv = p.docs.find((d) => d.doc_type === "invoice");
		return {
			tersimpan: true,
			...summary(p, res, dry.changes),
			langkah_berikut: inv
				? `Kalau mau dikirim ke klien: kirim_dokumen_usulan dengan document_id ${inv.doc_number}, tunggu owner setuju.`
				: "Event ini belum punya invoice — owner membuatnya dari halaman event.",
		};
	},
};
