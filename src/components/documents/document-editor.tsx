"use client";

import {
	ArrowDown,
	ArrowUp,
	Check,
	ChevronDown,
	Copy,
	Download,
	Eye,
	FileText,
	Handshake,
	Loader2,
	MessageCircle,
	PenLine,
	Plus,
	RefreshCw,
	Save,
	Trash2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	MoneyInput,
	NumberField,
	PhoneInput,
	TextField,
} from "@/components/ui/form-fields";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import {
	copyAsQuotation,
	type DocumentDraftInput,
	saveDocument,
	setDocumentStatus,
} from "@/lib/actions/documents";
import { computeTotals } from "@/lib/documents/totals";
import {
	DOC_TYPE_LABEL,
	type DocItem,
	type DocStatus,
	type DocumentSigner,
	defaultTerms,
	includesForPackage,
} from "@/lib/documents/types";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { whatsappUrl } from "@/lib/whatsapp";
import { ClientPicker } from "./client-picker";
import { DocStatusBadge } from "./document-status-badge";
import { PdfPreview } from "./pdf-preview";

export type EditorDoc = Omit<
	DocumentDraftInput,
	"items" | "discount" | "gross_up_enabled" | "gross_up_rate" | "status"
> & {
	id?: string | null;
	doc_number?: string | null;
	status: DocStatus;
	items: DocItem[];
	discount: number;
	gross_up_enabled: boolean;
	gross_up_rate: number;
};

export type PackageOption = {
	id: string;
	name: string;
	category: string;
	duration_hours: number | null;
	base_price: number;
	quotation_includes: string[] | null;
};
export type AddonOption = {
	id: string;
	name: string;
	unit: string | null;
	price: number;
};

/** Ringkasan event yang ditautkan invoice — angka bayar live dari event. */
export type LinkedEvent = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	venue_name: string | null;
	billable_total: number;
	total_paid: number;
	remaining_balance: number;
	payment_status: string;
	/** Item + diskon + gross-up versi event, untuk tombol "Samakan dari event". */
	fromEvent: { items: DocItem[]; discount: number; gross_up_enabled: boolean };
};

const CARD =
	"rounded-2xl border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)] space-y-3";
const LABEL = "text-[13px] font-medium text-foreground";

function Field({
	label,
	children,
	className,
	hint,
}: {
	label: string;
	children: React.ReactNode;
	className?: string;
	hint?: string;
}) {
	return (
		<div className={cn("space-y-1.5", className)}>
			<span className={LABEL}>{label}</span>
			{children}
			{hint ? (
				<p className="text-[12px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

export function DocumentEditor({
	initial,
	packages,
	addons,
	signers,
	grossupRate,
	linkedEvent,
	paymentsPanel,
}: {
	initial: EditorDoc;
	packages: PackageOption[];
	addons: AddonOption[];
	signers: DocumentSigner[];
	grossupRate: number;
	linkedEvent: LinkedEvent | null;
	/** Panel pembayaran (server component) — hanya untuk invoice. */
	paymentsPanel?: React.ReactNode;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [doc, setDoc] = useState<EditorDoc>(initial);
	const [savedSnapshot, setSavedSnapshot] = useState(() =>
		JSON.stringify(initial),
	);
	const [saving, startSave] = useTransition();
	const [busy, startBusy] = useTransition();
	const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");
	const dirty = JSON.stringify(doc) !== savedSnapshot;
	const isQuotation = doc.doc_type === "quotation";
	const typeLabel = DOC_TYPE_LABEL[doc.doc_type];

	const totals = useMemo(
		() =>
			computeTotals(doc.items, doc.discount ?? 0, {
				enabled: Boolean(doc.gross_up_enabled),
				ratePct: Number(doc.gross_up_rate ?? grossupRate),
			}),
		[
			doc.items,
			doc.discount,
			doc.gross_up_enabled,
			doc.gross_up_rate,
			grossupRate,
		],
	);

	const patch = useCallback(
		<K extends keyof EditorDoc>(k: K, v: EditorDoc[K]) => {
			setDoc((d) => ({ ...d, [k]: v }));
		},
		[],
	);
	const patchClient = (k: keyof EditorDoc["client"], v: string) =>
		setDoc((d) => ({ ...d, client: { ...d.client, [k]: v } }));
	const patchEvent = (
		k: keyof NonNullable<EditorDoc["event_info"]>,
		v: string,
	) => setDoc((d) => ({ ...d, event_info: { ...d.event_info, [k]: v } }));

	// S&K ikut berganti kalimat pajak saat gross-up ditoggle — hanya kalau
	// user belum mengubah S&K dari template.
	function toggleGrossUp() {
		setDoc((d) => {
			const next = !d.gross_up_enabled;
			const untouched =
				!d.terms ||
				d.terms === defaultTerms(d.doc_type, Boolean(d.gross_up_enabled));
			return {
				...d,
				gross_up_enabled: next,
				terms: untouched ? defaultTerms(d.doc_type, next) : d.terms,
			};
		});
	}

	// Peringatan tutup tab saat belum disimpan.
	useEffect(() => {
		if (!dirty) return;
		const h = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener("beforeunload", h);
		return () => window.removeEventListener("beforeunload", h);
	}, [dirty]);

	// Cmd/Ctrl+S = simpan
	useEffect(() => {
		const h = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
				e.preventDefault();
				void save();
			}
		};
		window.addEventListener("keydown", h);
		return () => window.removeEventListener("keydown", h);
	});

	type Saved = { id: string; number: string };
	const save = (): Promise<Saved | null> =>
		new Promise((resolve) => {
			startSave(async () => {
				const res = await saveDocument({ ...doc, id: doc.id ?? null });
				if (!res.ok) {
					toast.error(res.error);
					resolve(null);
					return;
				}
				const next = { ...doc, id: res.id, doc_number: res.doc_number };
				setDoc(next);
				setSavedSnapshot(JSON.stringify(next));
				toast.success(
					doc.id ? "Tersimpan" : `${typeLabel} ${res.doc_number} dibuat`,
				);
				if (!doc.id) router.replace(`/finance/dokumen/${res.id}`);
				resolve({ id: res.id, number: res.doc_number });
			});
		});

	async function ensureSaved(): Promise<Saved | null> {
		if (doc.id && doc.doc_number && !dirty)
			return { id: doc.id, number: doc.doc_number };
		return save();
	}

	async function download() {
		const saved = await ensureSaved();
		if (!saved) return;
		window.open(`/api/pdf/document/${saved.id}?download=1`, "_blank");
	}

	async function sendWa() {
		const saved = await ensureSaved();
		if (!saved) return;
		const id = saved.id;
		const phone = doc.client.phone?.trim();
		const when = doc.event_info?.date ?? linkedEvent?.event_date;
		const msg = [
			`Halo ${doc.client.name},`,
			"",
			`Berikut ${typeLabel.toLowerCase()} *${saved.number}* dari Tetra Photobooth${when ? ` untuk acara ${formatDateID(when)}` : ""}.`,
			`Total: *${formatRupiah(totals.total)}*`,
			"",
			"File PDF terlampir. Terima kasih 🙏",
		].join("\n");
		window.open(`/api/pdf/document/${id}?download=1`, "_blank");
		if (phone) {
			window.open(whatsappUrl(phone, msg), "_blank");
		} else {
			await navigator.clipboard?.writeText(msg);
			toast.info(
				"Nomor WA klien kosong — pesan disalin ke clipboard, PDF diunduh.",
			);
		}
	}

	function changeStatus(status: DocStatus) {
		if (!doc.id) return;
		startBusy(async () => {
			const res = await setDocumentStatus(doc.id as string, status);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			const next = { ...doc, status };
			setDoc(next);
			setSavedSnapshot(JSON.stringify(next));
			toast.success("Status diperbarui");
		});
	}

	async function voidDoc() {
		const ok = await confirm({
			title: `Batalkan ${typeLabel.toLowerCase()} ini?`,
			description: `Nomor ${doc.doc_number} tetap tercatat dan tidak dipakai ulang. Dokumen tidak bisa diedit lagi.`,
			confirmLabel: "Batalkan dokumen",
			variant: "destructive",
		});
		if (ok) changeStatus("void");
	}

	function duplicateAsQuotation() {
		startBusy(async () => {
			const saved = await ensureSaved();
			if (!saved) return;
			const res = await copyAsQuotation(saved.id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Quotation baru dibuat");
			router.push(`/finance/dokumen/${res.id}`);
		});
	}

	// ---- item helpers
	const setItems = (fn: (items: DocItem[]) => DocItem[]) =>
		setDoc((d) => ({ ...d, items: fn(d.items) }));
	const addPackage = (id: string) => {
		const p = packages.find((x) => x.id === id);
		if (!p) return;
		setItems((it) => [
			...it,
			{
				name: p.name,
				includes: includesForPackage(p),
				qty: 1,
				unit_price: p.base_price,
				package_id: p.id,
			},
		]);
	};
	const addAddon = (id: string) => {
		const a = addons.find((x) => x.id === id);
		if (!a) return;
		setItems((it) => [
			...it,
			{
				name: a.name,
				includes: a.unit ? [a.unit] : [],
				qty: 1,
				unit_price: a.price,
				addon_id: a.id,
			},
		]);
	};
	const addBlank = () =>
		setItems((it) => [
			...it,
			{ name: "", includes: [], qty: 1, unit_price: 0 },
		]);
	const updateItem = (i: number, p: Partial<DocItem>) =>
		setItems((it) => it.map((x, j) => (j === i ? { ...x, ...p } : x)));
	const removeItem = (i: number) =>
		setItems((it) => it.filter((_, j) => j !== i));
	const moveItem = (i: number, dir: -1 | 1) =>
		setItems((it) => {
			const j = i + dir;
			if (j < 0 || j >= it.length) return it;
			const next = [...it];
			[next[i], next[j]] = [next[j], next[i]];
			return next;
		});

	const packageOptions = useMemo(
		() =>
			packages.map((p) => ({
				value: p.id,
				label: p.name,
				sublabel: `${formatRupiah(p.base_price)}${p.duration_hours ? ` · ${p.duration_hours} jam` : ""}`,
			})),
		[packages],
	);
	const addonOptions = useMemo(
		() =>
			addons.map((a) => ({
				value: a.id,
				label: a.name,
				sublabel: `${formatRupiah(a.price)}${a.unit ? ` / ${a.unit}` : ""}`,
			})),
		[addons],
	);

	const signerOptions = signers.map((s) => ({
		value: s.id,
		label: `${s.name} — ${s.position}`,
	}));
	function pickSigner(id: string) {
		const s = signers.find((x) => x.id === id);
		setDoc((d) => ({
			...d,
			signer_id: id || null,
			signer_name: s?.name ?? d.signer_name,
			signer_position: s?.position ?? d.signer_position,
		}));
	}

	const mismatch =
		linkedEvent && totals.total !== linkedEvent.billable_total
			? linkedEvent.billable_total - totals.total
			: 0;

	const previewDraft = useMemo(
		() => ({
			...doc,
			doc_number: doc.doc_number ?? "DRAFT",
			gross_up_rate: doc.gross_up_rate ?? grossupRate,
		}),
		[doc, grossupRate],
	);

	const readOnly = doc.status === "void";

	return (
		<div className="space-y-3">
			{/* ── Bilah aksi ── */}
			<div className="sticky top-2 z-20 md:top-[76px] flex flex-wrap items-center gap-2 rounded-2xl border border-border-subtle bg-card/90 px-3 py-2 shadow-[var(--shadow-level-2)] backdrop-blur">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<FileText className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="truncate text-[14px] font-semibold">
								{doc.doc_number ?? `${typeLabel} baru`}
							</span>
							<DocStatusBadge status={doc.status} />
							{dirty ? (
								<span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
									<span className="size-1.5 rounded-full bg-amber-500" />
									Belum disimpan
								</span>
							) : null}
						</div>
						<p className="truncate text-[12px] text-muted-foreground">
							{typeLabel}
							{doc.client.name ? ` · ${doc.client.name}` : ""}
							{" · "}
							<span className="tabular">{formatRupiah(totals.total)}</span>
						</p>
					</div>
				</div>
				<div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
					<Button
						variant="outline"
						size="sm"
						onClick={download}
						disabled={saving}
					>
						<Download className="size-3.5" /> PDF
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={sendWa}
						disabled={saving}
					>
						<MessageCircle className="size-3.5" /> WA
					</Button>
					<Button
						size="sm"
						onClick={() => void save()}
						disabled={saving || readOnly || !dirty}
					>
						{saving ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<Save className="size-3.5" />
						)}
						Simpan
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger
							disabled={busy}
							className="inline-flex h-7 items-center gap-1 rounded-[12px] border border-border-default bg-card px-2 text-[12.5px] font-medium hover:bg-secondary"
							aria-label="Aksi lain"
						>
							<ChevronDown className="size-3.5" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={6} className="w-64">
							{isQuotation && doc.id ? (
								<DropdownMenuItem
									onClick={() =>
										router.push(`/operations/new?fromQuotation=${doc.id}`)
									}
									className="gap-2"
								>
									<Handshake className="size-4" /> Deal → Buat event + invoice
								</DropdownMenuItem>
							) : null}
							{isQuotation && !doc.id ? (
								<p className="px-2 py-1.5 text-[11px] text-muted-foreground">
									Simpan dulu untuk membuat event dari quotation ini.
								</p>
							) : null}
							<DropdownMenuItem
								onClick={duplicateAsQuotation}
								className="gap-2"
							>
								<Copy className="size-4" /> Salin jadi quotation baru
							</DropdownMenuItem>
							{doc.id ? (
								<>
									<DropdownMenuSeparator />
									{(["sent", "accepted", "rejected"] as const).map((s) => (
										<DropdownMenuItem
											key={s}
											disabled={doc.status === s || readOnly}
											onClick={() => changeStatus(s)}
											className="gap-2"
										>
											{doc.status === s ? (
												<Check className="size-4" />
											) : (
												<span className="size-4" />
											)}
											Tandai{" "}
											{s === "sent"
												? "terkirim"
												: s === "accepted"
													? "disetujui"
													: "ditolak"}
										</DropdownMenuItem>
									))}
									<DropdownMenuSeparator />
									<DropdownMenuItem
										disabled={readOnly}
										onClick={voidDoc}
										className="gap-2 text-rose-700"
									>
										<X className="size-4" /> Batalkan dokumen
									</DropdownMenuItem>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* ── Toggle Isi / Preview (mobile) ── */}
			<div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-border-subtle bg-card p-1 shadow-[var(--shadow-level-1)] lg:hidden">
				{(["form", "preview"] as const).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => setMobileTab(t)}
						className={cn(
							"inline-flex h-7 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
							mobileTab === t
								? "bg-[#059669] text-white"
								: "text-muted-foreground",
						)}
					>
						{t === "form" ? (
							<PenLine className="size-3.5" />
						) : (
							<Eye className="size-3.5" />
						)}
						{t === "form" ? "Isi" : "Preview"}
					</button>
				))}
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,42%)]">
				{/* ── Form ── */}
				<div
					className={cn(
						"space-y-3",
						mobileTab === "preview" && "hidden lg:block",
					)}
				>
					{readOnly ? (
						<div className="rounded-2xl border border-border-subtle bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
							Dokumen ini sudah dibatalkan — hanya bisa dilihat & diunduh.
						</div>
					) : null}

					{paymentsPanel}

					{/* Klien */}
					<section className={CARD}>
						<h2 className="type-heading">Klien</h2>
						<Field label="Nama klien">
							<ClientPicker
								name={doc.client.name}
								onNameChange={(v) => patchClient("name", v)}
								onPick={(c) =>
									setDoc((d) => ({
										...d,
										client: {
											name: c.name,
											org: c.org ?? d.client.org ?? "",
											phone: c.phone ?? d.client.phone ?? "",
											email: c.email ?? d.client.email ?? "",
											address: c.address ?? d.client.address ?? "",
										},
									}))
								}
							/>
						</Field>
						<div className="grid gap-3 sm:grid-cols-2">
							<Field label="Perusahaan / instansi">
								<TextField
									value={doc.client.org ?? ""}
									onChange={(e) => patchClient("org", e.target.value)}
									placeholder="PT Mahaka · SMA 1 Bogor"
								/>
							</Field>
							<Field label="WhatsApp">
								<PhoneInput
									value={doc.client.phone ?? ""}
									onChange={(e) => patchClient("phone", e.target.value)}
								/>
							</Field>
							<Field label="Email">
								<TextField
									type="email"
									value={doc.client.email ?? ""}
									onChange={(e) => patchClient("email", e.target.value)}
									placeholder="opsional"
								/>
							</Field>
							<Field label="Alamat">
								<TextField
									value={doc.client.address ?? ""}
									onChange={(e) => patchClient("address", e.target.value)}
									placeholder="opsional"
								/>
							</Field>
						</div>
					</section>

					{/* Acara */}
					<section className={CARD}>
						<div className="flex items-center justify-between gap-2">
							<h2 className="type-heading">Acara</h2>
							{linkedEvent ? (
								<Link
									href={`/operations/${linkedEvent.project_id}`}
									className="text-[12.5px] font-medium text-link hover:underline"
								>
									Buka event {linkedEvent.project_id}
								</Link>
							) : null}
						</div>
						{linkedEvent ? (
							<p className="text-[13px] text-muted-foreground">
								Tanggal, jam, dan lokasi diambil langsung dari event —{" "}
								<span className="text-foreground">
									{formatDateID(linkedEvent.event_date)}
									{linkedEvent.venue_name ? ` · ${linkedEvent.venue_name}` : ""}
								</span>
								. Ubah di halaman event bila perlu.
							</p>
						) : (
							<div className="grid gap-3 sm:grid-cols-2">
								<Field label="Tanggal acara">
									<DatePicker
										value={doc.event_info?.date ?? ""}
										onValueChange={(v) => patchEvent("date", v)}
										placeholder="Belum pasti? kosongkan"
									/>
								</Field>
								<Field label="Jam">
									<TextField
										value={doc.event_info?.time ?? ""}
										onChange={(e) => patchEvent("time", e.target.value)}
										placeholder="10:00–14:00"
									/>
								</Field>
								<Field label="Venue">
									<TextField
										value={doc.event_info?.venue ?? ""}
										onChange={(e) => patchEvent("venue", e.target.value)}
										placeholder="Grand Savero Hotel"
									/>
								</Field>
								<Field label="Kota">
									<TextField
										value={doc.event_info?.city ?? ""}
										onChange={(e) => patchEvent("city", e.target.value)}
										placeholder="Bogor"
									/>
								</Field>
							</div>
						)}
					</section>

					{/* Item */}
					<section className={CARD}>
						<h2 className="type-heading">Item</h2>
						<div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
							<Combobox
								value=""
								onValueChange={addPackage}
								options={packageOptions}
								allowFreeText={false}
								placeholder="+ Tambah paket…"
								aria-label="Tambah paket"
							/>
							<Combobox
								value=""
								onValueChange={addAddon}
								options={addonOptions}
								allowFreeText={false}
								placeholder="+ Tambah add-on…"
								aria-label="Tambah add-on"
							/>
							<Button
								variant="outline"
								size="lg"
								onClick={addBlank}
								className="h-10"
							>
								<Plus className="size-4" /> Baris kosong
							</Button>
						</div>

						{doc.items.length === 0 ? (
							<p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-center text-[13px] text-muted-foreground">
								Pilih paket di atas — daftar "include"-nya terisi otomatis dan
								bisa diedit.
							</p>
						) : null}

						<ul className="space-y-2">
							{doc.items.map((it, i) => (
								<li
									// biome-ignore lint/suspicious/noArrayIndexKey: item tak punya id; urutan = identitas
									key={i}
									className="rounded-xl border border-border-default bg-background p-3"
								>
									<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_72px_150px_auto]">
										<TextField
											value={it.name}
											onChange={(e) => updateItem(i, { name: e.target.value })}
											placeholder="Nama item"
											className="font-medium"
											aria-label="Nama item"
										/>
										<NumberField
											value={it.qty}
											min={0}
											onChange={(e) =>
												updateItem(i, { qty: Number(e.target.value) || 0 })
											}
											aria-label="Qty"
										/>
										<MoneyInput
											value={it.unit_price}
											onValueChange={(v) => updateItem(i, { unit_price: v })}
											aria-label="Harga satuan"
										/>
										<div className="flex items-center justify-end gap-0.5">
											<Button
												variant="ghost"
												size="icon-sm"
												onClick={() => moveItem(i, -1)}
												disabled={i === 0}
												aria-label="Naik"
											>
												<ArrowUp className="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												onClick={() => moveItem(i, 1)}
												disabled={i === doc.items.length - 1}
												aria-label="Turun"
											>
												<ArrowDown className="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												onClick={() => removeItem(i)}
												aria-label="Hapus"
												className="text-rose-700"
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
									</div>
									<div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
										<RichTextarea
											toolbar={false}
											rows={2}
											value={it.includes.join("\n")}
											onChange={(v) =>
												updateItem(i, { includes: v.split("\n") })
											}
											placeholder="Include — satu poin per baris (opsional)"
											className="text-[13px]"
										/>
										<div className="self-end pb-1 text-right text-[13px] text-muted-foreground sm:w-[150px]">
											<span className="tabular font-medium text-foreground">
												{formatRupiah(it.qty * it.unit_price)}
											</span>
										</div>
									</div>
								</li>
							))}
						</ul>
					</section>

					{/* Harga */}
					<section className={CARD}>
						<h2 className="type-heading">Harga & pajak</h2>
						<div className="grid gap-3 sm:grid-cols-2">
							<Field label="Diskon (Rp)">
								<MoneyInput
									value={doc.discount ?? 0}
									onValueChange={(v) => patch("discount", v)}
								/>
							</Field>
							<div className="space-y-1.5">
								<span className={LABEL}>Gross-up PPh</span>
								<div className="flex h-10 items-center gap-3">
									<Switch
										checked={Boolean(doc.gross_up_enabled)}
										onCheckedChange={toggleGrossUp}
										aria-label="Gross-up PPh"
									/>
									<span className="text-[13px] text-muted-foreground">
										{doc.gross_up_enabled
											? "Tagihan dinaikkan supaya setelah dipotong"
											: "Klien bayar sesuai nominal"}
									</span>
									{doc.gross_up_enabled ? (
										<div className="ml-auto flex items-center gap-1">
											<NumberField
												value={doc.gross_up_rate ?? grossupRate}
												step={0.5}
												min={0}
												max={99}
												onChange={(e) =>
													patch("gross_up_rate", Number(e.target.value) || 0)
												}
												className="w-16 text-right"
												aria-label="Persen gross-up"
											/>
											<span className="text-[13px] text-muted-foreground">
												%
											</span>
										</div>
									) : null}
								</div>
							</div>
						</div>
						<dl className="space-y-1 rounded-xl bg-secondary/60 px-4 py-3 text-[13px]">
							<Row k="Subtotal" v={formatRupiah(totals.subtotal)} />
							{totals.discount > 0 ? (
								<Row k="Diskon" v={`- ${formatRupiah(totals.discount)}`} />
							) : null}
							{totals.grossUp > 0 ? (
								<Row
									k={`Gross-up PPh ${doc.gross_up_rate ?? grossupRate}%`}
									v={formatRupiah(totals.grossUp)}
								/>
							) : null}
							<div className="flex items-center justify-between border-t border-border-default pt-2">
								<dt className="font-semibold">Total</dt>
								<dd className="type-num-lg tabular">
									{formatRupiah(totals.total)}
								</dd>
							</div>
							{totals.grossUp > 0 ? (
								<p className="pt-1 text-[12px] text-muted-foreground">
									Setelah klien memotong {doc.gross_up_rate ?? grossupRate}%,
									Tetra tetap menerima{" "}
									<span className="tabular">{formatRupiah(totals.net)}</span>.
								</p>
							) : null}
						</dl>
						{linkedEvent && mismatch !== 0 ? (
							<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
								<span>
									Total invoice{" "}
									<span className="tabular font-medium">
										{formatRupiah(totals.total)}
									</span>{" "}
									≠ tagihan event{" "}
									<span className="tabular font-medium">
										{formatRupiah(linkedEvent.billable_total)}
									</span>
									. Sisa tagihan di Billing mengikuti event.
								</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setDoc((d) => ({
											...d,
											items: linkedEvent.fromEvent.items,
											discount: linkedEvent.fromEvent.discount,
											gross_up_enabled: linkedEvent.fromEvent.gross_up_enabled,
										}))
									}
								>
									<RefreshCw className="size-3.5" /> Samakan dari event
								</Button>
							</div>
						) : null}
					</section>

					{/* Tanggal & tanda tangan */}
					<section className={CARD}>
						<h2 className="type-heading">Tanggal & tanda tangan</h2>
						<div className="grid gap-3 sm:grid-cols-2">
							<Field
								label="Tanggal terbit"
								hint={
									doc.id
										? "Nomor dokumen sudah terkunci ke tanggal terbit pertama."
										: undefined
								}
							>
								<DatePicker
									value={doc.issued_at}
									onValueChange={(v) => patch("issued_at", v)}
								/>
							</Field>
							{isQuotation ? (
								<Field label="Berlaku sampai">
									<DatePicker
										value={doc.valid_until ?? ""}
										onValueChange={(v) => patch("valid_until", v)}
										placeholder="opsional"
									/>
								</Field>
							) : (
								<Field label="Jatuh tempo">
									<DatePicker
										value={doc.due_date ?? ""}
										onValueChange={(v) => patch("due_date", v)}
										placeholder="opsional"
									/>
								</Field>
							)}
							<Field label="Penanda tangan" className="sm:col-span-2">
								<NativeSelect
									options={signerOptions}
									value={doc.signer_id ?? ""}
									onValueChange={pickSigner}
									placeholder="Pilih preset…"
								/>
							</Field>
							<Field label="Nama di dokumen">
								<TextField
									value={doc.signer_name ?? ""}
									onChange={(e) => patch("signer_name", e.target.value)}
								/>
							</Field>
							<Field label="Jabatan">
								<TextField
									value={doc.signer_position ?? ""}
									onChange={(e) => patch("signer_position", e.target.value)}
								/>
							</Field>
						</div>
						{signers.length === 0 ? (
							<p className="text-[12px] text-muted-foreground">
								Belum ada preset —{" "}
								<Link
									href="/settings/dokumen"
									className="text-link hover:underline"
								>
									tambah penanda tangan & unggah tanda tangan
								</Link>
								.
							</p>
						) : null}
					</section>

					{/* Catatan & S&K */}
					<section className={CARD}>
						<h2 className="type-heading">Catatan & syarat</h2>
						<Field label="Catatan untuk klien">
							<RichTextarea
								toolbar={false}
								rows={2}
								value={doc.notes ?? ""}
								onChange={(v) => patch("notes", v)}
								placeholder="opsional — tampil di atas S&K"
							/>
						</Field>
						<Field label="Syarat & ketentuan" hint="Satu poin per baris.">
							<RichTextarea
								toolbar={false}
								rows={4}
								value={doc.terms ?? ""}
								onChange={(v) => patch("terms", v)}
							/>
						</Field>
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								patch(
									"terms",
									defaultTerms(doc.doc_type, Boolean(doc.gross_up_enabled)),
								)
							}
						>
							<RefreshCw className="size-3.5" /> Kembalikan ke template
						</Button>
					</section>
				</div>

				{/* ── Preview ── */}
				<div className={cn("lg:block", mobileTab === "form" && "hidden")}>
					<div className="lg:sticky lg:top-[136px]">
						<PdfPreview
							draft={previewDraft}
							className="aspect-[210/297] w-full"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function Row({ k, v }: { k: string; v: string }) {
	return (
		<div className="flex items-center justify-between">
			<dt className="text-muted-foreground">{k}</dt>
			<dd className="tabular">{v}</dd>
		</div>
	);
}
