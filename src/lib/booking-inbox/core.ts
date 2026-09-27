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
	"tanggal",
	"tanggal_iso",
	"jam",
	"lokasi",
	"maps",
	"paket",
	"jumlah_tamu",
	"pic",
	"kontak_wo",
	"instagram",
	"ukuran_frame",
	"orientasi",
	"desain_frame",
	"teks_frame",
	"backdrop",
	"catatan",
] as const;
export type InboxDataKey = (typeof INBOX_DATA_KEYS)[number];
export type InboxData = Partial<Record<InboxDataKey, string | null>>;

export const INBOX_DATA_LABEL: Record<InboxDataKey, string> = {
	nama_acara: "Nama acara",
	tanggal: "Tanggal",
	tanggal_iso: "Tanggal (ISO)",
	jam: "Jam",
	lokasi: "Lokasi",
	maps: "Maps",
	paket: "Paket",
	jumlah_tamu: "Jumlah tamu",
	pic: "PIC",
	kontak_wo: "Kontak WO",
	instagram: "Instagram",
	ukuran_frame: "Ukuran frame",
	orientasi: "Orientasi",
	desain_frame: "Desain frame",
	teks_frame: "Teks frame",
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
	"ukuran_frame",
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
	lengkap: z.boolean().default(false),
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

/**
 * Aturan upsert per external_id:
 *  - belum ada → insert status `baru`
 *  - `dibatalkan` → abaikan (status tetap)
 *  - `jadi_event` → simpan data terbaru + tandai berubah_setelah_event bila isinya
 *    memang beda; event TIDAK disentuh
 *  - lainnya → perbarui isi, status dipertahankan (diproses tetap diproses)
 */
export function planUpsert(
	existing: InboxRow | null,
	body: BotBookingInput,
):
	| { action: "insert"; row: Writable }
	| { action: "update"; patch: Partial<Writable> }
	| { action: "ignore" } {
	const fields = {
		wa_jid: body.wa_jid,
		client_wa: body.client_wa ?? null,
		client_name: body.client_name ?? null,
		sumber: body.sumber ?? null,
		dp_dilaporkan_at: body.dp_dilaporkan_at ?? null,
		bukti_url: body.bukti_url ?? null,
		data: body.data as InboxData,
		lengkap: body.lengkap,
	};
	if (!existing) {
		return {
			action: "insert",
			row: {
				external_id: body.external_id,
				...fields,
				status: "baru",
				event_id: null,
				berubah_setelah_event: false,
			},
		};
	}
	if (existing.status === "dibatalkan") return { action: "ignore" };
	// Bot mengirim ulang isi yang sama (idempoten) → jangan ubah bukti lama yang
	// sudah ada dengan null.
	const patch: Partial<Writable> = {
		...fields,
		bukti_url: fields.bukti_url ?? existing.bukti_url,
		dp_dilaporkan_at: fields.dp_dilaporkan_at ?? existing.dp_dilaporkan_at,
	};
	if (existing.status === "jadi_event") {
		const changed = !sameData(existing.data, fields.data);
		patch.berubah_setelah_event = existing.berubah_setelah_event || changed;
	}
	return { action: "update", patch };
}

function sameData(a: InboxData, b: InboxData): boolean {
	return INBOX_DATA_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/** Penyimpanan yang disuntikkan ke handler (Supabase di route, Map di tes). */
export type InboxStore = {
	findByExternalId(externalId: string): Promise<InboxRow | null>;
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
	const existing = await params.store.findByExternalId(body.external_id);
	const plan = planUpsert(existing, body);
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
