"use client";

import { Calculator, CheckCircle2, Plus, Save, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { NumberedSection } from "@/components/operations/_shared/numbered-section";
import { RekapContextCard } from "@/components/rekap/rekap-context-card";
import { RekapProofUpload } from "@/components/rekap/rekap-proof-upload";
import { RekapSummaryBar } from "@/components/rekap/rekap-summary-bar";
import { SingleFileUpload } from "@/components/rekap/single-file-upload";
import { useRekapDraft } from "@/components/rekap/use-rekap-draft";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import type { RekapContext } from "@/lib/actions/rekap";
import { type RekapFormState, submitRekap } from "@/lib/actions/rekap";
import { formatRupiah } from "@/lib/format";
import {
	type CustomLine,
	computeRekapCost,
	deriveRekapRatio,
	type MappedItem,
	type RekapQuantities,
	sumBuckets,
} from "@/lib/rekap/cost";
import type { RekapField } from "@/lib/rekap-mapping/types";

/** Format ratio "0.000714 roll/cetak" → "1 roll / 1400 cetak" (readable). */
function humanizeRatio(qtyPerUnit: number, unit: string): string {
	if (qtyPerUnit >= 1) {
		return `×${qtyPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${unit}/cetak`;
	}
	const cetakPerUnit = Math.round(1 / qtyPerUnit);
	if (Number.isFinite(cetakPerUnit) && cetakPerUnit > 1) {
		return `1 ${unit} = ${cetakPerUnit.toLocaleString("id-ID")} cetak`;
	}
	return `×${qtyPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 6 })} ${unit}/cetak`;
}

/** 1 roll media = 1400 lembar (potongan terkecil ukuran 2R/polaroid). */
const LEMBAR_PER_ROLL = 1400;

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
	// Field expenses (Phase F2)
	transport_method: "online" | "rental" | "none";
	transport_cost: string;
	transport_proof_berangkat_url: string;
	transport_proof_pulang_url: string;
	bensin_cost: string;
	toll_cost: string;
	parking_cost: string;
	konsumsi_cost: string;
	lainnya_items: string; // JSON string of [{note, amount}]
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
	transport_method: "none",
	transport_cost: "0",
	transport_proof_berangkat_url: "",
	transport_proof_pulang_url: "",
	bensin_cost: "0",
	toll_cost: "0",
	parking_cost: "0",
	konsumsi_cost: "0",
	lainnya_items: "[]",
};

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
	const router = useRouter();
	const action = submitRekap.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<RekapFormState, FormData>(
		action,
		undefined,
	);

	const get = (key: keyof Defaults) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		return String(defaults[key] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
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
		// Mediaset & sleeve SELALU mulai auto (di-hitung dari total cetak).
		// Owner bisa klik "Sesuaikan" kalau mau override manual.
		media_set_used: false,
		sleeve_used: false,
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
	const [customMaterials, setCustomMaterials] =
		useState<Record<string, number>>(initialCustom);

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

	// === Field expenses (Phase F2) ===
	const [transportMethod, setTransportMethod] = useState<
		"online" | "rental" | "none"
	>((get("transport_method") as Defaults["transport_method"]) || "none");
	const [transportCost, setTransportCost] = useState(get("transport_cost"));
	const [transportProofBerangkat, setTransportProofBerangkat] = useState<
		string | null
	>(get("transport_proof_berangkat_url") || null);
	const [transportProofPulang, setTransportProofPulang] = useState<
		string | null
	>(get("transport_proof_pulang_url") || null);
	const [bensinCost, setBensinCost] = useState(get("bensin_cost"));
	const [tollCost, setTollCost] = useState(get("toll_cost"));
	const [parkingCost, setParkingCost] = useState(get("parking_cost"));
	const [konsumsiCost, setKonsumsiCost] = useState(get("konsumsi_cost"));

	const initialLainnya = useMemo<
		Array<{ note: string; amount: number }>
	>(() => {
		try {
			const obj = JSON.parse(defaults.lainnya_items || "[]");
			if (Array.isArray(obj)) {
				return obj
					.map((row): { note: string; amount: number } | null => {
						if (!row || typeof row !== "object") return null;
						const r = row as Record<string, unknown>;
						const note = String(r.note ?? "").slice(0, 120);
						const amount = Number(r.amount);
						if (!Number.isFinite(amount) || amount < 0) return null;
						return { note, amount: Math.round(amount) };
					})
					.filter((v): v is { note: string; amount: number } => v !== null)
					.slice(0, 20);
			}
		} catch {}
		return [];
	}, [defaults.lainnya_items]);
	const [lainnyaItems, setLainnyaItems] =
		useState<Array<{ note: string; amount: number }>>(initialLainnya);

	function addLainnyaRow() {
		setLainnyaItems((prev) =>
			prev.length >= 20 ? prev : [...prev, { note: "", amount: 0 }],
		);
	}
	function updateLainnyaRow(
		idx: number,
		patch: Partial<{ note: string; amount: number }>,
	) {
		setLainnyaItems((prev) =>
			prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
		);
	}
	function removeLainnyaRow(idx: number) {
		setLainnyaItems((prev) => prev.filter((_, i) => i !== idx));
	}

	const lainnyaItemsJson = JSON.stringify(lainnyaItems);
	const lainnyaTotal = lainnyaItems.reduce((s, r) => s + (r.amount || 0), 0);

	const fieldExpenseTotal = useMemo(() => {
		const t = transportMethod !== "none" ? Number(transportCost) || 0 : 0;
		const b = transportMethod === "rental" ? Number(bensinCost) || 0 : 0;
		const toll = Number(tollCost) || 0;
		const park = Number(parkingCost) || 0;
		const ks = Number(konsumsiCost) || 0;
		return t + b + toll + park + ks + lainnyaTotal;
	}, [
		transportMethod,
		transportCost,
		bensinCost,
		tollCost,
		parkingCost,
		konsumsiCost,
		lainnyaTotal,
	]);

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

	// === Draft persistence (localStorage, 7 day TTL) ===
	const draftValues = useMemo<Record<string, string>>(
		() => ({
			cetak_total: cetak,
			media_set_used: media,
			sleeve_used: sleeve,
			flashdisk_used: flashdisk,
			pouch_used: pouch,
			photomagnet_used: photomagnet,
			keychain_used: keychain,
			custom_materials: JSON.stringify(customMaterials),
			transport_method: transportMethod,
			transport_cost: transportCost,
			bensin_cost: bensinCost,
			toll_cost: tollCost,
			parking_cost: parkingCost,
			konsumsi_cost: konsumsiCost,
			lainnya_items: JSON.stringify(lainnyaItems),
		}),
		[
			cetak,
			media,
			sleeve,
			flashdisk,
			pouch,
			photomagnet,
			keychain,
			customMaterials,
			transportMethod,
			transportCost,
			bensinCost,
			tollCost,
			parkingCost,
			konsumsiCost,
			lainnyaItems,
		],
	);

	const {
		restoredValues,
		restoredAgeMs,
		clear: clearDraftState,
	} = useRekapDraft(eventId, draftValues, mode === "create");
	const [draftRestoredNotice, setDraftRestoredNotice] = useState(false);

	useEffect(() => {
		if (!restoredValues) return;
		// Apply restored draft values exactly once on mount.
		const numeric = (k: string) => {
			const v = restoredValues[k];
			if (v === undefined) return null;
			return String(v);
		};
		const c = numeric("cetak_total");
		if (c !== null) {
			setCetak(c);
			markTouched("cetak_total");
		}
		const m = numeric("media_set_used");
		if (m !== null) {
			setMedia(m);
			markTouched("media_set_used");
		}
		const s = numeric("sleeve_used");
		if (s !== null) {
			setSleeve(s);
			markTouched("sleeve_used");
		}
		const fd = numeric("flashdisk_used");
		if (fd !== null) {
			setFlashdisk(fd);
			markTouched("flashdisk_used");
		}
		const pc = numeric("pouch_used");
		if (pc !== null) {
			setPouch(pc);
			markTouched("pouch_used");
		}
		const pm = numeric("photomagnet_used");
		if (pm !== null) {
			setPhotomagnet(pm);
			markTouched("photomagnet_used");
		}
		const kc = numeric("keychain_used");
		if (kc !== null) {
			setKeychain(kc);
			markTouched("keychain_used");
		}
		const cm = restoredValues.custom_materials;
		if (cm) {
			try {
				const parsed = JSON.parse(cm);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					const out: Record<string, number> = {};
					for (const [k, v] of Object.entries(
						parsed as Record<string, unknown>,
					)) {
						const n = Number(v);
						if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
					}
					setCustomMaterials(out);
				}
			} catch {}
		}
		const tm = restoredValues.transport_method;
		if (tm === "online" || tm === "rental" || tm === "none") {
			setTransportMethod(tm);
		}
		const tc = numeric("transport_cost");
		if (tc !== null) setTransportCost(tc);
		const bc = numeric("bensin_cost");
		if (bc !== null) setBensinCost(bc);
		const tlc = numeric("toll_cost");
		if (tlc !== null) setTollCost(tlc);
		const prk = numeric("parking_cost");
		if (prk !== null) setParkingCost(prk);
		const ksm = numeric("konsumsi_cost");
		if (ksm !== null) setKonsumsiCost(ksm);
		const li = restoredValues.lainnya_items;
		if (li) {
			try {
				const parsed = JSON.parse(li);
				if (Array.isArray(parsed)) {
					const out: Array<{ note: string; amount: number }> = [];
					for (const row of parsed) {
						if (!row || typeof row !== "object") continue;
						const r = row as Record<string, unknown>;
						const note = String(r.note ?? "").slice(0, 120);
						const amount = Number(r.amount);
						if (!Number.isFinite(amount) || amount < 0) continue;
						out.push({ note, amount: Math.round(amount) });
						if (out.length >= 20) break;
					}
					setLainnyaItems(out);
				}
			} catch {}
		}
		setDraftRestoredNotice(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [restoredValues]);

	// Clear draft + navigate to success page after successful submit.
	useEffect(() => {
		if (!state?.success) return;
		clearDraftState();
		router.push(`/crew/jadwal/${projectId}/rekap/success`);
	}, [state?.success, clearDraftState, projectId, router]);

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
				frame_size: m.frame_size,
				item_id: m.item_id ?? "",
				qty_per_unit: m.qty_per_unit,
				purchase_price_avg: m.item?.purchase_price_avg ?? 0,
				base_unit: m.item?.unit,
				unit_conversion: m.item?.unit_conversion,
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

	// Helpers for per-field HPP chip — size-aware mapping resolution
	const frameSize = context.pkg.frame_size ?? "";
	const mappingByField = useMemo(() => {
		const m = new Map<RekapField, (typeof context.mappings)[number]>();
		// Group by field; pick exact frame_size match first, else '' fallback
		const fields = new Set(context.mappings.map((x) => x.rekap_field));
		for (const field of fields) {
			const candidates = context.mappings.filter(
				(x) => x.rekap_field === field,
			);
			const exact = candidates.find((x) => x.frame_size === frameSize);
			const fallback = candidates.find((x) => x.frame_size === "");
			const picked = exact ?? fallback;
			if (!picked) continue;
			// OVERRIDE qty_per_unit for derived fields (media_set_used, sleeve_used)
			// supaya match dengan backend SIZE_RECIPE (rekap.ts:740-767). Backend
			// ignore rekap_field_mapping.qty_per_unit untuk fields ini.
			const correctedRatio = deriveRekapRatio(field, frameSize, {
				rekap_field: picked.rekap_field,
				frame_size: picked.frame_size,
				item_id: picked.item_id ?? "",
				qty_per_unit: picked.qty_per_unit,
				purchase_price_avg: picked.item?.purchase_price_avg ?? 0,
				base_unit: picked.item?.unit,
				unit_conversion: picked.item?.unit_conversion,
			});
			m.set(field, { ...picked, qty_per_unit: correctedRatio });
		}
		return m;
	}, [context.mappings, frameSize]);

	// Auto-derived: mediaset dalam LEMBAR (1 roll = 1400 lembar), sleeve dalam pcs.
	// Di-sync ke state saat belum di-override manual → preview, draft, & submit
	// konsisten. Deduct stok di belakang layar tetap dari cetak_total (roll).
	const cetakNum = Number(cetak) || 0;
	const autoMediaLembar = (() => {
		const map = mappingByField.get("media_set_used");
		return map ? Math.round(cetakNum * map.qty_per_unit * LEMBAR_PER_ROLL) : 0;
	})();
	const autoSleeveQty = (() => {
		const map = mappingByField.get("sleeve_used");
		return map ? Math.ceil(cetakNum * map.qty_per_unit) : 0;
	})();
	useEffect(() => {
		if (!touched.media_set_used) setMedia(String(autoMediaLembar));
	}, [autoMediaLembar, touched.media_set_used]);
	useEffect(() => {
		if (!touched.sleeve_used) setSleeve(String(autoSleeveQty));
	}, [autoSleeveQty, touched.sleeve_used]);

	// HPP uses AUTO media/sleeve (cetak-derived) — same basis as the owner
	// settlement engine (planRekapDeduction ignores manual media/sleeve). So a
	// manual override changes the stock note only, never the HPP — crew preview
	// stays in sync with what the owner will settle.
	const buckets = useMemo(
		() =>
			computeRekapCost(
				{
					...quantities,
					media_set_used: autoMediaLembar,
					sleeve_used: autoSleeveQty,
				},
				mappedItems,
				bonusLines,
				customLines,
				context.pkg.frame_size ?? "",
			),
		[
			quantities,
			autoMediaLembar,
			autoSleeveQty,
			mappedItems,
			bonusLines,
			customLines,
			context.pkg.frame_size,
		],
	);
	const hppTotal = sumBuckets(buckets);

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
				(map.item.current_stock - deduct) /
					Math.max(map.item.current_stock, 1) <
					0.1,
		};
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
		// Only flag mismatches when user manually overrode the auto-derived
		// values — otherwise the math is consistent by construction.
		if (touched.sleeve_used) {
			const s = Number(sleeve) || 0;
			if (c > 0 && s > c * 2) {
				w.push("Sleeve override > 2× total cetak — biasanya 1:1, cek lagi.");
			}
		}
		if (touched.media_set_used) {
			const m = Number(media) || 0;
			const mediaMapping = mappingByField.get("media_set_used");
			if (mediaMapping && c > 0) {
				const expected = Math.ceil(c * mediaMapping.qty_per_unit);
				if (m > 0 && Math.abs(m - expected) > expected * 0.5) {
					w.push(
						`Mediaset override ${m} berbeda jauh dari auto-derive (${expected}). Pastikan benar.`,
					);
				}
			}
		}
		return w;
	}, [cetak, sleeve, media, touched, mappingByField]);

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
				<div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-[13px] font-medium text-emerald-700 dark:text-emerald-300">
					<CheckCircle2 className="h-4 w-4" />
					Rekap tersimpan. Mengarahkan ke ringkasan…
				</div>
			)}
			{draftRestoredNotice && !state?.success && (
				<div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/60 p-3 text-xs leading-relaxed dark:border-blue-900 dark:bg-blue-950/30">
					<Save className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
					<div className="flex-1">
						<p className="text-blue-900 dark:text-blue-200 font-medium">
							Draft dipulihkan
						</p>
						<p className="text-blue-900/80 dark:text-blue-200/80">
							{restoredAgeMs !== null
								? `Tersimpan ${formatRelativeAge(restoredAgeMs)}. `
								: ""}
							Edit seperlunya & submit.
						</p>
					</div>
					<button
						type="button"
						onClick={() => setDraftRestoredNotice(false)}
						className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
						aria-label="Tutup notice"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			)}
			{state?.errors?._form && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-[13px] font-medium text-destructive">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<RekapContextCard
				includeFlashdiskPouch={context.pkg.include_flashdisk_pouch}
				paidAddons={context.paid_addons}
				bonuses={context.bonuses}
				bundle={context.bundle}
			/>

			{/* ========== CETAK ========== */}
			{(() => {
				const mediaMapping = mappingByField.get("media_set_used");
				const sleeveMapping = mappingByField.get("sleeve_used");
				const autoSleeveExact = sleeveMapping
					? cetakNum * sleeveMapping.qty_per_unit
					: 0;
				// Mediaset dalam LEMBAR (integer alami: 2R/polaroid 1/cetak, 4R 2/cetak).
				const autoMedia = autoMediaLembar;
				const autoSleeve = autoSleeveQty;
				const finalMedia = touched.media_set_used
					? Number(media) || 0
					: autoMedia;
				const finalSleeve = touched.sleeve_used
					? Number(sleeve) || 0
					: autoSleeve;
				// Mapping versi lembar utk kartu Mediaset — cost & stok dikonversi
				// (avg ÷ 1400 = per lembar; stok roll × 1400 = lembar) supaya angka
				// di kartu tetap akurat sambil tampil dalam lembar.
				const mediaMappingLembar = mediaMapping?.item
					? {
							...mediaMapping,
							qty_per_unit: mediaMapping.qty_per_unit * LEMBAR_PER_ROLL,
							item: {
								...mediaMapping.item,
								unit: "lembar",
								purchase_price_avg:
									mediaMapping.item.purchase_price_avg / LEMBAR_PER_ROLL,
								current_stock:
									mediaMapping.item.current_stock * LEMBAR_PER_ROLL,
							},
						}
					: mediaMapping;
				return (
					<NumberedSection
						step={1}
						title="Cetak"
						description="Cuma isi total cetak — mediaset + sleeve auto-hitung dari mapping per frame size."
					>
						<NumField
							label="Total cetak (pcs)"
							name="cetak_total"
							value={cetak}
							onChange={(v) => {
								setCetak(v);
								markTouched("cetak_total");
							}}
							error={err("cetak_total")}
							cost={fieldCost("cetak_total", cetakNum)}
							stock={fieldStock("cetak_total", cetakNum)}
							auto={false}
						/>
						{/* Auto-derived preview cards */}
						<div className="grid gap-3 sm:grid-cols-2">
							<AutoDerivedCard
								label="Mediaset"
								value={finalMedia}
								exactValue={touched.media_set_used ? finalMedia : autoMedia}
								mapping={mediaMappingLembar}
								frameSize={frameSize}
								touched={touched.media_set_used}
								manualValue={media}
								onManualChange={(v) => {
									setMedia(v);
									markTouched("media_set_used");
								}}
								onResetToAuto={() => {
									setTouched((t) => ({ ...t, media_set_used: false }));
									setMedia(String(autoMedia));
								}}
							/>
							<AutoDerivedCard
								label="Sleeve"
								value={finalSleeve}
								exactValue={touched.sleeve_used ? finalSleeve : autoSleeveExact}
								mapping={sleeveMapping}
								frameSize={frameSize}
								touched={touched.sleeve_used}
								manualValue={sleeve}
								onManualChange={(v) => {
									setSleeve(v);
									markTouched("sleeve_used");
								}}
								onResetToAuto={() => {
									setTouched((t) => ({ ...t, sleeve_used: false }));
									setSleeve(String(autoSleeve));
								}}
							/>
						</div>
						{/* Hidden inputs — submit auto value when not touched, manual otherwise */}
						<input
							type="hidden"
							name="media_set_used"
							value={String(finalMedia)}
						/>
						<input
							type="hidden"
							name="sleeve_used"
							value={String(finalSleeve)}
						/>
					</NumberedSection>
				);
			})()}

			{/* ========== FLASHDISK & POUCH ========== */}
			<NumberedSection
				step={2}
				title="Flashdisk & Pouch"
				description={
					fdPouchIncluded
						? "FD + Pouch itu 1 paket — isi jumlah set-nya aja, otomatis kehitung dua-duanya."
						: "Paket tidak include. Skip kecuali emang dipakai."
				}
				badge={
					fdPouchIncluded ? (
						<Badge variant="success">Include</Badge>
					) : (
						<Badge variant="secondary">Skip</Badge>
					)
				}
			>
				{(() => {
					const fdSet = Number(flashdisk) || 0;
					const setSet = (v: string) => {
						setFlashdisk(v);
						setPouch(v);
						markTouched("flashdisk_used");
						markTouched("pouch_used");
					};
					const fdStock = fieldStock("flashdisk_used", fdSet);
					const pouchStock = fieldStock("pouch_used", fdSet);
					const setError = err("flashdisk_used") || err("pouch_used");
					const setCost =
						fieldCost("flashdisk_used", fdSet) + fieldCost("pouch_used", fdSet);
					return (
						<div className="space-y-1.5">
							<label
								htmlFor="flashdisk_used"
								className="text-[13px] font-medium"
							>
								Set FD + Pouch terpakai
							</label>
							<input
								id="flashdisk_used"
								name="flashdisk_used"
								type="number"
								inputMode="numeric"
								min={0}
								step={1}
								value={flashdisk}
								onChange={(e) => setSet(e.target.value)}
								className={`${inputClass} tabular`}
							/>
							{/* Pouch mirrors the set count — submitted, not shown */}
							<input type="hidden" name="pouch_used" value={pouch} />
							{setError ? (
								<p className="text-xs text-destructive">{setError}</p>
							) : (
								<div className="flex flex-wrap items-center gap-1.5 text-[11px]">
									{setCost > 0 && (
										<span className="tabular inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
											{formatRupiah(setCost)}
										</span>
									)}
									{fdSet > 0 &&
										[
											{ label: "FD", s: fdStock },
											{ label: "Pouch", s: pouchStock },
										].map(({ label, s }) =>
											s ? (
												<span
													key={label}
													className={`tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
														s.critical
															? "bg-destructive/15 text-destructive"
															: s.lowAfter
																? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
																: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
													}`}
													title={
														s.critical ? "Stok kurang!" : "Stok setelah deduct"
													}
												>
													<span className="opacity-70">{label}</span>
													{s.before} → {s.after}
												</span>
											) : null,
										)}
								</div>
							)}
						</div>
					);
				})()}
			</NumberedSection>

			{/* ========== ADD-ON ========== */}
			<NumberedSection
				step={3}
				title="Add-on"
				description="Photomagnet / keychain — jumlah yang dipakai (paid + bonus)."
			>
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
			</NumberedSection>

			{/* ========== ITEM TAMBAHAN (custom_materials) ========== */}
			<NumberedSection
				step={4}
				title="Item tambahan"
				description="Item dari stok yang kepake selain 7 item standar di atas (cth. sticker, magnetik, dll.)."
				badge={
					<span className="text-[11px] text-muted-foreground">
						{Object.keys(customMaterials).length} item
					</span>
				}
				defaultOpen={Object.keys(customMaterials).length > 0}
			>
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
										<p className="text-[13px] font-medium text-foreground">
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
										className="tabular h-9 w-20 rounded-md border border-border-default bg-background px-2 text-right text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
			</NumberedSection>

			{/* ========== TRANSPORTASI ========== */}
			<NumberedSection
				step={5}
				title="Transportasi"
				description="Biaya gocar/grabcar atau sewa mobil. Toll & parkir tetap diisi kalau ada."
			>
				<div className="grid grid-cols-3 gap-2">
					{(
						[
							{ key: "online", label: "Online", sub: "Gocar/Grab" },
							{ key: "rental", label: "Sewa mobil", sub: "Rental" },
							{ key: "none", label: "Tidak ada", sub: "Skip" },
						] as const
					).map((opt) => {
						const active = transportMethod === opt.key;
						return (
							<button
								key={opt.key}
								type="button"
								onClick={() => setTransportMethod(opt.key)}
								className={`flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-xs transition-colors ${
									active
										? "border-primary bg-primary/10 text-foreground"
										: "border-border-default bg-surface-3 text-muted-foreground hover:bg-muted"
								}`}
							>
								<span className="font-semibold">{opt.label}</span>
								<span className="text-[11px] opacity-70">{opt.sub}</span>
							</button>
						);
					})}
				</div>

				{transportMethod === "online" && (
					<div className="space-y-3">
						<MoneyField
							label="Total transport (berangkat + pulang)"
							name="transport_cost_input"
							value={transportCost}
							onChange={setTransportCost}
						/>
						<div className="grid gap-3 sm:grid-cols-2">
							<SingleFileUpload
								projectId={projectId}
								kind="transport_proof"
								seq="berangkat"
								label="Bukti Berangkat"
								value={transportProofBerangkat}
								onChange={setTransportProofBerangkat}
							/>
							<SingleFileUpload
								projectId={projectId}
								kind="transport_proof"
								seq="pulang"
								label="Bukti Pulang"
								value={transportProofPulang}
								onChange={setTransportProofPulang}
							/>
						</div>
					</div>
				)}

				{transportMethod === "rental" && (
					<div className="grid gap-3 sm:grid-cols-2">
						<MoneyField
							label="Sewa mobil"
							name="transport_cost_input"
							value={transportCost}
							onChange={setTransportCost}
						/>
						<MoneyField
							label="Bensin"
							name="bensin_cost_input"
							value={bensinCost}
							onChange={setBensinCost}
						/>
					</div>
				)}

				<div className="grid gap-3 sm:grid-cols-2">
					<MoneyField
						label="E-toll"
						name="toll_cost_input"
						value={tollCost}
						onChange={setTollCost}
					/>
					<MoneyField
						label="Parkir"
						name="parking_cost_input"
						value={parkingCost}
						onChange={setParkingCost}
					/>
				</div>
			</NumberedSection>

			{/* ========== KONSUMSI & LAIN-LAIN ========== */}
			<NumberedSection
				step={6}
				title="Konsumsi & Lain-lain"
				description="Snack/makan crew + biaya insidental yang nggak masuk kategori di atas."
			>
				<MoneyField
					label="Konsumsi crew"
					name="konsumsi_cost_input"
					value={konsumsiCost}
					onChange={setKonsumsiCost}
				/>

				<div className="space-y-2">
					<div className="flex items-center justify-between gap-2">
						<p className="text-[13px] font-medium">
							Lain-lain{" "}
							<span className="text-muted-foreground text-xs font-normal">
								({lainnyaItems.length}/20)
							</span>
						</p>
						{lainnyaItems.length < 20 && (
							<button
								type="button"
								onClick={addLainnyaRow}
								className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
							>
								<Plus className="h-3 w-3" />
								Tambah baris
							</button>
						)}
					</div>
					{lainnyaItems.length === 0 ? (
						<p className="text-muted-foreground text-xs italic">
							Belum ada. Contoh: P3K, obat, parking insidental, dll.
						</p>
					) : (
						<ul className="space-y-2">
							{lainnyaItems.map((row, idx) => (
								<li
									key={idx}
									className="flex items-start gap-2 rounded-md border border-border-default bg-surface-3 p-2.5"
								>
									<input
										type="text"
										value={row.note}
										onChange={(e) =>
											updateLainnyaRow(idx, { note: e.target.value })
										}
										maxLength={120}
										placeholder="Keterangan (cth. P3K)"
										className={`${inputClass} flex-1`}
									/>
									<input
										type="number"
										inputMode="numeric"
										min={0}
										step={1000}
										value={row.amount}
										onChange={(e) =>
											updateLainnyaRow(idx, {
												amount: Math.max(0, Number(e.target.value) || 0),
											})
										}
										placeholder="0"
										className={`${inputClass} tabular w-32 text-right`}
									/>
									<button
										type="button"
										onClick={() => removeLainnyaRow(idx)}
										title="Hapus baris"
										className="text-muted-foreground hover:bg-muted hover:text-destructive inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								</li>
							))}
						</ul>
					)}
				</div>

				{fieldExpenseTotal > 0 && (
					<div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-xs">
						<Wallet className="h-3.5 w-3.5 text-primary" />
						<span className="text-muted-foreground">Total biaya lapangan:</span>
						<span className="tabular ml-auto font-semibold text-primary">
							{formatRupiah(fieldExpenseTotal)}
						</span>
					</div>
				)}
			</NumberedSection>

			{/* Hidden inputs for expense fields (Phase F2) */}
			<input type="hidden" name="transport_method" value={transportMethod} />
			<input
				type="hidden"
				name="transport_cost"
				value={transportMethod === "none" ? "0" : transportCost || "0"}
			/>
			<input
				type="hidden"
				name="transport_proof_berangkat_url"
				value={
					transportMethod === "online" ? (transportProofBerangkat ?? "") : ""
				}
			/>
			<input
				type="hidden"
				name="transport_proof_pulang_url"
				value={transportMethod === "online" ? (transportProofPulang ?? "") : ""}
			/>
			<input
				type="hidden"
				name="bensin_cost"
				value={transportMethod === "rental" ? bensinCost || "0" : "0"}
			/>
			<input type="hidden" name="toll_cost" value={tollCost || "0"} />
			<input type="hidden" name="parking_cost" value={parkingCost || "0"} />
			<input type="hidden" name="konsumsi_cost" value={konsumsiCost || "0"} />
			<input type="hidden" name="lainnya_items" value={lainnyaItemsJson} />

			{/* ========== BUKTI ========== */}
			<NumberedSection
				step={7}
				title="Bukti"
				description="Foto counter mesin, area event, atau consumable. Wajib minimal 1."
			>
				<RekapProofUpload
					projectId={projectId}
					initial={initialUrls.map((url) => ({
						url,
						name: extractName(url),
					}))}
					onChange={setProofUrls}
				/>
				<input type="hidden" name="proof_photo_urls" value={proofUrlsHidden} />
				{err("proof_photo_urls") && (
					<p className="text-xs text-destructive">{err("proof_photo_urls")}</p>
				)}

				<div className="space-y-1.5">
					<label htmlFor="crew_notes" className="text-[13px] font-medium">
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
			</NumberedSection>

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
				disabledLabel="Upload bukti dulu"
				disabledReason="Wajib upload minimal 1 foto bukti event"
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

// Auto-derived preview card for mediaset / sleeve. Shows the computed
// value + ratio info + HPP. Click "Sesuaikan" to enter manual override.
function AutoDerivedCard({
	label,
	value,
	exactValue,
	mapping,
	frameSize,
	touched,
	manualValue,
	onManualChange,
	onResetToAuto,
}: {
	label: string;
	value: number;
	/** Decimal exact value matching backend deduction (no Math.ceil). Cost
	 * preview uses this for accuracy; `value` is the integer submitted. */
	exactValue: number;
	mapping:
		| {
				rekap_field: string;
				frame_size: string;
				qty_per_unit: number;
				item: {
					sku: string;
					name: string;
					unit: string;
					purchase_price_avg: number;
					current_stock: number;
				} | null;
		  }
		| undefined;
	frameSize: string;
	touched: boolean;
	manualValue: string;
	onManualChange: (v: string) => void;
	onResetToAuto: () => void;
}) {
	if (!mapping || !mapping.item) {
		return (
			<div className="rounded-lg border border-dashed border-border-default bg-surface-3/40 p-3">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
					{label}
				</p>
				<p className="text-[13px] text-muted-foreground italic">
					Mapping belum di-set di Settings → Items Mapping
				</p>
			</div>
		);
	}
	const item = mapping.item;
	// Cost preview pakai EXACT decimal (match backend reality), bukan ceiled
	// integer. Backend deduct decimal qty, so display should reflect that.
	const cost = Math.round(exactValue * item.purchase_price_avg);
	const stockBefore = item.current_stock;
	const stockAfter = stockBefore - exactValue;
	const critical = exactValue > stockBefore;
	const lowAfter =
		stockBefore > 0 && stockAfter / Math.max(stockBefore, 1) < 0.1;
	const stockToneClass = critical
		? "bg-destructive/15 text-destructive"
		: lowAfter
			? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
			: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

	return (
		<div className="space-y-2 rounded-lg border border-border-default bg-surface-3 p-3">
			<div className="flex items-baseline justify-between gap-2">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
					{label}
					<span className="ml-1 text-[10px] font-medium text-primary">
						{touched ? "MANUAL" : "AUTO"}
					</span>
				</p>
				{touched ? (
					<button
						type="button"
						onClick={onResetToAuto}
						className="text-[11px] font-medium text-primary hover:underline"
					>
						Reset ke auto
					</button>
				) : (
					<button
						type="button"
						onClick={() => onManualChange(String(value))}
						className="text-[11px] font-medium text-muted-foreground hover:text-primary"
					>
						Sesuaikan
					</button>
				)}
			</div>
			{touched ? (
				<input
					type="number"
					min={0}
					value={manualValue}
					onChange={(e) => onManualChange(e.target.value)}
					className="tabular h-10 w-full rounded-md border border-border-default bg-background px-2 text-[18px] font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
			) : (
				<p className="tabular text-[18px] font-semibold leading-none text-foreground">
					{value.toLocaleString("id-ID")}{" "}
					<span className="text-[12px] font-normal text-muted-foreground">
						{item.unit}
					</span>
				</p>
			)}
			<div className="flex flex-wrap items-center gap-1.5 text-[11px]">
				<span className="tabular rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
					Rp {cost.toLocaleString("id-ID")}
				</span>
				{exactValue > 0 && (
					<span
						className={`tabular rounded-full px-2 py-0.5 font-medium ${stockToneClass}`}
					>
						Stok: {stockBefore.toLocaleString("id-ID")} →{" "}
						{stockAfter.toLocaleString("id-ID", {
							maximumFractionDigits: 3,
						})}
					</span>
				)}
				<span className="text-[11px] text-muted-foreground">
					{frameSize || "default"} ·{" "}
					{humanizeRatio(mapping.qty_per_unit, item.unit)}
				</span>
				{touched ? null : value !== exactValue && exactValue > 0 ? (
					<span className="text-[11px] italic text-muted-foreground/80">
						(submit dibulatkan ke {value} {item.unit}, deduct exact{" "}
						{exactValue.toLocaleString("id-ID", {
							maximumFractionDigits: 3,
						})}
						)
					</span>
				) : null}
			</div>
		</div>
	);
}

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
				<label htmlFor={name} className="text-[13px] font-medium">
					{label}
				</label>
				{auto && (
					<span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
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
				<label htmlFor={name} className="text-[13px] font-medium">
					{label}
				</label>
				{(paid > 0 || bonus > 0) && (
					<span className="text-[11px] text-muted-foreground">
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

function MoneyField({
	label,
	name,
	value,
	onChange,
}: {
	label: string;
	name: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-[13px] font-medium">
				{label}
			</label>
			<div className="relative">
				<span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs">
					Rp
				</span>
				<input
					id={name}
					name={name}
					type="number"
					inputMode="numeric"
					min={0}
					step={1000}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="0"
					className={`${inputClass} tabular pl-9`}
				/>
			</div>
		</div>
	);
}

function formatRelativeAge(ms: number): string {
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return "barusan";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min} menit lalu`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} jam lalu`;
	const day = Math.floor(hr / 24);
	return `${day} hari lalu`;
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
	"h-10 w-full rounded-md border border-border-default bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";
