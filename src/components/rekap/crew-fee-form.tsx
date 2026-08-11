"use client";

import {
	CheckCircle2,
	ExternalLink,
	Info,
	Loader2,
	Plus,
	Save,
	Upload,
	Wallet,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import {
	payCrewFee,
	saveCrewFees,
	unpayCrewFee,
} from "@/lib/actions/crew-fees";
import {
	queueCrewFeePayment,
	removeQueuedEntry,
} from "@/lib/actions/settle-queue";
import { formatRupiah } from "@/lib/format";
import { emitCatatPrefill } from "@/lib/rekap/catat-prefill";

export type CrewAssignmentRow = {
	assignment_id: string;
	/** users.id — dipakai mencocokkan siapa yang submit rekap (saran reimburse). */
	user_id?: string | null;
	user_full_name: string;
	role_in_event: "lead" | "asisten" | "crew_c";
	fee_amount: number;
	bonus_amount: number;
	reimbursement_amount: number;
	payment_notes: string | null;
	payment_proof_url: string | null;
	/** Ongkos transfer ke rekening crew ini (beda bank tujuan, beda ongkos). */
	payment_admin_fee: number;
	is_paid: boolean;
	paid_via_account?: string | null;
	paid_at?: string | null;
};

export type CashAccountOption = {
	code: string;
	name: string;
	/** Saldo live (debit−credit). Dipakai disable rekening yang tidak cukup. */
	balance?: number;
};

type Props = {
	eventId: string;
	projectId: string;
	rows: CrewAssignmentRow[];
	fieldExpenseBreakdown?: {
		total: number;
		/** Porsi yang DITALANGI crew — inilah yang perlu di-rembers. */
		crewFrontedTotal: number;
		/** Porsi yang dibayar owner langsung — bukan hutang ke crew. */
		ownerPaidTotal: number;
		items: Array<{
			label: string;
			amount: number;
			paidBy: "crew" | "owner";
			/** users.id penalang — null kalau belum ditentukan siapa. */
			payerUserId: string | null;
			payerName: string | null;
			/** Deep-link Catat transaksi terprefill (item dibayar owner). */
			catatPrefill?: { categoryId: string; amount: number; note: string };
			catatRecorded?: boolean;
		}>;
		/** Total talangan per crew (users.id) — dasar auto-isi reimbursement. */
		byCrew: Record<string, number>;
		/** Talangan crew yang belum ditentukan penalangnya (rekap lama). */
		unattributedTotal: number;
	};
	/**
	 * users.id crew yang submit rekap — dia yang paling mungkin menalangi biaya
	 * lapangan, jadi dipakai untuk saran satu-klik "Isi otomatis ke …".
	 */
	submittedByUserId?: string | null;
	readOnly?: boolean;
	/** Post-settle: enable per-crew "Bayar fee" (posts Dr 2-100 / Cr Bank). */
	allowPayment?: boolean;
	cashAccounts?: CashAccountOption[];
	/** Rencana bayar fee crew yang sudah diantre untuk settle (pre-settle). */
	queuedPayment?: {
		id: string;
		amount: number;
		accountCode: string;
		adminFee: number;
		postError: string | null;
	} | null;
};

const ROLE_LABEL: Record<CrewAssignmentRow["role_in_event"], string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

export function CrewFeeForm({
	eventId,
	projectId,
	rows: initialRows,
	fieldExpenseBreakdown,
	submittedByUserId,
	readOnly = false,
	allowPayment = false,
	cashAccounts = [],
	queuedPayment = null,
}: Props) {
	const router = useRouter();
	const [rows, setRows] = useState<CrewAssignmentRow[]>(initialRows);
	const [pending, startTransition] = useTransition();

	// Post-settle (readOnly): re-sync dari server setelah router.refresh() — mis.
	// status lunas berubah sehabis Bayar. useState(initialRows) tidak auto-update
	// saat prop berubah, jadi tanpa ini banner "belum dibayar" jadi basi. Aman di
	// mode readOnly karena field dikunci (tidak ada edit lokal yang ke-clobber).
	useEffect(() => {
		if (readOnly) setRows(initialRows);
	}, [initialRows, readOnly]);

	// ── Rencana bayar fee crew saat settle ────────────────────────────────────
	// Sama perlakuannya dengan komisi sales: rekening + biaya admin diisi di
	// kartu ini, transfernya baru jalan saat Konfirmasi settle.
	const [planEnabled, setPlanEnabled] = useState(Boolean(queuedPayment));
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [planAccount, setPlanAccount] = useState(
		() =>
			queuedPayment?.accountCode ??
			cashAccounts.find((a) => /bca/i.test(a.name))?.code ??
			cashAccounts.find((a) => /bank/i.test(a.name))?.code ??
			cashAccounts[0]?.code ??
			"",
	);

	const unpaidRows = rows.filter(
		(r) =>
			!r.is_paid && r.fee_amount + r.bonus_amount + r.reimbursement_amount > 0,
	);
	const unpaidTotal = unpaidRows.reduce(
		(s, r) => s + r.fee_amount + r.bonus_amount + r.reimbursement_amount,
		0,
	);
	// Total ongkos transfer = jumlah biaya admin tiap crew yang akan ditransfer
	// (bukan satu angka dikali jumlah crew — tiap bank tujuan beda ongkosnya).
	const planAdminTotal = unpaidRows.reduce(
		(sum, r) => sum + (r.payment_admin_fee ?? 0),
		0,
	);
	const planAcct = cashAccounts.find((a) => a.code === planAccount);
	const planInsufficient =
		planAcct?.balance !== undefined &&
		planAcct.balance < unpaidTotal + planAdminTotal;

	function update(id: string, patch: Partial<CrewAssignmentRow>) {
		setRows((rs) =>
			rs.map((r) => (r.assignment_id === id ? { ...r, ...patch } : r)),
		);
	}

	function applyExpenseToReimbursement(id: string, amount: number) {
		update(id, { reimbursement_amount: amount });
	}

	// Auto-isi reimbursement SESUAI PENALANG: tiap crew menerima persis jumlah
	// yang dia talangi (dipilih per item di form rekap). Yang mengisi rekap
	// belum tentu yang membayar, jadi ini bukan tebakan — datanya eksplisit.
	function applyPayerAttribution() {
		const byCrew = fieldExpenseBreakdown?.byCrew ?? {};
		setRows((rs) =>
			rs.map((r) =>
				r.user_id && byCrew[r.user_id] !== undefined
					? { ...r, reimbursement_amount: byCrew[r.user_id] }
					: r,
			),
		);
	}

	// Ditawarkan saat ada talangan ber-penalang yang belum tersalin ke kolom
	// Reimbursement. Begitu semuanya cocok, tombolnya hilang (tidak ada yang
	// perlu dikerjakan) — dan owner tetap bebas mengoreksi manual.
	const attributionPending =
		!readOnly &&
		Object.keys(fieldExpenseBreakdown?.byCrew ?? {}).length > 0 &&
		rows.some(
			(r) =>
				r.user_id &&
				fieldExpenseBreakdown?.byCrew[r.user_id] !== undefined &&
				r.reimbursement_amount !== fieldExpenseBreakdown.byCrew[r.user_id],
		);

	// Fallback rekap lama (penalang belum ditentukan): saran ke crew yang
	// submit, hanya kalau semua reimburse masih 0.
	const suggestedRow =
		!readOnly &&
		submittedByUserId &&
		(fieldExpenseBreakdown?.unattributedTotal ?? 0) > 0 &&
		rows.every((r) => r.reimbursement_amount === 0)
			? rows.find((r) => r.user_id === submittedByUserId)
			: undefined;

	/**
	 * Satu tombol simpan untuk seluruh kartu: angka fee + rencana bayarnya.
	 * Dulu dua tombol (fee & rencana) — owner harus ingat menekan dua-duanya,
	 * dan tombol fee tidak pernah berubah setelah diklik sehingga tak jelas
	 * apakah sudah tersimpan.
	 */
	// Ada yang belum tersimpan? Dipakai untuk mematikan tombol simpan (dan
	// menunjukkan "Tersimpan") supaya tidak ada klik simpan berulang yang tak
	// jelas efeknya.
	const feesDirty = rows.some((r) => {
		const orig = initialRows.find((o) => o.assignment_id === r.assignment_id);
		if (!orig) return true;
		return (
			orig.fee_amount !== r.fee_amount ||
			orig.bonus_amount !== r.bonus_amount ||
			orig.reimbursement_amount !== r.reimbursement_amount ||
			(orig.payment_notes ?? "") !== (r.payment_notes ?? "") ||
			(orig.payment_proof_url ?? null) !== (r.payment_proof_url ?? null) ||
			orig.payment_admin_fee !== r.payment_admin_fee
		);
	});
	const planDirty =
		planEnabled !== Boolean(queuedPayment) ||
		(planEnabled && planAccount !== (queuedPayment?.accountCode ?? ""));
	const dirty = feesDirty || planDirty;

	function handleSave() {
		startTransition(async () => {
			const result = await saveCrewFees(
				eventId,
				projectId,
				rows.map((r) => ({
					assignment_id: r.assignment_id,
					fee_amount: r.fee_amount,
					bonus_amount: r.bonus_amount,
					reimbursement_amount: r.reimbursement_amount,
					payment_notes: r.payment_notes,
					payment_proof_url: r.payment_proof_url,
					payment_admin_fee: r.payment_admin_fee,
				})),
			);
			if (!result.ok) {
				toast.error(result.error || "Gagal simpan fee crew");
				return;
			}

			// Rencana bayar ikut disimpan/dicabut di aksi yang sama.
			let planMsg = "";
			if (planEnabled && unpaidTotal > 0 && planAccount) {
				const res = await queueCrewFeePayment({
					event_id: eventId,
					project_id: projectId,
					amount: unpaidTotal,
					account_code: planAccount,
					// Ongkosnya per crew (crew_assignments.payment_admin_fee); kolom di
					// antrian dibiarkan 0 supaya tidak ada dua sumber angka.
					admin_fee: 0,
				});
				if (!res.ok) {
					toast.error(res.error);
					return;
				}
				planMsg = " + rencana bayar saat settle";
			} else if (!planEnabled && queuedPayment) {
				const res = await removeQueuedEntry({
					id: queuedPayment.id,
					project_id: projectId,
				});
				if (!res.ok) {
					toast.error(res.error);
					return;
				}
				planMsg = " · rencana bayar dibatalkan";
			}

			setSavedAt(Date.now());
			toast.success(`${result.updated} fee crew disimpan${planMsg}`);
			router.refresh();
		});
	}

	if (rows.length === 0) {
		return (
			<section className="rounded-lg border border-border-default bg-surface-2 p-5">
				<header className="mb-3">
					<h2 className="text-fluid-h3 font-semibold tracking-tight">
						Fee crew
					</h2>
				</header>
				<p className="text-sm text-muted-foreground">
					Belum ada crew yang di-assign ke event ini. Buka halaman Crew
					Assignment untuk menambah crew.
				</p>
			</section>
		);
	}

	return (
		<section className="rounded-lg border border-border-default bg-surface-2 p-5">
			<header className="mb-4">
				<h2 className="text-fluid-h3 font-semibold tracking-tight">Fee crew</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Reimbursement bisa beda per crew — assign manual ke yang sebenarnya
					bayar.
				</p>
			</header>

			{allowPayment &&
				(() => {
					const unpaid = rows
						.filter((r) => !r.is_paid)
						.reduce(
							(s, r) =>
								s + r.fee_amount + r.bonus_amount + r.reimbursement_amount,
							0,
						);
					if (unpaid <= 0) return null;
					return (
						<div className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
							<Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
							<div className="space-y-1 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
								<p className="font-semibold">
									Belum dibayar ke crew:{" "}
									<span data-nominal>{formatRupiah(unpaid)}</span>
								</p>
								<p>
									Fee + reimbursement crew{" "}
									<span className="font-medium">sudah tercatat</span> sebagai{" "}
									<span className="font-medium">Hutang Crew</span> waktu event
									di-settle. Tapi saldo{" "}
									<span className="font-medium">
										Kas &amp; Bank belum berkurang
									</span>{" "}
									— uangnya masih di tangan kamu sampai benar-benar ditransfer.
								</p>
								<p>
									Klik <span className="font-medium">Bayar</span> di tiap crew
									saat kamu sudah transfer → kas berkurang &amp; utang ke crew
									lunas.
								</p>
							</div>
						</div>
					);
				})()}

			{fieldExpenseBreakdown && (
				<div className="mb-4 space-y-3 rounded-md border border-border-default bg-surface-3 p-3">
					{fieldExpenseBreakdown.crewFrontedTotal > 0 && (
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
								💸 Ditalangi crew{readOnly ? "" : " — perlu di-rembers"} ·{" "}
								<span data-nominal className="tabular">
									{formatRupiah(fieldExpenseBreakdown.crewFrontedTotal)}
								</span>
							</p>
							<ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular text-foreground/80">
								{fieldExpenseBreakdown.items
									.filter((it) => it.paidBy === "crew")
									.map((it) => (
										<li key={it.label}>
											<span className="text-muted-foreground">{it.label}:</span>{" "}
											<span data-nominal>{formatRupiah(it.amount)}</span>
											<span className="ml-1 text-muted-foreground">
												·{" "}
												{it.payerName ?? (
													<em className="not-italic text-amber-700 dark:text-amber-400">
														penalang belum dipilih
													</em>
												)}
											</span>
										</li>
									))}
							</ul>
							{/* Auto-isi sesuai penalang yang dipilih di form rekap — tiap
							    crew dapat persis jumlah yang dia talangi. */}
							{attributionPending && (
								<button
									type="button"
									onClick={applyPayerAttribution}
									className="press-down mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-600/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
								>
									<Wallet className="h-3 w-3" />
									Isi reimbursement sesuai penalang
								</button>
							)}
							{/* Fallback rekap lama: penalang belum dipilih per item, jadi
							    tawarkan crew yang submit sebagai tebakan terbaik. */}
							{suggestedRow && (
								<button
									type="button"
									onClick={() =>
										applyExpenseToReimbursement(
											suggestedRow.assignment_id,
											fieldExpenseBreakdown.crewFrontedTotal,
										)
									}
									className="press-down mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-600/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
								>
									<Wallet className="h-3 w-3" />
									Isi ke {suggestedRow.user_full_name} (yang submit rekap)
								</button>
							)}
							<p className="mt-1.5 text-[11px] text-muted-foreground">
								{readOnly
									? "Sudah masuk Hutang Crew saat settle — dibayar bersama fee."
									: "Apply ke kolom Reimbursement crew yang benar-benar bayar — dibayar bersama fee lewat Hutang Crew saat settle."}
							</p>
						</div>
					)}
					{fieldExpenseBreakdown.ownerPaidTotal > 0 && (
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
								✓ Dibayar owner ·{" "}
								<span data-nominal className="tabular">
									{formatRupiah(fieldExpenseBreakdown.ownerPaidTotal)}
								</span>
							</p>
							<ul className="mt-1.5 space-y-1 text-xs text-foreground/80">
								{fieldExpenseBreakdown.items
									.filter((it) => it.paidBy === "owner")
									.map((it) => (
										<li key={it.label} className="flex items-center gap-2">
											<span className="text-muted-foreground">{it.label}:</span>
											<span data-nominal className="tabular">
												{formatRupiah(it.amount)}
											</span>
											{it.catatRecorded ? (
												<span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border-default px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
													Sudah masuk daftar
												</span>
											) : it.catatPrefill ? (
												<button
													type="button"
													onClick={() => {
														const detail = it.catatPrefill;
														if (detail) emitCatatPrefill(detail);
													}}
													className="press-down ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
													title="Isi ke kartu Pemasukan / pengeluaran lain di halaman ini"
												>
													<Plus className="h-3 w-3" />
													Catat ke pembukuan
												</button>
											) : null}
										</li>
									))}
							</ul>
							<p className="mt-1.5 text-[11px] text-muted-foreground">
								Tidak ikut Hutang Crew di settlement — klik{" "}
								<span className="font-medium">Catat ke pembukuan</span> supaya
								bebannya tetap masuk — form di kartu{" "}
								<span className="font-medium">
									Pemasukan / pengeluaran lain
								</span>{" "}
								di bawah langsung terisi, tinggal pilih rekening & simpan. Yang
								sudah tercatat kelihatan di kartu itu juga, jadi tidak dobel.
							</p>
						</div>
					)}
				</div>
			)}

			<div className="space-y-4">
				{rows.map((row) => {
					const total =
						row.fee_amount + row.bonus_amount + row.reimbursement_amount;
					return (
						<div
							key={row.assignment_id}
							className="rounded-lg border border-border-default bg-surface-1 p-4"
						>
							<div className="mb-3 flex items-baseline justify-between">
								<div>
									<p className="text-sm font-semibold text-foreground">
										{row.user_full_name}
									</p>
									<p className="text-xs text-muted-foreground">
										{ROLE_LABEL[row.role_in_event]}
										{row.is_paid && (
											<span className="ml-2 inline-flex items-center rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground">
												Paid
											</span>
										)}
									</p>
								</div>
								<span className="tabular text-base font-semibold text-foreground">
									{formatRupiah(total)}
								</span>
							</div>

							<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
								<FeeField
									label="Base fee"
									value={row.fee_amount}
									onChange={(v) => update(row.assignment_id, { fee_amount: v })}
									readOnly={readOnly}
								/>
								<FeeField
									label="Bonus"
									value={row.bonus_amount}
									onChange={(v) =>
										update(row.assignment_id, { bonus_amount: v })
									}
									readOnly={readOnly}
								/>
								<FeeField
									label="Reimbursement"
									value={row.reimbursement_amount}
									onChange={(v) =>
										update(row.assignment_id, { reimbursement_amount: v })
									}
									readOnly={readOnly}
								/>
								{!readOnly &&
									fieldExpenseBreakdown &&
									fieldExpenseBreakdown.crewFrontedTotal > 0 && (
										<div className="col-span-full -mt-1 flex flex-wrap gap-1">
											<button
												type="button"
												onClick={() =>
													applyExpenseToReimbursement(
														row.assignment_id,
														row.user_id &&
															fieldExpenseBreakdown.byCrew[row.user_id] !==
																undefined
															? fieldExpenseBreakdown.byCrew[row.user_id]
															: fieldExpenseBreakdown.crewFrontedTotal,
													)
												}
												className="press-down rounded-md border border-foreground/15 bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background hover:bg-foreground/90"
												title={
													row.user_id &&
													fieldExpenseBreakdown.byCrew[row.user_id] !==
														undefined
														? "Set reimbursement = yang dia talangi di rekap"
														: "Set reimbursement = total talangan crew di rekap"
												}
											>
												= Talangan{" "}
												<span data-nominal>
													{formatRupiah(
														row.user_id &&
															fieldExpenseBreakdown.byCrew[row.user_id] !==
																undefined
															? fieldExpenseBreakdown.byCrew[row.user_id]
															: fieldExpenseBreakdown.crewFrontedTotal,
													)}
												</span>
											</button>
											{fieldExpenseBreakdown.items
												.filter((it) => it.paidBy === "crew")
												.map((it) => (
													<button
														key={it.label}
														type="button"
														onClick={() =>
															applyExpenseToReimbursement(
																row.assignment_id,
																row.reimbursement_amount + it.amount,
															)
														}
														className="rounded-md border border-border-default bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-link hover:bg-surface-3"
													>
														+ {it.label}{" "}
														<span data-nominal>{formatRupiah(it.amount)}</span>
													</button>
												))}
											{row.reimbursement_amount > 0 && (
												<button
													type="button"
													onClick={() =>
														applyExpenseToReimbursement(row.assignment_id, 0)
													}
													className="rounded-md border border-border-default bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-surface-3"
												>
													reset 0
												</button>
											)}
										</div>
									)}
							</div>

							<div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
								<div>
									<label
										htmlFor={`notes-${row.assignment_id}`}
										className="mb-1 block text-xs font-medium text-muted-foreground"
									>
										Catatan pembayaran (optional)
									</label>
									<Input
										id={`notes-${row.assignment_id}`}
										value={row.payment_notes ?? ""}
										onChange={(e) =>
											update(row.assignment_id, {
												payment_notes: e.target.value || null,
											})
										}
										placeholder="Mis. Transfer BCA 2026-05-20"
										disabled={readOnly}
									/>
								</div>
								<PaymentProofUpload
									projectId={projectId}
									crewRow={row}
									totalFee={total}
									onChange={(url) =>
										update(row.assignment_id, { payment_proof_url: url })
									}
									readOnly={readOnly}
								/>
								{!readOnly && (
									<div className="md:col-span-2">
										<span className="mb-1 block text-xs font-medium text-muted-foreground">
											Biaya admin bank ke rekening {row.user_full_name}{" "}
											(opsional)
										</span>
										<div className="flex items-center gap-1.5">
											{[0, 1000, 2500].map((v) => (
												<button
													key={v}
													type="button"
													onClick={() =>
														update(row.assignment_id, {
															payment_admin_fee: v,
														})
													}
													className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium ${
														row.payment_admin_fee === v
															? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
															: "border-border-default bg-surface-1 text-muted-foreground hover:bg-surface-2"
													}`}
												>
													{v === 0 ? (
														"Gratis"
													) : (
														<span data-nominal>{formatRupiah(v)}</span>
													)}
												</button>
											))}
											<Input
												type="number"
												inputMode="numeric"
												min={0}
												value={
													row.payment_admin_fee === 0
														? ""
														: row.payment_admin_fee
												}
												onChange={(e) =>
													update(row.assignment_id, {
														payment_admin_fee: Math.max(
															0,
															Number(e.target.value) || 0,
														),
													})
												}
												placeholder="lain"
												aria-label={`Biaya admin transfer ${row.user_full_name}`}
												className="tabular text-right"
											/>
										</div>
									</div>
								)}
							</div>

							{allowPayment && (
								<CrewPayPanel
									assignmentId={row.assignment_id}
									projectId={projectId}
									crewName={row.user_full_name}
									totalFee={total}
									defaultAdminFee={row.payment_admin_fee ?? 0}
									isPaid={row.is_paid}
									paidViaAccount={row.paid_via_account ?? null}
									paidAt={row.paid_at ?? null}
									cashAccounts={cashAccounts}
								/>
							)}
						</div>
					);
				})}
			</div>

			{/* Rencana bayar saat settle — bagian dari kartu ini, ikut tersimpan
			    lewat tombol "Simpan fee crew" (bukan tombol simpan kedua). */}
			{!readOnly && unpaidTotal > 0 && cashAccounts.length > 0 && (
				<div className="mt-4 rounded-xl border border-border-default bg-surface-1 p-3">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
								<Wallet className="h-4 w-4 text-muted-foreground" />
								Transfer fee crew saat settle
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Kalau dimatikan, fee jadi Hutang Crew & bisa dibayar kapan saja
								dari kartu ini setelah event ditutup.
							</p>
						</div>
						<Switch
							checked={planEnabled}
							onCheckedChange={() => setPlanEnabled((v) => !v)}
						/>
					</div>

					{planEnabled && (
						<div className="mt-3 space-y-2">
							<div className="space-y-1">
								<span className="block text-xs font-medium text-muted-foreground">
									Bayar dari rekening
								</span>
								<Combobox
									value={planAccount}
									onValueChange={(v) => setPlanAccount(v ?? "")}
									options={cashAccounts.map((a) => ({
										value: a.code,
										label:
											a.balance !== undefined
												? `${a.code} · ${a.name} — ${formatRupiah(a.balance)}`
												: `${a.code} · ${a.name}`,
									}))}
									placeholder="Pilih rekening"
									allowFreeText={false}
								/>
							</div>
							<p className="tabular text-[11px] text-muted-foreground">
								{planInsufficient ? (
									<span className="font-medium text-rose-600">
										Saldo {planAcct?.name} tidak cukup (
										{formatRupiah(planAcct?.balance ?? 0)}) untuk{" "}
										{formatRupiah(unpaidTotal + planAdminTotal)} — pilih
										rekening lain.
									</span>
								) : (
									<>
										{unpaidRows.length} transfer · fee{" "}
										{formatRupiah(unpaidTotal)}
										{planAdminTotal > 0
											? ` + admin ${formatRupiah(planAdminTotal)} (dijumlah dari tiap crew)`
											: ""}{" "}
										· total {formatRupiah(unpaidTotal + planAdminTotal)} keluar
										saat settle.
									</>
								)}
							</p>
							{queuedPayment?.postError && (
								<p className="text-[11px] font-medium text-rose-600">
									Gagal saat settle terakhir: {queuedPayment.postError}
								</p>
							)}
						</div>
					)}
				</div>
			)}

			{!readOnly && (
				<div className="mt-4 flex items-center justify-end gap-3">
					{!dirty && savedAt !== null && (
						<span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
							<CheckCircle2 className="h-3.5 w-3.5" /> Tersimpan
						</span>
					)}
					<Button
						onClick={handleSave}
						disabled={pending || !dirty || (planEnabled && planInsufficient)}
						className="gap-2"
					>
						{pending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Menyimpan…
							</>
						) : (
							<>
								<Save className="h-4 w-4" />
								Simpan fee crew
							</>
						)}
					</Button>
				</div>
			)}
		</section>
	);
}

function CrewPayPanel({
	assignmentId,
	projectId,
	crewName,
	totalFee,
	defaultAdminFee = 0,
	isPaid,
	paidViaAccount,
	paidAt,
	cashAccounts,
}: {
	assignmentId: string;
	projectId: string;
	crewName: string;
	totalFee: number;
	defaultAdminFee?: number;
	isPaid: boolean;
	paidViaAccount: string | null;
	paidAt: string | null;
	cashAccounts: CashAccountOption[];
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	// Default rekening = yang saldonya cukup dulu — bukan asal index 0 (Kas
	// Tunai). Dulu default buta ini yang bikin fee crew kepotong dari Kas Tunai
	// bersaldo Rp0 → saldo minus.
	const [bankCode, setBankCode] = useState<string>(
		cashAccounts.find((a) => (a.balance ?? 0) >= totalFee)?.code ??
			cashAccounts[0]?.code ??
			"",
	);
	// Prefill dari yang sudah diisi di kartu (ongkos transfer ke crew ini).
	const [adminFee, setAdminFee] = useState<string>(
		defaultAdminFee > 0 ? String(defaultAdminFee) : "",
	);
	// Optimistic paid-state override. useState(initialRows) di parent tidak
	// re-sync setelah router.refresh(), jadi tombol Bayar tetap kelihatan walau
	// sukses → rawan klik dua kali. Override lokal langsung flip UI ke "lunas"
	// (dan balik saat batalkan). Server tetap punya guard (is_paid) sbg jaring.
	const [override, setOverride] = useState<{
		paid: boolean;
		account?: string;
		at?: string;
	} | null>(null);

	const feeNum = Number(adminFee) || 0;
	const cashOut = totalFee + feeNum;
	const bankName = (code: string | null) =>
		cashAccounts.find((a) => a.code === code)?.name ?? code ?? "—";
	const selectedAcct = cashAccounts.find((a) => a.code === bankCode);
	const insufficient =
		selectedAcct?.balance !== undefined && selectedAcct.balance < cashOut;

	const effectivePaid = override ? override.paid : isPaid;
	const effectiveAccount = override?.account ?? paidViaAccount;
	const effectivePaidAt = override?.at ?? paidAt;

	function handlePay() {
		if (!bankCode) {
			toast.error("Pilih rekening sumber dulu");
			return;
		}
		startTransition(async () => {
			const res = await payCrewFee({
				assignment_id: assignmentId,
				project_id: projectId,
				bank_account_code: bankCode,
				admin_fee: feeNum,
				payment_date: new Date().toISOString().slice(0, 10),
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(
				`Fee ${crewName} dibayar${res.journalRef ? ` · jurnal ${res.journalRef}` : ""}`,
			);
			setOverride({
				paid: true,
				account: bankCode,
				at: new Date().toISOString(),
			});
			router.refresh();
		});
	}

	function handleUnpay() {
		startTransition(async () => {
			const res = await unpayCrewFee({
				assignment_id: assignmentId,
				project_id: projectId,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(`Pembayaran ${crewName} dibatalkan`);
			setOverride({ paid: false });
			router.refresh();
		});
	}

	if (effectivePaid) {
		return (
			<div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
				<span className="inline-flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-200">
					<CheckCircle2 className="h-3.5 w-3.5" />
					Lunas — dibayar via {bankName(effectiveAccount)}
					{effectivePaidAt ? ` · ${effectivePaidAt.slice(0, 10)}` : ""}
				</span>
				<button
					type="button"
					onClick={handleUnpay}
					disabled={pending}
					className="rounded-md border border-border-default bg-surface-1 px-2 py-1 font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground disabled:opacity-50"
				>
					{pending ? "Membatalkan…" : "Batalkan"}
				</button>
			</div>
		);
	}

	return (
		<div className="mt-3 rounded-md border border-border-default bg-surface-3 p-3">
			<div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				<Wallet className="h-3.5 w-3.5" /> Bayar fee crew ini
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
				<div className="space-y-1">
					<label className="block text-xs font-medium text-muted-foreground">
						Bayar dari
					</label>
					<Combobox
						value={bankCode}
						onValueChange={(v) => setBankCode(v ?? "")}
						options={cashAccounts.map((a) => ({
							value: a.code,
							label:
								a.balance !== undefined
									? `${a.code} · ${a.name} — ${formatRupiah(a.balance)}`
									: `${a.code} · ${a.name}`,
							disabled: a.balance !== undefined && a.balance < cashOut,
						}))}
						placeholder="Pilih rekening"
						allowFreeText={false}
					/>
				</div>
				<div className="space-y-1">
					<label className="block text-xs font-medium text-muted-foreground">
						Biaya admin (opsional)
					</label>
					<div className="flex items-center gap-1.5">
						{[1000, 2500].map((v) => {
							const active = feeNum === v;
							return (
								<button
									key={v}
									type="button"
									onClick={() => setAdminFee(active ? "" : String(v))}
									className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium ${
										active
											? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
											: "border-border-default bg-surface-1 text-muted-foreground hover:bg-surface-2"
									}`}
								>
									<span data-nominal>{formatRupiah(v)}</span>
								</button>
							);
						})}
						<Input
							type="number"
							inputMode="numeric"
							min={0}
							value={adminFee}
							onChange={(e) => setAdminFee(e.target.value)}
							placeholder="lain"
							className="tabular text-right"
						/>
					</div>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
				<p className="text-[11px] text-muted-foreground">
					{insufficient ? (
						<span className="font-medium text-rose-600">
							Saldo {bankName(bankCode)} tidak cukup (
							<span data-nominal>
								{formatRupiah(selectedAcct?.balance ?? 0)}
							</span>
							) untuk keluar <span data-nominal>{formatRupiah(cashOut)}</span> —
							pilih rekening lain.
						</span>
					) : (
						<>
							Saat dibayar: saldo{" "}
							<span className="font-medium text-foreground">
								{bankName(bankCode)}
							</span>{" "}
							berkurang{" "}
							<span className="font-medium text-foreground" data-nominal>
								{formatRupiah(cashOut)}
							</span>
							{feeNum > 0 ? (
								<>
									{" "}
									(termasuk biaya admin{" "}
									<span data-nominal>{formatRupiah(feeNum)}</span>)
								</>
							) : null}{" "}
							· utang ke crew lunas{" "}
							<span data-nominal>{formatRupiah(totalFee)}</span>
						</>
					)}
				</p>
				<Button
					onClick={handlePay}
					disabled={pending || totalFee <= 0 || insufficient}
					className="gap-2"
				>
					{pending ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" /> Memproses…
						</>
					) : (
						<>
							<Wallet className="h-4 w-4" /> Bayar{" "}
							<span data-nominal>{formatRupiah(cashOut)}</span>
						</>
					)}
				</Button>
			</div>
		</div>
	);
}

function PaymentProofUpload({
	projectId,
	crewRow,
	totalFee,
	onChange,
	readOnly,
}: {
	projectId: string;
	crewRow: CrewAssignmentRow;
	totalFee: number;
	onChange: (url: string | null) => void;
	readOnly?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const url = crewRow.payment_proof_url;

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		setUploading(true);
		try {
			const fd = new FormData();
			fd.set("file", file);
			fd.set("kind", "crew_fee");
			fd.set("crew_name", crewRow.user_full_name ?? "");
			fd.set("role", crewRow.role_in_event ?? "");
			fd.set("payment_date", new Date().toISOString().slice(0, 10));
			fd.set("amount", String(totalFee));
			const res = await fetch(`/api/drive/upload/${projectId}`, {
				method: "POST",
				body: fd,
			});
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(text || `HTTP ${res.status}`);
			}
			const { url: uploadedUrl, name: renamedName } = (await res.json()) as {
				url: string;
				name?: string;
			};
			onChange(uploadedUrl);
			toast.success(
				renamedName
					? `Bukti tersimpan: ${renamedName}`
					: `Bukti transfer ${crewRow.user_full_name} ter-upload`,
			);
		} catch (err) {
			toast.error(
				`Upload gagal: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setUploading(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	return (
		<div className="space-y-1">
			<label className="block text-xs font-medium text-muted-foreground">
				Bukti transfer (optional)
			</label>
			<input
				ref={inputRef}
				type="file"
				accept="image/*,application/pdf"
				className="hidden"
				onChange={(e) => handleFiles(e.target.files)}
				disabled={readOnly || uploading}
			/>
			{url ? (
				<div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
					<CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex-1 truncate text-emerald-900 hover:underline dark:text-emerald-200"
					>
						Lihat bukti
					</a>
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
					>
						<ExternalLink className="h-3 w-3" />
					</a>
					{!readOnly && (
						<button
							type="button"
							onClick={() => onChange(null)}
							className="text-emerald-700 hover:text-rose-700 dark:text-emerald-300"
							aria-label="Hapus bukti"
						>
							<X className="h-3 w-3" />
						</button>
					)}
				</div>
			) : (
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					disabled={readOnly || uploading}
					className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-default bg-surface-1 px-3 text-xs text-muted-foreground hover:border-border-strong hover:bg-surface-3 disabled:opacity-50"
				>
					{uploading ? (
						<>
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							Uploading…
						</>
					) : (
						<>
							<Upload className="h-3.5 w-3.5" />
							Upload bukti transfer
						</>
					)}
				</button>
			)}
		</div>
	);
}

function FeeField({
	label,
	value,
	onChange,
	readOnly,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	readOnly?: boolean;
}) {
	return (
		<div className="space-y-1">
			<label className="block text-xs font-medium text-muted-foreground">
				{label}
			</label>
			<Input
				type="number"
				inputMode="numeric"
				min={0}
				value={value}
				onChange={(e) => onChange(Number(e.target.value) || 0)}
				disabled={readOnly}
				className="tabular text-right"
			/>
		</div>
	);
}
