"use client";

import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ProofUploadButton } from "@/components/rekap/proof-upload-button";
import { RekapCard, SectionHeader } from "@/components/rekap/rekap-ui";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MoneyInput } from "@/components/ui/form-fields";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import {
	attachJournalProof,
	reverseJournalEntry,
} from "@/lib/actions/journal-entries";
import {
	attachQueuedProof,
	type QueuedEntry,
	queueEventExpense,
	queueEventExpensesBatch,
	removeQueuedEntry,
} from "@/lib/actions/settle-queue";
import {
	filterEmoneyAccounts,
	isEmoneyCoa,
	isTransportCoa,
} from "@/lib/finance/emoney";
import {
	type CatatDirection,
	categoriesFor,
	findCategory,
} from "@/lib/finance/quick-record-categories";
import { formatRupiah } from "@/lib/format";
import {
	CATAT_PREFILL_EVENT,
	type CatatPrefillDetail,
} from "@/lib/rekap/catat-prefill";

/**
 * Pemasukan / pengeluaran lain di sebuah event yang TIDAK tercakup form rekap —
 * mis. ganti barang klien yang rusak, tip dari klien, parkir tambahan yang
 * dibayar owner sendiri.
 *
 * Sengaja lewat jalur "Catat transaksi" yang sama (recordQuickTransaction):
 * jurnal kas 2 baris, guard saldo, dan `source_event_id` menempel ke event ini
 * supaya panel rekonsiliasi bisa mencocokkannya. TIDAK mengubah HPP/OpEx
 * settlement — ini uang yang benar-benar keluar/masuk sekarang, bukan komponen
 * laba event (perlakuan yang sama dengan biaya rekap "dibayar owner").
 */

/** Biaya lapangan dibayar owner yang belum dibukukan — bahan tombol "Catat semua". */
export type OwnerPaidPending = {
	label: string;
	categoryId: string;
	amount: number;
	note: string;
	proofUrl: string | null;
};

export type ExtraTxnRow = {
	id: string;
	refId: string;
	entryDate: string;
	description: string;
	amount: number;
	/** true = uang keluar (beban), false = uang masuk. */
	isOut: boolean;
	proofUrl: string | null;
};

type CashAccount = { code: string; name: string; balance?: number };

const DEFAULT_CATEGORY: Record<CatatDirection, string> = {
	keluar: "operasional-lain",
	masuk: "add-on",
	transfer: "operasional-lain",
};

function defaultAccount(
	accounts: CashAccount[],
	categoryIds: string[] = [],
): string {
	// Biaya tol → kartu e-toll (saldo terbesar), karena memang dibayar pakai
	// kartu. Selain itu BCA dulu — rekening operasional Tetra. Kas Tunai
	// kebetulan urutan pertama tapi saldonya biasanya Rp0.
	if (
		categoryIds.length > 0 &&
		categoryIds.every((id) => findCategory(id)?.coa === "5-213")
	) {
		const card = accounts
			.filter((a) => isEmoneyCoa(a.code))
			.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0];
		if (card) return card.code;
	}
	return (
		accounts.find((a) => /bca/i.test(a.name))?.code ??
		accounts.find((a) => /bank/i.test(a.name))?.code ??
		accounts[0]?.code ??
		""
	);
}

export function EventExtraTransactions({
	eventId,
	projectId,
	rows,
	queued,
	cashAccounts,
	ownerPaidPending = [],
	readOnly = false,
	uangJalan = [],
	owners = [],
	eventName,
}: {
	/** Nama acara — dibuang dari keterangan baris (sudah jelas di halaman ini). */
	eventName?: string;
	/** Owner yang bisa menalangi biaya (sumber "Hutang ke owner — dilunasi nanti"). */
	owners?: Array<{ id: string; name: string }>;
	/** Uang jalan yang masih dipegang crew (sudah dikurangi yang diantre) — DR-049. */
	uangJalan?: Array<{ user_id: string; name: string; saldo: number }>;
	eventId: string;
	projectId: string;
	/** Yang SUDAH masuk buku (jurnalnya lahir saat settle / dicatat manual). */
	rows: ExtraTxnRow[];
	/** Yang masih menunggu settle — belum jadi jurnal, bebas dihapus. */
	queued: QueuedEntry[];
	cashAccounts: CashAccount[];
	/** Biaya "dibayar owner" yang belum masuk pembukuan (dari kartu Fee crew). */
	ownerPaidPending?: OwnerPaidPending[];
	readOnly?: boolean;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const tanpaAcara = (t: string) =>
		eventName ? t.replace(` — ${eventName}`, "") : t;
	const [pending, startTransition] = useTransition();
	const [adding, setAdding] = useState(false);

	const [direction, setDirection] = useState<CatatDirection>("keluar");
	const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY.keluar);
	const [note, setNote] = useState("");
	const [amount, setAmount] = useState(0);
	const [account, setAccount] = useState(() => defaultAccount(cashAccounts));
	const [proofUrl, setProofUrl] = useState<string | null>(null);
	const cardRef = useRef<HTMLDivElement>(null);
	const [bulkAccount, setBulkAccount] = useState(() => {
		// Biaya lapangan "dibayar owner" biasanya dibayar dari uang jalan crew —
		// kalau cukup, itu sumber bawaannya.
		const need = ownerPaidPending.reduce((t, p) => t + p.amount, 0);
		const uj = uangJalan.find((u) => u.saldo >= need && need > 0);
		return uj
			? `uj:${uj.user_id}`
			: defaultAccount(
					cashAccounts,
					ownerPaidPending.map((p) => p.categoryId),
				);
	});
	// Sumber dana "uang jalan" — hanya untuk uang keluar.
	const ujOptions = uangJalan
		.filter((u) => u.saldo > 0)
		.map((u) => ({
			code: `uj:${u.user_id}`,
			name: `Uang jalan · ${u.name}`,
			balance: u.saldo,
		}));
	// Dibayar owner dulu → hutang Tetra ke owner itu, dilunasi nanti di modul
	// hutang-piutang owner. Bukan uang Tetra, jadi tanpa saldo.
	const ownerOptions: CashAccount[] = owners.map((o) => ({
		code: `owner:${o.id}`,
		name: `Hutang ke ${o.name} — dilunasi nanti`,
	}));
	const withUj = (list: CashAccount[], dir: CatatDirection) =>
		dir === "keluar" ? [...ujOptions, ...list, ...ownerOptions] : list;
	const sumberLabel = (a: CashAccount) =>
		a.code.startsWith("owner:")
			? a.name
			: a.code.startsWith("uj:")
				? `${a.name} — ${formatRupiah(a.balance ?? 0)} dipegang crew`
				: a.balance !== undefined
					? `${a.code} · ${a.name} — ${formatRupiah(a.balance)}`
					: `${a.code} · ${a.name}`;
	const ownerHint = (code: string) => {
		const o = owners.find((x) => `owner:${x.id}` === code);
		return o
			? `Biaya tetap masuk hitungan untung event. Tetra berutang ke ${o.name} — lunasi kapan saja di kartu Hutang-piutang owner (Dashboard / Keuangan).`
			: null;
	};
	// Ganti kategori = rekening ikut default-nya (tol → e-toll, lainnya BCA).
	function pickCategory(id: string) {
		setCategoryId(id);
		setAccount(defaultAccount(cashAccounts, [id]));
	}

	// Biaya "dibayar owner" di kartu Fee crew mengisi form ini lewat CustomEvent
	// — dulu tombolnya deep-link ke /finance & owner keluar dari halaman rekap.
	useEffect(() => {
		if (readOnly) return;
		function onPrefill(e: Event) {
			const d = (e as CustomEvent<CatatPrefillDetail>).detail;
			if (!d) return;
			setDirection("keluar");
			setCategoryId(d.categoryId);
			setAccount(defaultAccount(cashAccounts, [d.categoryId]));
			setAmount(d.amount);
			setNote(d.note);
			// Nota yang sudah di-upload crew langsung terlampir.
			setProofUrl(d.proofUrl ?? null);
			setAdding(true);
			requestAnimationFrame(() =>
				cardRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "center",
				}),
			);
		}
		window.addEventListener(CATAT_PREFILL_EVENT, onPrefill);
		return () => window.removeEventListener(CATAT_PREFILL_EVENT, onPrefill);
	}, [readOnly, cashAccounts]);

	const queuedExpenses = queued.filter((q) => q.kind === "expense");
	const totalOut =
		rows.filter((r) => r.isOut).reduce((s, r) => s + r.amount, 0) +
		queuedExpenses
			.filter((q) => q.direction === "keluar")
			.reduce((s, q) => s + q.amount, 0);
	const totalIn =
		rows.filter((r) => !r.isOut).reduce((s, r) => s + r.amount, 0) +
		queuedExpenses
			.filter((q) => q.direction === "masuk")
			.reduce((s, q) => s + q.amount, 0);

	// Kartu e-toll cuma boleh membayar kebutuhan transportasi. Daftar rekening
	// ikut kategori yang sedang dipilih, jadi kartu tidak pernah tersedia saat
	// mencatat konsumsi, perlengkapan, dsb.
	const formAccounts = filterEmoneyAccounts(
		cashAccounts,
		isTransportCoa(findCategory(categoryId)?.coa),
	);
	// Tombol "Catat semua" memakai SATU rekening untuk seluruh biaya tertunda,
	// jadi kartu hanya ditawarkan kalau semuanya memang biaya transportasi.
	const bulkAccounts = filterEmoneyAccounts(
		cashAccounts,
		ownerPaidPending.length > 0 &&
			ownerPaidPending.every((p) =>
				isTransportCoa(findCategory(p.categoryId)?.coa),
			),
	);

	const acct = [...ujOptions, ...ownerOptions, ...cashAccounts].find(
		(a) => a.code === account,
	);
	const insufficient =
		direction === "keluar" &&
		amount > 0 &&
		acct?.balance !== undefined &&
		acct.balance < amount;

	function resetForm() {
		setDirection("keluar");
		setCategoryId(DEFAULT_CATEGORY.keluar);
		setNote("");
		setAmount(0);
		setProofUrl(null);
		setAdding(false);
	}

	function handleSave() {
		if (amount <= 0) {
			toast.error("Isi nominalnya dulu");
			return;
		}
		if (!account) {
			toast.error("Pilih rekening dulu");
			return;
		}
		startTransition(async () => {
			const res = await queueEventExpense({
				event_id: eventId,
				project_id: projectId,
				direction: direction === "masuk" ? "masuk" : "keluar",
				category_id: categoryId,
				amount,
				note: note.trim() || null,
				account_code: account,
				proof_url: proofUrl,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(
				`${direction === "keluar" ? "Pengeluaran" : "Pemasukan"} ${formatRupiah(amount)} ${res.posted ? "langsung dibukukan (acara sudah di-settle)." : "disimpan — dibukukan saat settle."}`,
			);
			resetForm();
			router.refresh();
		});
	}

	const pendingTotal = ownerPaidPending.reduce((s, p) => s + p.amount, 0);
	const bulkAcct = [...ujOptions, ...ownerOptions, ...cashAccounts].find(
		(a) => a.code === bulkAccount,
	);
	const bulkInsufficient =
		bulkAcct?.balance !== undefined && bulkAcct.balance < pendingTotal;

	function handleRecordAll() {
		startTransition(async () => {
			const res = await queueEventExpensesBatch({
				event_id: eventId,
				project_id: projectId,
				account_code: bulkAccount,
				items: ownerPaidPending.map((p) => ({
					category_id: p.categoryId,
					amount: p.amount,
					note: p.note,
					proof_url: p.proofUrl,
				})),
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(
				`${res.queued} biaya dibayar owner masuk daftar (${formatRupiah(pendingTotal)}) — ${res.posted ? "langsung dibukukan." : "dibukukan saat settle."}`,
			);
			router.refresh();
		});
	}

	function handleRemoveQueued(entry: QueuedEntry) {
		startTransition(async () => {
			const res = await removeQueuedEntry({
				id: entry.id,
				project_id: projectId,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Baris dihapus.");
			router.refresh();
		});
	}

	// Bukti sering menyusul (struk difoto belakangan) — baris yang sudah tersimpan
	// tetap bisa dilampiri tanpa harus dihapus & diinput ulang.
	function attachProofToQueued(entry: QueuedEntry, url: string | null) {
		startTransition(async () => {
			const res = await attachQueuedProof({
				id: entry.id,
				project_id: projectId,
				proof_url: url,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			router.refresh();
		});
	}

	function attachProofToPosted(row: ExtraTxnRow, url: string | null) {
		startTransition(async () => {
			const res = await attachJournalProof({
				entry_id: row.id,
				project_id: projectId,
				proof_url: url,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			router.refresh();
		});
	}

	function handleDelete(row: ExtraTxnRow) {
		startTransition(async () => {
			const ok = await confirm({
				title: "Batalkan transaksi ini?",
				description: `${row.description} · ${formatRupiah(row.amount)}. Jurnal pembalik akan dibuat — uangnya kembali ke rekening semula.`,
				confirmLabel: "Batalkan transaksi",
				variant: "destructive",
			});
			if (!ok) return;
			const res = await reverseJournalEntry(
				row.id,
				"Dibatalkan dari halaman rekap event",
			);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Transaksi dibatalkan (jurnal pembalik dibuat).");
			router.refresh();
		});
	}

	return (
		<RekapCard ref={cardRef} className="space-y-4">
			<SectionHeader
				icon={Receipt}
				title="Pemasukan / pengeluaran lain"
				description="Biaya atau pemasukan acara ini yang tidak ada di rekap crew, mis. ganti barang rusak, ongkos tambahan, tip klien."
			/>

			{!readOnly && ownerPaidPending.length > 0 && (
				<div className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
					<p className="text-[13px] font-medium text-amber-900 dark:text-amber-200">
						{ownerPaidPending.length} biaya lapangan dibayar owner belum masuk
						pembukuan ·{" "}
						<span className="tabular">{formatRupiah(pendingTotal)}</span>
					</p>
					<p className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
						{ownerPaidPending
							.map((p) => `${p.label} ${formatRupiah(p.amount)}`)
							.join(" · ")}
						. Nota yang sudah di-upload crew ikut terlampir otomatis.
					</p>
					<div className="flex flex-wrap items-end gap-2">
						<div className="min-w-[220px] flex-1 space-y-1">
							<span className="block text-[11px] font-medium text-amber-900/80 dark:text-amber-200/80">
								Dibayar dari
							</span>
							<Combobox
								value={bulkAccount}
								onValueChange={(v) => setBulkAccount(v ?? "")}
								options={withUj(bulkAccounts, "keluar").map((a) => ({
									value: a.code,
									label: sumberLabel(a),
								}))}
								placeholder="Pilih rekening"
								allowFreeText={false}
							/>
						</div>
						<Button
							type="button"
							onClick={handleRecordAll}
							disabled={pending || !bulkAccount || bulkInsufficient}
							className="gap-2"
						>
							{pending ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" /> Mencatat…
								</>
							) : (
								<>
									<Plus className="h-4 w-4" /> Catat semua (
									{ownerPaidPending.length})
								</>
							)}
						</Button>
					</div>
					{ownerHint(bulkAccount) && (
						<p className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
							{ownerHint(bulkAccount)}
						</p>
					)}
					{bulkInsufficient && (
						<p className="tabular text-[11px] font-medium text-rose-600">
							Saldo {bulkAcct?.name} tidak cukup (
							{formatRupiah(bulkAcct?.balance ?? 0)}) untuk{" "}
							{formatRupiah(pendingTotal)} — pilih rekening lain.
						</p>
					)}
				</div>
			)}

			{(queuedExpenses.length > 0 || rows.length > 0) && (
				<ul className="divide-y divide-border-subtle rounded-xl bg-secondary/50 px-4">
					{queuedExpenses.map((q) => {
						const out = q.direction === "keluar";
						const sumber = q.ownerId
							? `Ditalangi ${owners.find((o) => o.id === q.ownerId)?.name ?? "owner"}`
							: q.accountCode === "1-320"
								? "Pakai uang jalan crew"
								: cashAccounts.find((a) => a.code === q.accountCode)?.name;
						return (
							<li
								key={q.id}
								className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
							>
								<div className="w-full min-w-0 sm:w-auto sm:flex-1">
									<p className="text-[13px] text-foreground">
										{tanpaAcara(q.note ?? "Transaksi")}
									</p>
									<p className="text-[12px] text-muted-foreground">
										{[
											sumber,
											"dibukukan saat settle",
											q.fromRekap ? "otomatis dari rekap" : null,
										]
											.filter(Boolean)
											.join(" · ")}
									</p>
									{q.postError && (
										<p className="text-[12px] font-medium text-rose-600">
											Gagal dibukukan: {q.postError} — hapus & ulangi lewat
											Finance › Catat transaksi.
										</p>
									)}
								</div>
								<span
									className={`tabular mr-auto shrink-0 whitespace-nowrap text-[13px] font-medium sm:mr-0 ${out ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}
									data-nominal
								>
									{out ? "−" : "+"} {formatRupiah(q.amount)}
								</span>
								<span className="flex shrink-0 items-center gap-1">
									{q.proofUrl ? (
										<a
											href={q.proofUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
										>
											Bukti
										</a>
									) : readOnly ? null : (
										<ProofUploadButton
											compact
											projectId={projectId}
											kind="event_txn"
											meta={{ name: q.note ?? "Transaksi", amount: q.amount }}
											url={null}
											onChange={(url) => attachProofToQueued(q, url)}
											disabled={pending}
										/>
									)}
									{!readOnly && !q.fromRekap && (
										<Button
											type="button"
											size="icon-sm"
											variant="ghost"
											aria-label="Hapus baris"
											className="text-muted-foreground hover:text-rose-600"
											disabled={pending}
											onClick={() => handleRemoveQueued(q)}
										>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									)}
								</span>
							</li>
						);
					})}
					{rows.map((row) => (
						<li
							key={row.id}
							className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
						>
							<div className="w-full min-w-0 sm:w-auto sm:flex-1">
								<p className="text-[13px] text-foreground">
									{tanpaAcara(row.description)}
								</p>
								<p className="tabular text-[12px] text-muted-foreground">
									Sudah dibukukan ·{" "}
									{new Date(`${row.entryDate}T00:00:00`).toLocaleDateString(
										"id-ID",
										{ day: "numeric", month: "short", year: "numeric" },
									)}
								</p>
							</div>
							<span
								className={`tabular mr-auto shrink-0 whitespace-nowrap text-[13px] font-medium sm:mr-0 ${row.isOut ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}
								data-nominal
							>
								{row.isOut ? "−" : "+"} {formatRupiah(row.amount)}
							</span>
							<span className="flex shrink-0 items-center gap-1">
								{row.proofUrl ? (
									<a
										href={row.proofUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1 text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
									>
										Bukti
									</a>
								) : readOnly ? null : (
									<ProofUploadButton
										compact
										projectId={projectId}
										kind="event_txn"
										meta={{ name: row.description, amount: row.amount }}
										url={null}
										onChange={(url) => attachProofToPosted(row, url)}
										disabled={pending}
									/>
								)}
								{!readOnly && (
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label="Batalkan transaksi"
										className="text-muted-foreground hover:text-rose-600"
										disabled={pending}
										onClick={() => handleDelete(row)}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								)}
							</span>
						</li>
					))}
				</ul>
			)}

			{(totalOut > 0 || totalIn > 0) && (
				<p className="tabular text-[11px] text-muted-foreground">
					{totalOut > 0 ? `Keluar ${formatRupiah(totalOut)}` : ""}
					{totalOut > 0 && totalIn > 0 ? " · " : ""}
					{totalIn > 0 ? `Masuk ${formatRupiah(totalIn)}` : ""} · sudah ikut
					dihitung di Hitungan untung event di bawah.
				</p>
			)}

			{readOnly ? null : adding ? (
				<div className="space-y-3 rounded-xl border border-border-default bg-surface-2 p-3">
					<div className="flex flex-wrap items-center gap-2">
						<div className="flex rounded-full bg-secondary p-0.5">
							{(["keluar", "masuk"] as const).map((dir) => (
								<button
									key={dir}
									type="button"
									onClick={() => {
										setDirection(dir);
										pickCategory(DEFAULT_CATEGORY[dir]);
									}}
									className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
										direction === dir
											? "bg-card text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									{dir === "keluar" ? "Uang keluar" : "Uang masuk"}
								</button>
							))}
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-1">
							<span className="block text-xs font-medium text-muted-foreground">
								Kategori
							</span>
							<NativeSelect
								value={categoryId}
								onValueChange={pickCategory}
								options={categoriesFor(direction).map((c) => ({
									value: c.id,
									label: c.label,
								}))}
								placeholder="Pilih kategori"
							/>
						</div>
						<div className="space-y-1">
							<span className="block text-xs font-medium text-muted-foreground">
								Nominal
							</span>
							<MoneyInput
								value={amount}
								onValueChange={setAmount}
								aria-label="Nominal transaksi"
							/>
						</div>
						<div className="space-y-1">
							<span className="block text-xs font-medium text-muted-foreground">
								Keterangan (opsional)
							</span>
							<input
								type="text"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="Mis. ganti frame klien yang pecah"
								className="h-9 w-full rounded-[10px] border border-border-default bg-card px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
							/>
						</div>
						<div className="space-y-1">
							<span className="block text-xs font-medium text-muted-foreground">
								{direction === "keluar"
									? "Uang keluar dari rekening"
									: "Uang masuk ke rekening"}
							</span>
							<Combobox
								value={account}
								onValueChange={(v) => setAccount(v ?? "")}
								options={withUj(formAccounts, direction).map((a) => ({
									value: a.code,
									label: sumberLabel(a),
								}))}
								placeholder="Pilih rekening"
								allowFreeText={false}
							/>
							{ownerHint(account) && (
								<p className="text-[11px] text-muted-foreground">
									{ownerHint(account)}
								</p>
							)}
						</div>
						<div className="md:col-span-2">
							<ProofUploadButton
								projectId={projectId}
								kind="event_txn"
								meta={{
									name:
										categoriesFor(direction).find((c) => c.id === categoryId)
											?.label ?? "Transaksi",
									amount,
								}}
								url={proofUrl}
								onChange={setProofUrl}
								label="Bukti transfer / nota (opsional)"
							/>
						</div>
					</div>

					{insufficient && (
						<p className="tabular text-[11px] font-medium text-rose-600">
							Saldo {acct?.name} tidak cukup ({formatRupiah(acct?.balance ?? 0)}
							) untuk keluar {formatRupiah(amount)} — pilih rekening lain.
						</p>
					)}

					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							onClick={resetForm}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							type="button"
							onClick={handleSave}
							disabled={pending || amount <= 0 || insufficient}
							className="gap-2"
						>
							{pending ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…
								</>
							) : (
								<>
									<Plus className="h-4 w-4" /> Catat transaksi
								</>
							)}
						</Button>
					</div>
				</div>
			) : (
				<Button
					type="button"
					variant="outline"
					onClick={() => setAdding(true)}
					className="gap-2"
				>
					<Plus className="h-4 w-4" /> Tambah pemasukan / pengeluaran
				</Button>
			)}
		</RekapCard>
	);
}
