/**
 * Daftar biaya lapangan dari satu rekap — satu sumber untuk halaman rekap owner
 * dan sinkronisasi hutang ke owner (biaya 'owner:<id>' → antrean settle), supaya
 * label, kategori Catat, keterangan, dan nota yang dipakai selalu identik.
 * Modul murni (tanpa Supabase).
 */
import {
	normalizePayer,
	ownerIdOfPayer,
	paidFromAccountId,
} from "@/lib/finance/emoney";
import { REKAP_EXPENSE_CATEGORY } from "@/lib/finance/quick-record-categories";

export type RekapExpenseSource = {
	transport_cost?: number | string | null;
	transport_method?: string | null;
	transport_proof_berangkat_url?: string | null;
	bensin_cost?: number | string | null;
	toll_cost?: number | string | null;
	parking_cost?: number | string | null;
	konsumsi_cost?: number | string | null;
	lainnya_items?: unknown;
	expense_paid_by?: unknown;
	expense_nota_urls?: unknown;
};

export type RekapExpenseItem = {
	/** Kunci koreksi: transport/bensin/toll/parking/konsumsi/lainnya:<i>. */
	key: string;
	label: string;
	amount: number;
	/** Nilai pembayar ternormalisasi (lihat normalizePayer). */
	rawPayer: string;
	/** Kunci REKAP_EXPENSE_CATEGORY → kategori Catat. */
	catatKey: string;
	notaUrl: string | null;
};

/** Biaya > 0 saja, urutan tetap. */
export function rekapExpenseItems(r: RekapExpenseSource): RekapExpenseItem[] {
	const pb = (
		r.expense_paid_by && typeof r.expense_paid_by === "object"
			? r.expense_paid_by
			: {}
	) as Record<string, unknown>;
	const nota = (
		r.expense_nota_urls && typeof r.expense_nota_urls === "object"
			? r.expense_nota_urls
			: {}
	) as Record<string, string | undefined>;
	const out: RekapExpenseItem[] = [];
	const push = (
		key: string,
		label: string,
		amount: unknown,
		payer: unknown,
		catatKey: string,
		notaUrl: string | null | undefined,
	) => {
		const n = Number(amount ?? 0) || 0;
		if (n <= 0) return;
		out.push({
			key,
			label,
			amount: n,
			rawPayer: normalizePayer(payer),
			catatKey,
			notaUrl: notaUrl ?? null,
		});
	};
	push(
		"transport",
		"Transport",
		r.transport_cost,
		pb.transport,
		r.transport_method === "rental" ? "transport_rental" : "transport_online",
		nota.transport ?? r.transport_proof_berangkat_url,
	);
	push("bensin", "Bensin", r.bensin_cost, pb.bensin, "bensin", nota.bensin);
	push("toll", "Toll", r.toll_cost, pb.toll, "toll", nota.toll);
	push(
		"parking",
		"Parkir",
		r.parking_cost,
		pb.parking,
		"parking",
		nota.parking,
	);
	push(
		"konsumsi",
		"Konsumsi",
		r.konsumsi_cost,
		pb.konsumsi,
		"konsumsi",
		nota.konsumsi,
	);
	if (Array.isArray(r.lainnya_items))
		for (const [i, raw] of r.lainnya_items.entries()) {
			const it = (raw ?? {}) as Record<string, unknown>;
			push(
				`lainnya:${i}`,
				(it.note as string) || "Lain-lain",
				it.amount,
				it.paid_by,
				"misc",
				it.nota_url as string | null | undefined,
			);
		}
	return out;
}

/** Isian Catat untuk satu biaya (kategori, keterangan "<label> — <klien>", nota). */
export function catatPrefill(it: RekapExpenseItem, clientName: string) {
	return {
		categoryId: REKAP_EXPENSE_CATEGORY[it.catatKey] ?? "operasional-lain",
		amount: Math.round(it.amount),
		note: `${it.label} — ${clientName}`.slice(0, 300),
		// Nota yang sudah di-upload crew ikut menempel ke jurnalnya.
		proofUrl: it.notaUrl,
	};
}

/**
 * Label "dibayar pakai uang siapa" untuk satu nilai pembayar — dipakai
 * ringkasan rekap crew supaya bahasanya sama dengan pemilih di form.
 */
export function labelPembayar(
	raw: string,
	nama: (userId: string) => string | undefined,
	kartu: (accountId: string) => string | undefined,
	/** Pemegang uang jalan (lihat pemegangUangJalan) atau null. */
	ujHolder: string | null,
): string {
	const owner = ownerIdOfPayer(raw);
	if (owner) return `Ditransfer / dibayar ${nama(owner) ?? "owner"} (owner)`;
	const acct = paidFromAccountId(raw);
	if (acct) return `Kartu ${kartu(acct) ?? "perusahaan"}`;
	if (raw === "owner") return "Owner (belum jelas siapa)";
	const crew = raw === "crew" ? ujHolder : raw;
	if (!crew) return "Belum dipilih";
	return crew === ujHolder
		? `💵 Uang jalan dari owner (dipegang ${nama(crew) ?? "crew"})`
		: `Uang pribadi ${nama(crew) ?? "crew"}`;
}
