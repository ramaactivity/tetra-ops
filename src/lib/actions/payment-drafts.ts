"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { tagihanEvent } from "@/lib/finance/tagihan";
import { autoConfirmGates, type DraftRow } from "@/lib/payment-drafts/core";
import {
	batalCore,
	hasDuplicate,
	konfirmasiCore,
	sisaTagihan,
	targetForEvent,
	uploadBuktiPrivat,
} from "@/lib/payment-drafts/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Aksi owner atas draft bukti DP (DR-055). Draft hanya bisa diubah saat
 * menunggu/disetujui; tercatat & dibatalkan terkunci. Tulis lewat admin
 * client (RLS payment_drafts hanya membuka SELECT owner).
 */

type Result =
	| { ok: true; tercatat?: boolean }
	| { ok: false; error: string; warning?: undefined }
	| { ok: false; warning: string; error?: undefined };

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner")
		throw new Error("Forbidden — owner-level only");
	return me;
}

async function loadOpen(id: string): Promise<DraftRow | string> {
	const { data } = await createAdminClient()
		.from("payment_drafts")
		.select("*")
		.eq("id", id)
		.maybeSingle();
	const d = data as DraftRow | null;
	if (!d) return "Draft tidak ditemukan.";
	if (d.status !== "menunggu" && d.status !== "disetujui")
		return "Draft ini sudah tercatat atau dibatalkan.";
	return d;
}

function revalidate(d: Pick<DraftRow, "booking_inbox_id">) {
	revalidatePath("/billing/uang-masuk");
	revalidatePath("/operations/booking-masuk");
	if (d.booking_inbox_id)
		revalidatePath(`/operations/booking-masuk/${d.booking_inbox_id}`);
}

/**
 * Konfirmasi di Tetra Ops → disetujui. Lebih bayar ditahan (keputusan Rama);
 * nominal sama dalam 24 jam = peringatan (force untuk tetap lanjut).
 * `kirim` = tombol "Konfirmasi & kirim terima kasih": kalau event sudah ada,
 * kuitansi/nota lunas langsung terkirim ke klien setelah masuk buku.
 */
export async function konfirmasiDraft(
	id: string,
	bankAccountId: string,
	force = false,
	kirim = false,
): Promise<Result> {
	const me = await requireOwnerLevel();
	const d = await loadOpen(id);
	if (typeof d === "string") return { ok: false, error: d };
	const res = await konfirmasiCore(
		createAdminClient(),
		d,
		bankAccountId,
		me.profile.id,
		{
			force,
			kirim,
		},
	);
	if (res.ok) revalidate(d);
	return res;
}

export type DraftEdit = {
	nominal: number | null;
	nama_pengirim: string | null;
	bank_pengirim: string | null;
	bank_tujuan: string | null;
	/** YYYY-MM-DD (WIB). */
	tanggal_transfer: string | null;
	bank_account_id: string | null;
	/** Untuk event mana (hermes-ff 25 Nov). undefined = tidak diubah. */
	event_id?: string;
};

/**
 * Koreksi isian. Nominal/rekening berubah pada draft yang sudah disetujui →
 * kembali menunggu (angka yang disetujui harus angka final).
 */
export async function ubahDraft(id: string, edit: DraftEdit): Promise<Result> {
	const me = await requireOwnerLevel();
	const d = await loadOpen(id);
	if (typeof d === "string") return { ok: false, error: d };
	const nominal =
		edit.nominal && edit.nominal > 0 ? Math.round(edit.nominal) : null;
	const t = (v: string | null) => v?.trim() || null;
	const tanggal =
		edit.tanggal_transfer && /^\d{4}-\d{2}-\d{2}$/.test(edit.tanggal_transfer)
			? edit.tanggal_transfer
			: null;
	const keepTime = d.waktu_transfer?.slice(0, 10) === tanggal;
	const admin = createAdminClient();
	// Pindah event → target ikut event itu (invoice + Booking Masuk-nya), lepas
	// dari Booking Masuk lama yang mungkin salah tebak.
	let target = {
		booking_inbox_id: d.booking_inbox_id,
		document_id: d.document_id,
		event_id: d.event_id,
	};
	const pindah = Boolean(edit.event_id && edit.event_id !== d.event_id);
	if (pindah && edit.event_id) {
		const t = await targetForEvent(admin, edit.event_id);
		if (!t)
			return {
				ok: false,
				error: "Event itu sudah dihapus atau dibatalkan — pilih event lain.",
			};
		target = t;
	}
	const moneyChanged =
		pindah ||
		nominal !== d.nominal ||
		(edit.bank_account_id ?? null) !== d.bank_account_id;
	// Syarat & sisa dihitung ulang dengan isian baru (bukan bacaan bot lama).
	const gerbang = autoConfirmGates({
		nominal,
		bankMatched: Boolean(edit.bank_account_id),
		sisa: await sisaTagihan(admin, target, d.id),
		confidence: d.confidence,
		duplicate: await hasDuplicate(admin, {
			draftId: d.id,
			nominal,
			target,
			client_wa: d.client_wa,
		}),
	});
	const { error } = await admin
		.from("payment_drafts")
		.update({
			...target,
			gerbang,
			nominal,
			nama_pengirim: t(edit.nama_pengirim),
			bank_pengirim: t(edit.bank_pengirim),
			bank_tujuan: t(edit.bank_tujuan),
			bank_account_id: edit.bank_account_id || null,
			waktu_transfer: tanggal
				? keepTime
					? d.waktu_transfer
					: `${tanggal}T12:00:00+07:00`
				: null,
			...(d.status === "disetujui" && moneyChanged
				? {
						status: "menunggu",
						disetujui_at: null,
						disetujui_via: null,
						disetujui_oleh: null,
					}
				: {}),
			updated_by: me.profile.id,
		})
		.eq("id", d.id)
		.in("status", ["menunggu", "disetujui"]);
	if (error) return { ok: false, error: error.message };
	revalidate(d);
	if (target.booking_inbox_id && target.booking_inbox_id !== d.booking_inbox_id)
		revalidatePath(`/operations/booking-masuk/${target.booking_inbox_id}`);
	return { ok: true };
}

const MIME_OK = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Ganti foto bukti (disimpan privat di R2, DR-065). */
export async function gantiBuktiDraft(formData: FormData): Promise<Result> {
	const me = await requireOwnerLevel();
	const id = String(formData.get("id") ?? "");
	const file = formData.get("file");
	if (!(file instanceof File) || file.size === 0)
		return { ok: false, error: "Pilih foto bukti." };
	if (!MIME_OK.has(file.type))
		return { ok: false, error: "Format foto harus JPG, PNG, atau WebP." };
	if (file.size > 8 * 1024 * 1024)
		return { ok: false, error: "Foto maksimal 8 MB." };
	const d = await loadOpen(id);
	if (typeof d === "string") return { ok: false, error: d };
	try {
		const up = await uploadBuktiPrivat(
			Buffer.from(await file.arrayBuffer()),
			file.type,
			d.id,
		);
		const { error } = await createAdminClient()
			.from("payment_drafts")
			.update({ ...up, updated_by: me.profile.id })
			.eq("id", d.id);
		if (error) return { ok: false, error: error.message };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "Gagal mengunggah bukti",
		};
	}
	revalidate(d);
	return { ok: true };
}

/** Batalkan = status, bukan hapus (jejak tetap ada). */
export async function batalkanDraft(id: string): Promise<Result> {
	const me = await requireOwnerLevel();
	const d = await loadOpen(id);
	if (typeof d === "string") return { ok: false, error: d };
	const res = await batalCore(createAdminClient(), d, me.profile.id);
	if (res.ok) revalidate(d);
	return res;
}

/**
 * "Bukan pembayaran event" (hermes-ff 25 Nov): bukti ditutup dengan alasan,
 * tidak masuk Billing. Uang masuk lain dicatat owner lewat Catat.
 */
export async function tandaiBukanEvent(id: string): Promise<Result> {
	const me = await requireOwnerLevel();
	const d = await loadOpen(id);
	if (typeof d === "string") return { ok: false, error: d };
	const admin = createAdminClient();
	const res = await batalCore(admin, d, me.profile.id);
	if (!res.ok) return res;
	await admin
		.from("payment_drafts")
		.update({
			catatan_posting: "Bukan pembayaran event — tidak masuk Billing.",
		})
		.eq("id", d.id);
	revalidate(d);
	return { ok: true };
}

export type EventPilihan = {
	id: string;
	label: string;
	sublabel: string;
};

/**
 * Pilihan event untuk dialog Ubah → "Untuk event": acara mulai 60 hari lalu
 * (pelunasan sering masuk setelah acara). Disaring di klien (Combobox
 * mencocokkan nama, tanggal, dan kode PRJ).
 */
export async function pilihanEventDraft(): Promise<EventPilihan[]> {
	await requireOwnerLevel();
	const sejak = new Date(Date.now() + 7 * 3600_000 - 60 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	// ponytail: ±ratusan acara per tahun → muat sekali; cari di server kalau ribuan.
	const { data, error } = await createAdminClient()
		.from("events")
		.select(
			"id, project_id, client_name, event_date, grand_total, total_paid, vendor_commission_mode, vendor_commission_amount",
		)
		.is("deleted_at", null)
		.neq("status", "cancelled")
		.gte("event_date", sejak)
		.order("event_date")
		.limit(400);
	if (error) throw new Error(`events: ${error.message}`);
	const tgl = (s: string) =>
		new Date(`${s}T00:00:00Z`).toLocaleDateString("id-ID", {
			day: "numeric",
			month: "long",
			year: "numeric",
			timeZone: "UTC",
		});
	return (data ?? []).map((e) => {
		const { sisa } = tagihanEvent(e);
		return {
			id: e.id as string,
			label: e.client_name as string,
			sublabel: `${tgl(e.event_date as string)} · ${e.project_id} · ${sisa > 0 ? `sisa Rp${sisa.toLocaleString("id-ID")}` : "lunas"}`,
		};
	});
}
