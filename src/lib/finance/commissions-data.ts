import "server-only";

import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Data komisi untuk hub /finance/vendors (Komisi). Satu baris per komisi
 * (vendor atau relasi) yang menempel di sebuah event, plus statusnya:
 *
 *   - "upfront"      → vendor Potongan Langsung: komisi sudah dipotong di muka,
 *                      bukan uang keluar. Tidak perlu dibayar.
 *   - "not_settled"  → event belum di-settle → utang komisi belum ter-akrual.
 *                      Tetap BOLEH dibayar sebagai uang muka (Dr 1-310).
 *   - "advance"      → sudah dibayar di muka, event belum di-settle. Saat settle
 *                      nanti uang mukanya otomatis dipakai (tidak jadi utang).
 *   - "payable"      → sudah ter-akrual (Cr 2-103/2-102), belum dibayar → Bayar.
 *   - "paid"         → sudah dibayar & event sudah ter-settle di buku sekarang.
 *
 * Status settlement mengikuti aturan yang sama dgn bayar fee crew: event
 * status=completed, punya settlement, closed_at >= finance cutoff, belum
 * di-reopen. (Lihat payCrewFee / payCommission.)
 */

export type CommissionStatus =
	| "upfront"
	| "not_settled"
	| "advance"
	| "payable"
	| "paid";

export type CommissionRow = {
	eventId: string;
	projectId: string;
	clientName: string;
	eventDate: string | null;
	channel: string;
	kind: "vendor" | "relasi" | "sales";
	vendorMode: string | null;
	payeeName: string;
	payeeContact: string | null;
	amount: number;
	status: CommissionStatus;
	payout: {
		id: string;
		paymentDate: string;
		bankName: string | null;
		proofUrl: string | null;
		/** Dibayar sebelum event di-settle (aset 1-310, bukan pelunasan utang). */
		isAdvance: boolean;
		/** Nominal yang benar-benar dibayar — bisa beda kalau komisi diubah. */
		paidAmount: number;
	} | null;
};

export type CommissionsOverview = {
	rows: CommissionRow[];
	totals: {
		payableCount: number;
		payableAmount: number;
		paidAmount: number;
		notSettledAmount: number;
		/** Sudah dibayar di muka, menunggu event di-settle (saldo 1-310). */
		advanceAmount: number;
	};
};

export async function getCommissionsOverview(
	supabase: ServerSupabase,
): Promise<CommissionsOverview> {
	const [{ data: cutoffCfg }, { data: events }] = await Promise.all([
		supabase
			.from("system_config")
			.select("value")
			.eq("key", "finance_cutoff_date")
			.maybeSingle(),
		supabase
			.from("events")
			.select(
				`id, project_id, client_name, event_date, channel, status,
				vendor_name, vendor_commission_mode, vendor_commission_amount, vendor_contact,
				referrer_user_id, referrer_commission,
				sales_user_id, direct_sales_commission`,
			)
			.is("deleted_at", null)
			.or(
				"vendor_commission_amount.gt.0,referrer_commission.gt.0,direct_sales_commission.gt.0",
			)
			.order("event_date", { ascending: false }),
	]);

	const cutoff =
		typeof cutoffCfg?.value === "string" && cutoffCfg.value.length > 0
			? cutoffCfg.value
			: null;

	const eventIds = (events ?? []).map((e) => e.id as string);
	if (eventIds.length === 0) {
		return {
			rows: [],
			totals: {
				payableCount: 0,
				payableAmount: 0,
				paidAmount: 0,
				notSettledAmount: 0,
				advanceAmount: 0,
			},
		};
	}

	const [{ data: settlements }, { data: payouts }, { data: referrers }] =
		await Promise.all([
			supabase
				.from("event_settlements")
				.select("event_id, closed_at, is_reopened")
				.in("event_id", eventIds),
			supabase
				.from("commission_payouts")
				.select(
					"id, event_id, kind, payment_date, is_reversed, is_advance, amount, proof_url, bank_account:bank_accounts(bank_name, account_name)",
				)
				.in("event_id", eventIds)
				.eq("is_reversed", false),
			supabase
				.from("users")
				.select("id, full_name")
				.in(
					"id",
					Array.from(
						new Set(
							(events ?? [])
								.flatMap((e) => [
									e.referrer_user_id as string | null,
									e.sales_user_id as string | null,
								])
								.filter((v): v is string => !!v),
						),
					),
				),
		]);

	const settledInBooks = new Map<string, boolean>();
	for (const s of settlements ?? []) {
		const closedDay =
			typeof s.closed_at === "string" ? s.closed_at.slice(0, 10) : null;
		const ok =
			!!closedDay && !s.is_reopened && (!cutoff || closedDay >= cutoff);
		settledInBooks.set(s.event_id as string, ok);
	}
	type PayoutRow = NonNullable<typeof payouts>[number];
	const payoutByKey = new Map<string, PayoutRow>();
	for (const p of payouts ?? []) {
		payoutByKey.set(`${p.event_id}:${p.kind}`, p);
	}
	const referrerName = new Map(
		(referrers ?? []).map((u) => [u.id as string, u.full_name as string]),
	);

	const rows: CommissionRow[] = [];
	for (const e of events ?? []) {
		const eventId = e.id as string;
		const base = {
			eventId,
			projectId: e.project_id as string,
			clientName: (e.client_name as string) ?? "—",
			eventDate: (e.event_date as string | null) ?? null,
			channel: e.channel as string,
		};

		const pushRow = (
			kind: "vendor" | "relasi" | "sales",
			amount: number,
			payeeName: string,
			payeeContact: string | null,
			vendorMode: string | null,
		) => {
			const payout = payoutByKey.get(`${eventId}:${kind}`) ?? null;
			const bank = payout?.bank_account as
				| { bank_name?: string; account_name?: string }
				| { bank_name?: string; account_name?: string }[]
				| null
				| undefined;
			const bankObj = Array.isArray(bank) ? bank[0] : bank;
			const settled = settledInBooks.get(eventId) === true;
			let status: CommissionStatus;
			if (kind === "vendor" && vendorMode === "upfront_cut") {
				status = "upfront";
			} else if (payout) {
				// Uang muka baru "selesai" setelah settlement memakainya.
				status = payout.is_advance && !settled ? "advance" : "paid";
			} else if (settled) {
				status = "payable";
			} else {
				status = "not_settled";
			}
			rows.push({
				...base,
				kind,
				vendorMode,
				payeeName,
				payeeContact,
				amount,
				status,
				payout: payout
					? {
							id: payout.id as string,
							paymentDate: payout.payment_date as string,
							bankName: bankObj?.bank_name ?? bankObj?.account_name ?? null,
							proofUrl: (payout.proof_url as string | null) ?? null,
							isAdvance: payout.is_advance === true,
							paidAmount: Number(payout.amount ?? 0),
						}
					: null,
			});
		};

		const vendAmount = Number(e.vendor_commission_amount ?? 0);
		if (e.channel === "vendor" && vendAmount > 0) {
			pushRow(
				"vendor",
				vendAmount,
				(e.vendor_name as string) ?? "Vendor",
				(e.vendor_contact as string | null) ?? null,
				(e.vendor_commission_mode as string | null) ?? null,
			);
		}
		const relAmount = Number(e.referrer_commission ?? 0);
		if (e.channel === "relasi" && relAmount > 0) {
			pushRow(
				"relasi",
				relAmount,
				referrerName.get(e.referrer_user_id as string) ?? "Relasi",
				null,
				null,
			);
		}
		const salesAmount = Number(e.direct_sales_commission ?? 0);
		if (e.channel === "direct" && salesAmount > 0) {
			pushRow(
				"sales",
				salesAmount,
				referrerName.get(e.sales_user_id as string) ?? "Sales Tetra",
				null,
				null,
			);
		}
	}

	const totals = rows.reduce(
		(acc, r) => {
			if (r.status === "payable") {
				acc.payableCount += 1;
				acc.payableAmount += r.amount;
			} else if (r.status === "paid") {
				acc.paidAmount += r.payout?.paidAmount ?? r.amount;
			} else if (r.status === "advance") {
				acc.advanceAmount += r.payout?.paidAmount ?? r.amount;
			} else if (r.status === "not_settled") {
				acc.notSettledAmount += r.amount;
			}
			return acc;
		},
		{
			payableCount: 0,
			payableAmount: 0,
			paidAmount: 0,
			notSettledAmount: 0,
			advanceAmount: 0,
		},
	);

	return { rows, totals };
}
