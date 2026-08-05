"use client";

import { CheckCircle2, Clock3, Handshake, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { unpayCommission } from "@/lib/actions/commissions";
import type { CommissionRow } from "@/lib/finance/commissions-data";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	type CommissionBankOption,
	CommissionPayDialog,
} from "./commission-pay-dialog";

const STATUS_META: Record<
	CommissionRow["status"],
	{ label: string; cls: string }
> = {
	upfront: {
		label: "Potong di muka",
		cls: "bg-secondary text-muted-foreground",
	},
	not_settled: {
		label: "Belum settle",
		cls: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
	},
	advance: {
		label: "Dibayar di muka",
		cls: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
	},
	payable: {
		label: "Terutang",
		cls: "bg-rose-500/12 text-rose-700 dark:text-rose-400",
	},
	paid: {
		label: "Dibayar",
		cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
	},
};

export function CommissionsExplorer({
	rows,
	banks,
	defaultDate,
}: {
	rows: CommissionRow[];
	banks: CommissionBankOption[];
	defaultDate: string;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [payRow, setPayRow] = useState<CommissionRow | null>(null);
	const [open, setOpen] = useState(false);
	const [reversingKey, setReversingKey] = useState<string | null>(null);

	function openPay(row: CommissionRow) {
		if (banks.length === 0) {
			toast.error("Belum ada rekening bank aktif. Tambah di Rekening Bank.");
			return;
		}
		setPayRow(row);
		setOpen(true);
	}

	async function reverse(row: CommissionRow) {
		const key = `${row.eventId}:${row.kind}`;
		const paid = row.payout?.paidAmount ?? row.amount;
		const ok = await confirm({
			title: "Batalkan pembayaran komisi?",
			description:
				row.status === "advance"
					? `Pembayaran di muka untuk ${row.payeeName} (${formatRupiah(paid)}) akan dibatalkan & jurnalnya dibalik. Uang muka komisi hilang, komisi kembali ke status "Belum settle".`
					: `Pembayaran komisi ${row.kind} untuk ${row.payeeName} (${formatRupiah(paid)}) akan dibatalkan dan jurnal dibalik. Utang komisi muncul lagi.`,
			confirmLabel: "Batalkan pembayaran",
			variant: "destructive",
		});
		if (!ok) return;
		setReversingKey(key);
		const res = await unpayCommission({
			event_id: row.eventId,
			project_id: row.projectId,
			kind: row.kind,
		});
		setReversingKey(null);
		if (!res.ok) {
			toast.error(res.error);
			return;
		}
		toast.success("Pembayaran komisi dibatalkan");
		router.refresh();
	}

	if (rows.length === 0) {
		return (
			<div className="rounded-2xl border border-dashed border-border-default p-10 text-center">
				<Handshake className="mx-auto size-6 text-muted-foreground/50" />
				<p className="mt-2 text-[13px] text-muted-foreground">
					Belum ada komisi. Buat event channel Vendor atau Relasi dengan komisi.
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="overflow-x-auto rounded-2xl border border-border-subtle bg-card">
				<table className="w-full min-w-[720px] text-[13px]">
					<thead>
						<tr className="border-b border-border-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<th className="px-4 py-3">Penerima</th>
							<th className="px-4 py-3">Event</th>
							<th className="px-4 py-3 text-right">Komisi</th>
							<th className="px-4 py-3">Status</th>
							<th className="px-4 py-3 text-right">Aksi</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border-subtle">
						{rows.map((row) => {
							const key = `${row.eventId}:${row.kind}`;
							const meta = STATUS_META[row.status];
							return (
								<tr key={key} className="align-middle">
									<td className="px-4 py-3">
										<div className="font-medium text-foreground">
											{row.payeeName}
										</div>
										<div className="mt-0.5 text-[11px] capitalize text-muted-foreground">
											{row.kind}
											{row.payeeContact ? ` · ${row.payeeContact}` : ""}
										</div>
									</td>
									<td className="px-4 py-3">
										<Link
											href={`/operations/${row.projectId}`}
											className="text-foreground hover:text-[#0070f3] hover:underline"
										>
											{row.clientName}
										</Link>
										<div className="mt-0.5 text-[11px] text-muted-foreground">
											{row.eventDate ? formatDateID(row.eventDate) : "—"}
										</div>
									</td>
									<td className="px-4 py-3 text-right">
										<span className="tabular font-semibold text-foreground">
											{formatRupiah(row.amount)}
										</span>
									</td>
									<td className="px-4 py-3">
										<span
											className={cn(
												"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
												meta.cls,
											)}
										>
											{meta.label}
										</span>
										{row.payout ? (
											<div className="mt-0.5 text-[10.5px] text-muted-foreground">
												{formatDateID(row.payout.paymentDate)}
												{row.payout.bankName ? ` · ${row.payout.bankName}` : ""}
												{row.status === "advance" ? " · nunggu settle" : ""}
											</div>
										) : null}
										{row.payout && row.payout.paidAmount !== row.amount ? (
											<div className="tabular mt-0.5 text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
												Dibayar {formatRupiah(row.payout.paidAmount)} — komisi
												sekarang {formatRupiah(row.amount)}
											</div>
										) : null}
									</td>
									<td className="px-4 py-3 text-right">
										{row.status === "payable" ? (
											<button
												type="button"
												onClick={() => openPay(row)}
												className="press tap inline-flex h-8 items-center gap-1.5 rounded-full bg-[#059669] px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[#047857]"
											>
												Bayar
											</button>
										) : row.status === "not_settled" && row.canPayAdvance ? (
											<button
												type="button"
												onClick={() => openPay(row)}
												title="Bayar sekarang walau event belum di-settle. Dicatat sebagai uang muka & otomatis diperhitungkan saat settle."
												className="press tap inline-flex h-8 items-center gap-1.5 rounded-full border border-border-default px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary"
											>
												<Clock3 className="size-3.5" aria-hidden />
												Bayar di muka
											</button>
										) : row.status === "paid" || row.status === "advance" ? (
											<button
												type="button"
												onClick={() => reverse(row)}
												disabled={reversingKey === key}
												className="press tap inline-flex h-8 items-center gap-1.5 rounded-full border border-border-default px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-50"
											>
												<RotateCcw className="size-3.5" aria-hidden />
												{reversingKey === key ? "…" : "Batalkan"}
											</button>
										) : row.status === "not_settled" ? (
											<span
												className="text-[11.5px] text-muted-foreground"
												title="Event ini ditutup sebelum cutoff pembukuan — komisinya tidak tercatat di buku sekarang."
											>
												Di luar buku
											</span>
										) : (
											<span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
												<CheckCircle2 className="size-3.5" aria-hidden />
												Otomatis
											</span>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<CommissionPayDialog
				row={payRow}
				banks={banks}
				defaultDate={defaultDate}
				open={open}
				onOpenChange={setOpen}
				onDone={() => router.refresh()}
			/>
		</>
	);
}
