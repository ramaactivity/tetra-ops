"use client";

import {
	ArrowDownLeft,
	ArrowLeftRight,
	ArrowUpRight,
	ChevronDown,
	Loader2,
	Paperclip,
	Repeat2,
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
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [showAllCats, setShowAllCats] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);

	const [state, formAction, pending] = useActionState<
		QuickRecordFormState,
		FormData
	>(recordQuickTransaction, undefined);

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

	// ── Section fragments (composed in different orders for mobile vs desktop) ──

	const directionSeg = (
		<div className="grid grid-cols-3 gap-1 rounded-full bg-surface-4 p-1">
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
							"press flex h-9 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors duration-base ease-out-expo",
							active
								? "bg-[#059669] text-white shadow-[var(--shadow-level-1)]"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon className="size-4" aria-hidden="true" />
						{DIRECTION_LABEL[d]}
					</button>
				);
			})}
		</div>
	);

	const amountHero = (
		<div className="text-center">
			<div className="eyebrow">{dirNoun}</div>
			<div
				className={cn(
					"type-num-xl mt-0.5 flex items-baseline justify-center gap-1.5",
					amount === 0
						? "text-muted-foreground/35"
						: direction === "masuk"
							? "text-emerald-700"
							: "text-foreground",
				)}
			>
				<span className="font-display text-xl text-muted-foreground">Rp</span>
				{amount === 0 ? "0" : amount.toLocaleString("id-ID")}
			</div>
		</div>
	);

	const recentsBlock =
		amount === 0 && data.recents.length > 0 ? (
			<div className="space-y-1.5">
				<div className="eyebrow">Transaksi terakhir</div>
				<div className="flex flex-wrap gap-2">
					{data.recents.map((r) => (
						<button
							key={r.id}
							type="button"
							onClick={() => applyRecent(r)}
							className="press tap inline-flex h-8 items-center gap-1.5 rounded-full border border-border-default bg-card px-3 text-[13px] text-foreground hover:bg-secondary"
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
			<div className="space-y-1.5">
				<div className="eyebrow">Kategori</div>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
									"press flex h-10 items-center gap-2 rounded-xl border px-3 text-[13px] font-medium transition-colors",
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
				<div className="flex items-center gap-3 pt-0.5">
					{cats.length > 6 ? (
						<button
							type="button"
							onClick={() => setShowAllCats((v) => !v)}
							className="shrink-0 text-[13px] font-medium text-muted-foreground hover:text-foreground"
						>
							{showAllCats ? "Lebih sedikit" : "Semua"}
						</button>
					) : null}
					<div className="min-w-0 flex-1">
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
						/>
					</div>
				</div>
			</div>
		) : null;

	const accountField = (
		<div className="space-y-1.5">
			<div className="eyebrow">
				{direction === "masuk" ? "Masuk ke" : "Dari"}
			</div>
			<AccountPicker
				accounts={data.cashAccounts}
				value={accountCode}
				onChange={setAccountCode}
				variant={keypad ? "scroll" : "grid"}
			/>
			{direction === "transfer" ? (
				<>
					<div className="flex items-center justify-between pt-1">
						<div className="eyebrow">Ke</div>
						<button
							type="button"
							onClick={swapTransfer}
							className="press tap inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
						>
							<ArrowLeftRight className="size-3.5" /> Tukar
						</button>
					</div>
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
		<div className="space-y-2">
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

	const runningBalance =
		sourceAcct && amount > 0 ? (
			<div className="flex items-center justify-between rounded-xl bg-surface-4/70 px-3 py-2 text-[13px]">
				<span className="text-muted-foreground">
					{sourceAcct.name} setelah ini
				</span>
				<span
					className={cn(
						"tabular font-medium",
						afterSource < 0 ? "text-rose-600" : "text-foreground",
					)}
				>
					{formatRupiah(afterSource)}
				</span>
			</div>
		) : null;

	const detailsField = (
		<div className="rounded-xl border border-border-subtle">
			<button
				type="button"
				onClick={() => setDetailsOpen((v) => !v)}
				className="flex w-full items-center justify-between px-3 py-2.5 text-[13px] font-medium text-foreground"
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
				<div className="space-y-3 border-t border-border-subtle p-3">
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => setDate(todayIso())}
							className={cn(
								"press tap h-8 rounded-full border px-3 text-[13px]",
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
							className="h-8 rounded-md border border-border-default bg-background px-2 text-[13px] text-foreground"
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
					<label className="press tap flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-default bg-card px-3 text-[13px] text-muted-foreground hover:bg-secondary">
						<Paperclip className="size-4" />
						<span className="truncate">
							{photo ? photo.name : "Lampirkan foto nota"}
						</span>
						<input
							type="file"
							accept="image/*,application/pdf"
							className="hidden"
							onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
						/>
					</label>
				</div>
			) : null}
		</div>
	);

	const lihatJurnal = canSubmit ? (
		<div>
			<button
				type="button"
				onClick={() => setPreviewOpen((v) => !v)}
				className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
			>
				{previewOpen ? "Sembunyikan jurnal" : "Lihat jurnal ▸"}
			</button>
			{previewOpen ? (
				<dl className="mt-2 space-y-1 rounded-lg bg-surface-4/70 p-3 text-[12px]">
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
			className="space-y-4"
		>
			{directionSeg}
			{amountHero}

			{keypad ? (
				// Mobile: surface category + account ABOVE the keypad so the required
				// choices are visible, with the keypad in the thumb zone above the CTA.
				<>
					{categoryField}
					{recentsBlock}
					{accountField}
					{runningBalance}
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
					{runningBalance}
					{detailsField}
					{lihatJurnal}
				</>
			)}

			{errorBanner}

			{/* Sticky CTA — bg covers content scrolling under it; no -mb overhang */}
			<div className="sticky bottom-0 -mx-4 border-t border-border-subtle bg-surface-3 px-4 pt-3 pb-1">
				<button
					type="submit"
					disabled={!canSubmit || pending}
					className={cn(
						"press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
						canSubmit && !pending
							? "bg-[#059669] text-white hover:bg-[#047857] dark:bg-[#0b9e6a] dark:hover:bg-[#059669]"
							: "cursor-not-allowed bg-surface-4 text-muted-foreground",
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
		return (
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
								"press flex min-w-[8.5rem] shrink-0 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40",
								active
									? "border-[#059669] bg-emerald-50"
									: "border-border-subtle bg-card",
							)}
						>
							<span className="max-w-[9rem] truncate text-[13px] font-medium text-foreground">
								{a.name}
							</span>
							<span className="tabular text-[11px] text-muted-foreground">
								{formatRupiah(a.balance)}
							</span>
						</button>
					);
				})}
			</div>
		);
	}

	return (
		<div className="grid gap-2 sm:grid-cols-2">
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
							"press flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-40",
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
