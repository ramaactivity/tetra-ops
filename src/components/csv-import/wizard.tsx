"use client";

import {
	AlertTriangle,
	Archive,
	ArrowLeft,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Download,
	FileSpreadsheet,
	Inbox,
	Loader2,
	Upload,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { normalizeHeaderKey, parseCsv } from "@/lib/csv-import/parser";
import type {
	ImportResult,
	ImportStat,
	WizardConfig,
} from "@/lib/csv-import/types";

type Step = 1 | 2 | 3 | 4;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function CsvImportWizard({ config }: { config: WizardConfig }) {
	const [step, setStep] = useState<Step>(1);
	const [fileName, setFileName] = useState<string | null>(null);
	const [headers, setHeaders] = useState<string[]>([]);
	const [rows, setRows] = useState<string[][]>([]);
	const [mapping, setMapping] = useState<Record<number, string>>({});
	const [duplicates, setDuplicates] = useState<Set<string>>(new Set());
	const [result, setResult] = useState<ImportResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const handleFile = useCallback(
		(file: File) => {
			setError(null);
			if (file.size > MAX_FILE_SIZE) {
				setError(
					`File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
				);
				return;
			}
			const reader = new FileReader();
			reader.onload = (e) => {
				const text = String(e.target?.result ?? "");
				try {
					const parsed = parseCsv(text);
					if (parsed.length < 2) {
						setError("Minimal 2 baris (header + 1 data row).");
						return;
					}
					const csvHeaders = parsed[0];
					const dataRows = parsed.slice(1);
					const autoMapping: Record<number, string> = {};
					csvHeaders.forEach((h, idx) => {
						const normalized = normalizeHeaderKey(h);
						const target = config.headerAliases[normalized];
						if (target) autoMapping[idx] = target;
					});
					setFileName(file.name);
					setHeaders(csvHeaders);
					setRows(dataRows);
					setMapping(autoMapping);
					setStep(2);
				} catch (err) {
					setError(
						`Gagal parse CSV: ${err instanceof Error ? err.message : "unknown"}`,
					);
				}
			};
			reader.onerror = () => setError("Gagal membaca file.");
			reader.readAsText(file);
		},
		[config.headerAliases],
	);

	const handlePasteText = useCallback(
		(text: string) => {
			setError(null);
			try {
				const parsed = parseCsv(text);
				if (parsed.length < 2) {
					setError("Minimal 2 baris (header + 1 data row).");
					return;
				}
				const csvHeaders = parsed[0];
				const dataRows = parsed.slice(1);
				const autoMapping: Record<number, string> = {};
				csvHeaders.forEach((h, idx) => {
					const normalized = normalizeHeaderKey(h);
					const target = config.headerAliases[normalized];
					if (target) autoMapping[idx] = target;
				});
				setFileName("Pasted CSV");
				setHeaders(csvHeaders);
				setRows(dataRows);
				setMapping(autoMapping);
				setStep(2);
			} catch (err) {
				setError(
					`Gagal parse CSV: ${err instanceof Error ? err.message : "unknown"}`,
				);
			}
		},
		[config.headerAliases],
	);

	// Validate that all required target fields are mapped
	const requiredFields = config.targetFields.filter((f) => f.required);
	const mappedFields = useMemo(() => new Set(Object.values(mapping)), [mapping]);
	const missingRequired = requiredFields.filter((f) => !mappedFields.has(f.key));

	// Build mapped rows: array of { targetKey: value }
	const buildMappedRows = useCallback((): Record<string, string>[] => {
		return rows.map((row) => {
			const obj: Record<string, string> = {};
			headers.forEach((_h, idx) => {
				const targetKey = mapping[idx];
				if (targetKey && targetKey !== "skip") {
					obj[targetKey] = (row[idx] ?? "").toString().trim();
				}
			});
			return obj;
		});
	}, [headers, rows, mapping]);

	const goPreview = useCallback(() => {
		setError(null);
		if (missingRequired.length > 0) {
			setError(
				`Field wajib belum ter-map: ${missingRequired.map((f) => f.label).join(", ")}`,
			);
			return;
		}
		const mapped = buildMappedRows();
		const primaryKeys = mapped
			.map((r) => r[config.primaryKeyField])
			.filter((v): v is string => Boolean(v));
		startTransition(async () => {
			try {
				const dupes = await config.checkDuplicates(primaryKeys);
				setDuplicates(new Set(dupes));
				setStep(3);
			} catch (err) {
				setError(
					`Duplicate check gagal: ${err instanceof Error ? err.message : "unknown"}`,
				);
			}
		});
	}, [missingRequired, buildMappedRows, config, startTransition]);

	const commit = useCallback(() => {
		setError(null);
		const mapped = buildMappedRows();
		startTransition(async () => {
			try {
				const r = await config.commit(mapped);
				setResult(r);
				setStep(4);
			} catch (err) {
				setError(
					`Import gagal: ${err instanceof Error ? err.message : "unknown"}`,
				);
			}
		});
	}, [buildMappedRows, config, startTransition]);

	const reset = useCallback(() => {
		setStep(1);
		setFileName(null);
		setHeaders([]);
		setRows([]);
		setMapping({});
		setDuplicates(new Set());
		setResult(null);
		setError(null);
	}, []);

	return (
		<div className="space-y-6">
			{config.backHref && (
				<Link
					href={config.backHref}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{config.backLabel ?? "Back"}
				</Link>
			)}

			<header className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">{config.title}</h2>
				<p className="text-muted-foreground text-sm">{config.description}</p>
			</header>

			<StepIndicator current={step} />

			{error && (
				<div className="border-destructive bg-destructive/10 flex items-start gap-2 rounded-md border p-3">
					<AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
					<p className="text-destructive text-sm">{error}</p>
				</div>
			)}

			<div className="border-border bg-card rounded-xl border p-5">
				{step === 1 && (
					<UploadStep
						onFile={handleFile}
						onPaste={handlePasteText}
						sampleCsv={config.sampleCsv}
					/>
				)}
				{step === 2 && (
					<MapStep
						fileName={fileName}
						headers={headers}
						rowCount={rows.length}
						mapping={mapping}
						setMapping={setMapping}
						targetFields={config.targetFields}
						missingRequired={missingRequired}
						onBack={() => setStep(1)}
						onNext={goPreview}
						isPending={isPending}
					/>
				)}
				{step === 3 && (
					<PreviewStep
						headers={headers}
						rows={rows}
						mapping={mapping}
						targetFields={config.targetFields}
						primaryKeyField={config.primaryKeyField}
						primaryKeyLabel={config.primaryKeyLabel}
						duplicates={duplicates}
						duplicateStrategy={config.duplicateStrategy}
						onBack={() => setStep(2)}
						onCommit={commit}
						isPending={isPending}
					/>
				)}
				{step === 4 && result && (
					<DoneStep result={result} onReset={reset} />
				)}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
	const steps: { num: Step; label: string }[] = [
		{ num: 1, label: "Upload" },
		{ num: 2, label: "Map" },
		{ num: 3, label: "Preview" },
		{ num: 4, label: "Done" },
	];
	return (
		<ol className="flex items-center gap-2">
			{steps.map((s, idx) => {
				const isActive = s.num === current;
				const isDone = s.num < current;
				return (
					<li key={s.num} className="flex items-center gap-2">
						<div className="flex items-center gap-2">
							<span
								className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
									isDone
										? "bg-primary text-primary-foreground"
										: isActive
											? "bg-primary text-primary-foreground ring-primary/20 ring-4"
											: "border-border bg-card text-muted-foreground border"
								}`}
							>
								{isDone ? <CheckCircle2 className="h-4 w-4" /> : s.num}
							</span>
							<span
								className={`text-sm font-medium ${
									isActive
										? "text-foreground"
										: isDone
											? "text-muted-foreground"
											: "text-muted-foreground/60"
								}`}
							>
								{s.label}
							</span>
						</div>
						{idx < steps.length - 1 && (
							<span
								className={`h-px w-8 ${
									isDone ? "bg-primary/40" : "bg-border"
								}`}
							/>
						)}
					</li>
				);
			})}
		</ol>
	);
}

// ─────────────────────────────────────────────────────────────────────────
// Step 1 — Upload
// ─────────────────────────────────────────────────────────────────────────

function UploadStep({
	onFile,
	onPaste,
	sampleCsv,
}: {
	onFile: (f: File) => void;
	onPaste: (text: string) => void;
	sampleCsv?: string;
}) {
	const [dragActive, setDragActive] = useState(false);
	const [showPaste, setShowPaste] = useState(false);
	const [pasteText, setPasteText] = useState("");

	return (
		<div className="space-y-5">
			<div className="space-y-1">
				<h3 className="text-base font-semibold">Upload CSV file</h3>
				<p className="text-muted-foreground text-sm">
					Pilih file CSV dari Google Sheets (File → Download → CSV) atau Excel.
					Header kolom akan auto-detect. Max 10MB.
				</p>
			</div>

			{!showPaste && (
				<label
					htmlFor="csv-file"
					onDragOver={(e) => {
						e.preventDefault();
						setDragActive(true);
					}}
					onDragLeave={() => setDragActive(false)}
					onDrop={(e) => {
						e.preventDefault();
						setDragActive(false);
						const file = e.dataTransfer.files[0];
						if (file) onFile(file);
					}}
					className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
						dragActive
							? "border-primary bg-primary/5"
							: "border-border bg-background hover:border-foreground/30"
					}`}
				>
					<div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-xl">
						<Upload className="h-6 w-6" />
					</div>
					<div className="space-y-0.5">
						<p className="text-foreground text-base font-medium">
							Click untuk pilih CSV file
						</p>
						<p className="text-muted-foreground text-xs">
							atau drag and drop · Max 10MB
						</p>
					</div>
					<input
						id="csv-file"
						type="file"
						accept=".csv,text/csv"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) onFile(file);
							e.target.value = "";
						}}
					/>
				</label>
			)}

			{showPaste && (
				<div className="space-y-2">
					<label
						htmlFor="paste-csv"
						className="text-foreground text-sm font-medium"
					>
						Paste CSV content
					</label>
					<textarea
						id="paste-csv"
						rows={12}
						value={pasteText}
						onChange={(e) => setPasteText(e.target.value)}
						placeholder={sampleCsv}
						className="border-border bg-background text-foreground focus-visible:ring-ring placeholder:text-muted-foreground/50 w-full rounded-md border px-3 py-2 font-mono text-xs leading-relaxed focus-visible:ring-2 focus-visible:outline-none"
					/>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								setShowPaste(false);
								setPasteText("");
							}}
							className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center px-3 text-sm font-medium"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={() => onPaste(pasteText)}
							disabled={!pasteText.trim()}
							className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50"
						>
							Parse
							<ChevronRight className="h-4 w-4" />
						</button>
					</div>
				</div>
			)}

			{!showPaste && (
				<div className="text-muted-foreground text-center text-xs">
					atau{" "}
					<button
						type="button"
						onClick={() => setShowPaste(true)}
						className="text-primary hover:underline"
					>
						paste CSV langsung
					</button>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2 — Map
// ─────────────────────────────────────────────────────────────────────────

function MapStep({
	fileName,
	headers,
	rowCount,
	mapping,
	setMapping,
	targetFields,
	missingRequired,
	onBack,
	onNext,
	isPending,
}: {
	fileName: string | null;
	headers: string[];
	rowCount: number;
	mapping: Record<number, string>;
	setMapping: (m: Record<number, string>) => void;
	targetFields: import("@/lib/csv-import/types").TargetField[];
	missingRequired: import("@/lib/csv-import/types").TargetField[];
	onBack: () => void;
	onNext: () => void;
	isPending: boolean;
}) {
	return (
		<div className="space-y-5">
			<div className="space-y-1">
				<h3 className="text-base font-semibold">Map kolom CSV → field tujuan</h3>
				<p className="text-muted-foreground text-sm">
					{fileName && (
						<>
							<FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
							<span className="text-foreground font-medium">{fileName}</span>
							{" · "}
						</>
					)}
					{headers.length} kolom · {rowCount.toLocaleString("id-ID")} baris
					terdeteksi. Mapping otomatis sudah diisi berdasarkan nama kolom.
				</p>
			</div>

			<div className="border-border overflow-hidden rounded-md border">
				<table className="w-full text-sm">
					<thead className="bg-muted/50">
						<tr>
							<th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">
								Kolom CSV
							</th>
							<th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">
								→ Field tujuan
							</th>
							<th className="text-muted-foreground hidden px-3 py-2 text-left text-xs font-medium uppercase tracking-wider sm:table-cell">
								Sample
							</th>
						</tr>
					</thead>
					<tbody className="divide-border divide-y">
						{headers.map((h, idx) => {
							const usedElsewhere = Object.entries(mapping).some(
								([i, k]) => Number(i) !== idx && k === mapping[idx] && k,
							);
							return (
								<tr key={`${h}-${idx}`}>
									<td className="text-foreground px-3 py-2 font-mono text-xs">
										{h || <span className="text-muted-foreground">(empty)</span>}
									</td>
									<td className="px-3 py-2">
										<select
											value={mapping[idx] ?? "skip"}
											onChange={(e) =>
												setMapping({ ...mapping, [idx]: e.target.value })
											}
											className="border-border bg-background focus-visible:ring-ring h-8 w-full rounded-md border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
										>
											<option value="skip">— Skip kolom ini —</option>
											{targetFields.map((f) => (
												<option key={f.key} value={f.key}>
													{f.label}
													{f.required ? " *" : ""}
												</option>
											))}
										</select>
										{usedElsewhere && mapping[idx] && (
											<p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
												⚠ Field ini sudah ter-map ke kolom lain
											</p>
										)}
									</td>
									<td className="text-muted-foreground hidden truncate px-3 py-2 font-mono text-xs sm:table-cell">
										—
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<details className="text-muted-foreground text-xs">
				<summary className="text-foreground cursor-pointer font-medium">
					Field tujuan yang tersedia ({targetFields.length})
				</summary>
				<dl className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
					{targetFields.map((f) => {
						const isMapped = Object.values(mapping).includes(f.key);
						return (
							<div
								key={f.key}
								className="flex items-baseline gap-1.5"
							>
								{isMapped ? (
									<CheckCircle2 className="text-emerald-600 dark:text-emerald-400 h-3 w-3 shrink-0" />
								) : (
									<span className="border-border h-3 w-3 shrink-0 rounded-full border" />
								)}
								<span
									className={
										isMapped
											? "text-foreground font-medium"
											: f.required
												? "text-amber-700 dark:text-amber-400"
												: ""
									}
								>
									{f.label}
									{f.required && !isMapped && " (wajib)"}
								</span>
							</div>
						);
					})}
				</dl>
			</details>

			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={onBack}
					className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-1 px-3 text-sm font-medium"
				>
					<ArrowLeft className="h-4 w-4" />
					Back
				</button>
				<div className="flex items-center gap-3">
					{missingRequired.length > 0 && (
						<p className="text-amber-700 dark:text-amber-400 text-xs">
							{missingRequired.length} field wajib belum ter-map
						</p>
					)}
					<button
						type="button"
						onClick={onNext}
						disabled={missingRequired.length > 0 || isPending}
						className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50"
					>
						{isPending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<ChevronRight className="h-4 w-4" />
						)}
						Next: Preview
					</button>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────
// Step 3 — Preview
// ─────────────────────────────────────────────────────────────────────────

function PreviewStep({
	headers,
	rows,
	mapping,
	targetFields,
	primaryKeyField,
	primaryKeyLabel,
	duplicates,
	duplicateStrategy,
	onBack,
	onCommit,
	isPending,
}: {
	headers: string[];
	rows: string[][];
	mapping: Record<number, string>;
	targetFields: import("@/lib/csv-import/types").TargetField[];
	primaryKeyField: string;
	primaryKeyLabel: string;
	duplicates: Set<string>;
	duplicateStrategy: "skip" | "update";
	onBack: () => void;
	onCommit: () => void;
	isPending: boolean;
}) {
	const mappedCols = useMemo(() => {
		const cols: { idx: number; key: string; label: string }[] = [];
		headers.forEach((_h, idx) => {
			const targetKey = mapping[idx];
			if (targetKey && targetKey !== "skip") {
				const field = targetFields.find((f) => f.key === targetKey);
				cols.push({ idx, key: targetKey, label: field?.label ?? targetKey });
			}
		});
		return cols;
	}, [headers, mapping, targetFields]);

	const pkColIdx = useMemo(() => {
		const found = Object.entries(mapping).find(
			([, key]) => key === primaryKeyField,
		);
		return found ? Number(found[0]) : -1;
	}, [mapping, primaryKeyField]);

	const duplicateRowCount = rows.filter((r) => {
		const pk = pkColIdx >= 0 ? r[pkColIdx]?.trim() : "";
		return pk && duplicates.has(pk);
	}).length;

	const previewRows = rows.slice(0, 10);

	const dupVerb = duplicateStrategy === "update" ? "di-update" : "di-skip";

	return (
		<div className="space-y-5">
			<div className="space-y-1">
				<h3 className="text-base font-semibold">Preview & Validation</h3>
				<p className="text-muted-foreground text-sm">
					Cek data sebelum import. Duplikat dicek terhadap database existing —
					row dengan {primaryKeyLabel} yang sama akan {dupVerb}.
				</p>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Stat
					label="Total rows"
					value={rows.length}
					tone="muted"
				/>
				<Stat
					label="Mapped fields"
					value={mappedCols.length}
					tone="primary"
				/>
				<Stat
					label="Duplicates"
					value={duplicates.size}
					tone={duplicates.size > 0 ? "amber" : "muted"}
					hint={duplicates.size > 0 ? `→ ${dupVerb}` : "tidak ada"}
				/>
				<Stat
					label="New rows"
					value={rows.length - duplicateRowCount}
					tone="emerald"
				/>
			</div>

			{previewRows.length > 0 && (
				<div className="space-y-1.5">
					<p className="text-muted-foreground text-xs">
						Preview baris pertama ({previewRows.length} dari {rows.length}):
					</p>
					<div className="border-border max-h-72 overflow-auto rounded-md border">
						<table className="w-full text-xs">
							<thead className="bg-muted/50 sticky top-0">
								<tr>
									<th className="text-muted-foreground sticky left-0 bg-muted/50 px-2 py-1.5 text-left font-medium">
										#
									</th>
									{mappedCols.map((c) => (
										<th
											key={c.key}
											className="text-muted-foreground whitespace-nowrap px-2 py-1.5 text-left font-medium"
										>
											{c.label}
											{c.key === primaryKeyField && (
												<span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">
													(PK)
												</span>
											)}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-border divide-y">
								{previewRows.map((r, rIdx) => {
									const pk = pkColIdx >= 0 ? r[pkColIdx]?.trim() : "";
									const isDupe = pk ? duplicates.has(pk) : false;
									return (
										<tr key={`row-${rIdx}`} className={isDupe ? "bg-amber-50 dark:bg-amber-950/30" : ""}>
											<td className="text-muted-foreground sticky left-0 bg-card px-2 py-1 font-mono">
												{rIdx + 2}
												{isDupe && (
													<span className="ml-1" title="Duplicate">
														⚠
													</span>
												)}
											</td>
											{mappedCols.map((c) => (
												<td
													key={c.key}
													className="whitespace-nowrap px-2 py-1 font-mono"
												>
													{r[c.idx] ?? ""}
												</td>
											))}
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={onBack}
					disabled={isPending}
					className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-1 px-3 text-sm font-medium disabled:opacity-50"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to mapping
				</button>
				<button
					type="button"
					onClick={onCommit}
					disabled={isPending}
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50"
				>
					{isPending ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" />
							Mengimport…
						</>
					) : (
						<>
							<FileSpreadsheet className="h-4 w-4" />
							Confirm & Import
						</>
					)}
				</button>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────
// Step 4 — Done
// ─────────────────────────────────────────────────────────────────────────

function DoneStep({
	result,
	onReset,
}: {
	result: ImportResult;
	onReset: () => void;
}) {
	return (
		<div className="space-y-5">
			<div className="flex items-center gap-3">
				<div className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex h-12 w-12 items-center justify-center rounded-xl">
					<CheckCircle2 className="h-6 w-6" />
				</div>
				<div>
					<h3 className="text-base font-semibold">Import selesai</h3>
					<p className="text-muted-foreground text-sm">
						{result.totalRows.toLocaleString("id-ID")} baris diproses.
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
				<Stat label="Total" value={result.totalRows} tone="muted" />
				{result.stats.map((s) => (
					<Stat
						key={s.label}
						label={s.label}
						value={s.value}
						tone={s.tone}
					/>
				))}
			</div>

			<details className="space-y-2">
				<summary className="text-foreground cursor-pointer text-sm font-medium">
					Lihat detail per baris ({result.rows.length})
				</summary>
				<div className="border-border max-h-96 overflow-auto rounded-md border">
					<table className="w-full text-xs">
						<thead className="bg-muted/50 sticky top-0">
							<tr>
								<th className="px-2 py-1.5 text-left font-medium">Row</th>
								<th className="px-2 py-1.5 text-left font-medium">PK</th>
								<th className="px-2 py-1.5 text-left font-medium">Label</th>
								<th className="px-2 py-1.5 text-left font-medium">Status</th>
								<th className="px-2 py-1.5 text-left font-medium">Notes</th>
							</tr>
						</thead>
						<tbody className="divide-border divide-y">
							{result.rows.map((r) => (
								<tr key={`${r.row}-${r.primaryKey ?? "na"}`}>
									<td className="text-muted-foreground tabular px-2 py-1">
										{r.row}
									</td>
									<td className="text-muted-foreground tabular px-2 py-1 font-mono">
										{r.primaryKey ?? "—"}
									</td>
									<td className="px-2 py-1">{r.label ?? "—"}</td>
									<td className="px-2 py-1">
										<StatusPill status={r.status} category={r.category} />
									</td>
									<td className="text-muted-foreground space-y-0.5 px-2 py-1">
										{r.message && <div>{r.message}</div>}
										{r.warnings?.map((w, idx) => (
											<div
												key={`${r.row}-w-${idx}`}
												className="text-amber-700 dark:text-amber-400"
											>
												⚠ {w}
											</div>
										))}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>

			<div className="flex items-center justify-between">
				<DownloadReportButton result={result} />
				<button
					type="button"
					onClick={onReset}
					className="border-border text-foreground hover:bg-muted inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium"
				>
					Import another
				</button>
			</div>
		</div>
	);
}

function Stat({
	label,
	value,
	tone,
	hint,
}: {
	label: string;
	value: number;
	tone?: "muted" | "primary" | "emerald" | "amber" | "rose";
	hint?: string;
}) {
	const cls =
		tone === "primary"
			? "text-primary"
			: tone === "emerald"
				? "text-emerald-600 dark:text-emerald-400"
				: tone === "rose"
					? "text-rose-600 dark:text-rose-400"
					: tone === "amber"
						? "text-amber-600 dark:text-amber-400"
						: "text-muted-foreground";
	return (
		<div className="border-border bg-background space-y-0.5 rounded-md border p-3">
			<dt className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className={`tabular text-lg font-semibold ${cls}`}>
				{value.toLocaleString("id-ID")}
			</dd>
			{hint && (
				<p className="text-muted-foreground text-[10px]">{hint}</p>
			)}
		</div>
	);
}

function StatusPill({
	status,
	category,
}: {
	status: string;
	category?: string;
}) {
	const s = (category ?? status).toLowerCase();
	if (s === "inserted" || s === "live") {
		return (
			<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 font-medium">
				{s === "live" ? (
					<Inbox className="h-3 w-3" />
				) : (
					<CheckCircle2 className="h-3 w-3" />
				)}
				{s}
			</span>
		);
	}
	if (s === "updated") {
		return (
			<span className="text-primary inline-flex items-center gap-0.5 font-medium">
				<CheckCircle2 className="h-3 w-3" />
				updated
			</span>
		);
	}
	if (s === "archived") {
		return (
			<span className="inline-flex items-center gap-0.5 font-medium text-amber-700 dark:text-amber-400">
				<Archive className="h-3 w-3" />
				archived
			</span>
		);
	}
	if (s === "skipped") {
		return <span className="text-muted-foreground italic">skipped</span>;
	}
	return (
		<span className="text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5 font-medium">
			<XCircle className="h-3 w-3" />
			{s}
		</span>
	);
}

function DownloadReportButton({ result }: { result: ImportResult }) {
	const handleClick = () => {
		const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
		const header = "row,primary_key,label,status,category,message,warnings\n";
		const body = result.rows
			.map((r) =>
				[
					r.row,
					escape(r.primaryKey ?? ""),
					escape(r.label ?? ""),
					r.status,
					r.category ?? "",
					escape(r.message ?? ""),
					escape((r.warnings ?? []).join(" | ")),
				].join(","),
			)
			.join("\n");
		const blob = new Blob([header + body], {
			type: "text/csv;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `import-report-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};
	return (
		<button
			type="button"
			onClick={handleClick}
			className="border-border text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium"
		>
			<Download className="h-4 w-4" />
			Download report
		</button>
	);
}

// Re-export for type tracking
export type { ImportResult, ImportStat };
