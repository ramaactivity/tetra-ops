/**
 * Booking Masuk (bot WA → Tetra Ops) — bagian murni tanpa I/O: kontrak body
 * bot, aturan upsert, dan handler endpoint dengan penyimpanan yang disuntikkan
 * (route asli memakai Supabase admin, tes memakai Map). Kontrak lengkap:
 * prompt "Booking Masuk" + WHATSAPP bot `src/lib/booking.js`.
 */
import { z } from "zod";

export const INBOX_STATUSES = [
	"baru",
	"diproses",
	"jadi_event",
	"dibatalkan",
] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const INBOX_STATUS_LABEL: Record<InboxStatus, string> = {
	baru: "Baru",
	diproses: "Diproses",
	jadi_event: "Jadi event",
	dibatalkan: "Dibatalkan",
};

/** Teks bebas hasil ekstraksi AI: longgar, kosong/null boleh. */
const txt = z
	.string()
	.max(300)
	.nullish()
	.transform((v) => (v?.trim() ? v.trim() : null));

export const INBOX_DATA_KEYS = [
	"nama_acara",
	/** Jenis acara dari bot (6 grup Hermes: wedding, keluarga, korporat, …). */
	"jenis",
	"instansi",
	"tanggal",
	"tanggal_iso",
	"jam",
	"lokasi",
	"maps",
	"paket",
	/** Event multi-unit: jumlah booth yang diminta klien ("2", "2 unit"). */
	"jumlah_unit",
	"jumlah_tamu",
	"pic",
	"kontak_wo",
	"instagram",
	"ukuran_frame",
	"orientasi",
	"desain_frame",
	"teks_frame",
	"tema",
	/** Teks: "ada" / nama file logo. */
	"logo",
	/** Jumlah pose/layout frame. */
	"pose",
	"backdrop",
	"catatan",
] as const;
export type InboxDataKey = (typeof INBOX_DATA_KEYS)[number];
export type InboxData = Partial<Record<InboxDataKey, string | null>>;

export const INBOX_DATA_LABEL: Record<InboxDataKey, string> = {
	nama_acara: "Nama acara",
	jenis: "Jenis acara",
	instansi: "Instansi",
	tanggal: "Tanggal",
	tanggal_iso: "Tanggal (ISO)",
	jam: "Jam",
	lokasi: "Lokasi",
	maps: "Maps",
	paket: "Paket",
	jumlah_unit: "Jumlah unit",
	jumlah_tamu: "Jumlah tamu",
	pic: "PIC",
	kontak_wo: "Kontak WO",
	instagram: "Instagram",
	ukuran_frame: "Ukuran frame",
	orientasi: "Orientasi",
	desain_frame: "Desain frame",
	teks_frame: "Teks frame",
	tema: "Tema",
	logo: "Logo",
	pose: "Jumlah pose",
	backdrop: "Backdrop",
	catatan: "Catatan",
};

/** Kolom yang dibutuhkan untuk membuat event tanpa bertanya lagi. */
export const INBOX_REQUIRED: InboxDataKey[] = [
	"nama_acara",
	"tanggal_iso",
	"jam",
	"lokasi",
	"paket",
	"pic",
	// ukuran_frame sengaja TIDAK wajib (Rama 19 Nov): harga sama untuk semua
	// ukuran selama durasinya sama — ukuran boleh menyusul.
	"backdrop",
];

export function missingFields(data: InboxData): InboxDataKey[] {
	return INBOX_REQUIRED.filter((k) => !data[k]?.trim());
}

const isoDate = z
	.string()
	.nullish()
	.transform((v) =>
		v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null,
	);

export const BotBookingSchema = z.object({
	external_id: z.string().trim().min(3).max(200),
	wa_jid: z.string().trim().min(3).max(200),
	client_wa: z
		.string()
		.nullish()
		.transform((v) => v?.replace(/\D/g, "") || null),
	client_name: txt,
	sumber: z.enum(["bukti-transfer", "admin"]).nullish(),
	dp_dilaporkan_at: z.iso.datetime({ offset: true }).nullish(),
	bukti_url: z.url().max(1000).nullish(),
	/** Tidak dikirim = pertahankan nilai lama (bot hanya mengirim yang terisi). */
	lengkap: z.boolean().nullish(),
	data: z
		.object(
			Object.fromEntries(
				INBOX_DATA_KEYS.map((k) => [k, k === "tanggal_iso" ? isoDate : txt]),
			) as Record<InboxDataKey, typeof txt>,
		)
		.partial()
		// Kolom tak dikenal dari bot dibuang, bukan ditolak.
		.strip()
		.default({}),
});
export type BotBookingInput = z.output<typeof BotBookingSchema>;

export type InboxRow = {
	id: string;
	external_id: string;
	wa_jid: string;
	client_wa: string | null;
	client_name: string | null;
	sumber: string | null;
	dp_dilaporkan_at: string | null;
	bukti_url: string | null;
	data: InboxData;
	lengkap: boolean;
	status: InboxStatus;
	event_id: string | null;
	berubah_setelah_event: boolean;
	created_at: string;
	updated_at: string;
};

type Writable = Omit<InboxRow, "id" | "created_at" | "updated_at">;

/** Isian dari dokumen resmi (quotation/invoice) — hanya mengisi yang kosong. */
export type InboxFill = {
	data: InboxData;
	client_wa?: string | null;
	client_name?: string | null;
};

const filled = (v: unknown) =>
	typeof v === "string" ? v.trim() !== "" : v != null;

/** Kolom yang masih kosong di `data` diisi dari `fill`; yang terisi tidak disentuh. */
export function fillEmpty(data: InboxData, fill: InboxData): InboxData {
	const out = { ...data };
	for (const k of INBOX_DATA_KEYS)
		if (!filled(out[k]) && filled(fill[k])) out[k] = fill[k];
	return out;
}

/**
 * Aturan upsert (record = per external_id, atau record klien yang cocok):
 *  - belum ada → insert status `baru`
 *  - `dibatalkan` → abaikan (status tetap)
 *  - lainnya → MERGE: kolom yang null/tidak dikirim bot tidak menimpa isi lama
 *    (bot hanya mengirim yang terisi); status dipertahankan
 *  - `jadi_event` → sama + tandai berubah_setelah_event bila isinya memang
 *    beda; event TIDAK disentuh
 *  - `fill` (dokumen resmi klien) mengisi kolom yang masih kosong sesudahnya
 */
export function planUpsert(
	existing: InboxRow | null,
	body: BotBookingInput,
	fill?: InboxFill | null,
):
	| { action: "insert"; row: Writable }
	| { action: "update"; patch: Partial<Writable> }
	| { action: "ignore" } {
	const incoming = Object.fromEntries(
		Object.entries(body.data).filter(([, v]) => filled(v)),
	) as InboxData;
	const top = {
		client_wa: body.client_wa ?? null,
		client_name: body.client_name ?? null,
		sumber: body.sumber ?? null,
		dp_dilaporkan_at: body.dp_dilaporkan_at ?? null,
		bukti_url: body.bukti_url ?? null,
	};
	if (!existing) {
		return {
			action: "insert",
			row: {
				external_id: body.external_id,
				wa_jid: body.wa_jid,
				...top,
				client_wa: top.client_wa ?? fill?.client_wa ?? null,
				client_name: top.client_name ?? fill?.client_name ?? null,
				data: fillEmpty(incoming, fill?.data ?? {}),
				lengkap: body.lengkap ?? false,
				status: "baru",
				event_id: null,
				berubah_setelah_event: false,
			},
		};
	}
	if (existing.status === "dibatalkan") return { action: "ignore" };
	const data = fillEmpty(
		{ ...(existing.data ?? {}), ...incoming },
		fill?.data ?? {},
	);
	const patch: Partial<Writable> = {
		wa_jid: body.wa_jid,
		client_wa: top.client_wa ?? existing.client_wa ?? fill?.client_wa ?? null,
		client_name:
			top.client_name ?? existing.client_name ?? fill?.client_name ?? null,
		sumber: top.sumber ?? existing.sumber,
		dp_dilaporkan_at: top.dp_dilaporkan_at ?? existing.dp_dilaporkan_at,
		bukti_url: top.bukti_url ?? existing.bukti_url,
		data,
		lengkap: body.lengkap ?? existing.lengkap,
	};
	if (existing.status === "jadi_event") {
		const changed = !sameData(existing.data, data);
		patch.berubah_setelah_event = existing.berubah_setelah_event || changed;
	}
	return { action: "update", patch };
}

/**
 * Bot membuat external_id baru tiap tahap (`wa:<jid>:<mulai>`). Record klien
 * yang sudah ada (jid / nomor sama) dipakai lagi: tanggal sama menang; kalau
 * salah satu belum bertanggal, record yang masih terbuka. `rows` urut terbaru.
 */
export function pickClientMatch(
	rows: InboxRow[],
	tanggalIso: string | null | undefined,
): InboxRow | null {
	const live = rows.filter((r) => r.status !== "dibatalkan");
	return (
		(tanggalIso
			? live.find((r) => r.data?.tanggal_iso === tanggalIso)
			: undefined) ??
		live.find(
			(r) =>
				(r.status === "baru" || r.status === "diproses") &&
				(!tanggalIso || !r.data?.tanggal_iso),
		) ??
		null
	);
}

function sameData(a: InboxData, b: InboxData): boolean {
	return INBOX_DATA_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/** Penyimpanan yang disuntikkan ke handler (Supabase di route, Map di tes). */
export type InboxStore = {
	findByExternalId(externalId: string): Promise<InboxRow | null>;
	/** Record klien yang sama (wa_jid atau 9 digit nomor), terbaru dulu. */
	findForClient?(q: {
		wa_jid: string;
		client_wa: string | null;
	}): Promise<InboxRow[]>;
	/** Isian dari quotation/invoice klien ini (null = tak ada dokumen). */
	docFill?(q: {
		wa_jid: string;
		client_wa: string | null;
		tanggal_iso: string | null;
	}): Promise<InboxFill | null>;
	insert(row: Writable): Promise<InboxRow>;
	update(id: string, patch: Partial<Writable>): Promise<InboxRow>;
};

export type BotBookingResponse = {
	status: number;
	body:
		| { id: string; status: InboxStatus; event_id: string | null; url: string }
		| { error: string; issues?: unknown };
};

export async function handleBotBooking(params: {
	authorized: boolean;
	json: unknown;
	store: InboxStore;
	appUrl: string;
}): Promise<BotBookingResponse> {
	if (!params.authorized) {
		return { status: 401, body: { error: "Unauthorized" } };
	}
	const parsed = BotBookingSchema.safeParse(params.json);
	if (!parsed.success) {
		return {
			status: 400,
			body: { error: "Body tidak valid", issues: parsed.error.issues },
		};
	}
	const body = parsed.data;
	const { store } = params;
	const existing =
		(await store.findByExternalId(body.external_id)) ??
		pickClientMatch(
			(await store.findForClient?.({
				wa_jid: body.wa_jid,
				client_wa: body.client_wa ?? null,
			})) ?? [],
			body.data.tanggal_iso,
		);
	const fill =
		(await store.docFill?.({
			wa_jid: body.wa_jid,
			client_wa: body.client_wa ?? existing?.client_wa ?? null,
			tanggal_iso: body.data.tanggal_iso ?? existing?.data?.tanggal_iso ?? null,
		})) ?? null;
	const plan = planUpsert(existing, body, fill);
	const row =
		plan.action === "insert"
			? await params.store.insert(plan.row)
			: plan.action === "update" && existing
				? await params.store.update(existing.id, plan.patch)
				: (existing as InboxRow);
	return {
		status: 200,
		body: {
			id: row.id,
			status: row.status,
			event_id: row.event_id,
			url: `${params.appUrl.replace(/\/$/, "")}/operations/booking-masuk/${row.id}`,
		},
	};
}
