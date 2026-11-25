import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	BankOption,
	DraftView,
} from "@/components/payment-drafts/dp-drafts-section";
import { type DraftRow, JENIS_BAYAR_LABEL, jenisBayar } from "./core";
import { eventOfDraft, tagihanDraft } from "./server";

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
	const [{ data: receipts }, { data: bankRows }, { data: pays }] =
		await Promise.all([
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
				.select("id, account_name, account_number, is_default_receive")
				.eq("is_active", true)
				.neq("account_kind", "emoney")
				.order("account_name"),
			payIds.length
				? supabase.from("payments").select("id, payment_type").in("id", payIds)
				: Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
		]);
	const jenisPay = new Map(
		(pays ?? []).map((p) => [p.id as string, p.payment_type as string]),
	);
	// Bukti yang masih terbuka: event-nya, sisa tagihan, jenis, saran pengirim.
	const extra = await Promise.all(drafts.map((r) => konteks(supabase, r)));
	const receiptOf = new Map(
		(receipts ?? []).map((r) => [
			r.payment_id as string,
			{ id: r.id as string, nomor: r.doc_number as string },
		]),
	);
	const wib = (iso: string) =>
		new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
	// Rekening penerima utama terisi otomatis → Konfirmasi cukup satu tap.
	const defaultBank =
		(bankRows ?? []).find((b) => b.is_default_receive)?.id ?? null;
	const views: DraftView[] = drafts.map((r, i) => {
		const tanggal = wib(r.waktu_transfer ?? r.waktu_pesan ?? r.created_at);
		return {
			id: r.id,
			status: r.status,
			nominal: r.nominal,
			nama_pengirim: r.nama_pengirim,
			bank_pengirim: r.bank_pengirim,
			bank_tujuan: r.bank_tujuan,
			bank_account_id: r.bank_account_id ?? (defaultBank as string | null),
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
			jenis:
				extra[i].jenis ??
				(r.payment_id
					? (JENIS_BAYAR_LABEL[
							jenisPay.get(r.payment_id) as keyof typeof JENIS_BAYAR_LABEL
						] ?? null)
					: null),
			sisa: extra[i].sisa,
			event: extra[i].event,
			saranPengirim: extra[i].saranPengirim,
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

type Konteks = {
	jenis: string | null;
	sisa: { sebelum: number; sesudah: number } | null;
	event: { id: string; label: string } | null;
	saranPengirim: string[];
};

const tglPanjang = (s: string) =>
	new Date(`${s}T00:00:00Z`).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

async function konteks(
	supabase: SupabaseClient,
	r: DraftRow,
): Promise<Konteks> {
	const kosong: Konteks = {
		jenis: null,
		sisa: null,
		event: null,
		saranPengirim: [],
	};
	if (r.status !== "menunggu" && r.status !== "disetujui") return kosong;
	const evId = await eventOfDraft(supabase, r);
	const [tagihan, { data: ev }, { data: ib }] = await Promise.all([
		tagihanDraft(
			supabase,
			{
				booking_inbox_id: r.booking_inbox_id,
				document_id: r.document_id,
				event_id: evId,
			},
			r.id,
		).catch((e) => {
			console.error("[payment-drafts] sisa tagihan:", e);
			return null;
		}),
		evId
			? supabase
					.from("events")
					.select(
						"project_id, client_name, event_date, booker_contact:contacts!events_booker_contact_id_fkey(name)",
					)
					.eq("id", evId)
					.maybeSingle()
			: Promise.resolve({ data: null }),
		r.booking_inbox_id && !evId
			? supabase
					.from("booking_inbox")
					.select("client_name")
					.eq("id", r.booking_inbox_id)
					.maybeSingle()
			: Promise.resolve({ data: null }),
	]);
	const booker = ev
		? ((Array.isArray(ev.booker_contact)
				? ev.booker_contact[0]
				: ev.booker_contact) as { name?: string | null } | null)
		: null;
	// Nama di bukti sering tidak tertera (BCA mobile/m-Transfer) → tawarkan
	// nama klien & pemesan; Rama tetap yang memilih sesuai mutasi.
	const saran = [
		ev?.client_name as string | undefined,
		booker?.name ?? undefined,
		ib?.client_name as string | undefined,
		r.nama_klien ?? undefined,
	]
		.map((x) => x?.trim())
		.filter((x): x is string => Boolean(x));
	return {
		jenis: tagihan
			? JENIS_BAYAR_LABEL[jenisBayar({ ...tagihan, nominal: r.nominal })]
			: null,
		sisa:
			tagihan && r.nominal
				? {
						sebelum: tagihan.sisa,
						// Negatif = lebih bayar (ditahan saat Konfirmasi) — tampil "lebih".
						sesudah: tagihan.sisa - r.nominal,
					}
				: null,
		event: ev
			? {
					id: evId as string,
					label: `${ev.client_name} · ${tglPanjang(ev.event_date as string)} · ${ev.project_id}`,
				}
			: null,
		saranPengirim: r.nama_pengirim ? [] : [...new Set(saran)],
	};
}
