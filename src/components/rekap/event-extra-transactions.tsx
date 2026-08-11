"use client";

import { ExternalLink, Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProofUploadButton } from "@/components/rekap/proof-upload-button";
import { RekapCard, SectionHeader } from "@/components/rekap/rekap-ui";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MoneyInput } from "@/components/ui/form-fields";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import {
	recordQuickTransaction,
	reverseJournalEntry,
} from "@/lib/actions/journal-entries";
import {
	type CatatDirection,
	categoriesFor,
} from "@/lib/finance/quick-record-categories";
import { formatRupiah } from "@/lib/format";

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

function defaultAccount(accounts: CashAccount[]): string {
	// BCA dulu — rekening operasional Tetra. Kas Tunai kebetulan urutan pertama
	// tapi saldonya biasanya Rp0.
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
	cashAccounts,
	readOnly = false,
}: {
	eventId: string;
	projectId: string;
	rows: ExtraTxnRow[];
	cashAccounts: CashAccount[];
	readOnly?: boolean;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, startTransition] = useTransition();
	const [adding, setAdding] = useState(false);

	const [direction, setDirection] = useState<CatatDirection>("keluar");
	const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY.keluar);
	const [note, setNote] = useState("");
	const [amount, setAmount] = useState(0);
	const [account, setAccount] = useState(() => defaultAccount(cashAccounts));
	const [proofUrl, setProofUrl] = useState<string | null>(null);

	const totalOut = rows
		.filter((r) => r.isOut)
		.reduce((s, r) => s + r.amount, 0);
	const totalIn = rows
		.filter((r) => !r.isOut)
		.reduce((s, r) => s + r.amount, 0);

	const acct = cashAccounts.find((a) => a.code === account);
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
			const fd = new FormData();
			fd.set("direction", direction);
			fd.set("amount", String(amount));
			fd.set("entry_date", new Date().toISOString().slice(0, 10));
			fd.set("account_code", account);
			fd.set("category_id", categoryId);
			fd.set("event_id", eventId);
			if (note.trim()) fd.set("note", note.trim());
			if (proofUrl) fd.set("proof_url", proofUrl);
			const res = await recordQuickTransaction(undefined, fd);
			if (!res?.success) {
				toast.error(res?.error ?? "Gagal mencatat transaksi");
				return;
			}
			toast.success(
				`${direction === "keluar" ? "Pengeluaran" : "Pemasukan"} ${formatRupiah(amount)} tercatat.`,
			);
			resetForm();
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
		<RekapCard className="space-y-4">
			<SectionHeader
				icon={Receipt}
				title="Pemasukan / pengeluaran lain"
				description="Uang keluar atau masuk di event ini yang tidak ada di form rekap — mis. ganti barang rusak, tip klien. Dicatat sebagai transaksi kas yang tertaut ke event ini (tidak mengubah laba settlement)."
			/>

			{rows.length > 0 && (
				<div className="space-y-2">
					{rows.map((row) => (
						<div
							key={row.id}
							className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-default bg-surface-2 px-3 py-2"
						>
							<span
								className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-medium ${
									row.isOut
										? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
										: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
								}`}
							>
								{row.isOut ? "Keluar" : "Masuk"}
							</span>
							<span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
								{row.description}
							</span>
							<span className="tabular text-xs text-muted-foreground">
								{row.entryDate}
							</span>
							<span
								className={`tabular text-sm font-medium ${
									row.isOut
										? "text-rose-600 dark:text-rose-400"
										: "text-emerald-600 dark:text-emerald-400"
								}`}
							>
								{row.isOut ? "−" : "+"} {formatRupiah(row.amount)}
							</span>
							{row.proofUrl ? (
								<a
									href={row.proofUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-[11px] text-link hover:underline"
								>
									Bukti <ExternalLink className="h-3 w-3" />
								</a>
							) : (
								<span className="text-[11px] text-muted-foreground">
									Tanpa bukti
								</span>
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
						</div>
					))}
					<p className="tabular text-[11px] text-muted-foreground">
						{totalOut > 0 ? `Keluar ${formatRupiah(totalOut)}` : ""}
						{totalOut > 0 && totalIn > 0 ? " · " : ""}
						{totalIn > 0 ? `Masuk ${formatRupiah(totalIn)}` : ""}
					</p>
				</div>
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
										setCategoryId(DEFAULT_CATEGORY[dir]);
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
								onValueChange={setCategoryId}
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
