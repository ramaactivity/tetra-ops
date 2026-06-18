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

export function QuickRecordCore({
	data,
	keypad,
	onDone,
}: {
	data: CatatData;
	/** Mobile: on-screen numeric keypad + compact, reordered layout. */
	keypad: boolean;
	onDone?: () => void;
}) {
	const router = useRouter();
	const haptic = useHaptics();
	const noteId = useId();

	const [direction, setDirection] = useState<CatatDirection>("keluar");
	const [amount, setAmount] = useState(0);
	const [categoryId, setCategoryId] = useState<string | null>(null);
	const [coaOverride, setCoaOverride] = useState("");
	const [accountCode, setAccountCode] = useState(
		data.cashAccounts[0]?.code ?? "",
	);
	const [toAccountCode, setToAccountCode] = useState(
		data.cashAccounts[1]?.code ?? data.cashAccounts[0]?.code ?? "",
	);
	const [date, setDate] = useState(todayIso());
	const [note, setNote] = useState("");
	const [photo, setPhoto] = useState<File | null>(null);
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [showAllCats, setShowAllCats] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);

	const [state, formAction, pending] = useActionState<
		QuickRecordFormState,
		FormData
	>(recordQuickTransaction, undefined);

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
	const visibleCats = showAllCats ? cats : cats.slice(0, 6);
	const sourceAcct = data.cashAccounts.find((a) => a.code === accountCode);

	const counterpartName =
		direction === "transfer"
			? (nameByCode.get(toAccountCode) ?? toAccountCode)
			: coaOverride
				? (nameByCode.get(coaOverride) ?? coaOverride)
				: (findCategory(categoryId)?.label ?? "—");

	const afterSource =
		direction === "masuk"
			? (sourceAcct?.balance ?? 0) + amount
			: (sourceAcct?.balance ?? 0) - amount;

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
				try {
					const fd = new FormData();
					fd.set("file", photo);
					fd.set("category", findCategory(categoryId)?.label ?? "Catat");
					fd.set("description", `${note || "Catat transaksi"} · ${ref}`);
					fd.set("nota_date", date);
					fd.set("amount", String(amount));
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
			onDone?.();
		})();
	}, [state, photo, categoryId, note, date, amount, haptic, router, onDone]);

	function changeDirection(d: CatatDirection) {
		haptic("select");
		setDirection(d);
		setCategoryId(null);
		setCoaOverride("");
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
					{cats.length > 6 ? (
						<button
							type="button"
							onClick={() => setShowAllCats((v) => !v)}
							className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800"
						>
							{showAllCats ? "Lebih sedikit" : "Lihat semua"}
						</button>
					) : null}
				</div>
				<div className="grid grid-cols-2 gap-2.5">
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
									"press flex h-12 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#059669]/40",
									active
										? "border-[#059669] bg-emerald-50 text-foreground"
										: "border-border-subtle bg-card text-foreground hover:bg-secondary",
								)}
							>
								<Icon
									className={cn(
										"size-4 shrink-0",
										active ? "text-[#059669]" : "text-muted-foreground",
									)}
								/>
								<span className="truncate">{c.label}</span>
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
					<textarea
						id={noteId}
						value={note}
						onChange={(e) => setNote(e.target.value)}
						rows={2}
						maxLength={300}
						placeholder="Catatan (opsional) — mis. bensin survey lokasi"
						className="w-full resize-none rounded-md border border-border-default bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-fluid-body"
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
					<JournalLine
						label={`KREDIT · ${direction === "masuk" ? counterpartName : (sourceAcct?.name ?? accountCode)}`}
						value={formatRupiah(amount)}
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
				if (!canSubmit) return;
				fd.set("direction", direction);
				fd.set("amount", String(amount));
				fd.set("entry_date", date);
				fd.set("account_code", accountCode);
				if (direction === "transfer") fd.set("to_account_code", toAccountCode);
				if (categoryId) fd.set("category_id", categoryId);
				if (coaOverride) fd.set("coa_override", coaOverride);
				if (note.trim()) fd.set("note", note.trim());
				formAction(fd);
			}}
			className="flex min-h-full flex-col gap-4"
		>
			{directionSeg}
			{amountHero}

			{keypad ? (
				<>
					{categoryField}
					{recentsBlock}
					{accountField}
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
					{detailsField}
					{lihatJurnal}
				</>
			)}

			{errorBanner}

			{/* Action bar — in-flow (mt-auto pins to bottom on short content);
			    matches the sheet surface so nothing leaks or looks cut. */}
			<div className="-mx-4 -mb-4 mt-auto border-t border-border-default bg-surface-3 px-4 pt-3 pb-3">
				<button
					type="submit"
					disabled={!canSubmit || pending}
					className={cn(
						"press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white outline-none transition-colors",
						canSubmit && !pending
							? "bg-[#059669] hover:bg-[#047857] dark:bg-[#0b9e6a] dark:hover:bg-[#059669]"
							: "cursor-not-allowed bg-[#059669]/45",
					)}
				>
					{pending ? (
						<>
							<Loader2 className="size-4 animate-spin" /> Menyimpan…
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
}: {
	accounts: CashAccount[];
	value: string;
	onChange: (code: string) => void;
	disabledCode?: string;
	variant?: "grid" | "scroll";
}) {
	const haptic = useHaptics();

	if (variant === "scroll") {
		// Exactly 2 cards per view, flush with the category columns above (same
		// gap-2.5 + half-gap width). Swipe for the rest. Inset ring on select so
		// it's never clipped by the scroller.
		return (
			<div className="hide-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1">
				{accounts.map((a) => {
					const active = value === a.code;
					const disabled = disabledCode === a.code;
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
							<span className="mt-1.5 flex items-baseline gap-1 whitespace-nowrap font-bold tracking-[-0.03em] text-foreground [font-family:var(--font-manrope),var(--font-inter),system-ui] [font-variant-numeric:tabular-nums_slashed-zero]">
								<span className="text-[0.9rem] font-bold text-muted-foreground">
									Rp
								</span>
								<span className="text-[1.2rem] leading-[1.04]">
									{a.balance.toLocaleString("id-ID")}
								</span>
							</span>
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
				const disabled = disabledCode === a.code;
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
							"press flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-40",
							active
								? "border-[#059669] bg-emerald-50"
								: "border-border-subtle bg-card hover:bg-secondary",
						)}
					>
						<span className="min-w-0 truncate text-[13px] font-medium text-foreground">
							{a.name}
						</span>
						<span className="tabular shrink-0 text-[12px] text-muted-foreground">
							{formatRupiah(a.balance)}
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
