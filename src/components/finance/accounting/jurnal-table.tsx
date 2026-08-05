"use client";

import {
	Calendar,
	Check,
	ChevronDown,
	ExternalLink,
	ImageOff,
	Loader2,
	Paperclip,
	Receipt,
	Upload,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { driveThumbnailUrl } from "@/lib/drive/thumbnail";
import {
	ENTRY_TYPE_LABEL,
	humanEntryTitle,
	SOURCE_LABEL,
} from "@/lib/finance/accounting";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export type JournalLineRow = {
	id: string;
	account_code: string;
	account_name: string | null;
	debit_amount: number;
	credit_amount: number;
	description: string | null;
	line_order: number;
};

export type JournalEntryRow = {
	id: string;
	ref_id: string;
	entry_date: string;
	entry_type: string;
	description: string;
	source_type: string;
	source_id: string | null;
	total_amount: number;
	is_reversed: boolean;
	reversed_at: string | null;
	created_at: string;
	created_by_name: string | null;
	proof_url: string | null;
	/** Konteks event (kalau entry ini terkait event) — bikin baris jelas siapa. */
	event_name: string | null;
	event_project_id: string | null;
	/** dp/partial/pelunasan, untuk judul entry pembayaran klien. */
	payment_type: string | null;
	lines: JournalLineRow[];
};

type StatusFilter = "all" | "posted" | "reversed";

export function JurnalTable({
	rows,
	defaultFrom,
	defaultTo,
	focusRef,
}: {
	rows: JournalEntryRow[];
	defaultFrom?: string;
	defaultTo?: string;
	/** ref_id yang datang dari deep-link — cari otomatis & buka barisnya. */
	focusRef?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	// Deep-link: isi kotak cari dengan ref-nya (jadi terlihat KENAPA daftarnya
	// menyusut, dan owner tinggal mengosongkan untuk kembali ke daftar penuh)
	// sekaligus langsung buka rinciannya.
	const [query, setQuery] = useState(focusRef ?? "");
	const [sourceFilter, setSourceFilter] = useState<string>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [expanded, setExpanded] = useState<string | null>(
		() => rows.find((r) => r.ref_id === focusRef)?.id ?? null,
	);

	const sourceOptions = useMemo(() => {
		const set = new Set<string>();
		for (const r of rows) set.add(r.source_type);
		return [
			{ value: "all", label: "Semua sumber" },
			...Array.from(set)
				.sort()
				.map((s) => ({ value: s, label: SOURCE_LABEL[s] ?? s })),
		];
	}, [rows]);

	// Dua teks pencarian per entry. `head` = yang terbaca langsung di baris
	// (judul, sumber, event, tanggal, nominal); `full` = head + isi rincian
	// (kode/nama akun, keterangan baris). Dihitung sekali per perubahan rows,
	// bukan tiap ketikan.
	const haystacks = useMemo(() => {
		const map = new Map<string, { head: string; full: string }>();
		for (const r of rows) {
			const head = [
				r.ref_id,
				// Judul yang dibaca owner DAN deskripsi mentahnya — mengetik
				// "pelunasan putra" maupun "PAY-20260804-0104" sama-sama ketemu.
				humanEntryTitle(r),
				r.description,
				ENTRY_TYPE_LABEL[r.entry_type] ?? r.entry_type,
				SOURCE_LABEL[r.source_type] ?? r.source_type,
				r.source_type,
				r.event_name ?? "",
				r.event_project_id ?? "",
				String(r.total_amount),
				formatRupiah(r.total_amount),
				formatDateID(r.entry_date),
				r.created_by_name ?? "",
			]
				.join(" ")
				.toLowerCase();
			const detail = r.lines
				.flatMap((l) => [
					l.account_code,
					l.account_name ?? "",
					l.description ?? "",
				])
				.join(" ")
				.toLowerCase();
			map.set(r.id, { head, full: `${head} ${detail}` });
		}
		return map;
	}, [rows]);

	const filtered = useMemo(() => {
		// Pencocokan per-kata, BUKAN substring utuh: "bayar crew" harus menemukan
		// "Bayar fee crew — Fahmi Kurniawan". Semua kata wajib ada (AND), jadi
		// menambah kata tetap mempersempit hasil seperti yang diharapkan.
		const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
		const base = rows.filter((r) => {
			if (sourceFilter !== "all" && r.source_type !== sourceFilter)
				return false;
			if (statusFilter === "posted" && r.is_reversed) return false;
			if (statusFilter === "reversed" && !r.is_reversed) return false;
			if (tokens.length === 0) return true;
			return tokens.every((t) => (haystacks.get(r.id)?.full ?? "").includes(t));
		});
		if (tokens.length === 0) return base;
		// Yang cocok di judul/sumber/event didahulukan; yang cocok cuma karena
		// isi rinciannya (mis. settlement yang kebetulan punya akun "Hutang
		// Crew") tetap muncul, tapi di bawah. Sort JS stabil → urutan tanggal
		// di dalam tiap kelompok tidak berubah.
		const rank = new Map(
			base.map((r) => [
				r.id,
				tokens.every((t) => (haystacks.get(r.id)?.head ?? "").includes(t))
					? 0
					: 1,
			]),
		);
		return base.sort((a, b) => (rank.get(a.id) ?? 1) - (rank.get(b.id) ?? 1));
	}, [rows, haystacks, query, sourceFilter, statusFilter]);

	function updateDate(field: "from" | "to", value: string) {
		const next = new URLSearchParams(params.toString());
		if (value) next.set(field, value);
		else next.delete(field);
		next.set("tab", "journal");
		router.push(`${pathname}?${next.toString()}`);
	}
	function clearDates() {
		const next = new URLSearchParams(params.toString());
		next.delete("from");
		next.delete("to");
		next.set("tab", "journal");
		router.push(`${pathname}?${next.toString()}`);
	}

	const hasDateFilter = !!(defaultFrom || defaultTo);

	if (rows.length === 0) {
		return (
			<EmptyState
				title="Belum ada jurnal"
				description="Settlement event, catat Pembelian, atau commit Stock Opname akan otomatis mem-posting entry ke sini."
			/>
		);
	}

	return (
		<div className="space-y-3">
			{/* Filters */}
			<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
				<FilterSearchInput
					className="flex-1 lg:max-w-sm"
					value={query}
					onValueChange={setQuery}
					placeholder="Cari transaksi, klien, akun, nominal…"
					aria-label="Cari jurnal"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<div className="inline-flex h-8 items-center gap-2 rounded-md border border-border-default bg-card px-2.5 text-[12px]">
						<Calendar className="size-3.5 text-muted-foreground" aria-hidden />
						<input
							type="date"
							defaultValue={defaultFrom ?? ""}
							onChange={(e) => updateDate("from", e.target.value)}
							aria-label="Dari tanggal"
							className="h-8 bg-transparent text-[12px] focus:outline-none"
						/>
						<span className="text-muted-foreground/50">→</span>
						<input
							type="date"
							defaultValue={defaultTo ?? ""}
							onChange={(e) => updateDate("to", e.target.value)}
							aria-label="Sampai tanggal"
							className="h-8 bg-transparent text-[12px] focus:outline-none"
						/>
						{hasDateFilter && (
							<button
								type="button"
								onClick={clearDates}
								className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
							>
								Reset
							</button>
						)}
					</div>
					<div className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border-default bg-secondary p-0.5">
						{(
							[
								{ key: "all", label: "Semua" },
								{ key: "posted", label: "Posted" },
								{ key: "reversed", label: "Dibalik" },
							] as const
						).map((o) => {
							const active = o.key === statusFilter;
							return (
								<button
									key={o.key}
									type="button"
									onClick={() => setStatusFilter(o.key)}
									aria-pressed={active}
									className={cn(
										"inline-flex h-7 items-center rounded px-2.5 text-[12px] font-medium transition-colors",
										active
											? "bg-card text-foreground shadow-[var(--shadow-level-2)]"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{o.label}
								</button>
							);
						})}
					</div>
					<div className="w-44">
						<NativeSelect
							value={sourceFilter}
							onValueChange={(v) => setSourceFilter(v ?? "all")}
							options={sourceOptions}
							aria-label="Filter sumber"
							triggerClassName="w-full"
						/>
					</div>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-secondary/40 p-8 text-center text-[13px] text-muted-foreground">
					Tidak ada jurnal yang cocok dengan filter ini.
				</div>
			) : (
				<ul className="overflow-hidden rounded-lg border border-border-default bg-card">
					{filtered.map((entry, i) => (
						<li
							key={entry.id}
							className={i > 0 ? "border-t border-border-subtle" : undefined}
						>
							<JournalEntry
								entry={entry}
								open={expanded === entry.id}
								onToggle={() =>
									setExpanded((cur) => (cur === entry.id ? null : entry.id))
								}
							/>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function JournalEntry({
	entry,
	open,
	onToggle,
}: {
	entry: JournalEntryRow;
	open: boolean;
	onToggle: () => void;
}) {
	const totalDebit = entry.lines.reduce((s, l) => s + l.debit_amount, 0);
	const totalCredit = entry.lines.reduce((s, l) => s + l.credit_amount, 0);
	const balanced = totalDebit === totalCredit;

	const title = humanEntryTitle(entry);

	// Deskripsi asli hanya diulang kalau judul benar-benar MENGGANTI kalimatnya
	// (mis. "Pembayaran klien PAY-…" → "Pelunasan dari …"), supaya referensi
	// mesinnya tidak hilang dari jejak audit. Kalau judul cuma merapikan angka
	// ("187.0000 pcs" → "187 pcs"), mengulangnya jadi mubazir — bandingkan
	// setelah angka & tanda baca dibuang.
	const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
	const rawStillInforms = letters(entry.description) !== letters(title);

	// Baris kecil di bawah judul. Nama klien dilewati kalau judul sudah
	// menyebutnya; kode proyek selalu ikut karena itu yang dipakai mencari
	// lintas modul.
	const subLabel = [
		entry.event_name &&
		!title.toLowerCase().includes(entry.event_name.toLowerCase())
			? entry.event_name
			: null,
		entry.event_project_id,
		rawStillInforms ? entry.description : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className={entry.is_reversed ? "opacity-70" : undefined}>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
			>
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="tabular text-[12px] font-semibold text-foreground">
							{entry.ref_id}
						</span>
						<Tag>{ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}</Tag>
						<Tag>{SOURCE_LABEL[entry.source_type] ?? entry.source_type}</Tag>
						{entry.is_reversed && (
							<span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
								Dibalik
							</span>
						)}
					</div>
					<div className="truncate text-[13px] font-medium text-foreground">
						{title}
					</div>
					{subLabel && (
						<div className="truncate text-[11.5px] text-muted-foreground">
							{subLabel}
						</div>
					)}
					<div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
						<span>{formatDateID(entry.entry_date)}</span>
						{entry.created_by_name && (
							<>
								<Dot />
								<span>oleh {entry.created_by_name}</span>
							</>
						)}
						<Dot />
						<span>{entry.lines.length} baris</span>
						{balanced && !entry.is_reversed && (
							<>
								<Dot />
								<span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
									<Check className="size-3" aria-hidden strokeWidth={2.5} />
									seimbang
								</span>
							</>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2.5">
					<span className="tabular text-[15px] font-semibold text-foreground">
						{formatRupiah(entry.total_amount)}
					</span>
					<ChevronDown
						className={cn(
							"size-4 text-muted-foreground transition-transform",
							open && "rotate-180",
						)}
						aria-hidden
					/>
				</div>
			</button>

			{open && (
				<div className="border-t border-border-subtle bg-secondary/30 px-4 pb-4 pt-3">
					<div className="w-full overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="border-b border-border-subtle text-left">
									<th className="eyebrow pb-1.5 pr-3 font-normal">Akun</th>
									<th className="eyebrow pb-1.5 pr-3 font-normal">
										Keterangan
									</th>
									<th className="eyebrow pb-1.5 pl-3 text-right font-normal">
										Debit
									</th>
									<th className="eyebrow pb-1.5 pl-3 text-right font-normal">
										Kredit
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border-subtle">
								{entry.lines.map((line) => (
									<tr key={line.id}>
										<td className="py-3 pr-3 align-top">
											<div className="tabular text-[12px] font-medium text-foreground">
												{line.account_code}
											</div>
											<div className="text-[11px] text-muted-foreground">
												{line.account_name ?? "—"}
											</div>
										</td>
										<td className="py-3 pr-3 align-top text-[12px] text-muted-foreground">
											{line.description ?? "—"}
										</td>
										<td className="py-3 pl-3 text-right align-top tabular text-[12px]">
											{line.debit_amount > 0 ? (
												<span className="font-medium text-foreground">
													{formatRupiah(line.debit_amount)}
												</span>
											) : (
												<span className="text-muted-foreground/30">—</span>
											)}
										</td>
										<td className="py-3 pl-3 text-right align-top tabular text-[12px]">
											{line.credit_amount > 0 ? (
												<span className="font-medium text-foreground">
													{formatRupiah(line.credit_amount)}
												</span>
											) : (
												<span className="text-muted-foreground/30">—</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr className="border-t border-border-default">
									<td className="pt-2 pr-3 text-right align-top" colSpan={2}>
										<span className="inline-flex items-center gap-1 text-[11px] font-medium">
											{balanced ? (
												<span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
													<Check
														className="size-3.5"
														aria-hidden
														strokeWidth={2.5}
													/>
													Debit = kredit
												</span>
											) : (
												<span className="text-destructive">Tidak seimbang</span>
											)}
										</span>
									</td>
									<td className="pt-2 pl-3 text-right align-top tabular text-[12px] font-semibold text-foreground">
										{formatRupiah(totalDebit)}
									</td>
									<td className="pt-2 pl-3 text-right align-top tabular text-[12px] font-semibold text-foreground">
										{formatRupiah(totalCredit)}
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
					<ProofControl entry={entry} />
					{entry.is_reversed && entry.reversed_at && (
						<p className="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-[11px] text-destructive">
							Entry ini sudah dibalik pada {formatDateID(entry.reversed_at)}.
						</p>
					)}
				</div>
			)}
		</div>
	);
}

const PROOF_ACCEPT =
	"image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

function ProofControl({ entry }: { entry: JournalEntryRow }) {
	const router = useRouter();
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [preview, setPreview] = useState(false);

	const proofUrl = entry.proof_url;
	const thumb = proofUrl ? driveThumbnailUrl(proofUrl, 1200) : null;

	async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = ""; // allow re-picking the same file later
		if (!file) return;
		if (file.size > 8 * 1024 * 1024) {
			toast.error("File terlalu besar (max 8 MB). Kompres dulu ya.");
			return;
		}
		setUploading(true);
		try {
			const fd = new FormData();
			fd.set("file", file);
			fd.set("category", SOURCE_LABEL[entry.source_type] ?? "Catat");
			fd.set("description", `${entry.description} · ${entry.ref_id}`);
			fd.set("nota_date", entry.entry_date);
			fd.set("amount", String(entry.total_amount));
			fd.set("entry_ref_id", entry.ref_id);
			const res = await fetch("/api/drive/upload/manual", {
				method: "POST",
				body: fd,
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				toast.error(body?.error ?? "Gagal mengunggah bukti");
				return;
			}
			toast.success("Bukti transaksi tersimpan");
			router.refresh();
		} catch {
			toast.error("Gagal mengunggah bukti");
		} finally {
			setUploading(false);
		}
	}

	return (
		<div className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-3">
			<span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
				<Receipt className="size-3.5" aria-hidden />
				Bukti transaksi
			</span>
			<div className="ml-auto flex items-center gap-2">
				{proofUrl ? (
					<button
						type="button"
						onClick={() => setPreview(true)}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-card px-2.5 text-[12px] font-medium text-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary"
					>
						<Paperclip className="size-3.5" aria-hidden />
						Lihat bukti
					</button>
				) : (
					<>
						<input
							ref={inputRef}
							id={inputId}
							type="file"
							accept={PROOF_ACCEPT}
							className="sr-only"
							onChange={handleFile}
							disabled={uploading}
						/>
						<button
							type="button"
							onClick={() => inputRef.current?.click()}
							disabled={uploading}
							className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-card px-2.5 text-[12px] font-medium text-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary disabled:opacity-60"
						>
							{uploading ? (
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
							) : (
								<Upload className="size-3.5" aria-hidden />
							)}
							{uploading ? "Mengunggah…" : "Upload bukti"}
						</button>
					</>
				)}
			</div>

			<Dialog open={preview} onOpenChange={setPreview}>
				<DialogContent className="max-w-2xl">
					<DialogTitle className="text-[14px] font-semibold">
						Bukti · {entry.ref_id}
					</DialogTitle>
					<div className="mt-1 space-y-3">
						<div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-black/90">
							{thumb ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={thumb}
									alt={`Bukti ${entry.ref_id}`}
									referrerPolicy="no-referrer"
									className="max-h-[70vh] w-auto object-contain"
								/>
							) : (
								<div className="flex flex-col items-center gap-2 py-12 text-white/70">
									<ImageOff className="size-6" aria-hidden />
									<span className="text-[12px]">Pratinjau tidak tersedia</span>
								</div>
							)}
						</div>
						{proofUrl && (
							<a
								href={proofUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-card px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary"
							>
								<ExternalLink className="size-3.5" aria-hidden />
								Buka di Drive
							</a>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function Tag({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
			{children}
		</span>
	);
}

function Dot() {
	return (
		<span aria-hidden className="text-muted-foreground/40">
			·
		</span>
	);
}
