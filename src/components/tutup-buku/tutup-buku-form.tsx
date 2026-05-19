"use client";

import {
	AlertTriangle,
	CheckCircle2,
	ExternalLink,
	Loader2,
	Pencil,
	Receipt,
	Users,
	Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { RekapContextCard } from "@/components/rekap/rekap-context-card";
import { RekapProofUpload } from "@/components/rekap/rekap-proof-upload";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import type { RekapContext } from "@/lib/actions/rekap";
import { tutupBuku, type TutupBukuFormState } from "@/lib/actions/tutup-buku";
import type { AutoHpp } from "@/lib/actions/settlement-prefill";
import { formatRupiah } from "@/lib/format";
import {
	computeRekapCost,
	type CustomLine,
	type MappedItem,
	sumBuckets,
} from "@/lib/rekap/cost";
import type { RekapField } from "@/lib/rekap-mapping/types";

type Defaults = {
	revenue_gross: number;
	discount_total: number;
	owner_pool_per_person: number;
	platform_fee: number;
	fee_lead: number;
	fee_asisten: number;
	fee_crew_c: number;
	fee_lead_baseline: number;
	fee_asisten_baseline: number;
	fee_crew_c_baseline: number;
	opex_transport_bbm: number;
	opex_konsumsi: number;
	cetak_total: number;
	media_set_used: number;
	sleeve_used: number;
	flashdisk_used: number;
	pouch_used: number;
	photomagnet_used: number;
	keychain_used: number;
	custom_materials: string;
	proof_photo_urls: string;
	crew_notes: string;
};

export type CrewExpense = {
	transport_method: "online" | "rental" | "none";
	transport_cost: number;
	transport_proof_berangkat_url: string | null;
	transport_proof_pulang_url: string | null;
	bensin_cost: number;
	toll_cost: number;
	parking_cost: number;
	konsumsi_cost: number;
	lainnya_items: Array<{ note: string; amount: number }>;
	lainnya_total: number;
};

const TRANSPORT_LABEL: Record<CrewExpense["transport_method"], string> = {
	online: "Online (Gocar/Grab)",
	rental: "Sewa mobil",
	none: "Tidak ada",
};

export function TutupBukuForm({
	eventId,
	projectId,
	context,
	autoHpp,
	defaults,
	crewExpense,
}: {
	eventId: string;
	projectId: string;
	context: RekapContext;
	autoHpp: AutoHpp;
	defaults: Defaults;
	crewExpense: CrewExpense;
}) {
	const router = useRouter();
	const action = tutupBuku.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		TutupBukuFormState,
		FormData
	>(action, undefined);

	const frameSize = context.pkg.frame_size ?? "";

	// ===== Consumption state =====
	const [cetak, setCetak] = useState(String(defaults.cetak_total));
	const [flashdisk, setFlashdisk] = useState(String(defaults.flashdisk_used));
	const [pouch, setPouch] = useState(String(defaults.pouch_used));
	const [photomagnet, setPhotomagnet] = useState(
		String(defaults.photomagnet_used),
	);
	const [keychain, setKeychain] = useState(String(defaults.keychain_used));
	const [crewNotes, setCrewNotes] = useState(defaults.crew_notes);
	const [proofUrls, setProofUrls] = useState<string[]>(
		defaults.proof_photo_urls
			.split(/[\n,]/)
			.map((s) => s.trim())
			.filter(Boolean),
	);

	// Mapping resolver helper (size-aware)
	const mappingByField = useMemo(() => {
		const m = new Map<RekapField, (typeof context.mappings)[number]>();
		const fields = new Set(context.mappings.map((x) => x.rekap_field));
		for (const field of fields) {
			const candidates = context.mappings.filter((x) => x.rekap_field === field);
			const exact = candidates.find((x) => x.frame_size === frameSize);
			const fallback = candidates.find((x) => x.frame_size === "");
			const picked = exact ?? fallback;
			if (picked) m.set(field, picked);
		}
		return m;
	}, [context.mappings, frameSize]);

	// Auto-derived mediaset + sleeve from cetak × mapping qty_per_unit
	const cetakNum = Number(cetak) || 0;
	const mediaMapping = mappingByField.get("media_set_used");
	const sleeveMapping = mappingByField.get("sleeve_used");
	const autoMedia = mediaMapping
		? Math.ceil(cetakNum * mediaMapping.qty_per_unit)
		: 0;
	const autoSleeve = sleeveMapping
		? Math.ceil(cetakNum * sleeveMapping.qty_per_unit)
		: 0;

	// ===== HPP state (prefilled from autoHpp) =====
	const [hpp, setHpp] = useState({
		mediaset: autoHpp.mediaset,
		sleeve: autoHpp.sleeve,
		flashdisk: autoHpp.flashdisk,
		pouch: autoHpp.pouch,
		photomagnet: autoHpp.photomagnet,
		keychain: autoHpp.keychain,
		bonus: autoHpp.bonus,
		other: autoHpp.other,
	});

	// ===== Live HPP recompute when cetak / qty change =====
	const liveHpp = useMemo(() => {
		const mappedItems: MappedItem[] = context.mappings
			.filter((m) => m.item)
			.map((m) => ({
				rekap_field: m.rekap_field,
				frame_size: m.frame_size,
				item_id: m.item_id ?? "",
				qty_per_unit: m.qty_per_unit,
				purchase_price_avg: m.item?.purchase_price_avg ?? 0,
			}));
		const bonusLines = context.bonuses.map((b) => ({
			addon_id: b.addon_id,
			quantity: b.quantity,
			purchase_price_avg: b.inventory_item?.purchase_price_avg ?? 0,
		}));
		const customLines: CustomLine[] = []; // skip custom for now
		return computeRekapCost(
			{
				cetak_total: cetakNum,
				media_set_used: autoMedia,
				sleeve_used: autoSleeve,
				flashdisk_used: Number(flashdisk) || 0,
				pouch_used: Number(pouch) || 0,
				photomagnet_used: Number(photomagnet) || 0,
				keychain_used: Number(keychain) || 0,
			},
			mappedItems,
			bonusLines,
			customLines,
			frameSize,
		);
	}, [
		context.mappings,
		context.bonuses,
		cetakNum,
		autoMedia,
		autoSleeve,
		flashdisk,
		pouch,
		photomagnet,
		keychain,
		frameSize,
	]);

	// Refresh hpp state whenever liveHpp changes (unless owner has manually
	// overridden — we always update for simplicity now; owner can edit HPP
	// inputs after change which then overrides)
	useEffect(() => {
		setHpp((prev) => ({
			...prev,
			mediaset: liveHpp.mediaset,
			sleeve: liveHpp.sleeve,
			flashdisk: liveHpp.flashdisk,
			pouch: liveHpp.pouch,
			photomagnet: liveHpp.photomagnet,
			keychain: liveHpp.keychain,
			bonus: liveHpp.bonus,
		}));
	}, [liveHpp]);

	// ===== OpEx state =====
	const [opex, setOpex] = useState({
		fee_lead: defaults.fee_lead,
		fee_asisten: defaults.fee_asisten,
		fee_crew_c: defaults.fee_crew_c,
		fee_extra: 0,
		transport_bbm: defaults.opex_transport_bbm,
		sewa_alat: 0,
		perawatan: 0, // repurposed UI label: "Sewa Aplikasi / Lainnya"
		konsumsi: defaults.opex_konsumsi,
		komisi_vendor: 0,
		komisi_relasi: 0,
		komisi_sales_direct: 0,
		platform_fee: defaults.platform_fee,
		diskon_tambahan: 0,
	});

	// Toggle: apply fee adjustment back to crew_assignments. Defaults ON
	// whenever owner ubah dari baseline; owner bisa matikan supaya cuma
	// snapshot di settlement saja (history baseline preserved).
	const [applyFeeAdjust, setApplyFeeAdjust] = useState(true);

	const feeAdjusted =
		opex.fee_lead !== defaults.fee_lead_baseline ||
		opex.fee_asisten !== defaults.fee_asisten_baseline ||
		opex.fee_crew_c !== defaults.fee_crew_c_baseline;

	// ===== Distribution =====
	const [ownerPoolPerPerson, setOwnerPoolPerPerson] = useState(
		defaults.owner_pool_per_person,
	);
	const [discountTotal, setDiscountTotal] = useState(defaults.discount_total);
	const revenueGross = defaults.revenue_gross;

	// ===== Live P&L footer (layered breakdown) =====
	const hppTotal = sumBuckets(hpp);
	const feeCrewTotal =
		opex.fee_lead + opex.fee_asisten + opex.fee_crew_c + opex.fee_extra;
	const fieldExpenseTotal = opex.transport_bbm + opex.konsumsi;
	const sewaTotal = opex.sewa_alat + opex.perawatan;
	const komisiTotal =
		opex.komisi_vendor +
		opex.komisi_relasi +
		opex.komisi_sales_direct +
		opex.platform_fee +
		opex.diskon_tambahan;
	const opexTotal = feeCrewTotal + fieldExpenseTotal + sewaTotal + komisiTotal;
	const revenueNet = revenueGross - discountTotal;
	const grossMargin = revenueNet - hppTotal;
	const netProfit = revenueNet - (hppTotal + opexTotal);
	const margin = revenueNet > 0 ? (netProfit / revenueNet) * 100 : 0;

	// ===== Handle action result =====
	useEffect(() => {
		if (!state) return;
		if (state.ok) {
			toast.success("✓ Event berhasil di-Tutup Buku");
			router.push(`/operations/${state.projectId}`);
		} else {
			toast.error(state.error);
		}
	}, [state, router]);

	const customMaterialsJson = defaults.custom_materials;
	const proofUrlsHidden = proofUrls.join("\n");

	return (
		<form action={formAction} className="space-y-5 pb-2">
			<RekapContextCard
				includeFlashdiskPouch={context.pkg.include_flashdisk_pouch}
				paidAddons={context.paid_addons}
				bonuses={context.bonuses}
			/>

			{/* === SECTION 1: KONSUMSI === */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<header>
					<h3 className="text-base font-semibold tracking-tight">
						1. Konsumsi & Bukti
					</h3>
					<p className="text-xs text-muted-foreground">
						Data crew di event. Mediaset + sleeve auto-derive dari frame size.
					</p>
				</header>

				<NumField
					label="Total cetak (pcs)"
					name="cetak_total"
					value={cetak}
					onChange={setCetak}
				/>

				<div className="grid gap-3 sm:grid-cols-2">
					<DerivedBox
						label="Mediaset (auto)"
						value={autoMedia}
						unit={mediaMapping?.item?.unit ?? "lembar"}
						info={`${frameSize || "default"} · ×${mediaMapping?.qty_per_unit ?? 1}/cetak`}
						cost={liveHpp.mediaset}
					/>
					<DerivedBox
						label="Sleeve (auto)"
						value={autoSleeve}
						unit={sleeveMapping?.item?.unit ?? "pcs"}
						info={`${frameSize || "default"} · ×${sleeveMapping?.qty_per_unit ?? 1}/cetak`}
						cost={liveHpp.sleeve}
					/>
				</div>
				<input type="hidden" name="media_set_used" value={String(autoMedia)} />
				<input type="hidden" name="sleeve_used" value={String(autoSleeve)} />

				<div className="grid gap-3 sm:grid-cols-2">
					<NumField
						label="Flashdisk"
						name="flashdisk_used"
						value={flashdisk}
						onChange={setFlashdisk}
					/>
					<NumField
						label="Pouch"
						name="pouch_used"
						value={pouch}
						onChange={setPouch}
					/>
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					<NumField
						label="Photomagnet"
						name="photomagnet_used"
						value={photomagnet}
						onChange={setPhotomagnet}
					/>
					<NumField
						label="Keychain"
						name="keychain_used"
						value={keychain}
						onChange={setKeychain}
					/>
				</div>

				{/* Bukti */}
				<div className="space-y-2">
					<label className="text-sm font-medium" htmlFor="tb-bukti">
						Bukti foto (opsional)
					</label>
					<RekapProofUpload
						projectId={projectId}
						initial={proofUrls.map((u) => ({ url: u, name: u }))}
						onChange={setProofUrls}
					/>
					<input
						type="hidden"
						name="proof_photo_urls"
						value={proofUrlsHidden}
					/>
				</div>

				{/* Notes */}
				<div className="space-y-1.5">
					<label htmlFor="tb-notes" className="text-sm font-medium">
						Catatan
					</label>
					<textarea
						id="tb-notes"
						name="crew_notes"
						rows={2}
						maxLength={1000}
						value={crewNotes}
						onChange={(e) => setCrewNotes(e.target.value)}
						className={`${inputClass} resize-none`}
					/>
				</div>

				<input
					type="hidden"
					name="custom_materials"
					value={customMaterialsJson}
				/>
			</section>

			{/* === SECTION 1b: BIAYA LAPANGAN DARI CREW === */}
			<FieldExpenseSection
				crewExpense={crewExpense}
				transportBbm={opex.transport_bbm}
				konsumsi={opex.konsumsi}
				onChangeTransportBbm={(v) =>
					setOpex((p) => ({ ...p, transport_bbm: v }))
				}
				onChangeKonsumsi={(v) => setOpex((p) => ({ ...p, konsumsi: v }))}
				transportBbmPrefill={defaults.opex_transport_bbm}
				konsumsiPrefill={defaults.opex_konsumsi}
			/>

			{/* === SECTION 2: HPP === */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<header className="flex items-baseline justify-between gap-2">
					<div>
						<h3 className="text-base font-semibold tracking-tight">
							2. HPP (Cost of Goods)
						</h3>
						<p className="text-xs text-muted-foreground">
							Auto-derived dari konsumsi × harga avg gudang. Boleh override.
						</p>
					</div>
					<Badge variant="outline">{formatRupiah(hppTotal)}</Badge>
				</header>
				<div className="grid gap-3 sm:grid-cols-3">
					<HppField label="Mediaset" name="hpp_mediaset" value={hpp.mediaset} onChange={(v) => setHpp((p) => ({ ...p, mediaset: v }))} />
					<HppField label="Sleeve" name="hpp_sleeve" value={hpp.sleeve} onChange={(v) => setHpp((p) => ({ ...p, sleeve: v }))} />
					<HppField label="Flashdisk" name="hpp_flashdisk" value={hpp.flashdisk} onChange={(v) => setHpp((p) => ({ ...p, flashdisk: v }))} />
					<HppField label="Pouch" name="hpp_pouch" value={hpp.pouch} onChange={(v) => setHpp((p) => ({ ...p, pouch: v }))} />
					<HppField label="Photomagnet" name="hpp_photomagnet" value={hpp.photomagnet} onChange={(v) => setHpp((p) => ({ ...p, photomagnet: v }))} />
					<HppField label="Keychain" name="hpp_keychain" value={hpp.keychain} onChange={(v) => setHpp((p) => ({ ...p, keychain: v }))} />
					<HppField label="Freebie (bonus)" name="hpp_bonus" value={hpp.bonus} onChange={(v) => setHpp((p) => ({ ...p, bonus: v }))} />
					<HppField label="Other" name="hpp_other" value={hpp.other} onChange={(v) => setHpp((p) => ({ ...p, other: v }))} />
				</div>
			</section>

			{/* === SECTION 3: FEE CREW & SEWA === */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<header className="flex items-baseline justify-between gap-2">
					<div>
						<div className="flex items-center gap-2">
							<Users className="h-4 w-4 text-primary" />
							<h3 className="text-base font-semibold tracking-tight">
								3. Fee Crew & Sewa
							</h3>
						</div>
						<p className="text-xs text-muted-foreground">
							Default fee dari assignment — owner bisa override final-nya di
							sini.
						</p>
					</div>
					<Badge variant="outline">
						{formatRupiah(
							opex.fee_lead +
								opex.fee_asisten +
								opex.fee_crew_c +
								opex.fee_extra +
								opex.sewa_alat +
								opex.perawatan,
						)}
					</Badge>
				</header>
				<div className="grid gap-3 sm:grid-cols-2">
					<FeeAdjustField
						label="Fee Lead"
						name="opex_fee_lead"
						value={opex.fee_lead}
						baseline={defaults.fee_lead_baseline}
						onChange={(v) => setOpex((p) => ({ ...p, fee_lead: v }))}
					/>
					<FeeAdjustField
						label="Fee Asisten"
						name="opex_fee_asisten"
						value={opex.fee_asisten}
						baseline={defaults.fee_asisten_baseline}
						onChange={(v) => setOpex((p) => ({ ...p, fee_asisten: v }))}
					/>
					<FeeAdjustField
						label="Fee Crew C"
						name="opex_fee_crew_c"
						value={opex.fee_crew_c}
						baseline={defaults.fee_crew_c_baseline}
						onChange={(v) => setOpex((p) => ({ ...p, fee_crew_c: v }))}
					/>
					<HppField
						label="Fee Extra (bonus crew)"
						name="opex_fee_extra"
						value={opex.fee_extra}
						onChange={(v) => setOpex((p) => ({ ...p, fee_extra: v }))}
					/>
					<HppField
						label="Sewa Alat / Studio"
						name="opex_sewa_alat"
						value={opex.sewa_alat}
						onChange={(v) => setOpex((p) => ({ ...p, sewa_alat: v }))}
					/>
					<HppField
						label="Sewa Aplikasi / Lainnya"
						name="opex_perawatan"
						value={opex.perawatan}
						onChange={(v) => setOpex((p) => ({ ...p, perawatan: v }))}
						hint="PicShoot dll + biaya owner lainnya"
					/>
				</div>

				{feeAdjusted && (
					<label className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
						<input
							type="checkbox"
							checked={applyFeeAdjust}
							onChange={(e) => setApplyFeeAdjust(e.target.checked)}
							className="mt-0.5 size-4 rounded border-border-default accent-primary"
						/>
						<span className="flex-1">
							<span className="font-medium text-foreground">
								Apply ke crew_assignments
							</span>{" "}
							— update fee final di WA reminder + crew dashboard. Kalau matikan,
							adjustment cuma snapshot di settlement (baseline crew_assignments
							tidak berubah).
						</span>
					</label>
				)}
				<input
					type="hidden"
					name="apply_fee_adjust"
					value={applyFeeAdjust && feeAdjusted ? "1" : "0"}
				/>
			</section>

			{/* === SECTION 4: KOMISI === */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<header className="flex items-baseline justify-between gap-2">
					<div>
						<h3 className="text-base font-semibold tracking-tight">
							4. Komisi & Platform Fee
						</h3>
						<p className="text-xs text-muted-foreground">
							Komisi vendor/relasi/sales + biaya platform.
						</p>
					</div>
					<Badge variant="outline">
						{formatRupiah(
							opex.komisi_vendor +
								opex.komisi_relasi +
								opex.komisi_sales_direct +
								opex.platform_fee,
						)}
					</Badge>
				</header>
				<div className="grid gap-3 sm:grid-cols-2">
					<HppField label="Komisi Vendor / EO" name="opex_komisi_vendor" value={opex.komisi_vendor} onChange={(v) => setOpex((p) => ({ ...p, komisi_vendor: v }))} />
					<HppField label="Komisi Relasi" name="opex_komisi_relasi" value={opex.komisi_relasi} onChange={(v) => setOpex((p) => ({ ...p, komisi_relasi: v }))} />
					<HppField label="Komisi Sales Direct" name="opex_komisi_sales_direct" value={opex.komisi_sales_direct} onChange={(v) => setOpex((p) => ({ ...p, komisi_sales_direct: v }))} />
					<HppField label="Platform Fee" name="opex_platform_fee" value={opex.platform_fee} onChange={(v) => setOpex((p) => ({ ...p, platform_fee: v }))} hint="Tetra Ops pool" />
				</div>
			</section>

			{/* === SECTION 5: DISKON & BAGI HASIL === */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<header>
					<h3 className="text-base font-semibold tracking-tight">
						5. Diskon & Bagi Hasil
					</h3>
					<p className="text-xs text-muted-foreground">
						Diskon klien (revenue impact) + diskon tambahan (post-settlement) +
						owner pool per orang.
					</p>
				</header>
				<div className="grid gap-3 sm:grid-cols-3">
					<HppField label="Diskon Klien" name="discount_total" value={discountTotal} onChange={setDiscountTotal} hint="Mengurangi revenue net" />
					<HppField label="Diskon Tambahan" name="opex_diskon_tambahan" value={opex.diskon_tambahan} onChange={(v) => setOpex((p) => ({ ...p, diskon_tambahan: v }))} hint="Bonus diskon di akhir" />
					<HppField
						label="Bagi Hasil / Owner"
						name="owner_pool_per_person"
						value={ownerPoolPerPerson}
						onChange={setOwnerPoolPerPerson}
						hint="Per orang owner aktif"
					/>
				</div>
			</section>

			<input type="hidden" name="revenue_gross" value={String(revenueGross)} />

			{/* === STICKY P&L FOOTER === */}
			<div aria-hidden="true" className="h-44 sm:h-0" />
			<div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface-2/95 backdrop-blur-md shadow-[var(--shadow-level-4)] sm:relative sm:rounded-lg sm:border sm:shadow-none">
				<div className="mx-auto max-w-4xl space-y-2 px-4 py-3 sm:px-5 sm:py-4">
					<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
						<PnlLine label="Revenue Gross" value={revenueGross} />
						<PnlLine label="− Diskon Klien" value={-discountTotal} muted />
						<PnlLine label="− HPP" value={-hppTotal} muted />
						<PnlLine
							label="= Gross Margin"
							value={grossMargin}
							tone={grossMargin >= 0 ? "default" : "rose"}
						/>
						<PnlLine label="− Fee Crew" value={-feeCrewTotal} muted />
						<PnlLine label="− Field Expense" value={-fieldExpenseTotal} muted />
						<PnlLine label="− Sewa & Lainnya" value={-sewaTotal} muted />
						<PnlLine label="− Komisi & Platform" value={-komisiTotal} muted />
					</div>
					<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-2">
						<div className="text-fluid-body">
							<span className="text-[10px] uppercase tracking-widest text-muted-foreground">
								Net Profit
							</span>{" "}
							<span
								className={`tabular ml-1 text-fluid-h3 font-bold ${
									netProfit >= 0
										? "text-emerald-600 dark:text-emerald-400"
										: "text-destructive"
								}`}
							>
								{formatRupiah(netProfit)}
							</span>
							<span className="ml-2 text-fluid-caption text-muted-foreground">
								Margin{" "}
								<span
									className={`tabular font-semibold ${
										margin >= 25
											? "text-emerald-600 dark:text-emerald-400"
											: margin >= 0
												? "text-amber-600 dark:text-amber-400"
												: "text-destructive"
									}`}
								>
									{margin.toFixed(1)}%
								</span>
							</span>
						</div>
						<button
							type="submit"
							disabled={pending}
							className="press-down inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-fluid-body font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{pending ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Menutup buku…
								</>
							) : (
								<>
									<CheckCircle2 className="size-4" />
									Simpan & Tutup Buku
								</>
							)}
						</button>
					</div>
				</div>
			</div>

			{state && !state.ok && (
				<div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
					<p className="inline-flex items-center gap-2 text-fluid-caption font-medium text-destructive">
						<AlertTriangle className="size-3.5" />
						{state.error}
					</p>
				</div>
			)}
		</form>
	);
}

// ============== Helpers ==============

function NumField({
	label,
	name,
	value,
	onChange,
	hint,
}: {
	label: string;
	name: string;
	value: string;
	onChange: (v: string) => void;
	hint?: string;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-sm font-medium">
				{label}
			</label>
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
			{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
		</div>
	);
}

function HppField({
	label,
	name,
	value,
	onChange,
	hint,
}: {
	label: string;
	name: string;
	value: number;
	onChange: (v: number) => void;
	hint?: string;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-sm font-medium">
				{label}
			</label>
			<div className="relative">
				<span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
					Rp
				</span>
				<input
					id={name}
					name={name}
					type="number"
					inputMode="numeric"
					min={0}
					step={1}
					value={value}
					onChange={(e) => onChange(Number(e.target.value) || 0)}
					className={`${inputClass} tabular pl-9`}
				/>
			</div>
			{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
		</div>
	);
}

function DerivedBox({
	label,
	value,
	unit,
	info,
	cost,
}: {
	label: string;
	value: number;
	unit: string;
	info: string;
	cost: number;
}) {
	return (
		<div className="space-y-1 rounded-lg border border-border-default bg-surface-3 p-3">
			<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
				{label}
			</p>
			<p className="tabular text-fluid-h2 font-semibold text-foreground">
				{value.toLocaleString("id-ID")}{" "}
				<span className="text-xs font-normal text-muted-foreground">
					{unit}
				</span>
			</p>
			<div className="flex flex-wrap items-center gap-1.5 text-[11px]">
				<span className="tabular rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
					{formatRupiah(cost)}
				</span>
				<span className="text-[10px] text-muted-foreground">{info}</span>
			</div>
		</div>
	);
}

/**
 * Display crew's field-expense breakdown (transport/bensin/toll/parking/
 * konsumsi/lainnya) read-only, with owner override toggle. When override
 * mode is OFF, transport_bbm + konsumsi inputs are hidden (auto-fill from
 * crew). When ON, owner gets two editable inputs that route into the
 * existing transport_bbm + konsumsi OpEx buckets.
 */
function FieldExpenseSection({
	crewExpense,
	transportBbm,
	konsumsi,
	onChangeTransportBbm,
	onChangeKonsumsi,
	transportBbmPrefill,
	konsumsiPrefill,
}: {
	crewExpense: CrewExpense;
	transportBbm: number;
	konsumsi: number;
	onChangeTransportBbm: (v: number) => void;
	onChangeKonsumsi: (v: number) => void;
	transportBbmPrefill: number;
	konsumsiPrefill: number;
}) {
	const [override, setOverride] = useState(false);
	const hasAnyData =
		crewExpense.transport_method !== "none" ||
		crewExpense.toll_cost > 0 ||
		crewExpense.parking_cost > 0 ||
		crewExpense.konsumsi_cost > 0 ||
		crewExpense.lainnya_total > 0;

	const fieldExpenseTotal = transportBbm + konsumsi;

	return (
		<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
			<header className="flex items-baseline justify-between gap-2">
				<div>
					<div className="flex items-center gap-2">
						<Receipt className="h-4 w-4 text-primary" />
						<h3 className="text-base font-semibold tracking-tight">
							1b. Biaya Lapangan (dari Crew)
						</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Pre-fill dari rekap crew. Override kalau ada koreksi.
					</p>
				</div>
				<Badge variant="outline">{formatRupiah(fieldExpenseTotal)}</Badge>
			</header>

			{hasAnyData ? (
				<div className="grid gap-2 text-xs sm:grid-cols-2">
					<ExpenseRow
						label="Transport"
						value={crewExpense.transport_cost}
						suffix={TRANSPORT_LABEL[crewExpense.transport_method]}
					/>
					{crewExpense.transport_method === "rental" && (
						<ExpenseRow label="Bensin" value={crewExpense.bensin_cost} />
					)}
					<ExpenseRow label="E-toll" value={crewExpense.toll_cost} />
					<ExpenseRow label="Parkir" value={crewExpense.parking_cost} />
					<ExpenseRow label="Konsumsi" value={crewExpense.konsumsi_cost} />
					<ExpenseRow
						label="Lainnya"
						value={crewExpense.lainnya_total}
						suffix={
							crewExpense.lainnya_items.length > 0
								? `${crewExpense.lainnya_items.length} item`
								: undefined
						}
					/>
				</div>
			) : (
				<p className="text-xs text-muted-foreground italic">
					Crew belum input biaya lapangan. Owner bisa isi langsung di Override.
				</p>
			)}

			{(crewExpense.transport_proof_berangkat_url ||
				crewExpense.transport_proof_pulang_url) && (
				<div className="flex flex-wrap gap-2 text-[11px]">
					{crewExpense.transport_proof_berangkat_url && (
						<a
							href={crewExpense.transport_proof_berangkat_url}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary inline-flex items-center gap-1 hover:underline"
						>
							<ExternalLink className="h-3 w-3" />
							Bukti berangkat
						</a>
					)}
					{crewExpense.transport_proof_pulang_url && (
						<a
							href={crewExpense.transport_proof_pulang_url}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary inline-flex items-center gap-1 hover:underline"
						>
							<ExternalLink className="h-3 w-3" />
							Bukti pulang
						</a>
					)}
				</div>
			)}

			<div className="flex items-center justify-between gap-2 border-t border-border-default pt-3">
				<div className="text-xs">
					<span className="text-muted-foreground">Routed ke OpEx:</span>{" "}
					<span className="tabular font-medium">
						transport_bbm {formatRupiah(transportBbm)}
					</span>{" "}
					·{" "}
					<span className="tabular font-medium">
						konsumsi {formatRupiah(konsumsi)}
					</span>
				</div>
				<button
					type="button"
					onClick={() => {
						if (override) {
							onChangeTransportBbm(transportBbmPrefill);
							onChangeKonsumsi(konsumsiPrefill);
						}
						setOverride((v) => !v);
					}}
					className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
				>
					<Pencil className="h-3 w-3" />
					{override ? "Reset ke crew" : "Override nominal"}
				</button>
			</div>

			{override && (
				<div className="grid gap-3 rounded-md bg-surface-3 p-3 sm:grid-cols-2">
					<HppField
						label="Transport / BBM (override)"
						name="_override_transport_bbm"
						value={transportBbm}
						onChange={onChangeTransportBbm}
					/>
					<HppField
						label="Konsumsi & Lainnya (override)"
						name="_override_konsumsi"
						value={konsumsi}
						onChange={onChangeKonsumsi}
					/>
				</div>
			)}

			{/* Hidden inputs always carry the final OpEx values regardless of UI mode */}
			<input
				type="hidden"
				name="opex_transport_bbm"
				value={String(transportBbm)}
			/>
			<input type="hidden" name="opex_konsumsi" value={String(konsumsi)} />
		</section>
	);
}

function ExpenseRow({
	label,
	value,
	suffix,
}: {
	label: string;
	value: number;
	suffix?: string;
}) {
	return (
		<div className="flex items-baseline justify-between gap-2 rounded-md bg-surface-3 px-3 py-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="tabular flex items-baseline gap-1.5 font-semibold">
				{formatRupiah(value)}
				{suffix && (
					<span className="text-[10px] font-normal text-muted-foreground">
						{suffix}
					</span>
				)}
			</span>
		</div>
	);
}

function FeeAdjustField({
	label,
	name,
	value,
	baseline,
	onChange,
}: {
	label: string;
	name: string;
	value: number;
	baseline: number;
	onChange: (v: number) => void;
}) {
	const adjusted = value !== baseline;
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<label htmlFor={name} className="text-sm font-medium">
					{label}
				</label>
				{baseline > 0 && (
					<span className="text-[10px] text-muted-foreground">
						Default {formatRupiah(baseline)}
					</span>
				)}
			</div>
			<div className="relative">
				<span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
					Rp
				</span>
				<input
					id={name}
					name={name}
					type="number"
					inputMode="numeric"
					min={0}
					step={1}
					value={value}
					onChange={(e) => onChange(Number(e.target.value) || 0)}
					className={`${inputClass} tabular pl-9 ${
						adjusted ? "border-amber-400 dark:border-amber-700" : ""
					}`}
				/>
			</div>
			{adjusted && (
				<p className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
					<Wallet className="h-2.5 w-2.5" />
					{value > baseline ? "+" : ""}
					{formatRupiah(value - baseline)} dari default
				</p>
			)}
		</div>
	);
}

function PnlLine({
	label,
	value,
	tone = "default",
	muted = false,
}: {
	label: string;
	value: number;
	tone?: "default" | "rose";
	muted?: boolean;
}) {
	const color =
		tone === "rose"
			? "text-rose-600 dark:text-rose-400"
			: muted
				? "text-muted-foreground"
				: "text-foreground";
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground text-[10px] tracking-wide">
				{label}
			</span>
			<span className={`tabular text-xs font-medium ${color}`}>
				{formatRupiah(value)}
			</span>
		</div>
	);
}

const inputClass =
	"h-10 w-full rounded-md border border-border-default bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
