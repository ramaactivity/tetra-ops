/**
 * Draft pembayaran dari bukti transfer WA (DR-055) — bagian murni tanpa I/O:
 * kontrak body bot, syarat konfirmasi otomatis, dan aturan kirim ulang.
 * Draft TIDAK menyentuh buku; posting ke payments terjadi saat event ada.
 * Kontrak: rancangan Hermes t_5c804dee (sesi hermes-15, 19 Nov 2026).
 */
import { z } from "zod";

export const DRAFT_STATUSES = [
	"menunggu",
	"disetujui",
	"tercatat",
	"dibatalkan",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
	menunggu: "Menunggu konfirmasi",
	disetujui: "Disetujui",
	tercatat: "Tercatat",
	dibatalkan: "Dibatalkan",
};

/** ponytail: ambang tetap; pindah ke system_config kalau Rama ingin mengatur. */
export const CONFIDENCE_MIN = 0.8;

const txt = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => v || null);
const waktu = z.iso.datetime({ offset: true }).nullish();

export const BotDraftSchema = z.object({
	pesan_id_wa: z.string().trim().min(3).max(200),
	client_wa: z
		.string()
		.nullish()
		.transform((v) => v?.replace(/\D/g, "") || null),
	wa_jid: txt(200),
	nama_klien: txt(160),
	invoice_no: txt(60),
	// Kontrak: null kalau tak terbaca. 0 diperlakukan sama (tidak pernah dicatat).
	nominal: z
		.number()
		.int()
		.min(0)
		.nullish()
		.transform((v) => (v ? v : null)),
	nama_pengirim: txt(160),
	bank_pengirim: txt(80),
	bank_tujuan: txt(120),
	waktu_transfer: waktu,
	waktu_pesan: waktu,
	confidence: z.number().min(0).max(1).nullish(),
	teks_mentah: txt(4000),
	sumber: z.enum(["client_only", "admin_wa"]),
	auto_confirm: z.boolean().default(false),
	/** Base64 tanpa prefix data:. Maks ±4 MB gambar (batas body Vercel 4,5 MB). */
	gambar: z.string().max(5_800_000).nullish(),
	gambar_mime: z.enum(["image/jpeg", "image/png", "image/webp"]).nullish(),
	/** Nama lama untuk gambar_mime. */
	mime: z.enum(["image/jpeg", "image/png", "image/webp"]).nullish(),
});
export type BotDraftInput = z.output<typeof BotDraftSchema>;

export type BankLite = { id: string; account_number: string | null };

/**
 * Rekening tujuan dari teks bukti ("BCA 0954965224") → rekening Tetra.
 * Wajib nomor rekening utuh (≥ 6 digit); nomor tersamar "****5224" tidak cocok.
 */
export function matchBankAccount(
	bankTujuan: string | null | undefined,
	banks: BankLite[],
): string | null {
	const digits = (bankTujuan ?? "").replace(/\D/g, "");
	if (digits.length < 6) return null;
	return (
		banks.find((b) => {
			const n = (b.account_number ?? "").replace(/\D/g, "");
			return n.length >= 6 && digits.includes(n);
		})?.id ?? null
	);
}

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

/**
 * Syarat ketat konfirmasi otomatis (keputusan Rama 19 Nov). Hasil = syarat
 * yang TIDAK lolos; kosong = boleh disetujui otomatis. Gerbang "yang membalas
 * memang admin" dijaga bot.
 */
export function autoConfirmGates(g: {
	nominal: number | null;
	bankMatched: boolean;
	sisa: number | null;
	confidence: number | null;
	/** Ada bukti/pembayaran lain bernominal sama untuk klien ini dalam 24 jam. */
	duplicate?: boolean;
}): string[] {
	const fail: string[] = [];
	if (!g.nominal) fail.push("nominal tidak terbaca");
	if (!g.bankMatched)
		fail.push("rekening tujuan tidak cocok dengan rekening Tetra");
	if (g.sisa == null) fail.push("tagihan klien tidak ditemukan");
	else if (g.nominal && g.nominal > g.sisa)
		fail.push(`nominal melebihi sisa tagihan (${rp(g.sisa)})`);
	if (g.confidence == null || g.confidence < CONFIDENCE_MIN)
		fail.push("bacaan AI kurang yakin");
	if (g.duplicate)
		fail.push(
			"ada bukti lain dengan nominal sama dalam 24 jam (mungkin dobel)",
		);
	return fail;
}

/** Kolom draft yang ditulis dari kiriman bot. */
export type DraftFields = {
	client_wa: string | null;
	wa_jid: string | null;
	nama_klien: string | null;
	invoice_no: string | null;
	nominal: number | null;
	nama_pengirim: string | null;
	bank_pengirim: string | null;
	bank_tujuan: string | null;
	waktu_transfer: string | null;
	waktu_pesan: string | null;
	confidence: number | null;
	teks_mentah: string | null;
};

export type DraftRow = DraftFields & {
	id: string;
	pesan_id_wa: string;
	status: DraftStatus;
	sumber: "client_only" | "admin_wa";
	booking_inbox_id: string | null;
	document_id: string | null;
	event_id: string | null;
	payment_id: string | null;
	bank_account_id: string | null;
	bukti_file_id: string | null;
	bukti_url: string | null;
	gerbang: string[];
	disetujui_at: string | null;
	disetujui_via: "admin_wa" | "app" | null;
	catatan_posting: string | null;
	kuitansi_status?: "dikabarkan_ke_hermes" | "belum_disiapkan" | null;
	kuitansi_catatan?: string | null;
	created_at: string;
	updated_at: string;
};

export type DraftContext = {
	banks: BankLite[];
	/** Sisa tagihan klien (null = tagihan tak ditemukan). */
	sisa: number | null;
	/** Bukti/pembayaran lain bernominal sama dalam 24 jam (lihat server). */
	duplicate: boolean;
	target: {
		booking_inbox_id: string | null;
		document_id: string | null;
		event_id: string | null;
	};
	now: string;
};

type Patch = Partial<Omit<DraftRow, "id" | "created_at" | "updated_at">>;

/**
 * Aturan simpan per pesan_id_wa:
 *  - baru → insert; disetujui hanya kalau admin_wa + auto_confirm + semua syarat lolos
 *  - tercatat / dibatalkan → tidak berubah oleh kiriman ulang
 *  - lainnya → kolom kosong diisi (koreksi Rama tidak ditimpa); admin_wa +
 *    auto_confirm yang lolos syarat menaikkan menunggu → disetujui
 */
export function planDraftUpsert(
	existing: DraftRow | null,
	body: BotDraftInput,
	ctx: DraftContext,
):
	| { action: "insert"; row: Patch & { pesan_id_wa: string }; gates: string[] }
	| { action: "update"; patch: Patch; gates: string[] }
	| { action: "ignore"; gates: string[] } {
	const incoming: DraftFields = {
		client_wa: body.client_wa,
		wa_jid: body.wa_jid,
		nama_klien: body.nama_klien,
		invoice_no: body.invoice_no,
		nominal: body.nominal,
		nama_pengirim: body.nama_pengirim,
		bank_pengirim: body.bank_pengirim,
		bank_tujuan: body.bank_tujuan,
		waktu_transfer: body.waktu_transfer ?? null,
		waktu_pesan: body.waktu_pesan ?? null,
		confidence: body.confidence ?? null,
		teks_mentah: body.teks_mentah,
	};
	if (
		existing &&
		(existing.status === "tercatat" || existing.status === "dibatalkan")
	)
		return { action: "ignore", gates: existing.gerbang ?? [] };

	const merged = { ...incoming } as DraftFields;
	if (existing)
		for (const k of Object.keys(incoming) as (keyof DraftFields)[])
			if (existing[k] != null)
				(merged as Record<string, unknown>)[k] = existing[k];

	const bankId =
		existing?.bank_account_id ??
		matchBankAccount(merged.bank_tujuan, ctx.banks);
	const gates = autoConfirmGates({
		nominal: merged.nominal,
		bankMatched: Boolean(bankId),
		sisa: ctx.sisa,
		confidence: merged.confidence,
		duplicate: ctx.duplicate,
	});
	const approve =
		body.sumber === "admin_wa" &&
		body.auto_confirm &&
		gates.length === 0 &&
		existing?.status !== "disetujui";
	const approval: Patch = approve
		? { status: "disetujui", disetujui_at: ctx.now, disetujui_via: "admin_wa" }
		: {};
	const target = {
		booking_inbox_id: existing?.booking_inbox_id ?? ctx.target.booking_inbox_id,
		document_id: existing?.document_id ?? ctx.target.document_id,
		event_id: existing?.event_id ?? ctx.target.event_id,
	};

	if (!existing)
		return {
			action: "insert",
			row: {
				pesan_id_wa: body.pesan_id_wa,
				...merged,
				...target,
				sumber: body.sumber,
				status: "menunggu",
				bank_account_id: bankId,
				gerbang: gates,
				...approval,
			},
			gates,
		};
	return {
		action: "update",
		patch: {
			...merged,
			...target,
			sumber: body.sumber === "admin_wa" ? "admin_wa" : existing.sumber,
			bank_account_id: bankId,
			gerbang: gates,
			...approval,
		},
		gates,
	};
}
