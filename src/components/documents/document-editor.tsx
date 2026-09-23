"use client";

import {
	ArrowDown,
	ArrowUp,
	CalendarDays,
	Check,
	ChevronDown,
	Copy,
	Download,
	Eye,
	FileText,
	Handshake,
	ImagePlus,
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
import type { VenueOption } from "@/components/booking/booking-form";
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
import { TimePicker } from "@/components/ui/time-picker";
import { toast } from "@/components/ui/toaster";
import {
	copyAsQuotation,
	type DocumentDraftInput,
	saveDocument,
	setDocumentStatus,
} from "@/lib/actions/documents";
import { computeTotals } from "@/lib/documents/totals";
import {
	addDays,
	DOC_TYPE_LABEL,
	type DocItem,
	type DocStatus,
	type DocumentSigner,
	DUE_PRESETS,
	defaultTerms,
	includesForPackage,
} from "@/lib/documents/types";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { whatsappUrl } from "@/lib/whatsapp";
import { ClientPicker } from "./client-picker";
import { DocStatusBadge } from "./document-status-badge";
import { IncludeList } from "./include-list";
import { PdfPreview } from "./pdf-preview";
import { SignerDialog } from "./signer-settings";

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
	venues = [],
}: {
	initial: EditorDoc;
	packages: PackageOption[];
	addons: AddonOption[];
	signers: DocumentSigner[];
	/** Master venue (sama dengan form booking) untuk quotation. */
	venues?: VenueOption[];
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
			const h = hMinusOf(
				d.due_date ?? null,
				linkedEvent?.event_date ?? d.event_info?.date ?? null,
			);
			const untouched =
				!d.terms ||
				d.terms === defaultTerms(d.doc_type, Boolean(d.gross_up_enabled), h);
			return {
				...d,
				gross_up_enabled: next,
				terms: untouched ? defaultTerms(d.doc_type, next, h) : d.terms,
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

	// Jam acara disimpan sebagai "10:00–14:00" (format yang juga dibaca
	// booking-defaults saat quotation di-deal).
	const [timeStart, timeEnd] = splitTime(doc.event_info?.time ?? "");
	function setTime(start: string, end: string) {
		patchEvent("time", start && end ? `${start}–${end}` : start || end);
	}

	const venueOptions = useMemo(
		() =>
			venues.map((v) => ({
				value: v.name,
				label: v.name,
				sublabel: [v.city, v.address].filter(Boolean).join(" · ") || undefined,
			})),
		[venues],
	);
	const matchedVenue = venues.find(
		(v) =>
			v.name.trim().toLowerCase() ===
			(doc.event_info?.venue ?? "").trim().toLowerCase(),
	);
	/** Kota mengikuti venue yang dipilih dari master; venue baru = kota diketik. */
	function pickVenue(name: string) {
		const found = venues.find(
			(v) => v.name.trim().toLowerCase() === name.trim().toLowerCase(),
		);
		setDoc((d) => ({
			...d,
			event_info: {
				...d.event_info,
				venue: name,
				city: found?.city ?? d.event_info?.city ?? "",
			},
		}));
	}

	// Tanggal acara untuk chip jatuh tempo: dari event (invoice) atau isian (quotation).
	const eventDate = linkedEvent?.event_date ?? doc.event_info?.date ?? null;
	const hMinus = hMinusOf(doc.due_date ?? null, eventDate);
	const currentSigner = signers.find((x) => x.id === doc.signer_id) ?? null;
	const [signerDialog, setSignerDialog] = useState<DocumentSigner | null>(null);

	function setDueH(n: number) {
		if (!eventDate) return;
		setDoc((d) => {
			const prev = hMinusOf(d.due_date ?? null, eventDate);
			const untouched =
				!d.terms ||
				d.terms === defaultTerms(d.doc_type, Boolean(d.gross_up_enabled), prev);
			return {
				...d,
				due_date: addDays(eventDate, -n),
				terms: untouched
					? defaultTerms(d.doc_type, Boolean(d.gross_up_enabled), n)
					: d.terms,
			};
		});
	}

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
						// Satu skala untuk semua nilai field di panel ini (14px di desktop;
						// HP tetap 16px agar iOS tidak auto-zoom).
						"space-y-3 md:[&_input]:text-[14px]! md:[&_textarea]:text-[14px]!",
						mobileTab === "preview" && "hidden lg:block",
					)}
				>
					{readOnly ? (
						<div className="rounded-2xl border border-border-subtle bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
							Dokumen ini sudah dibatalkan — hanya bisa dilihat & diunduh.
						</div>
					) : null}

					{paymentsPanel}

					{/* Klien & acara */}
					<section className={CARD}>
						<SectionTitle
							title="Klien & acara"
							hint={
								linkedEvent
									? "Jadwal & lokasi mengikuti data event."
									: "Tanggal acara boleh kosong dulu untuk penawaran."
							}
						/>
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
									placeholder="opsional"
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

						<div className="border-t border-border-subtle pt-3">
							{linkedEvent ? (
								<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-[13px]">
									<span className="inline-flex items-center gap-2">
										<CalendarDays className="size-4 text-muted-foreground" />
										<span className="font-medium">
											{formatDateID(linkedEvent.event_date)}
										</span>
										{linkedEvent.venue_name ? (
											<span className="text-muted-foreground">
												· {linkedEvent.venue_name}
											</span>
										) : null}
									</span>
									<Link
										href={`/operations/${linkedEvent.project_id}`}
										className="text-[12.5px] font-medium text-link hover:underline"
									>
										Ubah di event {linkedEvent.project_id}
									</Link>
								</div>
							) : (
								<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
									<Field label="Tanggal acara">
										<DatePicker
											value={doc.event_info?.date ?? ""}
											onValueChange={(v) => patchEvent("date", v)}
											placeholder="belum pasti"
										/>
									</Field>
									<Field label="Jam">
										<div className="flex items-center gap-2">
											<TimePicker
												value={timeStart}
												onValueChange={(v) => setTime(v, timeEnd)}
												placeholder="Mulai"
												aria-label="Jam mulai"
												className="flex-1"
											/>
											<span className="text-muted-foreground">–</span>
											<TimePicker
												value={timeEnd}
												onValueChange={(v) => setTime(timeStart, v)}
												placeholder="Selesai"
												aria-label="Jam selesai"
												className="flex-1"
											/>
										</div>
									</Field>
									<Field
										label="Venue"
										hint="Pilih venue tersimpan atau ketik nama baru — venue baru masuk master saat disimpan."
									>
										<Combobox
											value={doc.event_info?.venue ?? ""}
											onValueChange={pickVenue}
											options={venueOptions}
											placeholder="cth. Grand Savero Hotel"
											allowFreeText
											wrapOptions
											minPopupWidth={320}
											emptyMessage="Venue baru — tersimpan di master saat simpan"
											aria-label="Venue"
										/>
									</Field>
									<Field
										label="Kota"
										hint={
											matchedVenue?.city ? "Mengikuti data venue." : undefined
										}
									>
										<TextField
											value={doc.event_info?.city ?? ""}
											onChange={(e) => patchEvent("city", e.target.value)}
											placeholder="Bogor"
										/>
									</Field>
								</div>
							)}
						</div>
					</section>

					{/* Item */}
					<section className={CARD}>
						<SectionTitle
							title="Item"
							hint="Pilih paket — daftar include terisi otomatis dan bebas diedit."
						/>

						{doc.items.length > 0 ? (
							<ul className="space-y-2">
								{doc.items.map((it, i) => (
									<li
										// biome-ignore lint/suspicious/noArrayIndexKey: item tak punya id; urutan = identitas
										key={i}
										className="rounded-xl border border-border-default bg-background"
									>
										<div className="flex flex-wrap items-center gap-2 p-2">
											<span className="tabular w-5 text-center text-[12px] text-muted-foreground">
												{i + 1}
											</span>
											<TextField
												value={it.name}
												onChange={(e) =>
													updateItem(i, { name: e.target.value })
												}
												placeholder="Nama item"
												className="min-w-[160px] flex-1 font-medium"
												aria-label="Nama item"
											/>
											<NumberField
												value={it.qty}
												min={0}
												onChange={(e) =>
													updateItem(i, { qty: Number(e.target.value) || 0 })
												}
												className="w-16 text-center"
												aria-label="Qty"
											/>
											<MoneyInput
												value={it.unit_price}
												onValueChange={(v) => updateItem(i, { unit_price: v })}
												className="w-36"
												aria-label="Harga satuan"
											/>
											<span className="tabular ml-auto w-28 text-right text-[14px] font-medium">
												{formatRupiah(it.qty * it.unit_price)}
											</span>
											<div className="flex items-center">
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
										<div className="px-2 pb-2 sm:pl-9">
											<IncludeList
												value={it.includes}
												onChange={(v) => updateItem(i, { includes: v })}
											/>
										</div>
									</li>
								))}
							</ul>
						) : (
							<p className="rounded-xl border border-dashed border-border-default px-4 py-5 text-center text-[13px] text-muted-foreground">
								Belum ada item. Pilih paket atau add-on di bawah.
							</p>
						)}

						<div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
							<Combobox
								value=""
								onValueChange={addPackage}
								options={packageOptions}
								allowFreeText={false}
								wrapOptions
								minPopupWidth={360}
								placeholder="+ Paket…"
								aria-label="Tambah paket"
							/>
							<Combobox
								value=""
								onValueChange={addAddon}
								options={addonOptions}
								allowFreeText={false}
								wrapOptions
								minPopupWidth={360}
								placeholder="+ Add-on…"
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
					</section>

					{/* Harga */}
					<section className={CARD}>
						<SectionTitle title="Harga & pajak" />
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
											? "Tagihan dinaikkan agar bersih setelah dipotong"
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
								<dd className="tabular text-[20px] font-semibold tracking-[-0.01em]">
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
						<SectionTitle title="Tanggal & tanda tangan" />
						<div className="grid gap-3 sm:grid-cols-2">
							<Field
								label="Tanggal terbit"
								hint={
									doc.id
										? "Nomor dokumen terkunci ke tanggal terbit pertama."
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
									<div className="flex flex-wrap gap-1.5 pt-1.5">
										{[3, 7, 14].map((n) => (
											<Chip
												key={n}
												active={doc.valid_until === addDays(doc.issued_at, n)}
												onClick={() =>
													patch("valid_until", addDays(doc.issued_at, n))
												}
											>
												{n} hari
											</Chip>
										))}
									</div>
								</Field>
							) : (
								<Field
									label="Jatuh tempo"
									hint={
										eventDate
											? "H-n dihitung dari tanggal acara; S&K ikut menyesuaikan."
											: "Isi tanggal acara dulu untuk memakai H-n."
									}
								>
									<DatePicker
										value={doc.due_date ?? ""}
										onValueChange={(v) => patch("due_date", v)}
										placeholder="opsional"
									/>
									<div className="flex flex-wrap gap-1.5 pt-1.5">
										{DUE_PRESETS.map((n) => (
											<Chip
												key={n}
												active={
													Boolean(eventDate) &&
													doc.due_date === addDays(eventDate as string, -n)
												}
												disabled={!eventDate}
												onClick={() => setDueH(n)}
											>
												H-{n}
											</Chip>
										))}
									</div>
								</Field>
							)}
						</div>

						<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
							<div className="space-y-3">
								<Field label="Penanda tangan">
									<NativeSelect
										options={signerOptions}
										value={doc.signer_id ?? ""}
										onValueChange={pickSigner}
										placeholder="Pilih preset…"
									/>
								</Field>
								<div className="grid gap-3 sm:grid-cols-2">
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
							</div>
							<div className="space-y-1.5">
								<span className={LABEL}>Tanda tangan</span>
								<div className="flex h-[76px] w-full items-center justify-center rounded-xl border border-dashed border-border-default bg-background sm:w-44">
									{currentSigner?.signature_data ? (
										// biome-ignore lint/performance/noImgElement: data URL kecil
										<img
											src={currentSigner.signature_data}
											alt={`Tanda tangan ${currentSigner.name}`}
											className="max-h-16 max-w-[80%] object-contain"
										/>
									) : (
										<span className="px-3 text-center text-[12px] text-muted-foreground">
											{currentSigner ? "Belum ada gambar" : "Pilih preset dulu"}
										</span>
									)}
								</div>
								<Button
									variant="outline"
									size="sm"
									className="w-full"
									disabled={!currentSigner}
									onClick={() =>
										currentSigner && setSignerDialog(currentSigner)
									}
								>
									<ImagePlus className="size-3.5" />
									{currentSigner?.signature_data ? "Ganti" : "Unggah"} tanda
									tangan
								</Button>
							</div>
						</div>
						{signers.length === 0 ? (
							<p className="text-[12px] text-muted-foreground">
								Belum ada preset —{" "}
								<Link
									href="/settings/dokumen"
									className="text-link hover:underline"
								>
									tambah penanda tangan
								</Link>
								.
							</p>
						) : null}
					</section>

					{/* Catatan & S&K */}
					<section className={CARD}>
						<SectionTitle
							title="Catatan & syarat"
							hint="S&K menyesuaikan gross-up dan jatuh tempo selama belum diedit manual."
						/>
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
									defaultTerms(
										doc.doc_type,
										Boolean(doc.gross_up_enabled),
										hMinus,
									),
								)
							}
						>
							<RefreshCw className="size-3.5" /> Kembalikan ke template
						</Button>
					</section>
				</div>

				{signerDialog ? (
					<SignerDialog
						signer={signerDialog}
						onClose={() => {
							setSignerDialog(null);
							// Muat ulang daftar preset (server props) — isi editor tetap.
							router.refresh();
						}}
					/>
				) : null}

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

function splitTime(t: string): [string, string] {
	const m = /(\d{1,2}[:.]\d{2})?\s*[–\-—]?\s*(\d{1,2}[:.]\d{2})?/.exec(t);
	const norm = (x?: string) => (x ? x.replace(".", ":").padStart(5, "0") : "");
	return [norm(m?.[1]), norm(m?.[2])];
}

/** Selisih hari acara − jatuh tempo; 1 kalau tak bisa dihitung (default H-1). */
function hMinusOf(due: string | null, eventDate: string | null): number {
	if (!due || !eventDate) return 1;
	const diff = Math.round(
		(new Date(`${eventDate}T00:00:00`).getTime() -
			new Date(`${due}T00:00:00`).getTime()) /
			86_400_000,
	);
	return diff > 0 ? diff : 1;
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
	return (
		<div>
			<h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
			{hint ? (
				<p className="text-[12.5px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

function Chip({
	active,
	disabled,
	onClick,
	children,
}: {
	active: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={active}
			className={cn(
				"inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-40",
				active
					? "border-[#059669] bg-[#059669] text-white"
					: "border-border-default bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
			)}
		>
			{children}
		</button>
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
