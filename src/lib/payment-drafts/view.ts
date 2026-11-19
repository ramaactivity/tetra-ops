import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	BankOption,
	DraftView,
} from "@/components/payment-drafts/dp-drafts-section";
import type { DraftRow } from "./core";

/**
 * Draft → baris tampilan (tanggal sudah WIB di server → tanpa hydration error)
 * + rekening penerima untuk tombol Konfirmasi. Satu sumber untuk halaman
 * detail Booking Masuk dan daftar Booking Masuk.
 */
export async function draftViewsAndBanks(
	supabase: SupabaseClient,
	drafts: DraftRow[],
): Promise<{ views: DraftView[]; banks: BankOption[] }> {
	const payIds = drafts.map((r) => r.payment_id).filter(Boolean) as string[];
	const [{ data: receipts }, { data: bankRows }] = await Promise.all([
		payIds.length
			? supabase
					.from("documents")
					.select("id, doc_number, payment_id")
					.eq("doc_type", "receipt")
					.neq("status", "void")
					.in("payment_id", payIds)
			: Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
		supabase
			.from("bank_accounts")
			.select("id, account_name, account_number")
			.eq("is_active", true)
			.neq("account_kind", "emoney")
			.order("account_name"),
	]);
	const receiptOf = new Map(
		(receipts ?? []).map((r) => [
			r.payment_id as string,
			{ id: r.id as string, nomor: r.doc_number as string },
		]),
	);
	const wib = (iso: string) =>
		new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
	const views: DraftView[] = drafts.map((r) => {
		const tanggal = wib(r.waktu_transfer ?? r.waktu_pesan ?? r.created_at);
		return {
			id: r.id,
			status: r.status,
			nominal: r.nominal,
			nama_pengirim: r.nama_pengirim,
			bank_pengirim: r.bank_pengirim,
			bank_tujuan: r.bank_tujuan,
			bank_account_id: r.bank_account_id,
			tanggal,
			tanggalLabel: new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(
				"id-ID",
				{
					day: "numeric",
					month: "short",
					timeZone: "UTC",
				},
			),
			hasBukti: Boolean(r.bukti_file_id),
			alasanBelumOtomatis: r.sumber === "admin_wa" ? (r.gerbang ?? []) : [],
			disetujuiVia: r.disetujui_via,
			catatanPosting: r.catatan_posting,
			kuitansi: r.payment_id ? (receiptOf.get(r.payment_id) ?? null) : null,
			kuitansiStatus: r.kuitansi_status ?? null,
		};
	});
	const banks = (bankRows ?? []).map((b) => ({
		value: b.id as string,
		label: [
			b.account_name,
			b.account_number ? `…${String(b.account_number).slice(-4)}` : null,
		]
			.filter(Boolean)
			.join(" "),
	}));
	return { views, banks };
}
