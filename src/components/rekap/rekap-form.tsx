"use client";

import {
	AlertTriangle,
	Calculator,
	Check,
	CheckCircle2,
	Plus,
	Save,
	Wallet,
	X,
} from "lucide-react";
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
import { RichTextarea } from "@/components/ui/rich-textarea";
import type { RekapContext } from "@/lib/actions/rekap";
import { type RekapFormState, submitRekap } from "@/lib/actions/rekap";
import { formatRupiah } from "@/lib/format";
import { deriveRekapRatio } from "@/lib/rekap/cost";
import type { RekapField } from "@/lib/rekap-mapping/types";
import { cn } from "@/lib/utils";

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

/**
 * Fallback lembar per roll. Isi lembar per roll TERGANTUNG frame size —
 * 4R: 700, 2R/polaroid: 1400 — diturunkan dari ratio roll-per-lembar mapping
 * (kebalikannya). Konstanta ini hanya dipakai saat ratio tidak tersedia/nol.
 * 1 cetakan SELALU = 1 lembar, apa pun ukurannya.
 */
const FALLBACK_LEMBAR_PER_ROLL = 1400;

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
	lainnya_items: string; // JSON string of [{note, amount, paid_by?}]
	/** JSON map {transport|bensin|toll|parking|konsumsi: 'crew'|'owner'}. */
	expense_paid_by?: string;
	/** JSON map {transport|bensin|toll|parking|konsumsi: <drive_url>}. */
	expense_nota_urls?: string;
};

/** Siapa yang membayar sebuah biaya lapangan. */
type PaidBy = "crew" | "owner";
type PaidByKey = "transport" | "bensin" | "toll" | "parking" | "konsumsi";
const paidByOf = (v: unknown): PaidBy => (v === "owner" ? "owner" : "crew");

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
	expense_paid_by: "{}",
	expense_nota_urls: "{}",
};

export function RekapForm({
	eventId,
	projectId,
	defaults = EMPTY,
	mode,
	context,
	audience = "owner",
	cetakBenchmark = null,
}: {
	eventId: string;
	projectId: string;
	defaults?: Defaults;
	mode: "create" | "update";
	context: RekapContext;
	/**
	 * Who's filling this in. Crew just records what happened — they don't deal
	 * with stock levels, restock warnings, or auto/manual overrides (all of that
	 * is the owner's concern at settlement). Owner keeps the full toolset.
	 */
	audience?: "crew" | "owner";
	/**
	 * Median cetak for this package across past approved rekaps — drives a soft
	 * "is this number sane?" warning. Null/low-sample disables it.
	 */
	cetakBenchmark?: { typical: number; sampleSize: number } | null;
}) {
	const router = useRouter();
	const isCrew = audience === "crew";
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
	// Dependent ke flag event (include_flashdisk_pouch): event PAKAI flashdisk →
	// otomatis set flashdisk (= flashdisk+box+pouch); TIDAK pakai → pouch saja
	// (cetak foto pasti masuk pouch), tercentang otomatis tanpa aksi crew. Edit
	// mode tetap pakai nilai tersimpan.
	const fdFlag = context.pkg.include_flashdisk_pouch === true;
	const [flashdisk, setFlashdisk] = useState(() => {
		const d = get("flashdisk_used");
		return d !== "0" ? d : fdFlag ? "1" : "0";
	});
	const [pouch, setPouch] = useState(() => {
		const d = get("pouch_used");
		return d !== "0" ? d : fdFlag ? "0" : "1";
	});
	// Auto-isi photomagnet/keychain dari add-on event (paid + bonus) untuk rekap
	// baru — crew tinggal konfirmasi, tak perlu klik prefill. Edit mode pakai
	// nilai tersimpan.
	const expectedAddon = (re: RegExp) =>
		[...context.paid_addons, ...context.bonuses]
			.filter((a) => re.test(a.name))
			.reduce((s, a) => s + a.quantity, 0);
	const [photomagnet, setPhotomagnet] = useState(() => {
		const d = get("photomagnet_used");
		if (d !== "0") return d;
		const exp = expectedAddon(/photomagnet/i);
		return exp > 0 ? String(exp) : "0";
	});
	const [keychain, setKeychain] = useState(() => {
		const d = get("keychain_used");
		if (d !== "0") return d;
		const exp = expectedAddon(/keychain/i);
		return exp > 0 ? String(exp) : "0";
	});

	// Inline validation: flag total cetak the moment the user leaves the field
	// empty/zero, instead of a generic error only after submit.
	const [cetakBlurred, setCetakBlurred] = useState(false);

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
				// Clamp in JS (no HTML min/max — those silently block native form
				// submit with no feedback when out of range).
				next[sku] = Math.min(9999, Math.floor(qty));
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

	type LainnyaRow = {
		note: string;
		amount: number;
		paid_by: PaidBy;
		nota_url: string | null;
	};
	const initialLainnya = useMemo<LainnyaRow[]>(() => {
		try {
			const obj = JSON.parse(defaults.lainnya_items || "[]");
			if (Array.isArray(obj)) {
				return obj
					.map((row): LainnyaRow | null => {
						if (!row || typeof row !== "object") return null;
						const r = row as Record<string, unknown>;
						const note = String(r.note ?? "").slice(0, 120);
						const amount = Number(r.amount);
						if (!Number.isFinite(amount) || amount < 0) return null;
						return {
							note,
							amount: Math.round(amount),
							paid_by: paidByOf(r.paid_by),
							nota_url:
								typeof r.nota_url === "string" &&
								/^https?:\/\//.test(r.nota_url)
									? r.nota_url
									: null,
						};
					})
					.filter((v): v is LainnyaRow => v !== null)
					.slice(0, 20);
			}
		} catch {}
		return [];
	}, [defaults.lainnya_items]);
	const [lainnyaItems, setLainnyaItems] =
		useState<LainnyaRow[]>(initialLainnya);

	// Pembayar per biaya lapangan — tiap ITEM bisa ditalangi crew (di-rembers)
	// atau dibayar owner langsung. Default 'crew' (perilaku lama: masuk Hutang
	// Crew saat settle).
	const initialPaidBy = useMemo<Record<PaidByKey, PaidBy>>(() => {
		const base: Record<PaidByKey, PaidBy> = {
			transport: "crew",
			bensin: "crew",
			toll: "crew",
			parking: "crew",
			konsumsi: "crew",
		};
		try {
			const obj = JSON.parse(defaults.expense_paid_by || "{}");
			if (obj && typeof obj === "object" && !Array.isArray(obj)) {
				for (const k of Object.keys(base) as PaidByKey[]) {
					base[k] = paidByOf((obj as Record<string, unknown>)[k]);
				}
			}
		} catch {}
		return base;
	}, [defaults.expense_paid_by]);
	const [paidBy, setPaidBy] =
		useState<Record<PaidByKey, PaidBy>>(initialPaidBy);
	function setPaidByKey(key: PaidByKey, v: PaidBy) {
		setPaidBy((prev) => ({ ...prev, [key]: v }));
	}
	const expensePaidByJson = JSON.stringify(paidBy);

	// Nota/struk per biaya lapangan — masuk Arsip Nota lewat v_nota_sistem.
	// Sebelumnya cuma transport yang punya slot bukti, jadi jejak audit biaya
	// yang ditalangi crew bolong.
	const initialNota = useMemo<Partial<Record<PaidByKey, string>>>(() => {
		try {
			const obj = JSON.parse(defaults.expense_nota_urls || "{}");
			if (obj && typeof obj === "object" && !Array.isArray(obj)) {
				const out: Partial<Record<PaidByKey, string>> = {};
				for (const k of [
					"transport",
					"bensin",
					"toll",
					"parking",
					"konsumsi",
				] as PaidByKey[]) {
					const v = (obj as Record<string, unknown>)[k];
					if (typeof v === "string" && /^https?:\/\//.test(v)) out[k] = v;
				}
				return out;
			}
		} catch {}
		return {};
	}, [defaults.expense_nota_urls]);
	const [notaUrls, setNotaUrls] =
		useState<Partial<Record<PaidByKey, string>>>(initialNota);
	function setNotaUrl(key: PaidByKey, url: string | null) {
		setNotaUrls((prev) => {
			const next = { ...prev };
			if (url) next[key] = url;
			else delete next[key];
			return next;
		});
	}
	const expenseNotaJson = JSON.stringify(notaUrls);

	function addLainnyaRow() {
		setLainnyaItems((prev) =>
			prev.length >= 20
				? prev
				: [...prev, { note: "", amount: 0, paid_by: "crew", nota_url: null }],
		);
	}
	function updateLainnyaRow(idx: number, patch: Partial<LainnyaRow>) {
		setLainnyaItems((prev) =>
			prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
		);
	}
	function removeLainnyaRow(idx: number) {
		setLainnyaItems((prev) => prev.filter((_, i) => i !== idx));
	}

	const lainnyaItemsJson = JSON.stringify(lainnyaItems);

	// Total biaya lapangan + split talangan crew vs dibayar owner — angka split
	// inilah yang bikin owner langsung tahu berapa yang perlu di-rembers.
	const { fieldExpenseTotal, crewFrontedTotal, ownerPaidTotal } =
		useMemo(() => {
			const rows: Array<{ amount: number; payer: PaidBy }> = [
				{
					amount: transportMethod !== "none" ? Number(transportCost) || 0 : 0,
					payer: paidBy.transport,
				},
				{
					amount: transportMethod === "rental" ? Number(bensinCost) || 0 : 0,
					payer: paidBy.bensin,
				},
				{ amount: Number(tollCost) || 0, payer: paidBy.toll },
				{ amount: Number(parkingCost) || 0, payer: paidBy.parking },
				{ amount: Number(konsumsiCost) || 0, payer: paidBy.konsumsi },
				...lainnyaItems.map((r) => ({
					amount: r.amount || 0,
					payer: r.paid_by,
				})),
			];
			let crew = 0;
			let owner = 0;
			for (const r of rows) {
				if (r.payer === "owner") owner += r.amount;
				else crew += r.amount;
			}
			return {
				fieldExpenseTotal: crew + owner,
				crewFrontedTotal: crew,
				ownerPaidTotal: owner,
			};
		}, [
			transportMethod,
			transportCost,
			bensinCost,
			tollCost,
			parkingCost,
			konsumsiCost,
			lainnyaItems,
			paidBy,
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
			expense_paid_by: expensePaidByJson,
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
			expensePaidByJson,
		],
	);

	const {
		restoredValues,
		restoredAgeMs,
		saveState,
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
					const out: LainnyaRow[] = [];
					for (const row of parsed) {
						if (!row || typeof row !== "object") continue;
						const r = row as Record<string, unknown>;
						const note = String(r.note ?? "").slice(0, 120);
						const amount = Number(r.amount);
						if (!Number.isFinite(amount) || amount < 0) continue;
						out.push({
							note,
							amount: Math.round(amount),
							paid_by: paidByOf(r.paid_by),
							nota_url:
								typeof r.nota_url === "string" &&
								/^https?:\/\//.test(r.nota_url)
									? r.nota_url
									: null,
						});
						if (out.length >= 20) break;
					}
					setLainnyaItems(out);
				}
			} catch {}
		}
		const pb = restoredValues.expense_paid_by;
		if (pb) {
			try {
				const parsed = JSON.parse(pb);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					setPaidBy((prev) => {
						const next = { ...prev };
						for (const k of Object.keys(next) as PaidByKey[]) {
							next[k] = paidByOf((parsed as Record<string, unknown>)[k]);
						}
						return next;
					});
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

	// Auto-derived: mediaset dalam LEMBAR — 1 cetakan = 1 lembar untuk SEMUA
	// ukuran (4R/2R/polaroid). Yang beda per ukuran cuma isi roll (4R: 700
	// lembar, 2R/polaroid: 1400), dipakai untuk konversi harga/stok di kartu.
	// Dulu 4R salah tampil 2× cetak karena lembar-per-roll dipatok 1400.
	// Di-sync ke state saat belum di-override manual → preview, draft, & submit
	// konsisten. Deduct stok di belakang layar tetap dari cetak_total (roll).
	const cetakNum = Number(cetak) || 0;
	const mediaLembarPerRoll = (() => {
		const map = mappingByField.get("media_set_used");
		// qty_per_unit = roll per lembar (4R: 1/700, 2R/polaroid: 1/1400) →
		// kebalikannya = lembar per roll.
		return map && map.qty_per_unit > 0
			? 1 / map.qty_per_unit
			: FALLBACK_LEMBAR_PER_ROLL;
	})();
	const autoMediaLembar = (() => {
		const map = mappingByField.get("media_set_used");
		return map ? Math.round(cetakNum) : 0;
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

	// Per-field cost chip (owner-only — purchase_price_avg is zeroed for crew in
	// getRekapContext, so this renders nothing for crew). This is a per-field
	// estimate next to each input, NOT the settlement total: the canonical HPP
	// (incl. assembly box/pouch) is computed by planRekapDeduction and shown on
	// the owner rekap page's Ringkasan + Stok tabs.
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
	const fdPouchIncluded = fdFlag;

	// Progressive disclosure (crew only): optional sections start collapsed when
	// they have no data yet, so the form reads short and crew aren't scrolling
	// past empty blocks. Owner always sees everything expanded. `defaultOpen` is
	// read once on mount, and state is seeded from `defaults`, so this correctly
	// auto-expands sections that already have values in update mode.
	const fdSectionOpen = !isCrew || fdPouchIncluded || Number(flashdisk) > 0;
	const addonSectionOpen =
		!isCrew ||
		photomagnetPaid + photomagnetBonus + keychainPaid + keychainBonus > 0 ||
		Number(photomagnet) > 0 ||
		Number(keychain) > 0;
	const transportSectionOpen =
		!isCrew ||
		transportMethod !== "none" ||
		Number(tollCost) > 0 ||
		Number(parkingCost) > 0;
	const konsumsiSectionOpen =
		!isCrew || Number(konsumsiCost) > 0 || lainnyaItems.length > 0;

	// Soft validation warnings.
	const warnings = useMemo(() => {
		const w: string[] = [];
		const c = Number(cetak) || 0;

		// Cetak sanity check vs this package's history (crew + owner). Soft only —
		// never blocks submit; just nudges when the number looks way off. Needs a
		// real sample so we don't cry wolf on the first few events of a package.
		if (cetakBenchmark && cetakBenchmark.sampleSize >= 3 && c > 0) {
			const t = cetakBenchmark.typical;
			if (t > 0 && c >= t * 2.5) {
				w.push(
					`Total cetak ${c.toLocaleString("id-ID")} jauh di atas rata-rata paket ini (~${t.toLocaleString("id-ID")}). Pastikan benar.`,
				);
			} else if (t > 0 && c <= t * 0.4) {
				w.push(
					`Total cetak ${c.toLocaleString("id-ID")} jauh di bawah rata-rata paket ini (~${t.toLocaleString("id-ID")}). Yakin?`,
				);
			}
		}

		// Override-mismatch warnings are owner-only (crew can't override). Skip the
		// rest for crew to keep their view clean.
		if (isCrew) return w;
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
				// Pembanding dalam LEMBAR (satuan yang sama dengan input), bukan
				// roll — 1 cetak = 1 lembar.
				const expected = Math.round(c);
				if (m > 0 && Math.abs(m - expected) > expected * 0.5) {
					w.push(
						`Mediaset override ${m} berbeda jauh dari auto-derive (${expected}). Pastikan benar.`,
					);
				}
			}
		}
		return w;
	}, [cetak, sleeve, media, touched, mappingByField, isCrew, cetakBenchmark]);

	// Custom materials combobox options (exclude already-added)
	const customComboboxOptions = useMemo<ComboboxOption[]>(() => {
		return context.custom_inventory
			.filter((it) => !customMaterials[it.sku])
			.map((it) => ({
				value: it.id,
				label: `${it.sku} · ${it.name}`,
				sublabel: `Stok ${it.current_stock} ${it.unit}`,
			}));
	}, [context.custom_inventory, customMaterials]);

	const proofUrlsHidden = proofUrls.join("\n");
	const customMaterialsJson = JSON.stringify(customMaterials);

	// Submit gate — surface the blocker BEFORE submit (in the sticky bar) instead
	// of letting the server reject it. Cetak first (the core number), then proof.
	const submitBlock =
		cetakNum <= 0
			? {
					label: "Isi total cetak",
					reason: "Total cetak wajib diisi (lebih dari 0).",
				}
			: proofUrls.length === 0
				? {
						label: "Upload bukti dulu",
						reason: "Wajib upload minimal 1 foto bukti event.",
					}
				: null;

	return (
		<form action={formAction} className="space-y-5 pb-2">
			{/* Auto-save indicator — reassures crew the form survives an app close */}
			{saveState !== "idle" && !state?.success && (
				<p className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
					<Save
						className={cn("h-3 w-3", saveState === "saving" && "animate-pulse")}
					/>
					{saveState === "saving"
						? "Menyimpan draft…"
						: "Draft tersimpan otomatis"}
				</p>
			)}
			{state?.success && (
				<div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-fluid-body font-medium text-emerald-700 dark:text-emerald-300">
					<CheckCircle2 className="h-4 w-4" />
					Rekap tersimpan. Mengarahkan ke ringkasan…
				</div>
			)}
			{draftRestoredNotice && !state?.success && (
				<div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/60 p-3 text-fluid-caption leading-relaxed dark:border-blue-900 dark:bg-blue-950/30">
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
					<p className="text-fluid-body font-medium text-destructive">
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
				// Mediaset dalam LEMBAR — 1 cetak = 1 lembar untuk semua ukuran.
				const autoMedia = autoMediaLembar;
				const autoSleeve = autoSleeveQty;
				const finalMedia = touched.media_set_used
					? Number(media) || 0
					: autoMedia;
				const finalSleeve = touched.sleeve_used
					? Number(sleeve) || 0
					: autoSleeve;
				// Mapping versi lembar utk kartu Mediaset — cost & stok dikonversi
				// pakai isi roll SESUAI UKURAN (4R: 700, 2R/polaroid: 1400): avg ÷
				// lembarPerRoll = harga per lembar; stok roll × lembarPerRoll =
				// lembar. Angka kartu tetap akurat sambil tampil dalam lembar.
				const mediaMappingLembar = mediaMapping?.item
					? {
							...mediaMapping,
							qty_per_unit: mediaMapping.qty_per_unit * mediaLembarPerRoll,
							item: {
								...mediaMapping.item,
								unit: "lembar",
								purchase_price_avg:
									mediaMapping.item.purchase_price_avg / mediaLembarPerRoll,
								current_stock:
									mediaMapping.item.current_stock * mediaLembarPerRoll,
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
							onBlur={() => setCetakBlurred(true)}
							error={
								cetakBlurred && cetakNum <= 0
									? "Isi total cetak (lebih dari 0)."
									: err("cetak_total")
							}
							cost={fieldCost("cetak_total", cetakNum)}
							stock={isCrew ? null : fieldStock("cetak_total", cetakNum)}
							auto={false}
						/>
						{/* Auto-derived preview cards */}
						<div className="border-t border-border-subtle pt-4">
							<p className="text-fluid-caption text-muted-foreground">
								{isCrew ? (
									"Mediaset & sleeve dihitung otomatis dari total cetak — kamu nggak perlu isi."
								) : (
									<>
										Auto-dihitung dari total cetak — klik{" "}
										<span className="font-medium text-foreground">
											Sesuaikan
										</span>{" "}
										kalau perlu override manual.
									</>
								)}
							</p>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<AutoDerivedCard
								label="Mediaset"
								value={finalMedia}
								exactValue={touched.media_set_used ? finalMedia : autoMedia}
								mapping={mediaMappingLembar}
								frameSize={frameSize}
								touched={touched.media_set_used}
								manualValue={media}
								readOnly={isCrew}
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
								readOnly={isCrew}
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
						? "FD + Pouch itu 1 paket — biasanya 1 set per event. Centang aja kalau dipakai."
						: "Paket tidak include. Skip kecuali emang dipakai."
				}
				badge={
					fdPouchIncluded ? (
						<Badge variant="success">Include</Badge>
					) : (
						<Badge variant="secondary">Skip</Badge>
					)
				}
				defaultOpen={fdSectionOpen}
			>
				{(() => {
					const fdOn = (Number(flashdisk) || 0) > 0;
					const pouchN = Number(pouch) || 0;
					const fdStock = fieldStock("flashdisk_used", fdOn ? 1 : 0);
					const pouchStock = fieldStock("pouch_used", pouchN);
					const fdErr = err("flashdisk_used");
					const pouchErr = err("pouch_used");
					const fmt = (n: number) =>
						n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
					return (
						<div className="space-y-3">
							<input type="hidden" name="flashdisk_used" value={flashdisk} />
							<input type="hidden" name="pouch_used" value={pouch} />

							{/* Event PAKAI flashdisk → tampil set (flashdisk+box+pouch),
							    otomatis. Tidak pakai → cuma pouch (cetak foto). Crew tak
							    perlu pilih manual; ini ngikut flag di booking/edit event. */}
							{fdPouchIncluded && (
								<>
									{/* Flashdisk set = flashdisk + box + pouch (1:1:1) */}
									<button
										type="button"
										onClick={() => {
											setFlashdisk(fdOn ? "0" : "1");
											markTouched("flashdisk_used");
										}}
										aria-pressed={fdOn}
										className={cn(
											"flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors",
											fdOn
												? "border-primary/40 bg-primary/5"
												: "border-border-default bg-card hover:bg-secondary/40",
										)}
									>
										<span
											className={cn(
												"grid size-5 shrink-0 place-items-center rounded-[5px] border transition-colors",
												fdOn
													? "border-primary bg-[#059669] text-white"
													: "border-border-strong bg-background",
											)}
										>
											{fdOn ? (
												<Check
													className="size-3.5"
													strokeWidth={3}
													aria-hidden
												/>
											) : null}
										</span>
										<span className="min-w-0">
											<span className="block text-fluid-body font-medium text-foreground">
												Terpakai flashdisk
											</span>
											<span className="block text-fluid-caption text-muted-foreground">
												1 flashdisk = flashdisk + box + pouch — ketiganya
												otomatis ke-deduct.
											</span>
										</span>
									</button>
									{fdOn && fdStock && !isCrew ? (
										<p className="px-1 text-[12px] text-muted-foreground">
											Stok flashdisk:{" "}
											<span
												className={cn(
													"tabular font-medium",
													fdStock.critical
														? "text-destructive"
														: fdStock.lowAfter
															? "text-amber-700 dark:text-amber-400"
															: "text-foreground",
												)}
											>
												{fmt(fdStock.before)} → {fmt(fdStock.after)}
											</span>
										</p>
									) : null}
									{fdErr ? (
										<p className="text-fluid-caption text-destructive">
											{fdErr}
										</p>
									) : null}
								</>
							)}

							{/* Event TIDAK pakai flashdisk → hasil cetak foto masuk pouch.
							    Otomatis tercentang (default 1), crew tinggal sesuaikan jumlah. */}
							{!fdPouchIncluded && (
								<div className="rounded-lg border border-border-default bg-card p-4">
									<span className="block text-fluid-body font-medium text-foreground">
										Pouch (cetak foto)
									</span>
									<span className="mb-2 block text-fluid-caption text-muted-foreground">
										Jumlah pouch untuk hasil cetak foto klien. Otomatis terisi —
										sesuaikan kalau beda.
									</span>
									<input
										type="number"
										inputMode="numeric"
										min={0}
										value={pouch === "0" ? "" : pouch}
										onChange={(e) => {
											setPouch(e.target.value === "" ? "0" : e.target.value);
											markTouched("pouch_used");
										}}
										placeholder="0"
										className="tabular h-10 w-32 rounded-md border border-border-default bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
									/>
									{pouchN > 0 && pouchStock && !isCrew ? (
										<p className="mt-2 text-[12px] text-muted-foreground">
											Stok pouch:{" "}
											<span
												className={cn(
													"tabular font-medium",
													pouchStock.critical
														? "text-destructive"
														: pouchStock.lowAfter
															? "text-amber-700 dark:text-amber-400"
															: "text-foreground",
												)}
											>
												{fmt(pouchStock.before)} → {fmt(pouchStock.after)}
											</span>
										</p>
									) : null}
									{pouchErr ? (
										<p className="mt-1 text-fluid-caption text-destructive">
											{pouchErr}
										</p>
									) : null}
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
				defaultOpen={addonSectionOpen}
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
						stock={
							isCrew
								? null
								: fieldStock("photomagnet_used", Number(photomagnet) || 0)
						}
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
						stock={
							isCrew ? null : fieldStock("keychain_used", Number(keychain) || 0)
						}
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
							return (
								<li
									key={sku}
									className="flex items-center gap-2 rounded-md border border-border-default bg-surface-3 p-2.5"
								>
									<div className="min-w-0 flex-1">
										<p className="text-fluid-body font-medium text-foreground">
											{it.name}
										</p>
										<p className="font-mono text-[11px] text-muted-foreground">
											{it.sku} · Stok {it.current_stock} {it.unit}
										</p>
									</div>
									<input
										type="number"
										inputMode="numeric"
										value={qty}
										onChange={(e) =>
											updateCustomQty(sku, Number(e.target.value))
										}
										className="tabular h-9 w-20 rounded-md border border-border-default bg-background px-2 text-right text-[1rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									/>
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
				defaultOpen={transportSectionOpen}
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
								className={`flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-fluid-caption transition-colors ${
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
							paidBy={paidBy.transport}
							onPaidByChange={(v) => setPaidByKey("transport", v)}
							nota={{
								projectId,
								notaKey: "transport",
								url: notaUrls.transport ?? null,
								onChange: (u) => setNotaUrl("transport", u),
							}}
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
							paidBy={paidBy.transport}
							onPaidByChange={(v) => setPaidByKey("transport", v)}
							nota={{
								projectId,
								notaKey: "transport",
								url: notaUrls.transport ?? null,
								onChange: (u) => setNotaUrl("transport", u),
							}}
						/>
						<MoneyField
							label="Bensin"
							name="bensin_cost_input"
							value={bensinCost}
							onChange={setBensinCost}
							paidBy={paidBy.bensin}
							onPaidByChange={(v) => setPaidByKey("bensin", v)}
							nota={{
								projectId,
								notaKey: "bensin",
								url: notaUrls.bensin ?? null,
								onChange: (u) => setNotaUrl("bensin", u),
							}}
						/>
					</div>
				)}

				<div className="grid gap-3 sm:grid-cols-2">
					<MoneyField
						label="E-toll"
						name="toll_cost_input"
						value={tollCost}
						onChange={setTollCost}
						paidBy={paidBy.toll}
						onPaidByChange={(v) => setPaidByKey("toll", v)}
						nota={{
							projectId,
							notaKey: "toll",
							url: notaUrls.toll ?? null,
							onChange: (u) => setNotaUrl("toll", u),
						}}
					/>
					<MoneyField
						label="Parkir"
						name="parking_cost_input"
						value={parkingCost}
						onChange={setParkingCost}
						paidBy={paidBy.parking}
						onPaidByChange={(v) => setPaidByKey("parking", v)}
						nota={{
							projectId,
							notaKey: "parking",
							url: notaUrls.parking ?? null,
							onChange: (u) => setNotaUrl("parking", u),
						}}
					/>
				</div>
			</NumberedSection>

			{/* ========== KONSUMSI & LAIN-LAIN ========== */}
			<NumberedSection
				step={6}
				title="Konsumsi & Lain-lain"
				description="Snack/makan crew + biaya insidental yang nggak masuk kategori di atas."
				defaultOpen={konsumsiSectionOpen}
			>
				<MoneyField
					label="Konsumsi crew"
					name="konsumsi_cost_input"
					value={konsumsiCost}
					onChange={setKonsumsiCost}
					paidBy={paidBy.konsumsi}
					onPaidByChange={(v) => setPaidByKey("konsumsi", v)}
					nota={{
						projectId,
						notaKey: "konsumsi",
						url: notaUrls.konsumsi ?? null,
						onChange: (u) => setNotaUrl("konsumsi", u),
					}}
				/>

				<div className="space-y-2">
					<div className="flex items-center justify-between gap-2">
						<p className="text-fluid-body font-medium">
							Lain-lain{" "}
							<span className="text-muted-foreground text-fluid-caption font-normal">
								({lainnyaItems.length}/20)
							</span>
						</p>
						{lainnyaItems.length < 20 && (
							<button
								type="button"
								onClick={addLainnyaRow}
								className="text-primary inline-flex items-center gap-1 text-fluid-caption font-medium hover:underline"
							>
								<Plus className="h-3 w-3" />
								Tambah baris
							</button>
						)}
					</div>
					{lainnyaItems.length === 0 ? (
						<p className="text-muted-foreground text-fluid-caption italic">
							Belum ada. Contoh: P3K, obat, parking insidental, dll.
						</p>
					) : (
						<ul className="space-y-2">
							{lainnyaItems.map((row, idx) => (
								<li
									key={idx}
									className="space-y-2 rounded-md border border-border-default bg-surface-3 p-2.5"
								>
									<div className="flex items-start gap-2">
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
											step={1}
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
									</div>
									{row.amount > 0 && (
										<PaidByToggle
											value={row.paid_by}
											onChange={(v) => updateLainnyaRow(idx, { paid_by: v })}
											compact
										/>
									)}
								</li>
							))}
						</ul>
					)}
				</div>

				{fieldExpenseTotal > 0 && (
					<div className="space-y-1.5 rounded-md bg-primary/5 px-3 py-2 text-fluid-caption">
						<div className="flex items-center gap-2">
							<Wallet className="h-3.5 w-3.5 text-primary" />
							<span className="text-muted-foreground">
								Total biaya lapangan:
							</span>
							<span className="tabular ml-auto font-semibold text-primary">
								{formatRupiah(fieldExpenseTotal)}
							</span>
						</div>
						{crewFrontedTotal > 0 && (
							<div className="flex items-center justify-between gap-2 text-amber-700 dark:text-amber-300">
								<span>💸 Ditalangi crew (di-rembers)</span>
								<span className="tabular font-medium">
									{formatRupiah(crewFrontedTotal)}
								</span>
							</div>
						)}
						{ownerPaidTotal > 0 && (
							<div className="flex items-center justify-between gap-2 text-emerald-700 dark:text-emerald-300">
								<span>✓ Dibayar owner</span>
								<span className="tabular font-medium">
									{formatRupiah(ownerPaidTotal)}
								</span>
							</div>
						)}
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
			<input type="hidden" name="expense_paid_by" value={expensePaidByJson} />

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
					<p className="text-fluid-caption text-destructive">
						{err("proof_photo_urls")}
					</p>
				)}

				<div className="space-y-1.5">
					<label htmlFor="crew_notes" className="text-fluid-body font-medium">
						Catatan crew
					</label>
					<RichTextarea
						id="crew_notes"
						name="crew_notes"
						rows={3}
						maxLength={1000}
						defaultValue={get("crew_notes")}
						placeholder="Apa yang perlu owner tahu — alat rusak, request klien, dst"
						toolbar={false}
					/>
				</div>
			</NumberedSection>

			{/* Soft warnings */}
			{warnings.length > 0 && (
				<ul className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-fluid-caption dark:border-amber-900 dark:bg-amber-950/30">
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
				cetakTotal={Number(cetak) || 0}
				pending={pending}
				submitLabel={mode === "create" ? "Submit rekap" : "Update rekap"}
				disabled={Boolean(submitBlock)}
				disabledLabel={submitBlock?.label}
				disabledReason={submitBlock?.reason}
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
	readOnly = false,
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
	/** Crew view: read-only, no override, no stock/ratio (owner-only details). */
	readOnly?: boolean;
	onManualChange: (v: string) => void;
	onResetToAuto: () => void;
}) {
	if (!mapping || !mapping.item) {
		// Crew don't manage mappings — hide the settings hint, just show the value.
		if (readOnly) {
			return (
				<div className="rounded-lg border border-border-default bg-card p-4">
					<div className="flex items-center gap-2">
						<span className="eyebrow text-muted-foreground">{label}</span>
						<span className="rounded bg-secondary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
							Otomatis
						</span>
					</div>
					<p className="tabular mt-2.5 text-[26px] font-semibold leading-none text-foreground">
						{value.toLocaleString("id-ID")}
					</p>
				</div>
			);
		}
		return (
			<div className="rounded-lg border border-dashed border-border-default bg-card p-4">
				<p className="eyebrow text-muted-foreground">{label}</p>
				<p className="mt-1.5 text-fluid-caption text-muted-foreground italic">
					Mapping belum di-set di Settings → Items Mapping
				</p>
			</div>
		);
	}
	const item = mapping.item;

	// Crew view: a calm, read-only confirmation. No override, no stock, no ratio
	// jargon, no restock warnings — that's all owner territory at settlement.
	if (readOnly) {
		return (
			<div className="rounded-lg border border-border-default bg-card p-4">
				<div className="flex items-center gap-2">
					<span className="eyebrow text-muted-foreground">{label}</span>
					<span className="rounded bg-secondary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
						Otomatis
					</span>
				</div>
				<p className="tabular mt-2.5 text-[26px] font-semibold leading-none text-foreground">
					{value.toLocaleString("id-ID")}
					<span className="ml-1.5 text-[13px] font-normal text-muted-foreground">
						{item.unit}
					</span>
				</p>
			</div>
		);
	}
	// Cost preview pakai EXACT decimal (match backend reality), bukan ceiled
	// integer. Backend deduct decimal qty, so display should reflect that.
	const cost = Math.round(exactValue * item.purchase_price_avg);
	const stockBefore = item.current_stock;
	const stockAfter = stockBefore - exactValue;
	const critical = exactValue > stockBefore;
	const lowAfter =
		stockBefore > 0 && stockAfter / Math.max(stockBefore, 1) < 0.1;
	const stockValueClass = critical
		? "text-destructive"
		: lowAfter
			? "text-amber-700 dark:text-amber-400"
			: "text-foreground";
	const fmt = (n: number) =>
		n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

	return (
		<div
			className={cn(
				"rounded-lg border bg-card p-4",
				critical ? "border-destructive/40" : "border-border-default",
			)}
		>
			{/* Header — name + auto/manual state + override toggle */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className="eyebrow text-muted-foreground">{label}</span>
					<span
						className={cn(
							"rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
							touched
								? "bg-primary/10 text-primary"
								: "bg-secondary text-muted-foreground",
						)}
					>
						{touched ? "Manual" : "Auto"}
					</span>
				</div>
				<button
					type="button"
					onClick={
						touched ? onResetToAuto : () => onManualChange(String(value))
					}
					className="text-[12px] font-medium text-primary transition-colors hover:underline"
				>
					{touched ? "Reset ke auto" : "Sesuaikan"}
				</button>
			</div>

			{/* Quantity — big display or editable input */}
			{touched ? (
				<input
					type="number"
					min={0}
					value={manualValue}
					onChange={(e) => onManualChange(e.target.value)}
					className="tabular mt-2.5 h-11 w-full rounded-md border border-border-default bg-background px-3 text-[22px] font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
			) : (
				<p className="tabular mt-2.5 text-[26px] font-semibold leading-none text-foreground">
					{value.toLocaleString("id-ID")}
					<span className="ml-1.5 text-[13px] font-normal text-muted-foreground">
						{item.unit}
					</span>
				</p>
			)}

			{/* Breakdown — labeled rows so each number is unambiguous. No HPP/cost
			    here: crew view, material cost is a business secret. */}
			<dl className="mt-3.5 space-y-2 border-t border-border-subtle pt-3">
				{exactValue > 0 && (
					<div className="flex items-baseline justify-between gap-3">
						<dt className="text-[12px] text-muted-foreground">Stok setelah</dt>
						<dd
							className={cn("tabular text-[13px] font-medium", stockValueClass)}
						>
							{fmt(stockBefore)} → {fmt(stockAfter)}
						</dd>
					</div>
				)}
				<div className="flex items-baseline justify-between gap-3">
					<dt className="text-[12px] text-muted-foreground">Rasio</dt>
					<dd className="text-[12px] text-muted-foreground">
						{frameSize || "default"} ·{" "}
						{humanizeRatio(mapping.qty_per_unit, item.unit)}
					</dd>
				</div>
			</dl>

			{/* Stock alert — surfaced loud because it blocks settlement */}
			{critical ? (
				<p className="mt-3 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[12px] font-medium text-destructive">
					<AlertTriangle className="size-3.5 shrink-0" aria-hidden />
					Stok {item.name} tidak cukup — perlu restock.
				</p>
			) : lowAfter ? (
				<p className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-400">
					<AlertTriangle className="size-3.5 shrink-0" aria-hidden />
					Stok menipis setelah event.
				</p>
			) : null}

			{/* Rounding note (auto mode, integer submit vs decimal deduct) */}
			{!touched && value !== exactValue && exactValue > 0 ? (
				<p className="mt-2 text-[11px] italic text-muted-foreground/80">
					Angka di-submit dibulatkan ke {value} {item.unit}; deduct stok pakai{" "}
					{fmt(exactValue)}.
				</p>
			) : null}
		</div>
	);
}

function NumField({
	label,
	name,
	value,
	onChange,
	onBlur,
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
	onBlur?: () => void;
	error?: string;
	hint?: string;
	cost: number;
	stock: StockInfo | null;
	auto: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline gap-1.5">
				<label htmlFor={name} className="text-fluid-body font-medium">
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
				onBlur={(e) => {
					// Sanitize on blur so a stray "-" / non-number never reaches the
					// server (which rejects negatives post-submit).
					const n = Number(e.target.value);
					if (!Number.isFinite(n) || n < 0) onChange("0");
					onBlur?.();
				}}
				className={`${inputClass} tabular`}
			/>

			{/* HPP chip / stock chip / hint / error */}
			{error ? (
				<p className="text-fluid-caption text-destructive">{error}</p>
			) : (
				<div className="flex flex-wrap items-center gap-1.5 text-[11px]">
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
					{!stock && hint ? (
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
				<label htmlFor={name} className="text-fluid-body font-medium">
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
				onBlur={(e) => {
					const n = Number(e.target.value);
					if (!Number.isFinite(n) || n < 0) onChange("0");
				}}
				className={`${inputClass} tabular`}
			/>
			{error ? (
				<p className="text-fluid-caption text-destructive">{error}</p>
			) : (
				<div className="flex flex-wrap items-center gap-1.5 text-[11px]">
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

/**
 * Toggle kecil "siapa yang bayar" per item biaya. Muncul di bawah tiap input
 * uang saat nilainya > 0 — crew memutus per ITEM: ditalangi sendiri (nanti
 * di-rembers) atau sudah dibayar owner (uang perusahaan).
 */
function PaidByToggle({
	value,
	onChange,
	compact = false,
}: {
	value: PaidBy;
	onChange: (v: PaidBy) => void;
	compact?: boolean;
}) {
	const opts: Array<{ key: PaidBy; label: string }> = [
		{ key: "crew", label: compact ? "Uang crew" : "Uang crew · di-rembers" },
		{ key: "owner", label: compact ? "Owner" : "Dibayar owner" },
	];
	return (
		<div
			aria-label="Siapa yang bayar"
			className="inline-flex rounded-full border border-border-default bg-surface-3 p-0.5"
		>
			{opts.map((o) => {
				const active = value === o.key;
				return (
					<button
						key={o.key}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(o.key)}
						className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
							active
								? o.key === "crew"
									? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
									: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

function MoneyField({
	label,
	name,
	value,
	onChange,
	paidBy,
	onPaidByChange,
	nota,
}: {
	label: string;
	name: string;
	value: string;
	onChange: (v: string) => void;
	/** Kalau di-set (bareng onPaidByChange), tampilkan toggle pembayar saat nilai > 0. */
	paidBy?: PaidBy;
	onPaidByChange?: (v: PaidBy) => void;
	/** Slot nota/struk — muncul saat nilai > 0, ikut ke Arsip Nota. */
	nota?: {
		projectId: string;
		notaKey: string;
		url: string | null;
		onChange: (url: string | null) => void;
	};
}) {
	const hasAmount = (Number(value) || 0) > 0;
	const showPaidBy =
		paidBy !== undefined && onPaidByChange !== undefined && hasAmount;
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-fluid-body font-medium">
				{label}
			</label>
			<div className="relative">
				<span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fluid-caption">
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
					onChange={(e) => onChange(e.target.value)}
					onBlur={(e) => {
						const n = Number(e.target.value);
						if (!Number.isFinite(n) || n < 0) onChange("0");
					}}
					placeholder="0"
					className={`${inputClass} tabular pl-9`}
				/>
			</div>
			{showPaidBy ? (
				<PaidByToggle value={paidBy} onChange={onPaidByChange} />
			) : null}
			{nota && hasAmount ? (
				<SingleFileUpload
					projectId={nota.projectId}
					kind="nota"
					seq={nota.notaKey}
					label={`Nota ${label.toLowerCase()}`}
					value={nota.url}
					onChange={nota.onChange}
				/>
			) : null}
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

// 16px text is deliberate: iOS Safari zooms the viewport on focus when an input
// is < 16px. h-11 = 44px touch target.
const inputClass =
	"h-11 w-full rounded-xl border border-border-default bg-background px-3.5 text-[1rem] text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";
