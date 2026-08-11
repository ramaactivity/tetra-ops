import {
	Boxes,
	Camera,
	CheckSquare,
	FileText,
	History,
	Lock,
	Pencil,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { AddonSplitForm } from "@/components/rekap/addon-split-form";
import { RekapApprovalPreview } from "@/components/rekap/approval-preview";
import type { CrewAssignmentRow } from "@/components/rekap/crew-fee-form";
import { CrewFeeForm } from "@/components/rekap/crew-fee-form";
import { CrewInputSummary } from "@/components/rekap/crew-input-summary";
import {
	EventExtraTransactions,
	type ExtraTxnRow,
	type OwnerPaidPending,
} from "@/components/rekap/event-extra-transactions";
import { ProfitPreviewCard } from "@/components/rekap/profit-preview-card";
import { RekapAuditTab } from "@/components/rekap/rekap-audit-tab";
import { RekapForm } from "@/components/rekap/rekap-form";
import { RekapHeroCard } from "@/components/rekap/rekap-hero-card";
import { RekapProofGallery } from "@/components/rekap/rekap-proof-gallery";
import { RekapSummaryTab } from "@/components/rekap/rekap-summary-tab";
import { RekapCard, SectionHeader } from "@/components/rekap/rekap-ui";
import { RekapReviewButtons } from "@/components/rekap/review-buttons";
import {
	SalesCommissionCard,
	type SalesCommissionState,
} from "@/components/rekap/sales-commission-card";
import { SettleButton } from "@/components/rekap/settle-button";
import { SettledBanner } from "@/components/rekap/settled-banner";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProfitPreview } from "@/lib/actions/profit-preview";
import {
	getRekapApprovalPreview,
	getRekapContext,
	previewRekapHpp,
} from "@/lib/actions/rekap";
import { getCurrentUser } from "@/lib/auth/get-user";
import { fetchSalesCandidates } from "@/lib/events/booking-candidates";
import { isCashOrBank } from "@/lib/finance/accounting";
import { getCashAccountBalance } from "@/lib/finance/balance-guard";
import { REKAP_EXPENSE_CATEGORY } from "@/lib/finance/quick-record-categories";
import { createClient } from "@/lib/supabase/server";

type RekapRow = {
	id: string;
	cetak_total: number;
	media_set_used: number;
	sleeve_used: number;
	flashdisk_used: number;
	pouch_used: number;
	photomagnet_used: number;
	keychain_used: number;
	photomagnet_paid: number;
	photomagnet_bonus: number;
	keychain_paid: number;
	keychain_bonus: number;
	custom_materials: Record<string, number> | null;
	proof_photo_urls: string[];
	crew_notes: string | null;
	is_approved: boolean | null;
	reviewed_at: string | null;
	review_notes: string | null;
	stock_committed_at: string | null;
	stock_movement_batch_id: string | null;
	hpp_snapshot_total: number | null;
	created_at: string;
	status: "draft" | "submitted" | "reviewed" | "rejected" | "settled";
	locked: boolean | null;
	transport_method: "online" | "rental" | "none" | null;
	transport_cost: number | string | null;
	transport_proof_berangkat_url: string | null;
	transport_proof_pulang_url: string | null;
	bensin_cost: number | string | null;
	toll_cost: number | string | null;
	parking_cost: number | string | null;
	konsumsi_cost: number | string | null;
	lainnya_items: Array<{
		note: string;
		amount: number;
		// "owner" | users.id penalang | "crew" (belum ditentukan) — lihat
		// ExpensePaidBy di lib/actions/rekap.ts.
		paid_by?: string;
	}> | null;
	expense_paid_by: Record<string, string> | null;
	expense_nota_urls: Record<string, string> | null;
	submitted_by: string | null;
	submitted_by_user: { full_name: string } | null;
	reviewer: { full_name: string } | null;
};

type AssignmentJoin = {
	id: string;
	user_id: string | null;
	role_in_event: "lead" | "asisten" | "crew_c";
	fee_amount: number | null;
	bonus_amount: number | null;
	reimbursement_amount: number | null;
	payment_notes: string | null;
	payment_proof_url: string | null;
	is_paid: boolean | null;
	paid_via_account: string | null;
	paid_at: string | null;
	user: { full_name: string } | { full_name: string }[] | null;
};

export default async function EventRekapPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;

	const me = await getCurrentUser();
	if (!me) redirect("/login");
	const isOwnerLevel =
		me.profile.role === "super_admin" || me.profile.role === "owner";
	if (!isOwnerLevel) redirect("/login");
	const isSuperAdmin = me.profile.role === "super_admin";

	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select(
			`id, project_id, client_name, event_date, venue_name, status, grand_total,
			channel, vendor_name, vendor_commission_mode, vendor_commission_amount,
			referrer_user_id, referrer_commission,
			sales_user_id, direct_sales_commission`,
		)
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	const [{ data: rekapData }, { data: assignments }, { data: settlement }] =
		await Promise.all([
			supabase
				.from("crew_rekap")
				.select(
					`id, cetak_total, media_set_used, sleeve_used,
					flashdisk_used, pouch_used, photomagnet_used, keychain_used,
					photomagnet_paid, photomagnet_bonus, keychain_paid, keychain_bonus,
					custom_materials, status, locked,
					proof_photo_urls, crew_notes, is_approved, reviewed_at, review_notes,
					stock_committed_at, stock_movement_batch_id, hpp_snapshot_total, created_at,
					transport_method, transport_cost,
					transport_proof_berangkat_url, transport_proof_pulang_url,
					bensin_cost, toll_cost, parking_cost, konsumsi_cost, lainnya_items,
					expense_paid_by, expense_nota_urls, submitted_by,
					submitted_by_user:users!crew_rekap_submitted_by_fkey(full_name),
					reviewer:users!crew_rekap_reviewed_by_fkey(full_name)`,
				)
				.eq("event_id", event.id)
				.maybeSingle(),
			supabase
				.from("crew_assignments")
				.select(
					`id, user_id, role_in_event, fee_amount, bonus_amount, reimbursement_amount,
					payment_notes, payment_proof_url, is_paid, paid_via_account, paid_at,
					user:users!crew_assignments_user_id_fkey(full_name)`,
				)
				.eq("event_id", event.id),
			supabase
				.from("event_settlements")
				.select(
					`id, journal_entry_id, closed_at, is_reopened, reopen_reason,
					net_profit, closed_by_user:users!event_settlements_closed_by_fkey(full_name)`,
				)
				.eq("event_id", event.id)
				.maybeSingle(),
		]);

	const context = await getRekapContext(event.id as string);
	if ("error" in context) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
					<p className="text-sm font-medium text-foreground">
						Gagal load konteks rekap: {context.error}
					</p>
				</div>
			</Container>
		);
	}

	const rekap = rekapData
		? ({
				...rekapData,
				submitted_by_user: Array.isArray(rekapData.submitted_by_user)
					? rekapData.submitted_by_user[0]
					: rekapData.submitted_by_user,
				reviewer: Array.isArray(rekapData.reviewer)
					? rekapData.reviewer[0]
					: rekapData.reviewer,
			} as RekapRow)
		: null;

	const isSettled = event.status === "completed";
	// Approved iff is_approved is actually true (or already settled). Don't trust
	// status==='reviewed' alone: reopen_settlement sets is_approved=false but
	// leaves status='reviewed', so a reopened+uncommitted rekap must NOT read as
	// approved (it needs re-approval before settle).
	const recapApproved =
		rekap?.is_approved === true || rekap?.status === "settled";
	const recapLocked = rekap?.locked === true || isSettled;

	const settlementClosedBy = settlement?.closed_by_user
		? Array.isArray(settlement.closed_by_user)
			? settlement.closed_by_user[0]?.full_name
			: (settlement.closed_by_user as { full_name: string }).full_name
		: null;

	// Fee crew cuma boleh dibayar kalau event benar-benar ter-akrual ke 2-100
	// Hutang Crew di buku SEKARANG: punya settlement, closed_at >= finance cutoff,
	// dan belum di-reopen. Event lama yang ditutup pre-cutoff (frozen, tanpa
	// posting buku) tidak boleh — kalau dibayar, 2-100 jadi minus. payCrewFee juga
	// menolak server-side (defense in depth); ini menyembunyikan tombol Bayar-nya.
	const { data: cutoffCfg } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", "finance_cutoff_date")
		.maybeSingle();
	const financeCutoff =
		typeof cutoffCfg?.value === "string" && cutoffCfg.value.length > 0
			? cutoffCfg.value
			: null;
	const settlementClosedDay =
		typeof settlement?.closed_at === "string"
			? settlement.closed_at.slice(0, 10)
			: null;
	const crewPayable = Boolean(
		settlementClosedDay &&
			!settlement?.is_reopened &&
			(!financeCutoff || settlementClosedDay >= financeCutoff),
	);

	// Profit preview only fetched if rekap exists (avoid empty RPC calls)
	const profitPreviewResult = rekap?.id
		? await getProfitPreview(event.id as string)
		: null;
	const profitPreview =
		profitPreviewResult && profitPreviewResult.ok
			? profitPreviewResult.data
			: null;

	// Crew fee rows — normalize joined user
	const crewFeeRows: CrewAssignmentRow[] = (assignments ?? []).map((a) => {
		const aj = a as unknown as AssignmentJoin;
		const u = Array.isArray(aj.user) ? aj.user[0] : aj.user;
		return {
			assignment_id: aj.id,
			user_id: aj.user_id ?? null,
			user_full_name: u?.full_name ?? "—",
			role_in_event: aj.role_in_event,
			fee_amount: Number(aj.fee_amount ?? 0),
			bonus_amount: Number(aj.bonus_amount ?? 0),
			reimbursement_amount: Number(aj.reimbursement_amount ?? 0),
			payment_notes: aj.payment_notes ?? null,
			payment_proof_url: aj.payment_proof_url ?? null,
			is_paid: Boolean(aj.is_paid),
			paid_via_account: aj.paid_via_account ?? null,
			paid_at: aj.paid_at ?? null,
		};
	});

	// Cash/bank accounts (1-1xx aktif) + saldo live, untuk tombol bayar fee crew
	// post-settle — saldo dipakai men-disable rekening yang uangnya tidak cukup.
	const { data: cashCoa } = await supabase
		.from("chart_of_accounts")
		.select("code, name, account_type, is_active")
		.eq("is_active", true)
		.order("code");
	const cashAccounts = await Promise.all(
		(cashCoa ?? [])
			.filter((c) => isCashOrBank(c.code as string, c.account_type as string))
			.map(async (c) => ({
				code: c.code as string,
				name: c.name as string,
				balance: await getCashAccountBalance(supabase, c.code as string),
			})),
	);

	// Pemasukan/pengeluaran lain yang sudah dicatat untuk event ini (jalur Catat
	// transaksi, source_type='manual'). Jurnal yang sudah dibalik disembunyikan —
	// uangnya sudah kembali, jadi bukan lagi biaya/pemasukan event ini.
	const { data: extraTxns } = await supabase
		.from("journal_entries")
		.select(
			"id, ref_id, entry_date, description, entry_type, total_amount, proof_url, is_reversed",
		)
		.eq("source_event_id", event.id)
		.eq("source_type", "manual")
		.eq("is_reversed", false)
		.order("entry_date", { ascending: false });
	const extraTxnRows: ExtraTxnRow[] = (extraTxns ?? []).map((t) => ({
		id: t.id as string,
		refId: t.ref_id as string,
		entryDate: (t.entry_date as string) ?? "",
		description: (t.description as string) ?? "Transaksi",
		amount: Number(t.total_amount ?? 0),
		// expense = uang keluar; revenue/adjustment = uang masuk (lihat
		// recordQuickTransaction: reimbursement & setoran modal ditag adjustment).
		isOut: t.entry_type === "expense",
		proofUrl: (t.proof_url as string | null) ?? null,
	}));

	// Komisi yang menempel di event ini — untuk opsi "sekalian bayar komisi" di
	// dialog settle (biar owner tidak perlu mampir ke Finance › Komisi). Vendor
	// "Potongan Langsung" dilewati: komisinya sudah dipotong dari aliran uang.
	// Kalau sudah ada pembayaran aktif sebelum settle, itu pasti uang muka →
	// tidak perlu ditawari bayar lagi, cukup diberitahu.
	let commissionInfo: {
		payeeName: string;
		amount: number;
		paidInAdvance: boolean;
	} | null = null;

	// Satu query untuk semua payout komisi aktif event ini — dipisah per kind.
	// (Dulu .maybeSingle() tanpa filter kind: begitu satu event punya 2 komisi,
	// query-nya error & statusnya salah baca.)
	const { data: activePayouts } = await supabase
		.from("commission_payouts")
		.select("kind, amount, payment_date, proof_url, is_advance")
		.eq("event_id", event.id)
		.eq("is_reversed", false);
	const payoutByKind = new Map(
		(activePayouts ?? []).map((p) => [p.kind as string, p]),
	);

	if (!isSettled) {
		const channel = event.channel as string | null;
		let amount = 0;
		let payeeName = "";
		let payeeUserId: string | null = null;
		if (
			channel === "vendor" &&
			event.vendor_commission_mode !== "upfront_cut"
		) {
			amount = Number(event.vendor_commission_amount ?? 0);
			payeeName = (event.vendor_name as string) ?? "Vendor";
		} else if (channel === "relasi") {
			amount = Number(event.referrer_commission ?? 0);
			payeeUserId = (event.referrer_user_id as string | null) ?? null;
			payeeName = "Relasi";
		}
		if (amount > 0) {
			if (payeeUserId) {
				const { data: payee } = await supabase
					.from("users")
					.select("full_name")
					.eq("id", payeeUserId)
					.maybeSingle();
				payeeName = (payee?.full_name as string) ?? payeeName;
			}
			commissionInfo = {
				payeeName,
				amount,
				paidInAdvance: payoutByKind.has(
					channel === "vendor" ? "vendor" : "relasi",
				),
			};
		}
	}

	// Komisi sales Tetra — kartunya sendiri di halaman ini (bukan di dialog
	// settle). Berlaku di semua channel: event vendor pun sales/admin yang
	// closing tetap dapat komisi, terpisah dari komisi mitra.
	const salesUserId = (event.sales_user_id as string | null) ?? null;
	const [{ data: salesPayee }, teamUsers] = await Promise.all([
		salesUserId
			? supabase
					.from("users")
					.select("full_name, nickname")
					.eq("id", salesUserId)
					.maybeSingle()
			: Promise.resolve({ data: null }),
		// Urut dari yang paling sering closing, bukan abjad — sama dengan
		// picker di form booking.
		fetchSalesCandidates(supabase),
	]);
	const salesCandidates = teamUsers.map((u) => ({
		id: u.id,
		name: u.nickname?.trim() || u.full_name || "Tanpa nama",
		role: u.role,
	}));
	const salesPayout = payoutByKind.get("sales");
	const salesCommissionState: SalesCommissionState = {
		userId: salesUserId,
		payeeName:
			(salesPayee?.nickname as string | null)?.trim() ||
			(salesPayee?.full_name as string | null) ||
			null,
		amount: Number(event.direct_sales_commission ?? 0),
		isPaid: Boolean(salesPayout),
		paidAmount: Number(salesPayout?.amount ?? 0),
		paidDate: (salesPayout?.payment_date as string | null) ?? null,
		proofUrl: (salesPayout?.proof_url as string | null) ?? null,
		isAdvance: salesPayout?.is_advance === true,
	};

	const proofCount = rekap?.proof_photo_urls?.length ?? 0;

	// Estimasi HPP — use the CANONICAL number so the hero matches the committed
	// snapshot and the settlement exactly. Prefer the frozen hpp_snapshot_total
	// (once approved); before approval fall back to previewRekapHpp, which runs
	// the same planRekapDeduction engine the approval/settle use. (The old
	// mapping-based computeRekapCost diverged from the canonical planner.)
	let hppTotal = 0;
	if (rekap) {
		if (rekap.hpp_snapshot_total != null) {
			hppTotal = Number(rekap.hpp_snapshot_total);
		} else {
			const hpp = await previewRekapHpp(event.id as string);
			hppTotal = hpp?.total ?? 0;
		}
	}

	// Canonical consumption lines — the SAME array the "Stok" tab + settlement
	// use (planRekapDeduction). Feeds the "Ringkasan" tab so both tabs show
	// identical qty + HPP (incl. assembly-bundled pouch/box). Was previously
	// computed from the divergent field-based computeRekapCost.
	const rekapPreview = rekap
		? await getRekapApprovalPreview(rekap.id as string)
		: null;
	const rekapLines = rekapPreview?.ok ? rekapPreview.lines : [];

	// Field expense breakdown — ditampilkan sebagai INFO di Fee crew form,
	// DIPILAH per pembayar (flag dari form rekap): talangan crew = perlu
	// di-rembers via kolom Reimburse; dibayar owner = uang perusahaan sudah
	// keluar, TIDAK ikut Hutang Crew di settlement (owner catat via Catat
	// transaksi). Owner attribute reimburse manual ke crew yang benar-benar
	// bayar (mis. transport dibayar Lead, konsumsi dibayar Asisten).
	let fieldExpenseBreakdown:
		| {
				total: number;
				crewFrontedTotal: number;
				ownerPaidTotal: number;
				items: Array<{
					label: string;
					amount: number;
					paidBy: "crew" | "owner";
					/** users.id penalang — null kalau crew tapi belum ditentukan siapa. */
					payerUserId: string | null;
					payerName: string | null;
					/** Prefill kartu "Pemasukan / pengeluaran lain" — item dibayar owner. */
					catatPrefill?: {
						categoryId: string;
						amount: number;
						note: string;
						proofUrl: string | null;
					};
					/** Sudah pernah dicatat ke pembukuan (jurnal dgn keterangan sama). */
					catatRecorded?: boolean;
				}>;
				/** Total talangan per crew (users.id) — dasar auto-isi reimbursement. */
				byCrew: Record<string, number>;
				/** Talangan crew yang belum ditentukan penalangnya (data lama). */
				unattributedTotal: number;
		  }
		| undefined;
	if (rekap) {
		const pb = rekap.expense_paid_by ?? {};
		// Nilai bisa: "owner" | users.id penalang | "crew" (belum ditentukan).
		const rawPayerOf = (key: string): string =>
			typeof pb[key] === "string" && pb[key] ? (pb[key] as string) : "crew";
		const crewNameById = new Map(
			context.crew.map((c) => [c.user_id, c.name] as const),
		);
		const items: Array<{
			label: string;
			amount: number;
			paidBy: "crew" | "owner";
			payerUserId: string | null;
			payerName: string | null;
			catatPrefill?: {
				categoryId: string;
				amount: number;
				note: string;
				proofUrl: string | null;
			};
			catatRecorded?: boolean;
		}> = [];
		// Biaya yang dibayar owner TIDAK masuk OpEx settlement (by design), jadi
		// harus dibukukan lewat Catat transaksi. Prefill ini mengisi kartu
		// "Pemasukan / pengeluaran lain" di halaman yang sama — dulu deep-link ke
		// /finance, yang berarti owner keluar dari halaman rekap di tengah proses.
		const recordedNotes = new Set(
			extraTxnRows
				.filter((r) => r.isOut)
				.map((r) => r.description.trim().toLowerCase()),
		);
		const catatPrefillFor = (
			catatKey: string,
			amount: number,
			label: string,
			notaUrl: string | null,
		) => ({
			categoryId: REKAP_EXPENSE_CATEGORY[catatKey] ?? "operasional-lain",
			amount: Math.round(amount),
			note: `${label} — ${event.client_name}`.slice(0, 300),
			// Nota yang sudah di-upload crew ikut menempel ke jurnalnya — owner
			// tidak perlu meng-upload ulang bukti yang sudah ada.
			proofUrl: notaUrl,
		});
		const notaMap = (rekap.expense_nota_urls ?? {}) as Record<string, string>;
		const push = (
			label: string,
			amount: number,
			rawPayer: string,
			catatKey: string,
			notaUrl: string | null = null,
		) => {
			if (amount <= 0) return;
			const paidBy: "crew" | "owner" = rawPayer === "owner" ? "owner" : "crew";
			// "crew" = ditalangi tapi belum ditentukan siapa (data lama); selain itu
			// nilainya users.id penalang.
			const payerUserId =
				paidBy === "crew" && rawPayer !== "crew" ? rawPayer : null;
			items.push({
				label,
				amount,
				paidBy,
				payerUserId,
				payerName: payerUserId ? (crewNameById.get(payerUserId) ?? null) : null,
				catatPrefill:
					paidBy === "owner"
						? catatPrefillFor(catatKey, amount, label, notaUrl)
						: undefined,
				// Keterangannya deterministik, jadi kalau sudah ada transaksi lain
				// dgn keterangan persis sama berarti biaya ini sudah dibukukan —
				// tombolnya diganti penanda supaya tidak dobel catat.
				catatRecorded:
					paidBy === "owner" &&
					recordedNotes.has(
						`${label} — ${event.client_name}`.slice(0, 300).toLowerCase(),
					),
			});
		};
		push(
			"Transport",
			Number(rekap.transport_cost ?? 0),
			rawPayerOf("transport"),
			rekap.transport_method === "rental"
				? "transport_rental"
				: "transport_online",
			notaMap.transport ?? rekap.transport_proof_berangkat_url ?? null,
		);
		push(
			"Bensin",
			Number(rekap.bensin_cost ?? 0),
			rawPayerOf("bensin"),
			"bensin",
			notaMap.bensin ?? null,
		);
		push(
			"Toll",
			Number(rekap.toll_cost ?? 0),
			rawPayerOf("toll"),
			"toll",
			notaMap.toll ?? null,
		);
		push(
			"Parkir",
			Number(rekap.parking_cost ?? 0),
			rawPayerOf("parking"),
			"parking",
			notaMap.parking ?? null,
		);
		push(
			"Konsumsi",
			Number(rekap.konsumsi_cost ?? 0),
			rawPayerOf("konsumsi"),
			"konsumsi",
			notaMap.konsumsi ?? null,
		);
		for (const it of rekap.lainnya_items ?? []) {
			push(
				it.note || "Lain-lain",
				Number(it.amount ?? 0),
				it.paid_by || "crew",
				"misc",
				(it as { nota_url?: string }).nota_url ?? null,
			);
		}
		const total = items.reduce((s, x) => s + x.amount, 0);
		const crewFrontedTotal = items
			.filter((x) => x.paidBy === "crew")
			.reduce((s, x) => s + x.amount, 0);
		// Talangan dikelompokkan per penalang → owner tinggal satu klik untuk
		// mengisi reimbursement tiap crew sesuai yang benar-benar dia bayar.
		const byCrew: Record<string, number> = {};
		let unattributedTotal = 0;
		for (const it of items) {
			if (it.paidBy !== "crew") continue;
			if (it.payerUserId) {
				byCrew[it.payerUserId] = (byCrew[it.payerUserId] ?? 0) + it.amount;
			} else {
				unattributedTotal += it.amount;
			}
		}
		if (total > 0) {
			fieldExpenseBreakdown = {
				total,
				crewFrontedTotal,
				ownerPaidTotal: total - crewFrontedTotal,
				items,
				byCrew,
				unattributedTotal,
			};
		}
	}

	// Settle gating — name exactly what's blocking so the owner doesn't have to
	// scroll back and hunt for it.
	const roleLabel: Record<CrewAssignmentRow["role_in_event"], string> = {
		lead: "Lead",
		asisten: "Asisten",
		crew_c: "Crew",
	};
	const crewMissingFee = crewFeeRows.filter((r) => r.fee_amount <= 0);
	// Biaya dibayar owner yang BELUM dibukukan — bahan tombol "Catat semua" di
	// kartu Pemasukan/pengeluaran lain. Mencatat satu per satu bikin owner malas,
	// dan beban yang tidak pernah dicatat = laba kelihatan lebih besar dari
	// aslinya (biaya ini sengaja tidak ikut Hutang Crew di settlement).
	const ownerPaidPending: OwnerPaidPending[] = (
		fieldExpenseBreakdown?.items ?? []
	)
		.filter(
			(it) => it.paidBy === "owner" && it.catatPrefill && !it.catatRecorded,
		)
		.map((it) => ({
			label: it.label,
			categoryId: it.catatPrefill?.categoryId ?? "operasional-lain",
			amount: it.catatPrefill?.amount ?? it.amount,
			note: it.catatPrefill?.note ?? it.label,
			proofUrl: it.catatPrefill?.proofUrl ?? null,
		}));

	const settleDisabledReason = !rekap
		? "Rekap belum di-submit. Input data rekap dulu."
		: !recapApproved
			? "Approve rekap dulu sebelum settle."
			: proofCount < 1
				? "Minimal 1 foto bukti diperlukan."
				: crewFeeRows.length === 0
					? "Belum ada crew di-assign — assign crew dulu sebelum settle."
					: crewMissingFee.length > 0
						? `Fee belum diisi: ${crewMissingFee
								.map(
									(r) => `${r.user_full_name} (${roleLabel[r.role_in_event]})`,
								)
								.join(", ")}.`
						: undefined;

	const defaults = rekap
		? {
				cetak_total: String(rekap.cetak_total),
				media_set_used: String(rekap.media_set_used),
				sleeve_used: String(rekap.sleeve_used),
				flashdisk_used: String(rekap.flashdisk_used),
				pouch_used: String(rekap.pouch_used),
				photomagnet_used: String(rekap.photomagnet_used),
				keychain_used: String(rekap.keychain_used),
				custom_materials: JSON.stringify(rekap.custom_materials ?? {}),
				proof_photo_urls: (rekap.proof_photo_urls ?? []).join("\n"),
				crew_notes: rekap.crew_notes ?? "",
				transport_method: (rekap.transport_method ?? "none") as
					| "online"
					| "rental"
					| "none",
				transport_cost: String(rekap.transport_cost ?? 0),
				transport_proof_berangkat_url:
					rekap.transport_proof_berangkat_url ?? "",
				transport_proof_pulang_url: rekap.transport_proof_pulang_url ?? "",
				bensin_cost: String(rekap.bensin_cost ?? 0),
				toll_cost: String(rekap.toll_cost ?? 0),
				parking_cost: String(rekap.parking_cost ?? 0),
				konsumsi_cost: String(rekap.konsumsi_cost ?? 0),
				lainnya_items: JSON.stringify(rekap.lainnya_items ?? []),
				expense_paid_by: JSON.stringify(rekap.expense_paid_by ?? {}),
				expense_nota_urls: JSON.stringify(rekap.expense_nota_urls ?? {}),
			}
		: undefined;

	return (
		<Container size="xl" className="space-y-3 pb-32">
			<TopbarEntityPortal name={event.client_name} />
			{isSettled && settlement && (
				<SettledBanner
					eventId={event.id as string}
					projectId={projectId}
					settledAt={settlement.closed_at}
					closedByName={settlementClosedBy}
					netProfit={Number(settlement.net_profit ?? 0)}
					isReopened={Boolean(settlement.is_reopened)}
					journalEntryId={settlement.journal_entry_id ?? null}
					isSuperAdmin={isSuperAdmin}
				/>
			)}

			<RekapHeroCard
				clientName={event.client_name}
				projectId={event.project_id}
				eventDate={event.event_date}
				venueName={event.venue_name}
				pkg={context.pkg}
				isApproved={rekap?.is_approved}
				submitted={Boolean(rekap)}
				hppTotal={hppTotal}
				totalCetak={rekap?.cetak_total ?? 0}
				proofCount={proofCount}
				submittedBy={rekap?.submitted_by_user?.full_name ?? null}
				reviewedBy={rekap?.reviewer?.full_name ?? null}
			/>

			{/* === No rekap yet: owner can input manually === */}
			{!rekap && (
				<>
					<div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-[12.5px] leading-relaxed text-foreground/80 dark:border-amber-900/60 dark:bg-amber-950/20">
						<Pencil
							className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
							aria-hidden
						/>
						<span>
							Crew belum submit rekap. Kamu bisa input data ini secara
							retroaktif di bawah.
						</span>
					</div>
					<RekapForm
						eventId={event.id}
						projectId={projectId}
						defaults={defaults}
						mode="create"
						context={context}
					/>
				</>
			)}

			{/* === Edit recap (owner override) — only if not locked === */}
			{rekap && !recapLocked && (
				<CollapsibleCard
					icon={<Pencil className="size-4" aria-hidden strokeWidth={2} />}
					title="Edit rekap (owner override)"
					subtitle="Koreksi angka rekap manual sebelum di-approve."
				>
					<RekapForm
						eventId={event.id}
						projectId={projectId}
						defaults={defaults}
						mode="update"
						context={context}
					/>
				</CollapsibleCard>
			)}

			{/* === Tabs view (display) === */}
			{rekap && (
				<CrewInputSummary
					rekap={rekap}
					customCount={Object.keys(rekap.custom_materials ?? {}).length}
					submittedBy={rekap.submitted_by_user?.full_name ?? null}
				/>
			)}
			{rekap && (
				<Tabs defaultValue="ringkasan" className="gap-4">
					<TabsList variant="segmented">
						<TabsTrigger value="ringkasan">
							<FileText className="size-3.5" aria-hidden strokeWidth={2} />
							Ringkasan
						</TabsTrigger>
						<TabsTrigger value="stok">
							<Boxes className="size-3.5" aria-hidden strokeWidth={2} />
							Stok
						</TabsTrigger>
						<TabsTrigger value="bukti">
							<Camera className="size-3.5" aria-hidden strokeWidth={2} />
							Bukti ({proofCount})
						</TabsTrigger>
						<TabsTrigger value="audit">
							<History className="size-3.5" aria-hidden strokeWidth={2} />
							Audit
						</TabsTrigger>
					</TabsList>
					<TabsContent value="ringkasan">
						<RekapSummaryTab
							rekap={rekap}
							lines={rekapLines}
							frameSize={context.pkg.frame_size ?? ""}
						/>
						{rekap.crew_notes && (
							<RekapCard className="mt-4 space-y-1.5">
								<p className="eyebrow text-muted-foreground">Catatan crew</p>
								<p className="text-foreground whitespace-pre-wrap text-[13px] leading-relaxed">
									{rekap.crew_notes}
								</p>
							</RekapCard>
						)}
					</TabsContent>
					<TabsContent value="stok">
						<RekapApprovalPreview rekapId={rekap.id} />
					</TabsContent>
					<TabsContent value="bukti">
						<RekapProofGallery urls={rekap.proof_photo_urls ?? []} />
					</TabsContent>
					<TabsContent value="audit">
						<RekapAuditTab
							submittedAt={rekap.created_at}
							submittedBy={rekap.submitted_by_user?.full_name ?? null}
							reviewedAt={rekap.reviewed_at}
							reviewedBy={rekap.reviewer?.full_name ?? null}
							isApproved={rekap.is_approved}
							reviewNotes={rekap.review_notes}
							stockCommittedAt={rekap.stock_committed_at}
							stockMovementBatchId={rekap.stock_movement_batch_id}
						/>
					</TabsContent>
				</Tabs>
			)}

			{/* === Approve/Reject section (review stage, not settled yet) === */}
			{rekap && !recapApproved && !isSettled && (
				<RekapCard className="space-y-4">
					<SectionHeader
						icon={CheckSquare}
						title="Review rekap"
						description="Approve untuk commit deduksi stok ke warehouse, atau reject untuk minta revisi."
					/>
					<RekapReviewButtons
						rekapId={rekap.id}
						projectId={projectId}
						currentApproved={rekap.is_approved}
						stockCommittedAt={rekap.stock_committed_at ?? null}
						cetakTotal={rekap.cetak_total}
						hppTotal={hppTotal}
					/>
				</RekapCard>
			)}

			{/* === Pre-settle workflow: crew fees + addon split + profit preview + settle button === */}
			{rekap && recapApproved && !isSettled && (
				<>
					<CrewFeeForm
						eventId={event.id as string}
						projectId={projectId}
						rows={crewFeeRows}
						fieldExpenseBreakdown={fieldExpenseBreakdown}
						submittedByUserId={rekap.submitted_by ?? null}
						readOnly={recapLocked}
					/>

					<AddonSplitForm
						recapId={rekap.id}
						eventId={event.id as string}
						projectId={projectId}
						photomagnetTotal={rekap.photomagnet_used}
						keychainTotal={rekap.keychain_used}
						photomagnetPaid={rekap.photomagnet_paid}
						photomagnetBonus={rekap.photomagnet_bonus}
						keychainPaid={rekap.keychain_paid}
						keychainBonus={rekap.keychain_bonus}
						readOnly={recapLocked}
					/>

					<SalesCommissionCard
						eventId={event.id as string}
						projectId={projectId}
						state={salesCommissionState}
						candidates={salesCandidates}
						cashAccounts={cashAccounts}
						readOnly={isSettled}
					/>

					<EventExtraTransactions
						eventId={event.id as string}
						projectId={projectId}
						rows={extraTxnRows}
						cashAccounts={cashAccounts}
						ownerPaidPending={ownerPaidPending}
					/>

					{profitPreview && <ProfitPreviewCard preview={profitPreview} />}

					<RekapCard className="space-y-4">
						<SectionHeader
							icon={Lock}
							title="Settle event"
							description="Tutup buku event ini & commit ke ledger. Aksi destruktif — hanya bisa di-undo via Reopen Settlement."
						/>
						{profitPreview ? (
							<SettleButton
								eventId={event.id as string}
								projectId={projectId}
								recapId={rekap.id}
								revenueNet={profitPreview.revenue_net}
								hppTotal={profitPreview.hpp.total}
								opexTotal={profitPreview.opex.total}
								netProfit={profitPreview.net_profit}
								sinkingEstimate={profitPreview.sinking_estimate}
								ownerPoolEstimate={profitPreview.owner_pool_estimate}
								crewTotal={crewFeeRows.reduce(
									(s, r) =>
										s + r.fee_amount + r.bonus_amount + r.reimbursement_amount,
									0,
								)}
								// Pengali biaya admin bank: tiap crew = satu transfer sendiri.
								crewPayCount={
									crewFeeRows.filter(
										(r) =>
											!r.is_paid &&
											r.fee_amount + r.bonus_amount + r.reimbursement_amount >
												0,
									).length
								}
								cashAccounts={cashAccounts}
								commission={commissionInfo}
								salesCommission={
									salesCommissionState.amount > 0
										? {
												payeeName: salesCommissionState.payeeName,
												amount: salesCommissionState.amount,
											}
										: null
								}
								disabled={Boolean(settleDisabledReason)}
								disabledReason={settleDisabledReason}
							/>
						) : (
							<p className="text-[12px] text-muted-foreground">
								Profit preview tidak tersedia (cek error log).
							</p>
						)}
					</RekapCard>
				</>
			)}

			{/* === Post-settle: show profit preview + fee + addon split read-only === */}
			{rekap && isSettled && (
				<>
					<CrewFeeForm
						eventId={event.id as string}
						projectId={projectId}
						rows={crewFeeRows}
						// Sesudah settle, rincian talangan tetap ditampilkan (baca-saja):
						// owner masih perlu tahu siapa menalangi apa untuk audit &
						// memastikan biaya "dibayar owner" sudah dicatat.
						fieldExpenseBreakdown={fieldExpenseBreakdown}
						readOnly
						cashAccounts={cashAccounts}
						allowPayment={crewPayable}
					/>

					<AddonSplitForm
						recapId={rekap.id}
						eventId={event.id as string}
						projectId={projectId}
						photomagnetTotal={rekap.photomagnet_used}
						keychainTotal={rekap.keychain_used}
						photomagnetPaid={rekap.photomagnet_paid}
						photomagnetBonus={rekap.photomagnet_bonus}
						keychainPaid={rekap.keychain_paid}
						keychainBonus={rekap.keychain_bonus}
						readOnly
					/>

					<SalesCommissionCard
						eventId={event.id as string}
						projectId={projectId}
						state={salesCommissionState}
						candidates={salesCandidates}
						cashAccounts={cashAccounts}
						readOnly={isSettled}
					/>

					<EventExtraTransactions
						eventId={event.id as string}
						projectId={projectId}
						rows={extraTxnRows}
						cashAccounts={cashAccounts}
						ownerPaidPending={ownerPaidPending}
					/>

					{profitPreview && <ProfitPreviewCard preview={profitPreview} />}
				</>
			)}
		</Container>
	);
}
