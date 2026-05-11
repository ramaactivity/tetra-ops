"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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

export function TutupBukuForm({
	eventId,
	projectId,
	context,
	autoHpp,
	defaults,
}: {
	eventId: string;
	projectId: string;
	context: RekapContext;
	autoHpp: AutoHpp;
	defaults: Defaults;
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
		transport_bbm: 0,
		sewa_alat: 0,
		perawatan: 0,
		konsumsi: 0,
		komisi_vendor: 0,
		komisi_relasi: 0,
		komisi_sales_direct: 0,
		platform_fee: defaults.platform_fee,
		diskon_tambahan: 0,
	});

	// ===== Distribution =====
	const [ownerPoolPerPerson, setOwnerPoolPerPerson] = useState(
		defaults.owner_pool_per_person,
	);
	const [discountTotal, setDiscountTotal] = useState(defaults.discount_total);
	const revenueGross = defaults.revenue_gross;

	// ===== Live P&L footer =====
	const hppTotal = sumBuckets(hpp);
	const opexTotal = Object.values(opex).reduce((s, v) => s + (v || 0), 0);
	const revenueNet = revenueGross - discountTotal;
	const totalBiaya = hppTotal + opexTotal;
	const netProfit = revenueNet - totalBiaya;
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
					<h3 className="font-display text-base font-semibold tracking-tight">
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

			{/* === SECTION 2: HPP === */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<header className="flex items-baseline justify-between gap-2">
					<div>
						<h3 className="font-display text-base font-semibold tracking-tight">
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

			{/* === SECTION 3: SDM & OPERASIONAL === */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<header className="flex items-baseline justify-between gap-2">
					<div>
						<h3 className="font-display text-base font-semibold tracking-tight">
							3. SDM & Operasional
						</h3>
						<p className="text-xs text-muted-foreground">
							Fee crew, transportasi, sewa alat, konsumsi.
						</p>
					</div>
					<Badge variant="outline">
						{formatRupiah(
							opex.fee_lead +
								opex.fee_asisten +
								opex.fee_crew_c +
								opex.fee_extra +
								opex.transport_bbm +
								opex.sewa_alat +
								opex.perawatan +
								opex.konsumsi,
						)}
					</Badge>
				</header>
				<div className="grid gap-3 sm:grid-cols-2">
					<HppField label="Fee Lead" name="opex_fee_lead" value={opex.fee_lead} onChange={(v) => setOpex((p) => ({ ...p, fee_lead: v }))} />
					<HppField label="Fee Asisten" name="opex_fee_asisten" value={opex.fee_asisten} onChange={(v) => setOpex((p) => ({ ...p, fee_asisten: v }))} />
					<HppField label="Fee Crew C" name="opex_fee_crew_c" value={opex.fee_crew_c} onChange={(v) => setOpex((p) => ({ ...p, fee_crew_c: v }))} hint="Hanya kalau 3 crew" />
					<HppField label="Fee Extra (bonus crew)" name="opex_fee_extra" value={opex.fee_extra} onChange={(v) => setOpex((p) => ({ ...p, fee_extra: v }))} />
					<HppField label="Transport / BBM" name="opex_transport_bbm" value={opex.transport_bbm} onChange={(v) => setOpex((p) => ({ ...p, transport_bbm: v }))} />
					<HppField label="Sewa Alat / Studio" name="opex_sewa_alat" value={opex.sewa_alat} onChange={(v) => setOpex((p) => ({ ...p, sewa_alat: v }))} />
					<HppField label="Perawatan Alat" name="opex_perawatan" value={opex.perawatan} onChange={(v) => setOpex((p) => ({ ...p, perawatan: v }))} />
					<HppField label="Konsumsi / Lainnya" name="opex_konsumsi" value={opex.konsumsi} onChange={(v) => setOpex((p) => ({ ...p, konsumsi: v }))} />
				</div>
			</section>

			{/* === SECTION 4: KOMISI === */}
			<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5">
				<header className="flex items-baseline justify-between gap-2">
					<div>
						<h3 className="font-display text-base font-semibold tracking-tight">
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
					<h3 className="font-display text-base font-semibold tracking-tight">
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
			<div aria-hidden="true" className="h-32 sm:h-0" />
			<div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface-2/95 backdrop-blur-md shadow-lg sm:relative sm:rounded-xl sm:border sm:shadow-none">
				<div className="mx-auto max-w-4xl space-y-2 px-4 py-3 sm:px-5 sm:py-4">
					<div className="grid grid-cols-2 gap-2 text-fluid-caption sm:grid-cols-4">
						<FooterCell label="Revenue Net" value={revenueNet} />
						<FooterCell label="HPP" value={-hppTotal} tone="rose" />
						<FooterCell label="OpEx" value={-opexTotal} tone="rose" />
						<FooterCell
							label="Net Profit"
							value={netProfit}
							tone={netProfit >= 0 ? "emerald" : "rose"}
							bold
						/>
					</div>
					<div className="flex items-center justify-between gap-3 pt-1">
						<div className="text-fluid-caption text-muted-foreground">
							Margin:{" "}
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
						</div>
						<button
							type="submit"
							disabled={pending}
							className="press-down inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-fluid-body font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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

function FooterCell({
	label,
	value,
	tone = "default",
	bold = false,
}: {
	label: string;
	value: number;
	tone?: "default" | "rose" | "emerald";
	bold?: boolean;
}) {
	const color =
		tone === "rose"
			? "text-rose-600 dark:text-rose-400"
			: tone === "emerald"
				? "text-emerald-600 dark:text-emerald-400"
				: "text-foreground";
	return (
		<div className="space-y-0">
			<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
				{label}
			</p>
			<p
				className={`tabular ${bold ? "text-fluid-h3 font-semibold" : "text-fluid-body font-medium"} ${color}`}
			>
				{formatRupiah(value)}
			</p>
		</div>
	);
}

const inputClass =
	"h-10 w-full rounded-md border border-border-default bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
