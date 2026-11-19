"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import type { DraftRow } from "@/lib/payment-drafts/core";
import {
	hasDuplicate,
	postIfEventExists,
	receivingBanks,
	sisaTagihan,
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

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

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
	if (d.status === "disetujui") return { ok: true };
	if (!d.nominal) return { ok: false, error: "Isi nominal yang masuk dulu." };
	const admin = createAdminClient();
	const banks = await receivingBanks(admin);
	if (!banks.some((b) => b.id === bankAccountId))
		return { ok: false, error: "Pilih rekening tujuan yang menerima uang." };
	const target = {
		booking_inbox_id: d.booking_inbox_id,
		document_id: d.document_id,
		event_id: d.event_id,
	};
	const sisa = await sisaTagihan(admin, target, d.id);
	if (sisa == null)
		return {
			ok: false,
			error:
				"Tagihan klien ini belum ketemu (belum ada invoice/quotation). Buat invoice dulu supaya sisa tagihan bisa dicek.",
		};
	if (d.nominal > sisa)
		return {
			ok: false,
			error: `Nominal ${rp(d.nominal)} melebihi sisa tagihan ${rp(sisa)}. Koreksi nominal atau tagihannya dulu.`,
		};
	if (
		!force &&
		(await hasDuplicate(admin, {
			draftId: d.id,
			nominal: d.nominal,
			target,
			client_wa: d.client_wa,
		}))
	)
		return {
			ok: false,
			warning: `Sudah ada bukti/pembayaran ${rp(d.nominal)} untuk klien ini dalam 24 jam terakhir. Mungkin bukti yang sama terkirim dua kali.`,
		};
	const { error } = await admin
		.from("payment_drafts")
		.update({
			status: "disetujui",
			bank_account_id: bankAccountId,
			disetujui_at: new Date().toISOString(),
			disetujui_via: "app",
			disetujui_oleh: me.profile.id,
			updated_by: me.profile.id,
		})
		.eq("id", d.id)
		.eq("status", "menunggu");
	if (error) return { ok: false, error: error.message };
	// Booking sudah punya event → langsung masuk buku (DR-055).
	const tercatat = await postIfEventExists(admin, d, me.profile.id, {
		kirimLangsung: kirim,
	});
	revalidate(d);
	return { ok: true, tercatat };
}

export type DraftEdit = {
	nominal: number | null;
	nama_pengirim: string | null;
	bank_pengirim: string | null;
	bank_tujuan: string | null;
	/** YYYY-MM-DD (WIB). */
	tanggal_transfer: string | null;
	bank_account_id: string | null;
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
	const moneyChanged =
		nominal !== d.nominal ||
		(edit.bank_account_id ?? null) !== d.bank_account_id;
	const { error } = await createAdminClient()
		.from("payment_drafts")
		.update({
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
	return { ok: true };
}

const MIME_OK = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Ganti foto bukti (disimpan privat di Drive). */
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
			{
				nama: d.nama_klien,
				nominal: d.nominal,
			},
		);
		const { error } = await createAdminClient()
			.from("payment_drafts")
			.update({
				bukti_file_id: up.fileId,
				bukti_url: up.url,
				updated_by: me.profile.id,
			})
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
	const { error } = await createAdminClient()
		.from("payment_drafts")
		.update({
			status: "dibatalkan",
			dibatalkan_at: new Date().toISOString(),
			dibatalkan_oleh: me.profile.id,
			updated_by: me.profile.id,
		})
		.eq("id", d.id)
		.in("status", ["menunggu", "disetujui"]);
	if (error) return { ok: false, error: error.message };
	revalidate(d);
	return { ok: true };
}
