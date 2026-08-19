"use client";

import {
	ArrowDownLeft,
	ArrowLeftRight,
	ArrowUpRight,
	ChevronDown,
	Loader2,
	Paperclip,
	Repeat2,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
	useActionState,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { Combobox } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/ui/form-fields";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toaster";
import {
	type QuickRecordFormState,
	recordQuickTransaction,
} from "@/lib/actions/journal-entries";
import {
	type CatatDirection,
	categoriesFor,
	DIRECTION_LABEL,
	findCategory,
} from "@/lib/finance/quick-record-categories";
import type {
	CashAccount,
	CatatData,
	RecentTxn,
} from "@/lib/finance/quick-record-data";
import { formatRupiah } from "@/lib/format";
import { useHaptics } from "@/lib/use-haptics";
import { cn } from "@/lib/utils";
import { AmountKeypad, QuickAmountChips, shortAmount } from "./amount-keypad";

const MAX_AMOUNT = 999_999_999_999;
const DIR_ICON: Record<CatatDirection, typeof ArrowDownLeft> = {
	masuk: ArrowDownLeft,
	keluar: ArrowUpRight,
	transfer: ArrowLeftRight,
};

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

// Default rekening sumber (Dari) = saldo terbesar, bukan urutan pertama.
// Kas Tunai sering Rp 0 dan jadi default lama → user harus ganti manual tiap
// kali; memilih saldo terbesar otomatis mendarat di Bank BCA (yang berisi uang)
// dan langsung lolos saldo-guard untuk mayoritas transaksi keluar.
function pickDefaultSource(accounts: CashAccount[]): string {
	if (accounts.length === 0) return "";
	const best = accounts.reduce(
		(b, a) => (a.balance > b.balance ? a : b),
		accounts[0],
	);
	return best.code;
}

/**
 * Nilai awal form — dipakai deep-link "Catat ke pembukuan" dari rekap owner
 * (biaya event yang dibayar owner) supaya owner tinggal pilih rekening & simpan.
 */
export type QuickRecordPrefill = {
	direction?: CatatDirection;
	amount?: number;
	categoryId?: string;
	note?: string;
	/** Event asal biaya — ditulis ke journal_entries.source_event_id. */
	eventId?: string;
};

export function QuickRecordCore({
	data,
	keypad,
	wide = false,
	prefill,
	onDone,
}: {
	data: CatatData;
	/** Mobile: on-screen numeric keypad + compact, reordered layout. */
	keypad: boolean;
	/** Desktop modal: two-column layout (wider popup). */
	wide?: boolean;
	prefill?: QuickRecordPrefill;
	onDone?: () => void;
}) {
	const router = useRouter();
	const haptic = useHaptics();
	const noteId = useId();

	const [direction, setDirection] = useState<CatatDirection>(
		prefill?.direction ?? "keluar",
	);
	const [amount, setAmount] = useState(prefill?.amount ?? 0);
	const [categoryId, setCategoryId] = useState<string | null>(
		// Hanya terima id kategori yang benar-benar ada — kalau tidak, biarkan
		// kosong supaya guard "Pilih kategori" tetap menahan submit.
		prefill?.categoryId && findCategory(prefill.categoryId)
			? prefill.categoryId
			: null,
	);
	const [coaOverride, setCoaOverride] = useState("");
	const [accountCode, setAccountCode] = useState(() =>
		pickDefaultSource(data.cashAccounts),
	);
	const [toAccountCode, setToAccountCode] = useState(() => {
		const src = pickDefaultSource(data.cashAccounts);
		const other = data.cashAccounts.find((a) => a.code !== src);
		return other?.code ?? src;
	});
	const [date, setDate] = useState(todayIso());
	// Biaya admin/transfer bank — hanya untuk keluar & transfer. 0 = tidak ada.
	const [adminFee, setAdminFee] = useState(0);
	// Patungan owner: sebagian beban ditanggung bersama, dipotong dari bagi
	// hasil (bukan uang masuk). 0 = tidak ada patungan.
	const [patunganPerOwner, setPatunganPerOwner] = useState(0);
	const [note, setNote] = useState(prefill?.note ?? "");
	const [photo, setPhoto] = useState<File | null>(null);
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [showAllCats, setShowAllCats] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);

	// `pending` (elemen ketiga) WAJIB dipakai: state yang di-set DI DALAM form
	// action adalah update transition — React sengaja menahan render-nya sampai
	// aksinya selesai, jadi spinner yang hanya bergantung pada state lokal baru
	// muncul setelah semuanya beres (tombol terlihat "diam" berdetik-detik dan
	// mengundang klik berulang). `pending` justru dirancang menyala seketika.
	const [state, formAction, pending] = useActionState<
		QuickRecordFormState,
		FormData
	>(recordQuickTransaction, undefined);

	// Synchronous re-entry guard: blocks a second submit before React commits
	// `pending` (rapid double-tap) and stays locked through a successful save
	// until the panel unmounts — so a slow save can never create a duplicate
	// entry. Reset only on an error response so the user can retry.
	const submittingRef = useRef(false);
	// `pending` hanya menyala selama server action; ia keburu padam saat foto
	// nota masih di-upload ke Drive (bisa beberapa detik) — tombol jadi terlihat
	// aktif lagi tanpa spinner. `postBusy` menahan tombol tetap terkunci sampai
	// modal benar-benar tertutup, jadi feedback-nya tak pernah putus.
	const [postBusy, setPostBusy] = useState(false);
	const [uploadingNota, setUploadingNota] = useState(false);
	// Satu bendera untuk SELURUH umur simpan: klik → server action → upload nota
	// → refresh → tutup.
	const busy = pending || postBusy;
	useEffect(() => {
		if (state?.error) {
			submittingRef.current = false;
			setPostBusy(false);
			setUploadingNota(false);
		}
	}, [state]);

	// Receipt-photo object URL (revoked on change) for the inline preview.
	useEffect(() => {
		if (!photo?.type.startsWith("image/")) {
			setPhotoUrl(null);
			return;
		}
		const url = URL.createObjectURL(photo);
		setPhotoUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [photo]);

	const nameByCode = useMemo(() => {
		const m = new Map<string, string>();
		for (const a of data.cashAccounts) m.set(a.code, a.name);
		for (const o of data.coaOptions) if (!m.has(o.code)) m.set(o.code, o.name);
		return m;
	}, [data]);

	const cats = categoriesFor(direction);
	const visibleCats = showAllCats ? cats : cats.slice(0, 8);
	const sourceAcct = data.cashAccounts.find((a) => a.code === accountCode);

	const counterpartName =
		direction === "transfer"
			? (nameByCode.get(toAccountCode) ?? toAccountCode)
			: coaOverride
				? (nameByCode.get(coaOverride) ?? coaOverride)
				: (findCategory(categoryId)?.label ?? "—");

	// Admin fee only applies to money leaving the source account.
	const feeApplied = direction === "masuk" ? 0 : adminFee;
	const afterSource =
		direction === "masuk"
			? (sourceAcct?.balance ?? 0) + amount
			: (sourceAcct?.balance ?? 0) - amount - feeApplied;

	const blockReason =
		amount <= 0
			? "Masukkan jumlah"
			: !accountCode
				? "Pilih rekening"
				: direction === "transfer" &&
						(!toAccountCode || toAccountCode === accountCode)
					? "Pilih rekening tujuan"
					: direction !== "transfer" && !categoryId && !coaOverride
						? "Pilih kategori"
						: // Saldo guard: keluar/transfer tidak boleh bikin rekening minus.
							direction !== "masuk" && afterSource < 0
							? `Saldo ${sourceAcct?.name ?? "rekening"} tidak cukup`
							: null;
	const canSubmit = blockReason === null;

	// ── success → optional photo upload, toast, refresh, close ────────────────
	const handled = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!state?.success || !state.refId || handled.current === state.refId)
			return;
		handled.current = state.refId;
		const ref = state.refId;
		void (async () => {
			if (photo) {
				setUploadingNota(true);
				try {
					const fd = new FormData();
					fd.set("file", photo);
					fd.set("category", findCategory(categoryId)?.label ?? "Catat");
					fd.set("description", `${note || "Catat transaksi"} · ${ref}`);
					fd.set("nota_date", date);
					fd.set("amount", String(amount));
					fd.set("entry_ref_id", ref);
					const res = await fetch("/api/drive/upload/manual", {
						method: "POST",
						body: fd,
					});
					if (!res.ok)
						toast.error("Transaksi tersimpan, tapi foto nota gagal diunggah");
				} catch {
					toast.error("Transaksi tersimpan, tapi foto nota gagal diunggah");
				}
			}
			haptic("success");
			toast.success(`Tersimpan · ${ref}`);
			router.refresh();
			if (onDone) {
				onDone();
			} else {
				// Pemakaian tanpa modal (tak ada onDone): buka kunci form agar tak
				// permanen ter-disable setelah tersimpan.
				submittingRef.current = false;
				setPostBusy(false);
				setUploadingNota(false);
			}
		})();
	}, [state, photo, categoryId, note, date, amount, haptic, router, onDone]);

	function changeDirection(d: CatatDirection) {
		haptic("select");
		setDirection(d);
		setCategoryId(null);
		setCoaOverride("");
		if (d === "masuk") setAdminFee(0);
	}
	function applyRecent(r: RecentTxn) {
		haptic("select");
		setDirection(r.direction);
		setAmount(r.amount);
		setAccountCode(r.accountCode);
		if (r.direction === "transfer") setToAccountCode(r.counterpartCode);
		else {
			setCategoryId(r.categoryId);
			setCoaOverride(r.categoryId ? "" : r.counterpartCode);
		}
	}
	function swapTransfer() {
		haptic("tap");
		setAccountCode(toAccountCode);
		setToAccountCode(accountCode);
	}

	const dirNoun =
		direction === "keluar"
			? "Uang keluar"
			: direction === "masuk"
				? "Uang masuk"
				: "Jumlah transfer";

	// ── Section fragments ─────────────────────────────────────────────────────

	const directionSeg = (
		<div className="grid grid-cols-3 gap-2">
			{(["masuk", "keluar", "transfer"] as CatatDirection[]).map((d) => {
				const active = direction === d;
				const Icon = DIR_ICON[d];
				return (
					<button
						key={d}
						type="button"
						onClick={() => changeDirection(d)}
						aria-pressed={active}
						className={cn(
							"press flex h-11 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-medium outline-none transition-colors duration-base ease-out-expo focus-visible:ring-2 focus-visible:ring-[#059669]/40",
							active
								? "bg-[#059669] text-white shadow-[var(--shadow-level-2)]"
								: "border border-border-subtle bg-card text-foreground shadow-[var(--shadow-level-1)] hover:bg-secondary",
						)}
					>
						<Icon className="size-4" aria-hidden="true" />
						{DIRECTION_LABEL[d]}
					</button>
				);
			})}
		</div>
	);

	// Amount display — its own elevated card so the figure pops off the sheet
	// surface instead of blending with the background.
	const amountHero = (
		<div className="rounded-2xl border border-border-subtle bg-card py-5 text-center shadow-[var(--shadow-level-2)]">
			<div className="eyebrow">{dirNoun}</div>
			<div
				className={cn(
					"type-num-xl mt-1.5 flex items-baseline justify-center gap-1.5",
					amount === 0
						? "text-muted-foreground/40"
						: direction === "masuk"
							? "text-emerald-700"
							: "text-foreground",
				)}
			>
				<span className="font-display text-xl text-muted-foreground">Rp</span>
				{amount === 0 ? "0" : amount.toLocaleString("id-ID")}
			</div>
			{sourceAcct && amount > 0 ? (
				<div className="mt-2 text-[12.5px] text-muted-foreground">
					{sourceAcct.name} →{" "}
					<span
						className={cn(
							"tabular font-medium",
							afterSource < 0 ? "text-rose-600" : "text-foreground",
						)}
					>
						{formatRupiah(afterSource)}
					</span>
				</div>
			) : null}
		</div>
	);

	const recentsBlock =
		amount === 0 && data.recents.length > 0 ? (
			<div className="space-y-2">
				<div className="eyebrow">Transaksi terakhir</div>
				<div className="flex flex-wrap gap-2">
					{data.recents.map((r) => (
						<button
							key={r.id}
							type="button"
							onClick={() => applyRecent(r)}
							className="press tap inline-flex h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-card px-3 text-[13px] text-foreground shadow-[var(--shadow-level-1)] hover:bg-secondary"
						>
							<Repeat2 className="size-3.5 text-muted-foreground" />
							<span className="max-w-[10rem] truncate">{r.label}</span>
							<span className="tabular text-muted-foreground">
								{shortAmount(r.amount)}
							</span>
						</button>
					))}
				</div>
			</div>
		) : null;

	const categoryField =
		direction !== "transfer" ? (
			<div className="space-y-2.5">
				<div className="flex items-center justify-between">
					<span className="eyebrow">Kategori</span>
					{cats.length > 8 ? (
						<button
							type="button"
							onClick={() => setShowAllCats((v) => !v)}
							className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800"
						>
							{showAllCats ? "Lebih sedikit" : "Lihat semua"}
						</button>
					) : null}
				</div>
				<div className="grid grid-cols-2 gap-2">
					{visibleCats.map((c) => {
						const active = categoryId === c.id && !coaOverride;
						const Icon = c.icon;
						return (
							<button
								key={c.id}
								type="button"
								onClick={() => {
									haptic("tap");
									setCategoryId(c.id);
									setCoaOverride("");
								}}
								aria-pressed={active}
								className={cn(
									"press flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] font-medium leading-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#059669]/40",
									active
										? "border-[#059669] bg-emerald-50 text-foreground"
										: "border-border-subtle bg-card text-foreground hover:bg-secondary",
								)}
							>
								<Icon
									className={cn(
										"size-3.5 shrink-0",
										active ? "text-[#059669]" : "text-muted-foreground",
									)}
								/>
								<span>{c.label}</span>
							</button>
						);
					})}
				</div>
				<Combobox
					value={coaOverride}
					onValueChange={(v) => {
						setCoaOverride(v ?? "");
						if (v) setCategoryId(null);
					}}
					options={data.coaOptions.map((o) => ({
						value: o.code,
						label: `${o.code} · ${o.name}`,
					}))}
					placeholder="Akun lain…"
					allowFreeText={false}
					closeOnScroll
				/>
			</div>
		) : null;

	const accountField = (
		<div className="space-y-2.5">
			<span className="eyebrow">
				{direction === "masuk" ? "Masuk ke" : "Dari"}
			</span>
			<AccountPicker
				accounts={data.cashAccounts}
				value={accountCode}
				onChange={setAccountCode}
				variant={keypad ? "scroll" : "grid"}
				// Sumber uang keluar/transfer: rekening bersaldo kurang tidak bisa
				// dipilih — mencegah saldo minus (kasus Kas Tunai −383rb).
				requiredBalance={
					direction === "masuk" ? undefined : amount + feeApplied
				}
			/>
			{direction === "transfer" ? (
				<>
					<div className="flex justify-center">
						<button
							type="button"
							onClick={swapTransfer}
							className="press tap inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-card px-3.5 text-[12.5px] font-medium text-muted-foreground shadow-[var(--shadow-level-1)] hover:text-foreground"
						>
							<ArrowLeftRight className="size-3.5" /> Tukar
						</button>
					</div>
					<span className="eyebrow">Ke</span>
					<AccountPicker
						accounts={data.cashAccounts}
						value={toAccountCode}
						onChange={setToAccountCode}
						disabledCode={accountCode}
						variant={keypad ? "scroll" : "grid"}
					/>
				</>
			) : null}
		</div>
	);

	// Biaya admin/transfer bank — discoverable untuk keluar & transfer (kasus
	// transfer fee crew, bayar via VA/antar bank). Kosong (0) = tidak ada biaya.
	const adminFeeField =
		direction !== "masuk" ? (
			<div className="space-y-2.5">
				<span className="eyebrow">Biaya admin (opsional)</span>
				<div className="flex flex-wrap items-center gap-2">
					{[1000, 2500].map((v) => {
						const active = adminFee === v;
						return (
							<button
								key={v}
								type="button"
								onClick={() => {
									haptic("tap");
									setAdminFee(active ? 0 : v);
								}}
								aria-pressed={active}
								className={cn(
									"press tap h-9 rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#059669]/40",
									active
										? "border-[#059669] bg-emerald-50 text-foreground"
										: "border-border-subtle bg-card text-muted-foreground hover:bg-secondary",
								)}
							>
								{shortAmount(v)}
							</button>
						);
					})}
					<div className="min-w-[6.5rem] flex-1">
						<MoneyInput
							value={adminFee}
							onValueChange={setAdminFee}
							className="h-9 text-right text-[13px]"
						/>
					</div>
				</div>
				{adminFee > 0 ? (
					<p className="text-[11.5px] text-muted-foreground">
						Total keluar{" "}
						<span data-nominal>{formatRupiah(amount + adminFee)}</span> · biaya
						admin masuk beban bank (5-600)
					</p>
				) : null}
			</div>
		) : null;

	// Patungan owner — hanya relevan untuk uang keluar ke akun beban.
	const patunganField =
		direction === "keluar" ? (
			<div className="space-y-2.5">
				<span className="eyebrow">Patungan owner (opsional)</span>
				<div className="flex flex-wrap items-center gap-2">
					{[50000, 100000].map((v) => {
						const active = patunganPerOwner === v;
						return (
							<button
								key={v}
								type="button"
								onClick={() => {
									haptic("tap");
									setPatunganPerOwner(active ? 0 : v);
								}}
								aria-pressed={active}
								className={cn(
									"press tap h-9 rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#059669]/40",
									active
										? "border-[#059669] bg-emerald-50 text-foreground"
										: "border-border-subtle bg-card text-muted-foreground hover:bg-secondary",
								)}
							>
								{shortAmount(v)}/owner
							</button>
						);
					})}
					<div className="min-w-[6.5rem] flex-1">
						<MoneyInput
							value={patunganPerOwner}
							onValueChange={setPatunganPerOwner}
							className="h-9 text-right text-[13px]"
						/>
					</div>
				</div>
				{patunganPerOwner > 0 ? (
					<p className="text-[11.5px] text-muted-foreground">
						Tiap owner ikut menanggung{" "}
						<span data-nominal>{formatRupiah(patunganPerOwner)}</span>, dipotong
						dari bagi hasil — bukan uang masuk. Beban perusahaan berkurang
						sebesar total patungan.
					</p>
				) : null}
			</div>
		) : null;

	const amountControl = keypad ? (
		<div className="space-y-2.5">
			<QuickAmountChips
				onAdd={(v) => setAmount((a) => Math.min(a + v, MAX_AMOUNT))}
				className="justify-center"
			/>
			<AmountKeypad
				onAppend={(d) => setAmount((a) => Math.min(a * 10 + d, MAX_AMOUNT))}
				onTripleZero={() => setAmount((a) => Math.min(a * 1000, MAX_AMOUNT))}
				onBackspace={() => setAmount((a) => Math.floor(a / 10))}
			/>
		</div>
	) : (
		<div className="space-y-2">
			<MoneyInput
				value={amount}
				onValueChange={setAmount}
				className="h-11 text-right text-base"
			/>
			<QuickAmountChips
				onAdd={(v) => setAmount((a) => Math.min(a + v, MAX_AMOUNT))}
			/>
		</div>
	);

	// Wide modal — ONE compact amount block (no separate hero card): label, a
	// big editable input, quick chips, and the after-balance caption.
	const amountSectionWide = (
		<div className="space-y-2.5">
			<span className="eyebrow">{dirNoun}</span>
			<MoneyInput
				value={amount}
				onValueChange={setAmount}
				className="h-14 rounded-2xl text-right text-2xl font-bold tabular"
			/>
			<QuickAmountChips
				onAdd={(v) => setAmount((a) => Math.min(a + v, MAX_AMOUNT))}
			/>
			{sourceAcct && amount > 0 ? (
				<p className="text-[12.5px] text-muted-foreground">
					{sourceAcct.name} →{" "}
					<span
						className={cn(
							"tabular font-medium",
							afterSource < 0 ? "text-rose-600" : "text-foreground",
						)}
					>
						{formatRupiah(afterSource)}
					</span>
				</p>
			) : null}
		</div>
	);

	const detailsField = (
		<div className="rounded-xl border border-border-subtle bg-card">
			<button
				type="button"
				onClick={() => setDetailsOpen((v) => !v)}
				className="flex w-full items-center justify-between px-3.5 py-3 text-[13px] font-medium text-foreground"
			>
				<span>Tanggal, catatan, foto nota</span>
				<ChevronDown
					className={cn(
						"size-4 text-muted-foreground transition-transform",
						detailsOpen && "rotate-180",
					)}
				/>
			</button>
			{detailsOpen ? (
				<div className="space-y-3 border-t border-border-subtle p-3.5">
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => setDate(todayIso())}
							className={cn(
								"press tap h-9 rounded-full border px-3.5 text-[13px]",
								date === todayIso()
									? "border-[#059669] bg-emerald-50 text-foreground"
									: "border-border-default bg-card text-muted-foreground",
							)}
						>
							Hari ini
						</button>
						<input
							type="date"
							value={date}
							max={todayIso()}
							onChange={(e) => setDate(e.target.value)}
							className="h-9 rounded-md border border-border-default bg-background px-2.5 text-[13px] text-foreground"
						/>
					</div>
					<RichTextarea
						id={noteId}
						value={note}
						onChange={setNote}
						rows={2}
						maxLength={300}
						placeholder="Catatan (opsional) — mis. bensin survey lokasi"
						toolbar={false}
					/>
					{photo ? (
						<div className="overflow-hidden rounded-xl border border-border-subtle">
							{photoUrl ? (
								// biome-ignore lint/performance/noImgElement: local object-URL preview, not a remote asset
								<img
									src={photoUrl}
									alt="Preview nota"
									className="max-h-64 w-full bg-surface-3 object-contain"
								/>
							) : null}
							<div className="flex items-center justify-between gap-2 px-3 py-2">
								<span className="truncate text-[12.5px] text-muted-foreground">
									{photo.name}
								</span>
								<button
									type="button"
									onClick={() => setPhoto(null)}
									className="press tap inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-rose-600 hover:bg-rose-50"
								>
									<X className="size-3.5" /> Hapus
								</button>
							</div>
						</div>
					) : (
						<label className="press tap flex h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-default bg-card px-3 text-[13px] text-muted-foreground hover:bg-secondary">
							<Paperclip className="size-4" />
							<span>Lampirkan foto nota</span>
							<input
								type="file"
								accept="image/*,application/pdf"
								className="hidden"
								onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
							/>
						</label>
					)}
				</div>
			) : null}
		</div>
	);

	// Wide modal panes — date+note shown inline (no collapse) and the receipt
	// preview gets its own full-height column (mirrors the payment dialog).
	const dateNotePane = (
		<div className="space-y-2.5">
			<span className="eyebrow">Tanggal & catatan</span>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() => setDate(todayIso())}
					className={cn(
						"press tap h-9 rounded-full border px-3.5 text-[13px]",
						date === todayIso()
							? "border-[#059669] bg-emerald-50 text-foreground"
							: "border-border-default bg-card text-muted-foreground",
					)}
				>
					Hari ini
				</button>
				<input
					type="date"
					value={date}
					max={todayIso()}
					onChange={(e) => setDate(e.target.value)}
					className="h-9 rounded-md border border-border-default bg-background px-2.5 text-[13px] text-foreground"
				/>
			</div>
			<RichTextarea
				value={note}
				onChange={setNote}
				rows={2}
				maxLength={300}
				placeholder="Catatan (opsional) — mis. bensin survey lokasi"
				toolbar={false}
			/>
		</div>
	);

	const notaPane = (
		<div className="flex h-full flex-col space-y-2.5">
			<span className="eyebrow">Bukti nota</span>
			{photo ? (
				<div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle">
					{photoUrl ? (
						// biome-ignore lint/performance/noImgElement: local object-URL preview, not a remote asset
						<img
							src={photoUrl}
							alt="Preview nota"
							className="min-h-0 w-full flex-1 bg-surface-3 object-contain"
						/>
					) : (
						<div className="flex flex-1 items-center justify-center bg-surface-3 text-[12.5px] text-muted-foreground">
							{photo.name}
						</div>
					)}
					<div className="flex items-center justify-between gap-2 border-t border-border-subtle px-3 py-2">
						<span className="truncate text-[12.5px] text-muted-foreground">
							{photo.name}
						</span>
						<button
							type="button"
							onClick={() => setPhoto(null)}
							className="press tap inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-rose-600 hover:bg-rose-50"
						>
							<X className="size-3.5" /> Hapus
						</button>
					</div>
				</div>
			) : (
				<label className="press tap flex min-h-[9.5rem] flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-default bg-card px-4 text-center text-[13px] text-muted-foreground hover:bg-secondary">
					<Paperclip className="size-6 text-muted-foreground/70" />
					<span>Tarik atau klik untuk lampirkan foto nota</span>
					<span className="text-[11.5px] text-muted-foreground/70">
						Opsional · gambar atau PDF
					</span>
					<input
						type="file"
						accept="image/*,application/pdf"
						className="hidden"
						onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
					/>
				</label>
			)}
		</div>
	);

	const lihatJurnal = canSubmit ? (
		<div className="text-center">
			<button
				type="button"
				onClick={() => setPreviewOpen((v) => !v)}
				className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
			>
				{previewOpen ? "Sembunyikan jurnal" : "Lihat jurnal ▸"}
			</button>
			{previewOpen ? (
				<dl className="mt-2 space-y-1 rounded-lg border border-border-subtle bg-card p-3 text-left text-[12px]">
					<JournalLine
						label={`DEBIT · ${direction === "masuk" ? (sourceAcct?.name ?? accountCode) : counterpartName}`}
						value={formatRupiah(amount)}
					/>
					{feeApplied > 0 ? (
						<JournalLine
							label="DEBIT · Biaya Admin Bank (5-600)"
							value={formatRupiah(feeApplied)}
						/>
					) : null}
					<JournalLine
						label={`KREDIT · ${direction === "masuk" ? counterpartName : (sourceAcct?.name ?? accountCode)}`}
						value={formatRupiah(
							direction === "masuk" ? amount : amount + feeApplied,
						)}
						muted
					/>
				</dl>
			) : null}
		</div>
	) : null;

	const errorBanner = state?.error ? (
		<p
			role="alert"
			className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[13px] font-medium text-rose-600"
		>
			{state.error}
		</p>
	) : null;

	return (
		<form
			action={(fd) => {
				// Guard-nya lewat ref (sinkron), bukan `busy` — `busy` sudah ikut
				// menyala dari `pending` begitu aksi jalan, jadi kalau dipakai di sini
				// submit ulang yang sah bisa ikut terblokir.
				if (!canSubmit || submittingRef.current) return;
				submittingRef.current = true;
				setPostBusy(true);
				fd.set("direction", direction);
				fd.set("amount", String(amount));
				fd.set("entry_date", date);
				fd.set("account_code", accountCode);
				if (direction === "transfer") fd.set("to_account_code", toAccountCode);
				if (categoryId) fd.set("category_id", categoryId);
				if (coaOverride) fd.set("coa_override", coaOverride);
				fd.set("admin_fee", String(feeApplied));
				if (prefill?.eventId) fd.set("event_id", prefill.eventId);
				fd.set(
					"patungan_per_owner",
					String(direction === "keluar" ? patunganPerOwner : 0),
				);
				if (note.trim()) fd.set("note", note.trim());
				formAction(fd);
			}}
			className={cn(
				"flex flex-col gap-4",
				wide ? "min-h-0 flex-1" : "min-h-full",
			)}
		>
			{directionSeg}

			{wide ? (
				// Desktop modal — header (direction) + footer (action bar) stay fixed;
				// only this 3-column region scrolls if needed. Columns balanced so it
				// rarely does: money/account · category · receipt + date/note.
				<div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
						<div className="space-y-4">
							{amountSectionWide}
							{accountField}
							{adminFeeField}
							{patunganField}
						</div>
						<div className="space-y-4">
							{categoryField}
							{recentsBlock}
							{lihatJurnal}
						</div>
						<div className="space-y-4">
							{notaPane}
							{dateNotePane}
						</div>
					</div>
				</div>
			) : (
				<>
					{amountHero}
					{keypad ? (
						<>
							{categoryField}
							{recentsBlock}
							{accountField}
							{adminFeeField}
							{patunganField}
							{amountControl}
							{detailsField}
							{lihatJurnal}
						</>
					) : (
						<>
							{amountControl}
							{recentsBlock}
							{categoryField}
							{accountField}
							{adminFeeField}
							{patunganField}
							{detailsField}
							{lihatJurnal}
						</>
					)}
				</>
			)}

			{errorBanner}

			{/* Action bar — in-flow (mt-auto pins to bottom on short content);
			    matches the sheet surface so nothing leaks or looks cut. */}
			<div
				className={cn(
					"-mx-4 -mb-4 mt-auto border-t border-border-default bg-surface-3 px-4 pt-3 pb-3",
					wide && "rounded-b-xl",
				)}
			>
				<button
					type="submit"
					disabled={!canSubmit || busy}
					aria-busy={busy}
					className={cn(
						"press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white outline-none transition-colors",
						canSubmit && !busy
							? "bg-[#059669] hover:bg-[#047857] dark:bg-[#0b9e6a] dark:hover:bg-[#059669]"
							: "cursor-not-allowed bg-[#059669]/45",
					)}
				>
					{busy ? (
						<>
							<Loader2 className="size-4 animate-spin" />
							{uploadingNota ? "Mengunggah nota…" : "Menyimpan…"}
						</>
					) : canSubmit ? (
						`Simpan · ${formatRupiah(amount)}`
					) : (
						(blockReason ?? "Simpan")
					)}
				</button>
				<p className="mt-1.5 text-center text-[11px] text-muted-foreground">
					Tercatat otomatis ke pembukuan.
				</p>
			</div>
		</form>
	);
}

function AccountPicker({
	accounts,
	value,
	onChange,
	disabledCode,
	variant = "grid",
	requiredBalance,
}: {
	accounts: CashAccount[];
	value: string;
	onChange: (code: string) => void;
	disabledCode?: string;
	variant?: "grid" | "scroll";
	/** Saldo minimum agar akun bisa dipilih (sumber uang keluar/transfer). */
	requiredBalance?: number;
}) {
	const haptic = useHaptics();
	const lacksBalance = (a: CashAccount) =>
		requiredBalance !== undefined && a.balance < requiredBalance;

	if (variant === "scroll") {
		// Exactly 2 cards per view, flush with the category columns above (same
		// gap-2.5 + half-gap width). Swipe for the rest. Inset ring on select so
		// it's never clipped by the scroller.
		return (
			<div className="hide-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1">
				{accounts.map((a) => {
					const active = value === a.code;
					const kurang = lacksBalance(a);
					const disabled = disabledCode === a.code || kurang;
					return (
						<button
							key={a.code}
							type="button"
							disabled={disabled}
							onClick={() => {
								haptic("tap");
								onChange(a.code);
							}}
							aria-pressed={active}
							className={cn(
								"press w-[calc(50%-0.3125rem)] shrink-0 snap-start rounded-[16px] border bg-card p-4 text-left shadow-[var(--shadow-level-2)] outline-none transition-colors disabled:opacity-40",
								active
									? "border-[#059669] ring-1 ring-inset ring-[#059669]"
									: "border-border-subtle",
							)}
						>
							<span className="block truncate text-[13px] font-medium text-muted-foreground">
								{a.name}
							</span>
							<span className="tabular mt-1.5 flex items-baseline gap-1 whitespace-nowrap font-bold tracking-[-0.03em] text-foreground [font-family:var(--font-manrope),var(--font-inter),system-ui] [font-variant-numeric:tabular-nums_slashed-zero]">
								<span className="text-[0.9rem] font-bold text-muted-foreground">
									Rp
								</span>
								<span className="text-[1.2rem] leading-[1.04]">
									{a.balance.toLocaleString("id-ID")}
								</span>
							</span>
							{kurang ? (
								<span className="mt-1 block text-[11px] font-medium text-rose-600">
									Saldo kurang
								</span>
							) : null}
						</button>
					);
				})}
			</div>
		);
	}

	return (
		<div className="grid gap-2.5 sm:grid-cols-2">
			{accounts.map((a) => {
				const active = value === a.code;
				const kurang = lacksBalance(a);
				const disabled = disabledCode === a.code || kurang;
				return (
					<button
						key={a.code}
						type="button"
						disabled={disabled}
						onClick={() => {
							haptic("tap");
							onChange(a.code);
						}}
						aria-pressed={active}
						className={cn(
							"press flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:opacity-40",
							active
								? "border-[#059669] bg-emerald-50"
								: "border-border-subtle bg-card hover:bg-secondary",
						)}
					>
						<span className="w-full truncate text-[13px] font-medium text-foreground">
							{a.name}
						</span>
						<span className="tabular text-[12px] text-muted-foreground">
							{formatRupiah(a.balance)}
							{kurang ? (
								<span className="ml-1.5 font-medium text-rose-600">
									· Saldo kurang
								</span>
							) : null}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function JournalLine({
	label,
	value,
	muted,
}: {
	label: string;
	value: string;
	muted?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span
				className={cn(
					"truncate",
					muted ? "text-muted-foreground" : "text-foreground",
				)}
			>
				{label}
			</span>
			<span className="tabular shrink-0 text-foreground">{value}</span>
		</div>
	);
}
