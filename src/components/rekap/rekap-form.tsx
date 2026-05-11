"use client";

import { Calculator, CheckCircle2, Plus, Sparkles, X } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { RekapContextCard } from "@/components/rekap/rekap-context-card";
import { RekapProofUpload } from "@/components/rekap/rekap-proof-upload";
import { RekapSummaryBar } from "@/components/rekap/rekap-summary-bar";
import { Badge } from "@/components/ui/badge";
import {
	Combobox,
	type ComboboxOption,
} from "@/components/ui/combobox";
import {
	Disclosure,
	DisclosurePanel,
	DisclosureTrigger,
} from "@/components/ui/disclosure";
import type { RekapContext } from "@/lib/actions/rekap";
import { type RekapFormState, submitRekap } from "@/lib/actions/rekap";
import { formatRupiah } from "@/lib/format";
import {
	computeRekapCost,
	type CustomLine,
	type MappedItem,
	type RekapQuantities,
	sumBuckets,
} from "@/lib/rekap/cost";
import type { RekapField } from "@/lib/rekap-mapping/types";

type Defaults = {
	cetak_total: string;
	media_set_used: string;
	sleeve_used: string;
	flashdisk_used: string;
	pouch_used: string;
	photomagnet_used: string;
	keychain_used: string;
	custom_materials: string; // JSON string
	proof_photo_urls: string;
	crew_notes: string;
};

const EMPTY: Defaults = {
	cetak_total: "0",
	media_set_used: "0",
	sleeve_used: "0",
	flashdisk_used: "0",
	pouch_used: "0",
	photomagnet_used: "0",
	keychain_used: "0",
	custom_materials: "{}",
	proof_photo_urls: "",
	crew_notes: "",
};

const MEDIA_SET_RATIO = 140; // 1 mediaset ≈ 140 cetak

export function RekapForm({
	eventId,
	projectId,
	defaults = EMPTY,
	mode,
	context,
}: {
	eventId: string;
	projectId: string;
	defaults?: Defaults;
	mode: "create" | "update";
	context: RekapContext;
}) {
	const action = submitRekap.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		RekapFormState,
		FormData
	>(action, undefined);

	const get = (key: keyof Defaults) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		return String(defaults[key] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	// === Quantity state (numeric) ===
	const [cetak, setCetak] = useState(get("cetak_total"));
	const [media, setMedia] = useState(get("media_set_used"));
	const [sleeve, setSleeve] = useState(get("sleeve_used"));
	const [flashdisk, setFlashdisk] = useState(get("flashdisk_used"));
	const [pouch, setPouch] = useState(get("pouch_used"));
	const [photomagnet, setPhotomagnet] = useState(get("photomagnet_used"));
	const [keychain, setKeychain] = useState(get("keychain_used"));

	// Track which fields have been manually touched so auto-fill doesn't
	// overwrite. After initial mount, any direct edit flips the flag.
	const [touched, setTouched] = useState<Record<RekapField, boolean>>({
		cetak_total: defaults.cetak_total !== "0",
		media_set_used: defaults.media_set_used !== "0",
		sleeve_used: defaults.sleeve_used !== "0",
		flashdisk_used: defaults.flashdisk_used !== "0",
		pouch_used: defaults.pouch_used !== "0",
		photomagnet_used: defaults.photomagnet_used !== "0",
		keychain_used: defaults.keychain_used !== "0",
	});

	function markTouched(f: RekapField) {
		setTouched((t) => ({ ...t, [f]: true }));
	}

	// === Custom materials (SKU -> qty) ===
	const initialCustom = useMemo<Record<string, number>>(() => {
		try {
			const obj = JSON.parse(defaults.custom_materials || "{}");
			if (obj && typeof obj === "object" && !Array.isArray(obj)) {
				const out: Record<string, number> = {};
				for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
					const n = Number(v);
					if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
				}
				return out;
			}
		} catch {}
		return {};
	}, [defaults.custom_materials]);
	const [customMaterials, setCustomMaterials] = useState<
		Record<string, number>
	>(initialCustom);

	const customInventoryById = useMemo(
		() => new Map(context.custom_inventory.map((it) => [it.id, it])),
		[context.custom_inventory],
	);
	const customInventoryBySku = useMemo(
		() => new Map(context.custom_inventory.map((it) => [it.sku, it])),
		[context.custom_inventory],
	);

	function addCustomItem(itemId: string) {
		const it = customInventoryById.get(itemId);
		if (!it) return;
		setCustomMaterials((prev) =>
			prev[it.sku] ? prev : { ...prev, [it.sku]: 1 },
		);
	}
	function updateCustomQty(sku: string, qty: number) {
		setCustomMaterials((prev) => {
			const next = { ...prev };
			if (qty <= 0) {
				delete next[sku];
			} else {
				next[sku] = Math.floor(qty);
			}
			return next;
		});
	}
	function removeCustomItem(sku: string) {
		setCustomMaterials((prev) => {
			const next = { ...prev };
			delete next[sku];
			return next;
		});
	}

	// === Proof URLs (multi-file upload) ===
	const initialUrls = useMemo<string[]>(
		() =>
			defaults.proof_photo_urls
				.split(/[\n,]/)
				.map((s) => s.trim())
				.filter(Boolean),
		[defaults.proof_photo_urls],
	);
	const [proofUrls, setProofUrls] = useState<string[]>(initialUrls);

	// === Live cost computation ===
	const quantities = useMemo<RekapQuantities>(() => {
		return {
			cetak_total: Number(cetak) || 0,
			media_set_used: Number(media) || 0,
			sleeve_used: Number(sleeve) || 0,
			flashdisk_used: Number(flashdisk) || 0,
			pouch_used: Number(pouch) || 0,
			photomagnet_used: Number(photomagnet) || 0,
			keychain_used: Number(keychain) || 0,
		};
	}, [cetak, media, sleeve, flashdisk, pouch, photomagnet, keychain]);

	const mappedItems = useMemo<MappedItem[]>(() => {
		return context.mappings
			.filter((m) => m.item)
			.map((m) => ({
				rekap_field: m.rekap_field,
				item_id: m.item_id ?? "",
				qty_per_unit: m.qty_per_unit,
				purchase_price_avg: m.item?.purchase_price_avg ?? 0,
			}));
	}, [context.mappings]);

	const bonusLines = useMemo(
		() =>
			context.bonuses.map((b) => ({
				addon_id: b.addon_id,
				quantity: b.quantity,
				purchase_price_avg: b.inventory_item?.purchase_price_avg ?? 0,
			})),
		[context.bonuses],
	);

	const customLines = useMemo<CustomLine[]>(() => {
		return Object.entries(customMaterials)
			.map(([sku, qty]) => {
				const it = customInventoryBySku.get(sku);
				return {
					sku,
					quantity: qty,
					purchase_price_avg: it?.purchase_price_avg ?? 0,
				};
			})
			.filter((l) => l.quantity > 0);
	}, [customMaterials, customInventoryBySku]);

	const buckets = useMemo(
		() => computeRekapCost(quantities, mappedItems, bonusLines, customLines),
		[quantities, mappedItems, bonusLines, customLines],
	);
	const hppTotal = sumBuckets(buckets);

	// Helpers for per-field HPP chip
	const mappingByField = useMemo(() => {
		const m = new Map<RekapField, (typeof context.mappings)[number]>();
		for (const x of context.mappings) m.set(x.rekap_field, x);
		return m;
	}, [context.mappings]);

	function fieldCost(field: RekapField, value: number): number {
		const map = mappingByField.get(field);
		if (!map?.item) return 0;
		return Math.round(value * map.qty_per_unit * map.item.purchase_price_avg);
	}

	function fieldStock(field: RekapField, value: number) {
		const map = mappingByField.get(field);
		if (!map?.item) return null;
		const deduct = value * map.qty_per_unit;
		return {
			before: map.item.current_stock,
			after: map.item.current_stock - deduct,
			critical: deduct > map.item.current_stock,
			lowAfter:
				map.item.current_stock > 0 &&
				(map.item.current_stock - deduct) / Math.max(map.item.current_stock, 1) <
					0.1,
		};
	}

	// === Auto-fill (cetak → mediaset + sleeve) ===
	function autoFillFromCetak() {
		const c = Number(cetak) || 0;
		if (c <= 0) return;
		if (!touched.media_set_used) {
			setMedia(String(Math.ceil(c / MEDIA_SET_RATIO)));
		}
		if (!touched.sleeve_used) {
			setSleeve(String(c));
		}
	}

	// === Add-on prefill calc ===
	const photomagnetPaid = useMemo(
		() =>
			context.paid_addons
				.filter((a) => /photomagnet/i.test(a.name))
				.reduce((s, a) => s + a.quantity, 0),
		[context.paid_addons],
	);
	const photomagnetBonus = useMemo(
		() =>
			context.bonuses
				.filter((b) => /photomagnet/i.test(b.name))
				.reduce((s, b) => s + b.quantity, 0),
		[context.bonuses],
	);
	const keychainPaid = useMemo(
		() =>
			context.paid_addons
				.filter((a) => /keychain/i.test(a.name))
				.reduce((s, a) => s + a.quantity, 0),
		[context.paid_addons],
	);
	const keychainBonus = useMemo(
		() =>
			context.bonuses
				.filter((b) => /keychain/i.test(b.name))
				.reduce((s, b) => s + b.quantity, 0),
		[context.bonuses],
	);

	function prefillAddon(field: "photomagnet_used" | "keychain_used") {
		if (field === "photomagnet_used") {
			setPhotomagnet(String(photomagnetPaid + photomagnetBonus));
			markTouched("photomagnet_used");
		} else {
			setKeychain(String(keychainPaid + keychainBonus));
			markTouched("keychain_used");
		}
	}

	// FD/Pouch hint based on package
	const fdPouchIncluded = context.pkg.include_flashdisk_pouch === true;

	// Soft validation warnings
	const warnings = useMemo(() => {
		const w: string[] = [];
		const c = Number(cetak) || 0;
		const s = Number(sleeve) || 0;
		const m = Number(media) || 0;
		if (c > 0 && s > c * 2) w.push("Sleeve > 2× total cetak — biasanya 1:1, cek angkanya.");
		if (c > 0 && m === 0) w.push("Media set masih 0. Auto-fill (Hitung) atau isi manual.");
		if (m > 0 && m * MEDIA_SET_RATIO < c * 0.5) {
			w.push(
				`Media set ${m} biasanya ≈ ${m * MEDIA_SET_RATIO} cetak — tapi total cetak ${c}, mismatch.`,
			);
		}
		return w;
	}, [cetak, sleeve, media]);

	// Custom materials combobox options (exclude already-added)
	const customComboboxOptions = useMemo<ComboboxOption[]>(() => {
		return context.custom_inventory
			.filter((it) => !customMaterials[it.sku])
			.map((it) => ({
				value: it.id,
				label: `${it.sku} · ${it.name}`,
				sublabel: `Stok ${it.current_stock} · ${formatRupiah(it.purchase_price_avg)}/${it.unit}`,
			}));
	}, [context.custom_inventory, customMaterials]);

	const proofUrlsHidden = proofUrls.join("\n");
	const customMaterialsJson = JSON.stringify(customMaterials);

	return (
		<form action={formAction} className="space-y-5 pb-2">
			{state?.success && (
				<div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
					<CheckCircle2 className="h-4 w-4" />
					Rekap tersimpan. Owner akan review sebelum settlement.
				</div>
			)}
			{state?.errors?._form && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<RekapContextCard
				includeFlashdiskPouch={context.pkg.include_flashdisk_pouch}
				paidAddons={context.paid_addons}
				bonuses={context.bonuses}
			/>

			{/* ========== CETAK ========== */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<div className="flex items-start justify-between gap-2">
					<div>
						<h3 className="text-base font-semibold tracking-tight">Cetak</h3>
						<p className="text-xs text-muted-foreground">
							Hitung total dari counter mesin atau manual.
						</p>
					</div>
					{Number(cetak) > 0 && (!touched.media_set_used || !touched.sleeve_used) && (
						<button
							type="button"
							onClick={autoFillFromCetak}
							className="press-down inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
						>
							<Calculator className="h-3 w-3" />
							Hitung otomatis
						</button>
					)}
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<NumField
						label="Total cetak (pcs)"
						name="cetak_total"
						value={cetak}
						onChange={(v) => {
							setCetak(v);
							markTouched("cetak_total");
						}}
						error={err("cetak_total")}
						cost={fieldCost("cetak_total", Number(cetak) || 0)}
						stock={fieldStock("cetak_total", Number(cetak) || 0)}
						auto={false}
					/>
					<NumField
						label="Media Set"
						name="media_set_used"
						value={media}
						onChange={(v) => {
							setMedia(v);
							markTouched("media_set_used");
						}}
						error={err("media_set_used")}
						hint={`1 set ≈ ${MEDIA_SET_RATIO} cetak`}
						cost={fieldCost("media_set_used", Number(media) || 0)}
						stock={fieldStock("media_set_used", Number(media) || 0)}
						auto={!touched.media_set_used && Number(media) > 0}
					/>
					<NumField
						label="Sleeve (pcs)"
						name="sleeve_used"
						value={sleeve}
						onChange={(v) => {
							setSleeve(v);
							markTouched("sleeve_used");
						}}
						error={err("sleeve_used")}
						hint="Biasanya = total cetak"
						cost={fieldCost("sleeve_used", Number(sleeve) || 0)}
						stock={fieldStock("sleeve_used", Number(sleeve) || 0)}
						auto={!touched.sleeve_used && Number(sleeve) > 0}
					/>
				</div>
			</section>

			{/* ========== FLASHDISK & POUCH ========== */}
			<section
				className={`space-y-4 rounded-xl border p-5 ${
					fdPouchIncluded
						? "border-border-default bg-surface-2"
						: "border-dashed border-border-default bg-surface-2/40"
				}`}
			>
				<div>
					<div className="flex items-center gap-2">
						<h3 className="text-base font-semibold tracking-tight">
							Flashdisk & Pouch
						</h3>
						{fdPouchIncluded ? (
							<Badge variant="success" className="text-[10px]">
								Include
							</Badge>
						) : (
							<Badge variant="secondary" className="text-[10px]">
								Skip
							</Badge>
						)}
					</div>
					<p className="text-xs text-muted-foreground">
						{fdPouchIncluded
							? "Paket include FD + Pouch. Biasanya 1 set per event."
							: "Paket tidak include. Skip kecuali emang dipakai."}
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<NumField
						label="Flashdisk terpakai"
						name="flashdisk_used"
						value={flashdisk}
						onChange={(v) => {
							setFlashdisk(v);
							markTouched("flashdisk_used");
						}}
						error={err("flashdisk_used")}
						cost={fieldCost("flashdisk_used", Number(flashdisk) || 0)}
						stock={fieldStock("flashdisk_used", Number(flashdisk) || 0)}
						auto={false}
					/>
					<NumField
						label="Pouch terpakai"
						name="pouch_used"
						value={pouch}
						onChange={(v) => {
							setPouch(v);
							markTouched("pouch_used");
						}}
						error={err("pouch_used")}
						cost={fieldCost("pouch_used", Number(pouch) || 0)}
						stock={fieldStock("pouch_used", Number(pouch) || 0)}
						auto={false}
					/>
				</div>
			</section>

			{/* ========== ADD-ON ========== */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<div>
					<h3 className="text-base font-semibold tracking-tight">Add-on</h3>
					<p className="text-xs text-muted-foreground">
						Photomagnet / keychain — jumlah yang dipakai (paid + bonus).
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<AddonField
						label="Photomagnet"
						name="photomagnet_used"
						value={photomagnet}
						paid={photomagnetPaid}
						bonus={photomagnetBonus}
						onChange={(v) => {
							setPhotomagnet(v);
							markTouched("photomagnet_used");
						}}
						onPrefill={() => prefillAddon("photomagnet_used")}
						error={err("photomagnet_used")}
						cost={fieldCost("photomagnet_used", Number(photomagnet) || 0)}
						stock={fieldStock("photomagnet_used", Number(photomagnet) || 0)}
					/>
					<AddonField
						label="Keychain"
						name="keychain_used"
						value={keychain}
						paid={keychainPaid}
						bonus={keychainBonus}
						onChange={(v) => {
							setKeychain(v);
							markTouched("keychain_used");
						}}
						onPrefill={() => prefillAddon("keychain_used")}
						error={err("keychain_used")}
						cost={fieldCost("keychain_used", Number(keychain) || 0)}
						stock={fieldStock("keychain_used", Number(keychain) || 0)}
					/>
				</div>
			</section>

			{/* ========== ITEM TAMBAHAN (custom_materials) ========== */}
			<section className="rounded-xl border border-border-default bg-surface-2">
				<Disclosure
					defaultOpen={Object.keys(customMaterials).length > 0}
				>
					<DisclosureTrigger className="px-5 py-4">
						<span className="flex items-center gap-2">
							<Sparkles className="h-4 w-4 text-primary" />
							<span className="text-base font-semibold">
								Item tambahan{" "}
								<span className="text-muted-foreground text-xs font-normal">
									({Object.keys(customMaterials).length})
								</span>
							</span>
						</span>
					</DisclosureTrigger>
					<DisclosurePanel>
						<div className="space-y-3 pt-2">
							<p className="text-xs text-muted-foreground">
								Item dari stok yang kepake selain 7 standard di atas (cth.
								sticker, magnetic, dll.).
							</p>

							{Object.keys(customMaterials).length > 0 && (
								<ul className="space-y-2">
									{Object.entries(customMaterials).map(([sku, qty]) => {
										const it = customInventoryBySku.get(sku);
										if (!it) return null;
										const cost = qty * it.purchase_price_avg;
										return (
											<li
												key={sku}
												className="flex items-center gap-2 rounded-md border border-border-default bg-surface-3 p-2.5"
											>
												<div className="min-w-0 flex-1">
													<p className="text-sm font-medium text-foreground">
														{it.name}
													</p>
													<p className="font-mono text-[11px] text-muted-foreground">
														{it.sku} · Stok {it.current_stock} ·{" "}
														{formatRupiah(it.purchase_price_avg)}/{it.unit}
													</p>
												</div>
												<input
													type="number"
													min={1}
													max={9999}
													value={qty}
													onChange={(e) =>
														updateCustomQty(sku, Number(e.target.value))
													}
													className="tabular h-8 w-20 rounded-md border border-border-default bg-background px-2 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												/>
												<span className="tabular hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:inline">
													{formatRupiah(cost)}
												</span>
												<button
													type="button"
													onClick={() => removeCustomItem(sku)}
													title="Hapus"
													className="text-muted-foreground hover:bg-muted hover:text-destructive inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
												>
													<X className="h-3.5 w-3.5" />
												</button>
											</li>
										);
									})}
								</ul>
							)}

							{customComboboxOptions.length > 0 && (
								<div className="flex items-end gap-2">
									<div className="flex-1">
										<Combobox
											value=""
											onValueChange={(id) => id && addCustomItem(id)}
											options={customComboboxOptions}
											placeholder="Cari item — SKU / nama…"
											allowFreeText={false}
											emptyMessage="Tidak ada item match. Tambah master item di Settings → Inventory."
											aria-label="Tambah item tambahan"
										/>
									</div>
									<div className="hidden h-10 items-center text-muted-foreground sm:inline-flex">
										<Plus className="h-4 w-4" />
									</div>
								</div>
							)}
						</div>
					</DisclosurePanel>
				</Disclosure>
			</section>

			{/* ========== BUKTI ========== */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<div>
					<h3 className="text-base font-semibold tracking-tight">Bukti</h3>
					<p className="text-xs text-muted-foreground">
						Foto counter mesin, area event, atau consumable. Wajib minimal 1.
					</p>
				</div>
				<RekapProofUpload
					projectId={projectId}
					initial={initialUrls.map((url) => ({
						url,
						name: extractName(url),
					}))}
					onChange={setProofUrls}
				/>
				<input
					type="hidden"
					name="proof_photo_urls"
					value={proofUrlsHidden}
				/>
				{err("proof_photo_urls") && (
					<p className="text-xs text-destructive">{err("proof_photo_urls")}</p>
				)}

				<div className="space-y-1.5">
					<label htmlFor="crew_notes" className="text-sm font-medium">
						Catatan crew
					</label>
					<textarea
						id="crew_notes"
						name="crew_notes"
						rows={3}
						maxLength={1000}
						defaultValue={get("crew_notes")}
						placeholder="Apa yang perlu owner tahu — alat rusak, request klien, dst"
						className={`${inputClass} resize-none`}
					/>
				</div>
			</section>

			{/* Soft warnings */}
			{warnings.length > 0 && (
				<ul className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30">
					{warnings.map((w) => (
						<li
							key={w}
							className="flex items-start gap-2 text-amber-900 dark:text-amber-200"
						>
							<span className="mt-0.5 size-1 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
							<span>{w}</span>
						</li>
					))}
				</ul>
			)}

			<input
				type="hidden"
				name="custom_materials"
				value={customMaterialsJson}
			/>

			<RekapSummaryBar
				hppTotal={hppTotal}
				pending={pending}
				submitLabel={mode === "create" ? "Submit rekap" : "Update rekap"}
				disabled={proofUrls.length === 0}
			/>
		</form>
	);
}

// ============== Field components ==============

type StockInfo = {
	before: number;
	after: number;
	critical: boolean;
	lowAfter: boolean;
};

function NumField({
	label,
	name,
	value,
	onChange,
	error,
	hint,
	cost,
	stock,
	auto,
}: {
	label: string;
	name: string;
	value: string;
	onChange: (v: string) => void;
	error?: string;
	hint?: string;
	cost: number;
	stock: StockInfo | null;
	auto: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline gap-1.5">
				<label htmlFor={name} className="text-sm font-medium">
					{label}
				</label>
				{auto && (
					<span className="text-[9px] font-semibold uppercase tracking-widest text-primary">
						AUTO
					</span>
				)}
			</div>
			<input
				id={name}
				name={name}
				type="number"
				inputMode="numeric"
				min={0}
				step={1}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={`${inputClass} tabular`}
			/>

			{/* HPP chip / stock chip / hint / error */}
			{error ? (
				<p className="text-xs text-destructive">{error}</p>
			) : (
				<div className="flex flex-wrap items-center gap-1.5 text-[11px]">
					{cost > 0 && (
						<span className="tabular inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
							{formatRupiah(cost)}
						</span>
					)}
					{stock && Number(value) > 0 && (
						<span
							className={`tabular inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
								stock.critical
									? "bg-destructive/15 text-destructive"
									: stock.lowAfter
										? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
										: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							}`}
							title={stock.critical ? "Stok kurang!" : "Stok setelah deduct"}
						>
							{stock.before} → {stock.after}
						</span>
					)}
					{cost === 0 && !stock && hint ? (
						<span className="text-muted-foreground">{hint}</span>
					) : null}
				</div>
			)}
		</div>
	);
}

function AddonField({
	label,
	name,
	value,
	paid,
	bonus,
	onChange,
	onPrefill,
	error,
	cost,
	stock,
}: {
	label: string;
	name: string;
	value: string;
	paid: number;
	bonus: number;
	onChange: (v: string) => void;
	onPrefill: () => void;
	error?: string;
	cost: number;
	stock: StockInfo | null;
}) {
	const total = paid + bonus;
	const showPrefill = total > 0 && Number(value) !== total;
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<label htmlFor={name} className="text-sm font-medium">
					{label}
				</label>
				{(paid > 0 || bonus > 0) && (
					<span className="text-[10px] text-muted-foreground">
						{paid > 0 && (
							<span className="text-foreground/80">{paid} paid</span>
						)}
						{paid > 0 && bonus > 0 && " + "}
						{bonus > 0 && (
							<span className="text-emerald-700 dark:text-emerald-300">
								{bonus} bonus
							</span>
						)}
						{" = "}
						<span className="tabular text-foreground font-semibold">
							{total}
						</span>
					</span>
				)}
			</div>
			<input
				id={name}
				name={name}
				type="number"
				inputMode="numeric"
				min={0}
				step={1}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={`${inputClass} tabular`}
			/>
			{error ? (
				<p className="text-xs text-destructive">{error}</p>
			) : (
				<div className="flex flex-wrap items-center gap-1.5 text-[11px]">
					{cost > 0 && (
						<span className="tabular inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
							{formatRupiah(cost)}
						</span>
					)}
					{stock && Number(value) > 0 && (
						<span
							className={`tabular inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
								stock.critical
									? "bg-destructive/15 text-destructive"
									: stock.lowAfter
										? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
										: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							}`}
						>
							{stock.before} → {stock.after}
						</span>
					)}
					{showPrefill && (
						<button
							type="button"
							onClick={onPrefill}
							className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
						>
							<Calculator className="h-3 w-3" />
							Auto = {total}
						</button>
					)}
				</div>
			)}
		</div>
	);
}

function extractName(url: string): string {
	try {
		const u = new URL(url);
		const last = u.pathname.split("/").filter(Boolean).pop();
		return last ? decodeURIComponent(last) : url;
	} catch {
		return url;
	}
}

const inputClass =
	"h-10 w-full rounded-md border border-border-default bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
