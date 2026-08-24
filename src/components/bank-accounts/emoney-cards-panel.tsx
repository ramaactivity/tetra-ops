"use client";

import { CreditCard, Plus, Scale, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";
import {
	Field,
	FormError,
	fieldInputClass,
} from "@/components/catalog/form-kit";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/form-fields";
import { toast } from "@/components/ui/toaster";
import {
	createEmoneyCard,
	type EmoneyFormState,
	recountEmoneyCard,
	topupEmoneyCard,
} from "@/lib/actions/emoney";
import { CARD_PROVIDERS } from "@/lib/finance/emoney";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Panel kartu e-money (e-toll) di halaman Rekening Bank.
 *
 * Kartu bukan kategori biaya — ia tempat uang. Jadi yang ditampilkan sama
 * seperti rekening: saldo berjalan, plus dua aksi yang benar-benar
 * menggerakkan uang: isi saldo & cocokkan saldo.
 *
 * Pemilih & tanggal memakai Combobox/DatePicker (bukan kontrol native) sesuai
 * aturan design system; nilainya dititipkan ke FormData lewat input hidden
 * supaya alur `useActionState` + validasi server tetap dipakai apa adanya.
 */

export type CardRow = {
	id: string;
	name: string;
	provider: string | null;
	holderNote: string | null;
	coaCode: string;
	balance: number;
	lowThreshold: number;
	isLow: boolean;
	isActive: boolean;
};

export type SourceAccount = { code: string; name: string; balance: number };

const today = () => new Date().toISOString().slice(0, 10);

function errOf(state: EmoneyFormState, key: string): string | undefined {
	return (state?.errors as Record<string, string[] | undefined> | undefined)?.[
		key
	]?.[0];
}

function sourceOptions(
	sources: SourceAccount[],
	exclude?: string,
): ComboboxOption[] {
	return sources
		.filter((s) => s.code !== exclude)
		.map((s) => ({
			value: s.code,
			label: s.name,
			sublabel: formatRupiah(s.balance),
		}));
}

/** Tutup dialog + refresh begitu aksinya berhasil. */
function useCloseOnSuccess(
	state: EmoneyFormState,
	onDone: () => void,
	successText: string,
) {
	const router = useRouter();
	useEffect(() => {
		if (!state?.ok) return;
		toast.success(state.info ?? successText);
		onDone();
		router.refresh();
	}, [state, onDone, router, successText]);
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function EmoneyCardsPanel({
	cards,
	sources,
}: {
	cards: CardRow[];
	sources: SourceAccount[];
}) {
	const [addOpen, setAddOpen] = useState(false);
	const [topupCard, setTopupCard] = useState<CardRow | null>(null);
	const [recountCard, setRecountCard] = useState<CardRow | null>(null);

	const activeCards = cards.filter((c) => c.isActive);
	const total = activeCards.reduce((s, c) => s + c.balance, 0);

	return (
		<section className="space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-base font-semibold">Kartu e-toll / e-money</h2>
					<p className="text-muted-foreground text-[13px]">
						Uang yang sudah pindah ke kartu — belum jadi biaya sampai dipakai di
						gerbang tol.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{cards.length > 0 ? (
						<span className="text-muted-foreground text-[13px]">
							Total saldo{" "}
							<span
								data-nominal
								className="tabular text-foreground font-medium"
							>
								{formatRupiah(total)}
							</span>
						</span>
					) : null}
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-9 rounded-full"
						onClick={() => setAddOpen(true)}
					>
						<Plus className="size-4" aria-hidden />
						Tambah kartu
					</Button>
				</div>
			</div>

			{cards.length === 0 ? (
				<div className="border-border-default bg-surface-2 rounded-2xl border border-dashed p-6 text-center">
					<div className="bg-secondary text-muted-foreground mx-auto mb-3 grid size-10 place-items-center rounded-xl">
						<CreditCard className="size-5" aria-hidden />
					</div>
					<p className="font-medium">Belum ada kartu</p>
					<p className="text-muted-foreground mx-auto mt-1 max-w-md text-[13px]">
						Tambah kartu e-toll supaya uang yang di-topup punya tempat berdiri.
						Tanpa ini, saldo bank di buku selalu lebih besar dari kenyataan.
					</p>
				</div>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{cards.map((c) => (
						<article
							key={c.id}
							className={cn(
								"border-border-default bg-surface-2 rounded-2xl border p-4",
								!c.isActive && "opacity-60",
							)}
						>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="truncate font-medium">{c.name}</p>
									<p className="text-muted-foreground truncate text-[12px]">
										{c.provider ?? "E-money"} · {c.coaCode}
									</p>
								</div>
								{c.isLow ? (
									<span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
										Menipis
									</span>
								) : null}
								{!c.isActive ? (
									<span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
										Nonaktif
									</span>
								) : null}
							</div>

							<p
								data-nominal
								className={cn(
									"tabular-lg mt-3",
									c.balance < 0
										? "text-destructive"
										: c.isLow
											? "text-amber-700 dark:text-amber-300"
											: "text-foreground",
								)}
							>
								{formatRupiah(c.balance)}
							</p>
							{c.holderNote ? (
								<p className="text-muted-foreground mt-1 text-[12px]">
									Dipegang: {c.holderNote}
								</p>
							) : null}

							<div className="mt-3 flex flex-wrap gap-2">
								<Button
									type="button"
									size="sm"
									className="h-8 rounded-full"
									onClick={() => setTopupCard(c)}
								>
									<Wallet className="size-3.5" aria-hidden />
									Isi saldo
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 rounded-full"
									onClick={() => setRecountCard(c)}
								>
									<Scale className="size-3.5" aria-hidden />
									Cocokkan saldo
								</Button>
							</div>
						</article>
					))}
				</div>
			)}

			<AddCardDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				sources={sources}
			/>
			<TopupDialog
				card={topupCard}
				sources={sources}
				onClose={() => setTopupCard(null)}
			/>
			<RecountDialog
				card={recountCard}
				sources={sources}
				onClose={() => setRecountCard(null)}
			/>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Tambah kartu
// ---------------------------------------------------------------------------

function AddCardDialog({
	open,
	onOpenChange,
	sources,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	sources: SourceAccount[];
}) {
	const id = useId();
	const [state, action, pending] = useActionState(createEmoneyCard, undefined);
	const [provider, setProvider] = useState("");
	const [opening, setOpening] = useState(0);
	const [fromCoa, setFromCoa] = useState("");
	const [date, setDate] = useState(today);
	const [threshold, setThreshold] = useState(0);

	useCloseOnSuccess(state, () => onOpenChange(false), "Kartu tersimpan");

	return (
		<Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
			<DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<div className="bg-secondary text-muted-foreground mb-1 grid size-9 place-items-center rounded-xl">
						<CreditCard className="size-4" aria-hidden />
					</div>
					<DialogTitle>Tambah kartu e-toll</DialogTitle>
					<DialogDescription>
						Kode akun dibuat otomatis. Kartu tidak akan pernah muncul sebagai
						rekening tujuan pembayaran klien.
					</DialogDescription>
				</DialogHeader>

				<form action={action} className="space-y-4">
					<FormError message={errOf(state, "_form")} />

					<Field
						label="Nama kartu"
						name={`${id}-name`}
						hint="Nama yang crew kenal, bukan nomor kartu — misal “E-toll A (Avanza)”."
						error={errOf(state, "account_name")}
						required
					>
						<input
							id={`${id}-name`}
							name="account_name"
							required
							maxLength={80}
							placeholder="E-toll A"
							className={fieldInputClass}
						/>
					</Field>

					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label="Penerbit"
							name={`${id}-provider`}
							error={errOf(state, "card_provider")}
						>
							<Combobox
								id={`${id}-provider`}
								value={provider}
								onValueChange={setProvider}
								options={CARD_PROVIDERS.map((p) => ({ value: p, label: p }))}
								placeholder="Mandiri e-Money"
								aria-label="Penerbit kartu"
							/>
							<input type="hidden" name="card_provider" value={provider} />
						</Field>

						<Field
							label="Dipegang siapa"
							name={`${id}-holder`}
							error={errOf(state, "holder_note")}
						>
							<input
								id={`${id}-holder`}
								name="holder_note"
								maxLength={120}
								placeholder="Owner / nama crew"
								className={fieldInputClass}
							/>
						</Field>
					</div>

					<Field
						label="Peringatkan kalau saldo di bawah"
						name={`${id}-threshold`}
						hint="Biarkan 0 kalau tidak perlu peringatan."
						error={errOf(state, "low_balance_threshold")}
					>
						<MoneyInput
							id={`${id}-threshold`}
							name="low_balance_threshold"
							value={threshold}
							onValueChange={setThreshold}
						/>
					</Field>

					<div className="border-border-default space-y-4 rounded-xl border border-dashed p-3">
						<Field
							label="Saldo yang sudah ada di kartu"
							name={`${id}-opening`}
							hint="Uang ini dulu keluar dari suatu rekening — jadi dicatat sebagai pindah saldo, bukan angka yang muncul dari langit."
							error={errOf(state, "opening_balance")}
						>
							<MoneyInput
								id={`${id}-opening`}
								name="opening_balance"
								value={opening}
								onValueChange={setOpening}
							/>
						</Field>

						{opening > 0 ? (
							<div className="grid gap-4 sm:grid-cols-2">
								<Field
									label="Diambil dari"
									name={`${id}-from`}
									error={errOf(state, "opening_from_coa")}
									required
								>
									<Combobox
										id={`${id}-from`}
										value={fromCoa}
										onValueChange={setFromCoa}
										options={sourceOptions(sources)}
										allowFreeText={false}
										placeholder="Pilih rekening…"
										aria-label="Rekening asal saldo awal"
									/>
									<input
										type="hidden"
										name="opening_from_coa"
										value={fromCoa}
									/>
								</Field>
								<Field
									label="Tanggal"
									name={`${id}-opendate`}
									error={errOf(state, "opening_date")}
								>
									<DatePicker
										id={`${id}-opendate`}
										value={date}
										onValueChange={setDate}
									/>
									<input type="hidden" name="opening_date" value={date} />
								</Field>
							</div>
						) : null}
					</div>

					<input type="hidden" name="is_active" value="on" />

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? "Menyimpan…" : "Simpan kartu"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Isi saldo
// ---------------------------------------------------------------------------

function TopupDialog({
	card,
	sources,
	onClose,
}: {
	card: CardRow | null;
	sources: SourceAccount[];
	onClose: () => void;
}) {
	const id = useId();
	const [state, action, pending] = useActionState(topupEmoneyCard, undefined);
	const [fromCoa, setFromCoa] = useState("");
	const [amount, setAmount] = useState(0);
	const [hasFee, setHasFee] = useState(false);
	const [fee, setFee] = useState(1500);
	const [date, setDate] = useState(today);

	useCloseOnSuccess(state, onClose, "Saldo kartu bertambah");

	// Isian direset tiap kali kartu berganti — kalau tidak, angka kartu
	// sebelumnya masih menempel di form kartu berikutnya.
	useEffect(() => {
		if (!card) return;
		setFromCoa("");
		setAmount(0);
		setHasFee(false);
		setFee(1500);
		setDate(today());
	}, [card]);

	return (
		<Dialog
			open={card !== null}
			onOpenChange={(o) => !o && !pending && onClose()}
		>
			<DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<div className="bg-secondary text-muted-foreground mb-1 grid size-9 place-items-center rounded-xl">
						<Wallet className="size-4" aria-hidden />
					</div>
					<DialogTitle>Isi saldo {card?.name}</DialogTitle>
					<DialogDescription>
						Uangnya cuma pindah tempat — yang jadi beban hanya biaya adminnya.
					</DialogDescription>
				</DialogHeader>

				<form action={action} className="space-y-4">
					<FormError message={errOf(state, "_form")} />
					<input type="hidden" name="to_coa" value={card?.coaCode ?? ""} />

					<Field
						label="Diambil dari"
						name={`${id}-from`}
						error={errOf(state, "from_coa")}
						required
					>
						<Combobox
							id={`${id}-from`}
							value={fromCoa}
							onValueChange={setFromCoa}
							options={sourceOptions(sources, card?.coaCode)}
							allowFreeText={false}
							placeholder="Pilih rekening…"
							aria-label="Rekening asal topup"
						/>
						<input type="hidden" name="from_coa" value={fromCoa} />
					</Field>

					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label="Nominal topup"
							name={`${id}-amount`}
							error={errOf(state, "amount")}
							required
						>
							<MoneyInput
								id={`${id}-amount`}
								name="amount"
								value={amount}
								onValueChange={setAmount}
							/>
						</Field>
						<Field
							label="Tanggal"
							name={`${id}-date`}
							error={errOf(state, "entry_date")}
						>
							<DatePicker
								id={`${id}-date`}
								value={date}
								onValueChange={setDate}
							/>
							<input type="hidden" name="entry_date" value={date} />
						</Field>
					</div>

					<div className="border-border-default space-y-3 rounded-xl border p-3">
						<label className="flex items-center gap-2 text-sm font-medium">
							<input
								type="checkbox"
								name="has_admin_fee"
								checked={hasFee}
								onChange={(e) => setHasFee(e.target.checked)}
								className="border-border-default size-4 rounded"
							/>
							Ada biaya admin
						</label>
						{hasFee ? (
							<Field
								label="Biaya admin"
								name={`${id}-fee`}
								hint="Dibebankan ke Beban Administrasi Bank — tidak menambah saldo kartu."
								error={errOf(state, "admin_fee")}
							>
								<MoneyInput
									id={`${id}-fee`}
									name="admin_fee"
									value={fee}
									onValueChange={setFee}
								/>
							</Field>
						) : null}
					</div>

					{amount > 0 ? (
						<p className="text-muted-foreground text-[12px]">
							Total keluar dari rekening asal:{" "}
							<span
								data-nominal
								className="tabular text-foreground font-medium"
							>
								{formatRupiah(amount + (hasFee ? fee : 0))}
							</span>
						</p>
					) : null}

					<Field
						label="Catatan"
						name={`${id}-note`}
						error={errOf(state, "note")}
					>
						<input
							id={`${id}-note`}
							name="note"
							maxLength={120}
							placeholder="opsional"
							className={fieldInputClass}
						/>
					</Field>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={pending}
						>
							Batal
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? "Menyimpan…" : "Isi saldo"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Cocokkan saldo
// ---------------------------------------------------------------------------

const REASON_OUT: ComboboxOption[] = [
	{ value: "usage", label: "Kepakai di tol" },
	{ value: "unknown", label: "Tidak tahu" },
];
const REASON_IN: ComboboxOption[] = [
	{ value: "topup_unrecorded", label: "Ada topup yang belum dicatat" },
	{ value: "unknown", label: "Tidak tahu" },
];

function RecountDialog({
	card,
	sources,
	onClose,
}: {
	card: CardRow | null;
	sources: SourceAccount[];
	onClose: () => void;
}) {
	const id = useId();
	const [state, action, pending] = useActionState(recountEmoneyCard, undefined);
	const [actual, setActual] = useState(0);
	const [reasonOut, setReasonOut] = useState("usage");
	const [reasonIn, setReasonIn] = useState("topup_unrecorded");
	const [counterpart, setCounterpart] = useState("");
	const [date, setDate] = useState(today);

	useCloseOnSuccess(state, onClose, "Saldo dicocokkan");

	useEffect(() => {
		if (!card) return;
		setActual(card.balance);
		setReasonOut("usage");
		setReasonIn("topup_unrecorded");
		setCounterpart("");
		setDate(today());
	}, [card]);

	const book = card?.balance ?? 0;
	const diff = actual - book;

	return (
		<Dialog
			open={card !== null}
			onOpenChange={(o) => !o && !pending && onClose()}
		>
			<DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<div className="bg-secondary text-muted-foreground mb-1 grid size-9 place-items-center rounded-xl">
						<Scale className="size-4" aria-hidden />
					</div>
					<DialogTitle>Cocokkan saldo {card?.name}</DialogTitle>
					<DialogDescription>
						Cek saldo asli di aplikasi penerbit atau struk gerbang, lalu isi di
						sini. Selisihnya dijurnal otomatis.
					</DialogDescription>
				</DialogHeader>

				<form action={action} className="space-y-4">
					<FormError message={errOf(state, "_form")} />
					<input type="hidden" name="account_id" value={card?.id ?? ""} />
					<input
						type="hidden"
						name="reason"
						value={diff > 0 ? reasonIn : reasonOut}
					/>

					<div className="bg-surface-2 flex items-center justify-between rounded-xl px-3 py-2 text-sm">
						<span className="text-muted-foreground">Saldo menurut catatan</span>
						<span data-nominal className="tabular font-medium">
							{formatRupiah(book)}
						</span>
					</div>

					<Field
						label="Saldo asli di kartu"
						name={`${id}-actual`}
						error={errOf(state, "actual_balance")}
						required
					>
						<MoneyInput
							id={`${id}-actual`}
							name="actual_balance"
							value={actual}
							onValueChange={setActual}
						/>
					</Field>

					{diff !== 0 ? (
						<div
							className={cn(
								"rounded-xl px-3 py-2 text-[13px]",
								diff < 0
									? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
									: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
							)}
						>
							{diff < 0 ? (
								<>
									Kurang{" "}
									<span data-nominal className="tabular font-semibold">
										{formatRupiah(-diff)}
									</span>{" "}
									— ada pemakaian yang belum tercatat.
								</>
							) : (
								<>
									Lebih{" "}
									<span data-nominal className="tabular font-semibold">
										{formatRupiah(diff)}
									</span>{" "}
									— biasanya topup yang belum dicatat.
								</>
							)}
						</div>
					) : null}

					{diff < 0 ? (
						<Field
							label="Selisihnya untuk apa"
							name={`${id}-reason-out`}
							error={errOf(state, "reason")}
						>
							<Combobox
								id={`${id}-reason-out`}
								value={reasonOut}
								onValueChange={setReasonOut}
								options={REASON_OUT}
								allowFreeText={false}
								aria-label="Sebab selisih kurang"
							/>
						</Field>
					) : null}

					{diff > 0 ? (
						<>
							<Field
								label="Kenapa lebih"
								name={`${id}-reason-in`}
								error={errOf(state, "reason")}
							>
								<Combobox
									id={`${id}-reason-in`}
									value={reasonIn}
									onValueChange={setReasonIn}
									options={REASON_IN}
									allowFreeText={false}
									aria-label="Sebab selisih lebih"
								/>
							</Field>
							{reasonIn === "topup_unrecorded" ? (
								<Field
									label="Topupnya dari rekening mana"
									name={`${id}-cp`}
									hint="Rekening itu yang berkurang."
									error={errOf(state, "counterpart_coa")}
									required
								>
									<Combobox
										id={`${id}-cp`}
										value={counterpart}
										onValueChange={setCounterpart}
										options={sourceOptions(sources, card?.coaCode)}
										allowFreeText={false}
										placeholder="Pilih rekening…"
										aria-label="Rekening asal topup"
									/>
									<input
										type="hidden"
										name="counterpart_coa"
										value={counterpart}
									/>
								</Field>
							) : null}
						</>
					) : null}

					<Field
						label="Tanggal"
						name={`${id}-date`}
						error={errOf(state, "entry_date")}
					>
						<DatePicker
							id={`${id}-date`}
							value={date}
							onValueChange={setDate}
						/>
						<input type="hidden" name="entry_date" value={date} />
					</Field>

					<Field
						label="Catatan"
						name={`${id}-note`}
						error={errOf(state, "note")}
					>
						<input
							id={`${id}-note`}
							name="note"
							maxLength={120}
							placeholder="opsional"
							className={fieldInputClass}
						/>
					</Field>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={pending}
						>
							Batal
						</Button>
						<Button type="submit" disabled={pending || diff === 0}>
							{pending
								? "Menyimpan…"
								: diff === 0
									? "Saldo sudah cocok"
									: "Simpan penyesuaian"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
