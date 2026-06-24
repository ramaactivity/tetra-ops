"use client";

import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	CheckCircle2,
	CloudUpload,
	Download,
	Loader2,
	Lock,
	PackageOpen,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput, NumberField } from "@/components/ui/form-fields";
import { toast } from "@/components/ui/toaster";
import {
	backupCutoffToDrive,
	executeFinanceCutoff,
	getCutoffBackup,
} from "@/lib/actions/finance-cutoff";
import {
	CUTOFF_MAX_DATE,
	type CutoffBackupPayload,
	type CutoffBankOption,
	type CutoffItemOption,
	type ExecuteCutoffResult,
} from "@/lib/cutoff/types";
import { cn } from "@/lib/utils";

const rp = (n: number) =>
	`Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

function csvEscape(v: unknown): string {
	if (v == null) return "";
	const s = typeof v === "object" ? JSON.stringify(v) : String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV, one section per table — Excel-friendly backup of all wiped data. */
function buildBackupCsv(payload: CutoffBackupPayload): string {
	const out: string[] = [];
	for (const [table, { count, rows }] of Object.entries(payload.tables)) {
		out.push(`=== ${table} (${count} baris) ===`);
		if (rows.length > 0) {
			const cols = Array.from(
				rows.reduce<Set<string>>((set, r) => {
					for (const k of Object.keys(r as object)) set.add(k);
					return set;
				}, new Set()),
			);
			out.push(cols.map(csvEscape).join(","));
			for (const r of rows) {
				out.push(
					cols
						.map((c) => csvEscape((r as Record<string, unknown>)[c]))
						.join(","),
				);
			}
		} else {
			out.push("(kosong)");
		}
		out.push("");
	}
	return out.join("\n");
}

const STEPS = [
	"Tanggal",
	"Backup",
	"Kas & Bank",
	"Stok Awal",
	"Tinjau",
] as const;

type Props = {
	today: string;
	banks: CutoffBankOption[];
	items: CutoffItemOption[];
	driveConfigured: boolean;
};

export function CutoffWizard({ today, banks, items, driveConfigured }: Props) {
	const [step, setStep] = useState(0); // 0..4 wizard, 5 = done
	const [cutoffDate, setCutoffDate] = useState(today);

	// Backup
	const [backupBusy, setBackupBusy] = useState<
		"json" | "excel" | "drive" | null
	>(null);
	const [downloaded, setDownloaded] = useState(false);
	const [excelDone, setExcelDone] = useState(false);
	const [driveUrl, setDriveUrl] = useState<string | null>(null);

	// Opening balances
	const [cash, setCash] = useState(0);
	const [bankAmounts, setBankAmounts] = useState<Record<string, number>>({});
	const [itemQty, setItemQty] = useState<Record<string, number>>({});
	const [itemWac, setItemWac] = useState<Record<string, number>>({});

	// Execute
	const [confirmText, setConfirmText] = useState("");
	const [pending, startTransition] = useTransition();
	const [result, setResult] = useState<ExecuteCutoffResult | null>(null);

	const bankTotal = useMemo(
		() => Object.values(bankAmounts).reduce((s, v) => s + (v || 0), 0),
		[bankAmounts],
	);
	const stokLines = useMemo(
		() =>
			items
				.map((it) => {
					const qty = itemQty[it.item_id] || 0;
					const wac = itemWac[it.item_id] || 0;
					return { ...it, qty, wac, value: qty * wac };
				})
				.filter((l) => l.value > 0),
		[items, itemQty, itemWac],
	);
	const stokTotal = useMemo(
		() => stokLines.reduce((s, l) => s + l.value, 0),
		[stokLines],
	);
	const totalAssets = cash + bankTotal + stokTotal;
	const backupDone = downloaded || excelDone || Boolean(driveUrl);

	function triggerDownload(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	async function handleDownload() {
		setBackupBusy("json");
		try {
			const payload = await getCutoffBackup();
			triggerDownload(
				new Blob([JSON.stringify(payload, null, 2)], {
					type: "application/json",
				}),
				`backup-keuangan-${cutoffDate}.json`,
			);
			setDownloaded(true);
			toast.success(`Backup ${payload.totalRows} baris ter-download (JSON).`);
		} catch (e) {
			toast.error(`Gagal backup: ${(e as Error).message}`);
		} finally {
			setBackupBusy(null);
		}
	}

	async function handleExcel() {
		setBackupBusy("excel");
		try {
			const payload = await getCutoffBackup();
			// Satu CSV (dibuka Excel), satu seksi per tabel. BOM (﻿) agar Excel
			// membaca UTF-8 dengan benar.
			triggerDownload(
				new Blob([`﻿${buildBackupCsv(payload)}`], {
					type: "text/csv;charset=utf-8",
				}),
				`backup-keuangan-${cutoffDate}.csv`,
			);
			setExcelDone(true);
			toast.success(`Backup ${payload.totalRows} baris ter-download (Excel).`);
		} catch (e) {
			toast.error(`Gagal backup Excel: ${(e as Error).message}`);
		} finally {
			setBackupBusy(null);
		}
	}

	async function handleDrive() {
		setBackupBusy("drive");
		try {
			const res = await backupCutoffToDrive();
			if (res.ok && res.url) {
				setDriveUrl(res.url);
				toast.success(
					`Backup ${res.totalRows ?? ""} baris tersimpan di Drive.`,
				);
			} else {
				toast.error(res.error ?? "Gagal backup ke Drive.");
			}
		} catch (e) {
			toast.error(`Gagal backup ke Drive: ${(e as Error).message}`);
		} finally {
			setBackupBusy(null);
		}
	}

	function handleExecute() {
		startTransition(async () => {
			const res = await executeFinanceCutoff({
				cutoffDate,
				cash,
				banks: banks
					.map((b) => ({
						coa_code: b.coa_code,
						amount: bankAmounts[b.coa_code] || 0,
					}))
					.filter((b) => b.amount > 0),
				items: items
					.map((it) => ({
						item_id: it.item_id,
						qty_base: itemQty[it.item_id] || 0,
						wac: itemWac[it.item_id] || 0,
					}))
					.filter((it) => it.qty_base > 0),
			});
			if (res.ok) {
				setResult(res);
				setStep(5);
			} else {
				toast.error(res.error ?? "Cutoff gagal.");
			}
		});
	}

	// ── Done state ──────────────────────────────────────────────────────────
	if (step === 5 && result?.ok) {
		return (
			<div className="rounded-2xl border border-border-subtle bg-card p-6 text-center sm:p-10">
				<div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
					<CheckCircle2 className="size-7" />
				</div>
				<h2 className="mt-4 text-lg font-semibold">
					Cutoff keuangan selesai 🎉
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Pembukuan dimulai bersih dari{" "}
					<span className="font-medium text-foreground">
						{result.cutoffDate}
					</span>
					.
				</p>
				<div className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-3 text-left">
					<Stat label="Saldo awal" value={rp(result.openingTotal ?? 0)} />
					<Stat
						label="Event dibekukan"
						value={String(result.eventsFrozen ?? 0)}
					/>
					<Stat label="Jurnal" value={result.journalRef ?? "—"} />
				</div>
				<div className="mt-6 flex flex-wrap justify-center gap-2">
					<Link
						href="/finance"
						className={buttonVariants({ variant: "default" })}
					>
						Buka Neraca
					</Link>
					<Link
						href="/warehouse"
						className={buttonVariants({ variant: "outline" })}
					>
						Cek Stok
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<StepIndicator current={step} />

			<div className="rounded-2xl border border-border-subtle bg-card p-5 sm:p-6">
				{/* STEP 0 — Tanggal */}
				{step === 0 && (
					<div className="space-y-4">
						<Header
							title="Mulai pembukuan dari titik nol"
							desc="Wizard ini menutup data keuangan lama dan memulai buku baru yang bersih. Event tetap aman — tidak dihapus, hanya dibekukan agar tak mengganggu buku baru."
						/>
						<div className="max-w-xs">
							<span className="mb-1.5 block text-sm font-medium">
								Tanggal cutoff
							</span>
							<DatePicker
								value={cutoffDate}
								onValueChange={setCutoffDate}
								max={CUTOFF_MAX_DATE}
							/>
							<p className="mt-1.5 text-xs text-muted-foreground">
								Buku baru mulai tanggal ini. Paling lambat {CUTOFF_MAX_DATE}.
							</p>
						</div>
					</div>
				)}

				{/* STEP 1 — Backup */}
				{step === 1 && (
					<div className="space-y-4">
						<Header
							title="Backup dulu sebelum hapus"
							desc="Cutoff menghapus PERMANEN data keuangan lama (jurnal, settlement, stok, hutang, dll). Simpan cadangan dulu — minimal salah satu di bawah ini wajib."
						/>
						<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
							<AlertTriangle className="mr-1.5 inline size-4 align-text-bottom" />
							Data lama tidak bisa dipulihkan dari aplikasi setelah cutoff.
							Pastikan backup tersimpan.
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								onClick={handleExcel}
								disabled={backupBusy !== null}
							>
								{backupBusy === "excel" ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Download className="size-4" />
								)}
								Download Excel (.csv)
								{excelDone && (
									<CheckCircle2 className="size-4 text-emerald-600" />
								)}
							</Button>
							<Button
								variant="outline"
								onClick={handleDownload}
								disabled={backupBusy !== null}
							>
								{backupBusy === "json" ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Download className="size-4" />
								)}
								Download JSON
								{downloaded && (
									<CheckCircle2 className="size-4 text-emerald-600" />
								)}
							</Button>
							{driveConfigured && (
								<Button
									variant="outline"
									onClick={handleDrive}
									disabled={backupBusy !== null}
								>
									{backupBusy === "drive" ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<CloudUpload className="size-4" />
									)}
									Backup ke Google Drive
									{driveUrl && (
										<CheckCircle2 className="size-4 text-emerald-600" />
									)}
								</Button>
							)}
						</div>
						{driveUrl && (
							<p className="text-xs text-muted-foreground">
								Tersimpan di Drive ·{" "}
								<a
									href={driveUrl}
									target="_blank"
									rel="noreferrer"
									className="text-link underline"
								>
									buka folder
								</a>
							</p>
						)}
						{!driveConfigured && (
							<p className="text-xs text-muted-foreground">
								Google Drive belum dikonfigurasi — gunakan download lokal.
							</p>
						)}
					</div>
				)}

				{/* STEP 2 — Kas & Bank */}
				{step === 2 && (
					<div className="space-y-4">
						<Header
							icon={<Wallet className="size-5" />}
							title="Saldo awal Kas & Bank"
							desc="Isi posisi uang riil per tanggal cutoff. Kosongkan yang tidak ada."
						/>
						<div className="space-y-2.5">
							<BalanceRow label="Kas Tunai" sub="1-100">
								<MoneyInput value={cash} onValueChange={setCash} />
							</BalanceRow>
							{banks.map((b) => (
								<BalanceRow
									key={b.coa_code}
									label={b.accountName || b.bankName}
									sub={`${b.bankName} · ${b.coa_code}`}
								>
									<MoneyInput
										value={bankAmounts[b.coa_code] || 0}
										onValueChange={(v) =>
											setBankAmounts((p) => ({ ...p, [b.coa_code]: v }))
										}
									/>
								</BalanceRow>
							))}
						</div>
						<TotalBar label="Total Kas & Bank" value={cash + bankTotal} />
					</div>
				)}

				{/* STEP 3 — Stok awal */}
				{step === 3 && (
					<div className="space-y-4">
						<Header
							icon={<PackageOpen className="size-5" />}
							title="Stok awal & harga rata-rata"
							desc="Isi jumlah stok fisik + perkiraan harga modal per satuan dasar. Item tanpa stok boleh dikosongkan."
						/>
						<div className="space-y-2.5">
							{items.length === 0 && (
								<p className="text-sm text-muted-foreground">
									Tidak ada item persediaan aktif.
								</p>
							)}
							{items.map((it) => {
								const qty = itemQty[it.item_id] || 0;
								const wac = itemWac[it.item_id] || 0;
								return (
									<div
										key={it.item_id}
										className="rounded-xl border border-border-subtle p-3"
									>
										<div className="flex items-baseline justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate text-sm font-medium">
													{it.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{it.sku}
												</p>
											</div>
											{qty * wac > 0 && (
												<span className="shrink-0 text-sm font-medium tabular">
													{rp(qty * wac)}
												</span>
											)}
										</div>
										<div className="mt-2 grid grid-cols-2 gap-2">
											<div className="block">
												<span className="mb-1 block text-xs text-muted-foreground">
													Jumlah ({it.unit})
												</span>
												<NumberField
													min={0}
													step="any"
													aria-label={`Jumlah ${it.name}`}
													value={qty === 0 ? "" : qty}
													onChange={(e) =>
														setItemQty((p) => ({
															...p,
															[it.item_id]: Math.max(
																0,
																Number(e.target.value) || 0,
															),
														}))
													}
												/>
											</div>
											<div className="block">
												<span className="mb-1 block text-xs text-muted-foreground">
													Harga / {it.unit}
												</span>
												<MoneyInput
													value={wac}
													aria-label={`Harga ${it.name}`}
													onValueChange={(v) =>
														setItemWac((p) => ({ ...p, [it.item_id]: v }))
													}
												/>
											</div>
										</div>
									</div>
								);
							})}
						</div>
						<TotalBar label="Total Persediaan" value={stokTotal} />
					</div>
				)}

				{/* STEP 4 — Review & execute */}
				{step === 4 && (
					<div className="space-y-4">
						<Header
							title="Tinjau jurnal pembuka"
							desc="Saldo awal dicatat sebagai satu jurnal seimbang. Modal Awal otomatis menyeimbangkan total aset."
						/>
						<div className="overflow-hidden rounded-xl border border-border-subtle">
							<table className="w-full text-sm">
								<thead className="bg-secondary/50 text-xs text-muted-foreground">
									<tr>
										<th className="px-3 py-2 text-left font-medium">Akun</th>
										<th className="px-3 py-2 text-right font-medium">Debit</th>
										<th className="px-3 py-2 text-right font-medium">Kredit</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border-subtle">
									{cash > 0 && <JeRow name="1-100 Kas Tunai" debit={cash} />}
									{banks
										.filter((b) => (bankAmounts[b.coa_code] || 0) > 0)
										.map((b) => (
											<JeRow
												key={b.coa_code}
												name={`${b.coa_code} ${b.accountName || b.bankName}`}
												debit={bankAmounts[b.coa_code] || 0}
											/>
										))}
									{stokTotal > 0 && (
										<JeRow name="1-2xx Persediaan" debit={stokTotal} />
									)}
									<JeRow
										name="3-101 Modal Awal / Saldo Awal"
										credit={totalAssets}
										bold
									/>
								</tbody>
								<tfoot className="border-t border-border-default bg-secondary/30 text-sm font-semibold">
									<tr>
										<td className="px-3 py-2">Total</td>
										<td className="px-3 py-2 text-right tabular">
											{rp(totalAssets)}
										</td>
										<td className="px-3 py-2 text-right tabular">
											{rp(totalAssets)}
										</td>
									</tr>
								</tfoot>
							</table>
						</div>
						<p className="flex items-center gap-1.5 text-sm text-emerald-700">
							<CheckCircle2 className="size-4" /> Buku seimbang — Debit = Kredit
							= {rp(totalAssets)}
						</p>

						<div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
							<p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
								<AlertTriangle className="size-4" /> Tindakan permanen
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Data keuangan lama akan dihapus permanen dan {/* */}
								event sebelum {cutoffDate} dibekukan. Ketik{" "}
								<span className="font-mono font-semibold text-foreground">
									HAPUS
								</span>{" "}
								untuk konfirmasi.
							</p>
							<input
								value={confirmText}
								onChange={(e) => setConfirmText(e.target.value)}
								placeholder="HAPUS"
								className="mt-2.5 h-10 w-40 rounded-md border border-border-default bg-background px-3 text-base uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
						</div>
					</div>
				)}

				{/* Footer nav */}
				<div className="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
					<Button
						variant="ghost"
						onClick={() => setStep((s) => Math.max(0, s - 1))}
						disabled={step === 0 || pending}
					>
						<ArrowLeft className="size-4" /> Kembali
					</Button>

					{step < 4 ? (
						<Button
							onClick={() => setStep((s) => s + 1)}
							disabled={step === 1 && !backupDone}
						>
							Lanjut <ArrowRight className="size-4" />
						</Button>
					) : (
						<Button
							variant="destructive"
							onClick={handleExecute}
							disabled={pending || confirmText.trim().toUpperCase() !== "HAPUS"}
						>
							{pending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Lock className="size-4" />
							)}
							Jalankan Cutoff
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

// ── Small presentational helpers ────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
	return (
		<ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
			{STEPS.map((label, i) => {
				const done = i < current;
				const active = i === current;
				return (
					<li key={label} className="flex items-center gap-2">
						<span
							className={cn(
								"flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
								done && "bg-emerald-500 text-white",
								active && "bg-foreground text-background",
								!done && !active && "bg-secondary text-muted-foreground",
							)}
						>
							{done ? "✓" : i + 1}
						</span>
						<span
							className={cn(
								"font-medium",
								active ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{label}
						</span>
						{i < STEPS.length - 1 && (
							<span className="mx-0.5 text-border-strong">·</span>
						)}
					</li>
				);
			})}
		</ol>
	);
}

function Header({
	title,
	desc,
	icon,
}: {
	title: string;
	desc: string;
	icon?: React.ReactNode;
}) {
	return (
		<div>
			<h2 className="flex items-center gap-2 text-base font-semibold">
				{icon}
				{title}
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">{desc}</p>
		</div>
	);
}

function BalanceRow({
	label,
	sub,
	children,
}: {
	label: string;
	sub?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle p-3">
			<div className="min-w-0">
				<p className="truncate text-sm font-medium">{label}</p>
				{sub && <p className="text-xs text-muted-foreground">{sub}</p>}
			</div>
			<div className="w-44 shrink-0">{children}</div>
		</div>
	);
}

function TotalBar({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-2.5 text-sm font-semibold">
			<span>{label}</span>
			<span className="tabular">{rp(value)}</span>
		</div>
	);
}

function JeRow({
	name,
	debit,
	credit,
	bold,
}: {
	name: string;
	debit?: number;
	credit?: number;
	bold?: boolean;
}) {
	return (
		<tr className={cn(bold && "font-medium")}>
			<td className="px-3 py-2">{name}</td>
			<td className="px-3 py-2 text-right tabular">
				{debit ? rp(debit) : "—"}
			</td>
			<td className="px-3 py-2 text-right tabular">
				{credit ? rp(credit) : "—"}
			</td>
		</tr>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-border-subtle bg-secondary/30 p-3">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="mt-0.5 truncate text-sm font-semibold tabular">{value}</p>
		</div>
	);
}
