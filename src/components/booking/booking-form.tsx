"use client";

import {
	AlertTriangle,
	CheckCircle2,
	Gift,
	Loader2,
	MapPin,
	Sparkles,
	Users,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { TimePicker } from "@/components/ui/time-picker";
import type { BookingFormState, BookingInput } from "@/lib/actions/bookings";
import {
	ADDON_CATEGORY_LABELS,
	CHANNEL_TYPE_LABELS,
	FRAME_SIZE_LABELS,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";

const CHANNEL_OPTIONS = Object.entries(CHANNEL_TYPE_LABELS);

const FIELD_LABELS: Record<string, string> = {
	channel: "Sales Channel",
	client_name: "Nama Klien",
	client_wa: "WA Pembooking",
	client_email: "Email Klien",
	service_type: "Service Type",
	package_id: "Paket",
	frame_size: "Frame Size",
	event_category: "Tipe Acara",
	event_date: "Tanggal Event",
	setup_time: "Waktu Setup",
	start_time: "Waktu Mulai",
	end_time: "Waktu Selesai",
	booker_name: "Nama Pembooking",
	venue_name: "Nama Venue",
	venue_address: "Alamat",
	venue_city: "Kota / Kabupaten",
	venue_province: "Provinsi",
	google_maps_url: "Google Maps URL",
	vendor_name: "Nama Vendor",
	vendor_pic_name: "Nama PIC Vendor",
	vendor_contact: "WA / Kontak Vendor",
	vendor_commission_mode: "Skema Komisi Vendor",
	vendor_commission_value_type: "Tipe Nilai Komisi",
	vendor_commission_value: "Nilai Komisi Vendor",
	vendor_commission_rate: "Komisi Vendor (%)",
	vendor_commission_amount: "Komisi Vendor (Rp)",
	referrer_user_id: "Relasi (User)",
	referrer_type: "Tipe Relasi",
	referrer_commission: "Komisi Relasi",
	pic_name: "Nama PIC di Lokasi",
	pic_wa: "WA PIC di Lokasi",
	backdrop_id: "Backdrop",
	vendor_decor_markup: "Markup Vendor Decor",
	base_price: "Base Price",
	discount_amount: "Discount",
	gross_up_pph_amount: "Gross-up PPh",
	discount_type: "Tipe Diskon",
	crew_notes: "Catatan Crew",
};
const SERVICE_TYPE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS);
const FRAME_SIZE_OPTIONS = Object.entries(FRAME_SIZE_LABELS);

const BACKDROP_TYPE_LABEL: Record<string, string> = {
	basic_included: "Basic (gratis)",
	rental_owned: "Rental",
	vendor_decor: "Vendor Decor",
};

type Action = (
	prev: BookingFormState,
	formData: FormData,
) => Promise<BookingFormState>;

export type PackageOption = {
	id: string;
	name: string;
	category: string;
	frame_size: string;
	duration_hours: number;
	base_price: number;
};

export type AddonOption = {
	id: string;
	name: string;
	category: string;
	unit: string;
	price: number;
};

export type BackdropOption = {
	id: string;
	code: string;
	name: string;
	type:
		| "basic_included"
		| "rental_owned"
		| "vendor_decor"
		| "client_provided";
	rental_price: number;
};

export type EventTypeOption = {
	code: string;
	label: string;
};

export type RelasiOption = {
	id: string;
	full_name: string;
	role: string;
};

export type VendorOption = {
	name: string;
	pic_name: string | null;
	contact: string | null;
	/** Commission scheme from vendor master. Auto-fills booking form
	 * when an existing vendor is picked. Free-text new vendors send null. */
	commission_mode?: "commission" | "upfront_cut" | null;
	commission_value_type?: "percent" | "flat" | null;
	commission_value?: number | null;
	/** Legacy: percent rate (deprecated, prefer commission_value above). */
	commission_rate?: number | null;
};

export type AddonSelection = { addon_id: string; quantity: number };
export type BonusSelection = {
	addon_id: string;
	quantity: number;
	notes?: string | null;
};

export type BookingFormDefaults = Partial<{
	channel: string;
	client_name: string;
	client_wa: string;
	client_email: string;
	service_type: string;
	package_id: string;
	frame_size: string;
	event_category: string;
	event_date: string;
	setup_time: string;
	start_time: string;
	end_time: string;
	booker_name: string;
	venue_name: string;
	venue_address: string;
	venue_city: string;
	venue_province: string;
	google_maps_url: string;
	vendor_name: string;
	vendor_pic_name: string;
	vendor_contact: string;
	vendor_commission_mode: string;
	vendor_commission_value_type: string;
	vendor_commission_value: number;
	vendor_commission_rate: number;
	vendor_commission_amount: number;
	referrer_user_id: string;
	referrer_type: string;
	referrer_commission: number;
	pic_name: string;
	pic_wa: string;
	backdrop_id: string;
	vendor_decor_markup: number;
	include_flashdisk_pouch: boolean;
	base_price: number;
	discount_amount: number;
	gross_up_pph_amount: number;
	crew_notes: string;
	addons: AddonSelection[];
	bonuses: BonusSelection[];
}>;

/**
 * Category-specific helper fields. Each entry maps event_category code
 * to a small form that builds a structured client_name like
 * "Andi & Sari" (wedding) or "PT Mahaka — Annual Gathering" (corporate).
 *
 * Owner can always override client_name manually.
 */
const CATEGORY_HINTS: Record<
	string,
	{
		hint: string;
		fields: Array<{
			key: string;
			label: string;
			placeholder?: string;
		}>;
		assemble: (vals: Record<string, string>) => string;
	}
> = {
	pernikahan: {
		hint: "Tetra suggest: gabungkan nama kedua pengantin",
		fields: [
			{ key: "groom", label: "Nama Pengantin Pria", placeholder: "Andi" },
			{ key: "bride", label: "Nama Pengantin Wanita", placeholder: "Sari" },
		],
		assemble: (v) =>
			[v.groom, v.bride].filter(Boolean).join(" & ").trim() || "",
	},
	wedding: {
		hint: "Tetra suggest: gabungkan nama kedua pengantin",
		fields: [
			{ key: "groom", label: "Nama Pengantin Pria", placeholder: "Andi" },
			{ key: "bride", label: "Nama Pengantin Wanita", placeholder: "Sari" },
		],
		assemble: (v) =>
			[v.groom, v.bride].filter(Boolean).join(" & ").trim() || "",
	},
	birthday: {
		hint: "Nama yang berulang tahun + (opsional) usia/tema",
		fields: [
			{
				key: "celebrant",
				label: "Nama yang Berulang Tahun",
				placeholder: "Andi",
			},
			{
				key: "age",
				label: "Usia / Tema (opsional)",
				placeholder: "Sweet 17",
			},
		],
		assemble: (v) =>
			v.age ? `${v.celebrant ?? ""} ${v.age}`.trim() : (v.celebrant ?? ""),
	},
	wisuda: {
		hint: "Nama instansi + nama angkatan/acara",
		fields: [
			{
				key: "instansi",
				label: "Sekolah / Kampus",
				placeholder: "SMA Negeri 1 Bogor",
			},
			{ key: "event_name", label: "Nama Acara / Angkatan", placeholder: "Wisuda 2026" },
		],
		assemble: (v) =>
			[v.instansi, v.event_name].filter(Boolean).join(" — "),
	},
	corporate: {
		hint: "Nama perusahaan/EO + nama acara",
		fields: [
			{ key: "company", label: "Perusahaan / EO", placeholder: "PT Mahaka" },
			{ key: "event_name", label: "Nama Acara", placeholder: "Annual Gathering 2026" },
		],
		assemble: (v) =>
			[v.company, v.event_name].filter(Boolean).join(" — "),
	},
	gathering: {
		hint: "Nama perusahaan/EO + nama acara",
		fields: [
			{ key: "company", label: "Perusahaan / EO", placeholder: "PT Mahaka" },
			{ key: "event_name", label: "Nama Acara", placeholder: "Family Gathering" },
		],
		assemble: (v) =>
			[v.company, v.event_name].filter(Boolean).join(" — "),
	},
};

const DISCOUNT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "", label: "— pilih tipe diskon —" },
	{ value: "promo", label: "Promo (musiman / campaign)" },
	{ value: "loyalty", label: "Loyalty (klien repeat)" },
	{ value: "relasi", label: "Relasi (kenalan / referral)" },
	{ value: "owner_override", label: "Owner Override (diskon manual)" },
	{ value: "package_deal", label: "Package Deal (bundling)" },
	{ value: "other", label: "Lainnya" },
];

export function BookingForm({
	action,
	packages,
	addons,
	backdrops,
	eventTypes,
	relasiOptions = [],
	vendorOptions = [],
	grossupRate = 2,
	defaults,
	submitLabel = "Save as draft",
}: {
	action: Action;
	packages: PackageOption[];
	addons: AddonOption[];
	backdrops: BackdropOption[];
	eventTypes: EventTypeOption[];
	relasiOptions?: RelasiOption[];
	vendorOptions?: VendorOption[];
	grossupRate?: number;
	defaults?: BookingFormDefaults;
	submitLabel?: string;
}) {
	const [state, formAction, pending] = useActionState(action, undefined);
	const router = useRouter();

	// Narrow union: success state has `ok`; failure state has `errors`/`values`.
	const stateValues =
		state && "values" in state ? state.values : undefined;
	const stateErrors =
		state && "errors" in state ? state.errors : undefined;
	const stateOk = state && "ok" in state ? state : null;

	const get = (key: keyof BookingInput, fallback?: string) =>
		stateValues?.[key] ??
		(
			defaults?.[key as keyof BookingFormDefaults] as
				| string
				| number
				| undefined
		)?.toString() ??
		fallback ??
		"";

	const err = (key: keyof BookingInput) => stateErrors?.[key]?.[0];

	// Save feedback popup state machine
	const [saveOverlay, setSaveOverlay] = useState<
		| { kind: "saving" }
		| { kind: "success"; projectId: string; isUpdate: boolean }
		| {
				kind: "error";
				message: string;
				fields: Array<{ name: string; label: string; message: string }>;
		  }
		| null
	>(null);

	useEffect(() => {
		if (pending) {
			setSaveOverlay({ kind: "saving" });
		}
	}, [pending]);

	useEffect(() => {
		if (pending) return;
		if (stateOk) {
			setSaveOverlay({
				kind: "success",
				projectId: stateOk.projectId,
				isUpdate: Boolean(stateOk.isUpdate),
			});
			const timer = setTimeout(() => {
				router.push(`/operations/${stateOk.projectId}`);
			}, 1100);
			return () => clearTimeout(timer);
		}
		if (stateErrors) {
			const formErr = stateErrors._form?.[0];
			const fieldEntries = Object.entries(stateErrors)
				.filter(
					([k, v]) => k !== "_form" && Array.isArray(v) && v.length > 0,
				)
				.map(([k, v]) => ({
					name: k,
					label: FIELD_LABELS[k] ?? k,
					message: (v as string[])[0] ?? "Field tidak valid",
				}));
			const headline =
				formErr ??
				(fieldEntries.length > 0
					? `Ada ${fieldEntries.length} field yang belum valid:`
					: "Gagal menyimpan. Coba lagi.");
			setSaveOverlay({
				kind: "error",
				message: headline,
				fields: fieldEntries,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state, pending]);

	// === Channel & Referrer
	const [channel, setChannel] = useState(get("channel", "direct"));
	const [vendorName, setVendorName] = useState(get("vendor_name"));
	const [vendorPicName, setVendorPicName] = useState(get("vendor_pic_name"));
	const [vendorContact, setVendorContact] = useState(get("vendor_contact"));
	// New commission model — see migration 20260520_vendor_commission_mode.sql
	const [vendorCommissionMode, setVendorCommissionMode] = useState<
		"commission" | "upfront_cut"
	>(() => {
		const v = get("vendor_commission_mode", "commission");
		return v === "upfront_cut" ? "upfront_cut" : "commission";
	});
	const [vendorCommissionValueType, setVendorCommissionValueType] = useState<
		"percent" | "flat"
	>(() => {
		const v = get("vendor_commission_value_type", "percent");
		return v === "flat" ? "flat" : "percent";
	});
	const [vendorCommissionValue, setVendorCommissionValue] = useState(
		get("vendor_commission_value", "10"),
	);
	const [referrerUserId, setReferrerUserId] = useState(get("referrer_user_id"));
	const [referrerCommission, setReferrerCommission] = useState(
		get("referrer_commission"),
	);

	// === Event Category + sub-fields
	const [eventCategory, setEventCategory] = useState(get("event_category", ""));
	const [categoryMeta, setCategoryMeta] = useState<Record<string, string>>({});

	// Resolve category template
	const categoryTpl = useMemo(
		() => CATEGORY_HINTS[eventCategory] ?? null,
		[eventCategory],
	);

	// === Client name (auto-derived from category sub-fields, can be overridden)
	const [clientName, setClientName] = useState(get("client_name"));
	const [clientNameTouched, setClientNameTouched] = useState(
		Boolean(get("client_name")),
	);

	useEffect(() => {
		if (categoryTpl && !clientNameTouched) {
			const assembled = categoryTpl.assemble(categoryMeta).trim();
			if (assembled) setClientName(assembled);
		}
	}, [categoryMeta, categoryTpl, clientNameTouched]);

	// === Service & Package
	const [serviceType, setServiceType] = useState(get("service_type", ""));
	const [frameSize, setFrameSize] = useState(get("frame_size", ""));
	const initialPkgId = stateValues?.package_id ?? defaults?.package_id ?? "";
	const [packageId, setPackageId] = useState(initialPkgId);
	const initialBase = Number(
		stateValues?.base_price ?? defaults?.base_price ?? 0,
	);
	const [basePrice, setBasePrice] = useState(initialBase);

	const selectedPkg = useMemo(
		() => packages.find((p) => p.id === packageId),
		[packageId, packages],
	);

	// Filter packages by service_type + frame_size — owner only sees relevant
	// paket. If service_type or frame_size empty, show all (initial state).
	const filteredPackages = useMemo(() => {
		return packages.filter((p) => {
			if (serviceType && p.category !== serviceType) return false;
			if (frameSize && p.frame_size !== frameSize && p.frame_size !== "none")
				return false;
			return true;
		});
	}, [packages, serviceType, frameSize]);

	// If currently selected paket no longer in filter, clear it
	useEffect(() => {
		if (!packageId) return;
		const stillVisible = filteredPackages.some((p) => p.id === packageId);
		if (!stillVisible) {
			setPackageId("");
		}
	}, [filteredPackages, packageId]);

	// === Schedule (auto-fill setup/end)
	const [eventDate, setEventDate] = useState(get("event_date", ""));
	const [setupTime, setSetupTime] = useState(get("setup_time", ""));
	const [startTime, setStartTime] = useState(get("start_time", ""));
	const [endTime, setEndTime] = useState(get("end_time", ""));
	const [setupTouched, setSetupTouched] = useState(Boolean(get("setup_time")));
	const [endTouched, setEndTouched] = useState(Boolean(get("end_time")));

	// Auto-derive setup = start - 1h on start change (unless owner manually touched)
	useEffect(() => {
		if (!startTime || setupTouched) return;
		const [hh, mm] = startTime.split(":").map(Number);
		if (Number.isNaN(hh)) return;
		const setupHour = hh === 0 ? 23 : hh - 1;
		const newSetup = `${String(setupHour).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
		setSetupTime(newSetup);
	}, [startTime, setupTouched]);

	// Auto-derive end = start + duration_hours on start or package change
	useEffect(() => {
		if (!startTime || endTouched) return;
		const dur = selectedPkg?.duration_hours;
		if (!dur) return;
		const [hh, mm] = startTime.split(":").map(Number);
		if (Number.isNaN(hh)) return;
		const endHour = (hh + dur) % 24;
		const newEnd = `${String(endHour).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
		setEndTime(newEnd);
	}, [startTime, selectedPkg, endTouched]);

	// === Customization
	const [backdropId, setBackdropId] = useState(get("backdrop_id"));
	const initialVendorMarkup = Number(
		stateValues?.vendor_decor_markup ?? defaults?.vendor_decor_markup ?? 0,
	);
	const [vendorMarkup, setVendorMarkup] = useState(initialVendorMarkup);
	const selectedBackdrop = useMemo(
		() => backdrops.find((b) => b.id === backdropId),
		[backdrops, backdropId],
	);
	const isVendorDecor = selectedBackdrop?.type === "vendor_decor";
	const backdropContribution = useMemo(() => {
		if (!selectedBackdrop) return 0;
		if (selectedBackdrop.type === "rental_owned")
			return selectedBackdrop.rental_price;
		if (selectedBackdrop.type === "vendor_decor") return vendorMarkup;
		return 0;
	}, [selectedBackdrop, vendorMarkup]);

	// === Location
	const [venueName, setVenueName] = useState(get("venue_name"));
	const [venueAddress, setVenueAddress] = useState(get("venue_address"));
	const [venueCity, setVenueCity] = useState(get("venue_city"));
	const [venueProvince, setVenueProvince] = useState(get("venue_province"));
	const [mapsUrl, setMapsUrl] = useState(get("google_maps_url"));
	const [addressTouched, setAddressTouched] = useState(
		Boolean(get("venue_address")),
	);
	const [cityTouched, setCityTouched] = useState(Boolean(get("venue_city")));
	const [provinceTouched, setProvinceTouched] = useState(
		Boolean(get("venue_province")),
	);
	const [resolvingMaps, setResolvingMaps] = useState(false);
	const [resolveStatus, setResolveStatus] = useState<
		| "idle"
		| "ok"
		| "noop"
		| "search_only"
		| "no_coordinates"
		| "geocode_failed"
		| "error"
	>("idle");

	// Debounced auto-resolve Maps URL → alamat + kota
	useEffect(() => {
		if (!mapsUrl || !/^https?:\/\//.test(mapsUrl)) {
			setResolveStatus("idle");
			return;
		}
		let cancelled = false;
		const timer = setTimeout(async () => {
			setResolvingMaps(true);
			try {
				const { resolveMapsUrl } = await import("@/lib/actions/maps");
				const result = await resolveMapsUrl(mapsUrl);
				if (cancelled) return;
				if (!result.ok) {
					setResolveStatus("error");
					return;
				}
				// Non-ok reasons short-circuit to specific hint state
				if (result.reason !== "ok") {
					setResolveStatus(result.reason);
					return;
				}
				let hydratedSomething = false;
				// Only override if user hasn't manually typed
				if (!addressTouched && result.address) {
					setVenueAddress(result.address);
					hydratedSomething = true;
				}
				if (!cityTouched && result.city) {
					setVenueCity(result.city);
					hydratedSomething = true;
				}
				if (!provinceTouched && result.province) {
					setVenueProvince(result.province);
					hydratedSomething = true;
				}
				if (!venueName && result.venue) {
					setVenueName(result.venue);
					hydratedSomething = true;
				}
				setResolveStatus(hydratedSomething ? "ok" : "noop");
			} catch {
				if (!cancelled) setResolveStatus("error");
			} finally {
				if (!cancelled) setResolvingMaps(false);
			}
		}, 800);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mapsUrl]);

	// === Contacts
	const [clientWa, setClientWa] = useState(get("client_wa"));
	const [bookerName, setBookerName] = useState(get("booker_name"));
	const [bookerSameAsClient, setBookerSameAsClient] = useState(false);
	const [bookerSameAsVendor, setBookerSameAsVendor] = useState(false);
	const [picName, setPicName] = useState(get("pic_name"));
	const [picWa, setPicWa] = useState(get("pic_wa"));
	const [picSameAsBooker, setPicSameAsBooker] = useState(false);

	// Toggle: pembooking sama dengan klien (yang punya acara)
	useEffect(() => {
		if (bookerSameAsClient) setBookerName(clientName);
	}, [bookerSameAsClient, clientName]);

	// Toggle: pembooking adalah vendor (channel vendor — kami nggak komunikasi
	// langsung sama klien, semua via PIC vendor)
	useEffect(() => {
		if (bookerSameAsVendor) {
			setBookerName(vendorPicName || vendorName);
			if (vendorContact) setClientWa(vendorContact);
		}
	}, [bookerSameAsVendor, vendorPicName, vendorName, vendorContact]);

	// Channel ganti ke non-vendor → reset toggle vendor
	useEffect(() => {
		if (channel !== "vendor" && bookerSameAsVendor) {
			setBookerSameAsVendor(false);
		}
	}, [channel, bookerSameAsVendor]);

	// Toggle: PIC sama dengan pembooking
	useEffect(() => {
		if (picSameAsBooker) {
			setPicName(bookerName || clientName);
			setPicWa(clientWa);
		}
	}, [picSameAsBooker, bookerName, clientName, clientWa]);

	// === Financial
	const initialDiscount = Number(
		stateValues?.discount_amount ?? defaults?.discount_amount ?? 0,
	);
	const [discount, setDiscount] = useState(initialDiscount);
	const [discountType, setDiscountType] = useState(get("discount_type", ""));
	const initialGrossUp = Number(
		stateValues?.gross_up_pph_amount ?? defaults?.gross_up_pph_amount ?? 0,
	);
	const [grossUp, setGrossUp] = useState(initialGrossUp);

	const initialAddons = useMemo(() => {
		const map: Record<string, number> = {};
		for (const a of defaults?.addons ?? []) map[a.addon_id] = a.quantity;
		return map;
	}, [defaults?.addons]);
	const [selectedAddons, setSelectedAddons] =
		useState<Record<string, number>>(initialAddons);

	const addonsByCategory = useMemo(() => {
		const groups = new Map<string, AddonOption[]>();
		for (const a of addons) {
			if (!groups.has(a.category)) groups.set(a.category, []);
			groups.get(a.category)!.push(a);
		}
		return Array.from(groups.entries());
	}, [addons]);

	const addonsTotal = useMemo(() => {
		let sum = 0;
		for (const a of addons) {
			const qty = selectedAddons[a.id];
			if (qty) sum += a.price * qty;
		}
		return sum;
	}, [addons, selectedAddons]);

	const addonsJson = useMemo(
		() =>
			JSON.stringify(
				Object.entries(selectedAddons)
					.filter(([, qty]) => qty > 0)
					.map(([addon_id, quantity]) => ({ addon_id, quantity })),
			),
		[selectedAddons],
	);

	// === Bonus (item gratis untuk klien, internal-only)
	type BonusRow = { addon_id: string; quantity: number; notes: string };
	const initialBonuses = useMemo<BonusRow[]>(
		() =>
			(defaults?.bonuses ?? []).map((b) => ({
				addon_id: b.addon_id,
				quantity: b.quantity,
				notes: b.notes ?? "",
			})),
		[defaults?.bonuses],
	);
	const [bonusRows, setBonusRows] = useState<BonusRow[]>(initialBonuses);

	function addBonusRow(addonId: string) {
		setBonusRows((prev) => {
			if (prev.some((r) => r.addon_id === addonId)) return prev;
			return [...prev, { addon_id: addonId, quantity: 1, notes: "" }];
		});
	}
	function setBonusQty(addonId: string, qty: number) {
		setBonusRows((prev) =>
			prev.map((r) =>
				r.addon_id === addonId ? { ...r, quantity: Math.max(1, qty) } : r,
			),
		);
	}
	function setBonusNotes(addonId: string, notes: string) {
		setBonusRows((prev) =>
			prev.map((r) => (r.addon_id === addonId ? { ...r, notes } : r)),
		);
	}
	function removeBonusRow(addonId: string) {
		setBonusRows((prev) => prev.filter((r) => r.addon_id !== addonId));
	}
	const bonusesJson = useMemo(
		() =>
			JSON.stringify(
				bonusRows
					.filter((r) => r.quantity > 0)
					.map((r) => ({
						addon_id: r.addon_id,
						quantity: r.quantity,
						notes: r.notes.trim() || null,
					})),
			),
		[bonusRows],
	);
	const bonusAddonMap = useMemo(
		() => new Map(addons.map((a) => [a.id, a])),
		[addons],
	);

	const grandTotal = useMemo(
		() =>
			Math.max(
				0,
				basePrice + addonsTotal + backdropContribution - discount + grossUp,
			),
		[basePrice, addonsTotal, backdropContribution, discount, grossUp],
	);

	function toggleAddon(id: string, enabled: boolean) {
		setSelectedAddons((prev) => {
			const next = { ...prev };
			if (enabled) next[id] = next[id] || 1;
			else delete next[id];
			return next;
		});
	}

	function setAddonQty(id: string, qty: number) {
		setSelectedAddons((prev) => ({ ...prev, [id]: Math.max(1, qty) }));
	}

	function handlePackageChange(id: string) {
		setPackageId(id);
		if (id) {
			const pkg = packages.find((p) => p.id === id);
			if (pkg && (basePrice === 0 || basePrice === initialBase)) {
				setBasePrice(pkg.base_price);
			}
		}
	}

	function handleVendorAutoFill(name: string) {
		// Match against vendor master by case-insensitive trimmed name —
		// users may free-text-type with slight casing variance.
		const lookup = name.trim().toLowerCase();
		const found = vendorOptions.find(
			(v) => v.name.trim().toLowerCase() === lookup,
		);
		setVendorName(name);
		if (found?.pic_name) setVendorPicName(found.pic_name);
		if (found?.contact) setVendorContact(found.contact);
		// Apply commission scheme defaults from vendor master.
		if (found?.commission_mode) setVendorCommissionMode(found.commission_mode);
		if (found?.commission_value_type) {
			setVendorCommissionValueType(found.commission_value_type);
		}
		if (found?.commission_value != null) {
			setVendorCommissionValue(String(found.commission_value));
		} else if (found?.commission_rate != null) {
			// Legacy fallback (vendor master without new fields populated)
			setVendorCommissionValue(String(found.commission_rate));
		}
	}

	function openMapsSearch() {
		const query = [venueName, venueCity].filter(Boolean).join(", ");
		if (!query) return;
		const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
		window.open(url, "_blank", "noopener,noreferrer");
	}

	const showReferrerBlock = channel === "vendor" || channel === "relasi";
	const backdropMissing = !backdropId;

	function handleDismissError() {
		if (saveOverlay?.kind === "error" && saveOverlay.fields.length > 0) {
			const firstField = saveOverlay.fields[0]?.name;
			if (firstField) {
				// 1) Prefer the <label htmlFor={name}> — always visible if its
				//    Section is rendered. Hidden inputs share `name` with their
				//    visible siblings, so matching on label avoids landing on a
				//    display:none element.
				let target: HTMLElement | null = document.querySelector<HTMLElement>(
					`label[for="${firstField}"]`,
				);
				// 2) Fallback: first VISIBLE input with this name (skip hidden).
				if (!target) {
					const candidates = document.querySelectorAll<HTMLElement>(
						`[name="${firstField}"]`,
					);
					for (const el of Array.from(candidates)) {
						const isHidden =
							el instanceof HTMLInputElement && el.type === "hidden";
						if (!isHidden && el.offsetParent !== null) {
							target = el;
							break;
						}
					}
				}
				if (target) {
					const targetEl = target;
					targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
					setTimeout(() => {
						const focusable = (
							targetEl.matches("input,textarea,select,button")
								? targetEl
								: targetEl.parentElement?.querySelector(
										"input:not([type=hidden]),textarea,select,button",
									)
						) as HTMLInputElement | null;
						focusable?.focus({ preventScroll: true });
					}, 350);
				}
			}
		}
		setSaveOverlay(null);
	}

	return (
		<>
			{saveOverlay && (
				<SavePopup state={saveOverlay} onDismissError={handleDismissError} />
			)}
		<form
			action={formAction}
			className="space-y-8"
			onKeyDown={(e) => {
				// Block accidental Enter-to-submit dari text/number/tel inputs
				// (esp. Combobox di mana Enter biasanya commit free-text input,
				// bukan kirim form). User wajib klik tombol "Save as draft" di
				// bottom bar. Textarea + submit button tetap berperilaku normal.
				if (e.key !== "Enter") return;
				const target = e.target as HTMLElement;
				if (target.tagName === "TEXTAREA") return;
				if (
					target.tagName === "BUTTON" &&
					(target as HTMLButtonElement).type === "submit"
				) {
					return;
				}
				e.preventDefault();
			}}
		>
			{stateErrors?._form && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-fluid-body font-medium text-destructive">
						{stateErrors!._form[0]}
					</p>
				</div>
			)}

			{/* === 1. CHANNEL === */}
			<Section
				step={1}
				title="Sumber Booking"
				description="Pilih dulu dari mana booking ini datang — selanjutnya form akan menyesuaikan."
			>
				<Field
					label="Sales Channel"
					name="channel"
					error={err("channel")}
					required
				>
					<NativeSelect
						value={channel}
						onValueChange={setChannel}
						options={CHANNEL_OPTIONS.map(([value, label]) => ({
							value,
							label,
						}))}
						triggerClassName="w-full"
						aria-invalid={!!err("channel")}
					/>
					<input type="hidden" name="channel" value={channel} required />
				</Field>
			</Section>

			{/* === 2. REFERRER (dependent on channel) === */}
			{showReferrerBlock && (
				<div className="fade-in-on-mount">
				<Section
					step={2}
					title={
						channel === "vendor" ? "Direferensikan oleh Vendor" : "Direferensikan oleh"
					}
					description={
						channel === "vendor"
							? "Pilih vendor existing atau ketik manual (otomatis tersimpan untuk booking berikutnya)."
							: "Pilih relasi yang mereferensikan klien ini ke kita."
					}
				>
					{channel === "vendor" && (
						<div className="fade-in-on-mount space-y-4">
							<Field
								label="Nama Vendor / Perusahaan"
								name="vendor_name"
								error={err("vendor_name")}
								hint="Pilih dari master vendor, atau ketik nama baru (auto-create di /settings/vendors saat save)."
								required
							>
								<Combobox
									value={vendorName}
									onValueChange={handleVendorAutoFill}
									options={vendorOptions.map(
										(v): ComboboxOption => ({
											value: v.name,
											label: v.name,
											sublabel: [
												v.pic_name,
												v.contact,
												v.commission_rate != null
													? `${v.commission_rate}%`
													: null,
											]
												.filter(Boolean)
												.join(" · "),
										}),
									)}
									placeholder="cth. Partner Organizer"
									allowFreeText
									emptyMessage="Vendor baru — akan auto-create di master saat save"
									aria-label="Nama vendor"
								/>
								<input type="hidden" name="vendor_name" value={vendorName} />
							</Field>
							<div className="grid gap-6 md:grid-cols-2">
								<Field
									label="Nama PIC / Sales Vendor"
									name="vendor_pic_name"
									error={err("vendor_pic_name")}
									hint="Orang yang kita kontak dari vendor (mis. nama salesnya)."
								>
									<input
										type="text"
										value={vendorPicName}
										onChange={(e) => setVendorPicName(e.target.value)}
										placeholder="cth. Nisa"
										className={inputClass}
									/>
									<input
										type="hidden"
										name="vendor_pic_name"
										value={vendorPicName}
									/>
								</Field>
								<Field
									label="WA / HP PIC Vendor"
									name="vendor_contact"
									error={err("vendor_contact")}
									hint="Kontak utama buat koordinasi event"
								>
									<input
										type="tel"
										value={vendorContact}
										onChange={(e) => setVendorContact(e.target.value)}
										placeholder="08xxxxxxxxxx"
										className={`${inputClass} tabular`}
									/>
									<input
										type="hidden"
										name="vendor_contact"
										value={vendorContact}
									/>
								</Field>
							</div>
							{/* Commission scheme — mode + type segmented controls */}
							<div className="space-y-3">
								<div className="space-y-1">
									<span className="text-[13px] font-medium text-foreground">
										Skema Komisi
									</span>
									<p className="text-[12px] text-muted-foreground">
										Default dari master vendor; override per event kalau perlu.
									</p>
								</div>
								<div className="grid gap-2 sm:grid-cols-2">
									<button
										type="button"
										role="radio"
										aria-checked={vendorCommissionMode === "commission"}
										onClick={() => setVendorCommissionMode("commission")}
										className={`flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors ${
											vendorCommissionMode === "commission"
												? "border-primary bg-primary/5"
												: "border-border-default bg-card hover:border-border-strong hover:bg-secondary/40"
										}`}
									>
										<span
											className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors ${
												vendorCommissionMode === "commission"
													? "border-primary"
													: "border-border-strong"
											}`}
										>
											{vendorCommissionMode === "commission" && (
												<span className="size-2 rounded-full bg-primary" />
											)}
										</span>
										<span className="flex flex-col gap-0.5">
											<span className="text-[13px] font-medium text-foreground">
												Komisi Langsung
											</span>
											<span className="text-[11px] leading-snug text-muted-foreground">
												Klien bayar Tetra full, Tetra transfer komisi ke vendor.
											</span>
										</span>
									</button>
									<button
										type="button"
										role="radio"
										aria-checked={vendorCommissionMode === "upfront_cut"}
										onClick={() => setVendorCommissionMode("upfront_cut")}
										className={`flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors ${
											vendorCommissionMode === "upfront_cut"
												? "border-primary bg-primary/5"
												: "border-border-default bg-card hover:border-border-strong hover:bg-secondary/40"
										}`}
									>
										<span
											className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors ${
												vendorCommissionMode === "upfront_cut"
													? "border-primary"
													: "border-border-strong"
											}`}
										>
											{vendorCommissionMode === "upfront_cut" && (
												<span className="size-2 rounded-full bg-primary" />
											)}
										</span>
										<span className="flex flex-col gap-0.5">
											<span className="text-[13px] font-medium text-foreground">
												Potongan Langsung
											</span>
											<span className="text-[11px] leading-snug text-muted-foreground">
												Vendor potong nominal tetap dari base price. Tetra terima
												sisanya.
											</span>
										</span>
									</button>
								</div>
								<input
									type="hidden"
									name="vendor_commission_mode"
									value={vendorCommissionMode}
								/>
							</div>

							{vendorCommissionMode === "commission" ? (
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-1.5">
										<span className="text-[13px] font-medium text-foreground">
											Tipe Nilai
										</span>
										<div className="inline-flex rounded-md border border-border-default bg-card p-0.5">
											<button
												type="button"
												role="radio"
												aria-checked={vendorCommissionValueType === "percent"}
												onClick={() => setVendorCommissionValueType("percent")}
												className={`inline-flex h-8 items-center rounded-[4px] px-3 text-[12.5px] font-medium leading-none transition-colors ${
													vendorCommissionValueType === "percent"
														? "bg-foreground text-background"
														: "text-muted-foreground hover:text-foreground"
												}`}
											>
												Persentase (%)
											</button>
											<button
												type="button"
												role="radio"
												aria-checked={vendorCommissionValueType === "flat"}
												onClick={() => setVendorCommissionValueType("flat")}
												className={`inline-flex h-8 items-center rounded-[4px] px-3 text-[12.5px] font-medium leading-none transition-colors ${
													vendorCommissionValueType === "flat"
														? "bg-foreground text-background"
														: "text-muted-foreground hover:text-foreground"
												}`}
											>
												Nominal (Rp)
											</button>
										</div>
										<input
											type="hidden"
											name="vendor_commission_value_type"
											value={vendorCommissionValueType}
										/>
									</div>
									<Field
										label={
											vendorCommissionValueType === "percent"
												? "Komisi Vendor (%)"
												: "Komisi Vendor (Rp)"
										}
										name="vendor_commission_value"
										error={err("vendor_commission_value")}
										hint={
											vendorCommissionValueType === "percent"
												? "Persentase dari grand total. Standar 10%."
												: "Nominal flat yang Tetra bayar ke vendor per event."
										}
									>
										<div className="relative">
											{vendorCommissionValueType === "flat" && (
												<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
													Rp
												</span>
											)}
											<input
												type="number"
												min={0}
												max={
													vendorCommissionValueType === "percent" ? 100 : undefined
												}
												step={
													vendorCommissionValueType === "percent" ? 0.5 : 1000
												}
												value={vendorCommissionValue}
												onChange={(e) => setVendorCommissionValue(e.target.value)}
												placeholder={
													vendorCommissionValueType === "percent"
														? "10"
														: "500000"
												}
												className={`${inputClass} tabular ${
													vendorCommissionValueType === "flat" ? "pl-9" : ""
												}`}
											/>
											{vendorCommissionValueType === "percent" && (
												<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
													%
												</span>
											)}
										</div>
										<input
											type="hidden"
											name="vendor_commission_value"
											value={vendorCommissionValue}
										/>
									</Field>
								</div>
							) : (
								<div className="space-y-3">
									<Field
										label="Potongan Vendor (Rp)"
										name="vendor_commission_value"
										error={err("vendor_commission_value")}
										hint="Jumlah tetap yang vendor potong dari base price per event. Klien tetap pilih paket dari katalog Tetra di section Financial — vendor ambil fee ini saat transfer ke Tetra."
									>
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
												Rp
											</span>
											<input
												type="number"
												min={0}
												step={50000}
												value={vendorCommissionValue}
												onChange={(e) => setVendorCommissionValue(e.target.value)}
												placeholder="500000"
												className={`${inputClass} tabular pl-9`}
											/>
											<input
												type="hidden"
												name="vendor_commission_value"
												value={vendorCommissionValue}
											/>
											<input
												type="hidden"
												name="vendor_commission_value_type"
												value="flat"
											/>
										</div>
									</Field>

									{/* Live preview of vendor cut math. Numbers update as user
									    edits base_price (in Financial section) or potongan. */}
									<div className="rounded-md border border-border-default bg-surface-3/40 p-3">
										<div className="eyebrow mb-1.5">Skema potongan</div>
										<dl className="space-y-1 text-[13px]">
											<div className="flex items-baseline justify-between gap-3">
												<dt className="text-muted-foreground">Base price (paket)</dt>
												<dd className="tabular font-medium text-foreground">
													{formatRupiah(basePrice || 0)}
												</dd>
											</div>
											<div className="flex items-baseline justify-between gap-3">
												<dt className="text-muted-foreground">
													Potongan vendor
												</dt>
												<dd className="tabular font-medium text-rose-600 dark:text-rose-400">
													− {formatRupiah(Number(vendorCommissionValue) || 0)}
												</dd>
											</div>
											<div className="flex items-baseline justify-between gap-3 border-t border-border-default pt-1.5">
												<dt className="text-[13px] font-medium text-foreground">
													Tetra terima
												</dt>
												<dd className="tabular font-semibold text-emerald-600 dark:text-emerald-400">
													{formatRupiah(
														Math.max(
															0,
															(basePrice || 0) -
																(Number(vendorCommissionValue) || 0),
														),
													)}
												</dd>
											</div>
										</dl>
										<p className="mt-2 text-[11px] leading-snug text-muted-foreground">
											Beda dari{" "}
											<span className="font-medium">Discount</span> di section
											Financial: discount = potongan untuk klien (klien bayar
											lebih sedikit). Potongan vendor = vendor ambil fee dari
											payment flow.
										</p>
									</div>
								</div>
							)}

							{/* Legacy hidden inputs for back-compat with the server action
							    schema. vendor_commission_rate filled only for
							    commission+percent mode to preserve old aggregation paths. */}
							<input
								type="hidden"
								name="vendor_commission_rate"
								value={
									vendorCommissionMode === "commission" &&
									vendorCommissionValueType === "percent"
										? vendorCommissionValue
										: ""
								}
							/>
							<input
								type="hidden"
								name="vendor_commission_amount"
								value=""
							/>
						</div>
					)}
					{channel === "relasi" && (
						<>
							<Field
								label="Relasi (User Tetra)"
								name="referrer_user_id"
								error={err("referrer_user_id")}
								hint="Cari nama owner/crew. Komisi default Rp100.000."
								required
							>
								<Combobox
									value={referrerUserId}
									onValueChange={setReferrerUserId}
									options={relasiOptions.map(
										(r): ComboboxOption => ({
											value: r.id,
											label: r.full_name,
											sublabel: r.role,
										}),
									)}
									placeholder="Cari nama relasi…"
									allowFreeText={false}
									emptyMessage="Nggak ketemu — cek daftar di Settings → Master Crew"
									aria-label="Cari relasi"
								/>
								<input
									type="hidden"
									name="referrer_user_id"
									value={referrerUserId}
								/>
								<input type="hidden" name="referrer_type" value="owner" />
							</Field>
							<Field
								label="Komisi Relasi (Rp)"
								name="referrer_commission"
								error={err("referrer_commission")}
								hint="Default Rp100.000. Tentatif/nego boleh override."
							>
								<input
									type="number"
									min={0}
									step={1}
									value={referrerCommission}
									onChange={(e) => setReferrerCommission(e.target.value)}
									placeholder="100000"
									className={`${inputClass} tabular`}
								/>
								<input
									type="hidden"
									name="referrer_commission"
									value={referrerCommission}
								/>
							</Field>
						</>
					)}
				</Section>
				</div>
			)}
			{!showReferrerBlock && (
				<>
					<input type="hidden" name="vendor_name" value="" />
					<input type="hidden" name="vendor_pic_name" value="" />
					<input type="hidden" name="vendor_contact" value="" />
					<input type="hidden" name="vendor_commission_rate" value="" />
					<input type="hidden" name="vendor_commission_amount" value="" />
					<input type="hidden" name="referrer_user_id" value="" />
					<input type="hidden" name="referrer_type" value="" />
					<input type="hidden" name="referrer_commission" value="" />
				</>
			)}

			{/* === 3. EVENT TYPE + Category sub-fields === */}
			<Section
				step={showReferrerBlock ? 3 : 2}
				title="Tipe Acara"
				description="Kategori event nentuin field nama klien yang muncul di bawah."
			>
				<Field
					label="Kategori Event"
					name="event_category"
					error={err("event_category")}
					required
				>
					<NativeSelect
						value={eventCategory}
						onValueChange={(v) => {
							setEventCategory(v);
							setCategoryMeta({}); // reset sub-fields
							setClientNameTouched(false); // re-derive client_name
						}}
						placeholder="— pilih kategori —"
						options={eventTypes.map((t) => ({
							value: t.code,
							label: t.label,
						}))}
						triggerClassName="w-full"
						aria-invalid={!!err("event_category")}
					/>
					<input
						type="hidden"
						name="event_category"
						value={eventCategory}
						required
					/>
				</Field>

				{categoryTpl && (
					<div className="fade-in-on-mount space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
						<p className="text-fluid-caption text-primary inline-flex items-center gap-1.5">
							<Sparkles className="size-3" />
							{categoryTpl.hint}
						</p>
						<div className="grid gap-3 sm:grid-cols-2">
							{categoryTpl.fields.map((f) => (
								<div key={f.key} className="space-y-1">
									<label className="text-fluid-caption font-medium text-foreground">
										{f.label}
									</label>
									<input
										type="text"
										value={categoryMeta[f.key] ?? ""}
										onChange={(e) =>
											setCategoryMeta((m) => ({
												...m,
												[f.key]: e.target.value,
											}))
										}
										placeholder={f.placeholder}
										className={inputClass}
									/>
								</div>
							))}
						</div>
					</div>
				)}

				<Field
					label="Nama Klien (final, akan tampil di event)"
					name="client_name"
					error={err("client_name")}
					hint={
						categoryTpl
							? "Auto-derive dari field di atas. Edit manual kalau perlu."
							: "Nama klien atau acara — yang muncul di list operations."
					}
					required
				>
					<input
						type="text"
						required
						value={clientName}
						onChange={(e) => {
							setClientName(e.target.value);
							setClientNameTouched(true);
						}}
						placeholder="cth. Andi & Sari"
						className={inputClass}
					/>
					<input type="hidden" name="client_name" value={clientName} required />
				</Field>
			</Section>

			{/* === 4. SCHEDULE === */}
			<Section
				step={showReferrerBlock ? 4 : 3}
				title="Jadwal"
				description="Setup auto-fill -1 jam dari mulai. Selesai auto-fill +durasi paket."
			>
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Tanggal Event"
						name="event_date"
						error={err("event_date")}
						required
					>
						<DatePicker
							value={eventDate}
							onValueChange={setEventDate}
							placeholder="Pilih tanggal"
							aria-invalid={!!err("event_date")}
						/>
						<input
							type="hidden"
							name="event_date"
							value={eventDate}
							required
						/>
					</Field>
					<Field
						label="Jam Mulai"
						name="start_time"
						error={err("start_time")}
						required
						hint="Set ini dulu, setup + selesai auto-fill"
					>
						<TimePicker
							value={startTime}
							onValueChange={setStartTime}
							aria-invalid={!!err("start_time")}
						/>
						<input
							type="hidden"
							name="start_time"
							value={startTime}
							required
						/>
					</Field>
				</div>
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Setup"
						name="setup_time"
						error={err("setup_time")}
						required
						hint={
							setupTouched ? "Manual override" : "Auto: 1 jam sebelum mulai"
						}
					>
						<TimePicker
							value={setupTime}
							onValueChange={(v) => {
								setSetupTime(v);
								setSetupTouched(true);
							}}
							aria-invalid={!!err("setup_time")}
						/>
						<input
							type="hidden"
							name="setup_time"
							value={setupTime}
							required
						/>
					</Field>
					<Field
						label="Selesai"
						name="end_time"
						error={err("end_time")}
						required
						hint={
							endTouched
								? "Manual override"
								: selectedPkg
									? `Auto: mulai +${selectedPkg.duration_hours} jam (durasi paket)`
									: "Pilih paket dulu buat auto-fill"
						}
					>
						<TimePicker
							value={endTime}
							onValueChange={(v) => {
								setEndTime(v);
								setEndTouched(true);
							}}
							aria-invalid={!!err("end_time")}
						/>
						<input type="hidden" name="end_time" value={endTime} required />
					</Field>
				</div>
			</Section>

			{/* === 5. SERVICE & PACKAGE === */}
			<Section
				step={showReferrerBlock ? 5 : 4}
				title="Service & Paket"
				description="Jenis layanan dan paket dari pricelist."
			>
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Service Type"
						name="service_type"
						error={err("service_type")}
						required
					>
						<NativeSelect
							value={serviceType}
							onValueChange={setServiceType}
							placeholder="— pilih service —"
							options={SERVICE_TYPE_OPTIONS.map(([value, label]) => ({
								value,
								label,
							}))}
							triggerClassName="w-full"
							aria-invalid={!!err("service_type")}
						/>
						<input
							type="hidden"
							name="service_type"
							value={serviceType}
							required
						/>
					</Field>
					<Field
						label="Frame Size"
						name="frame_size"
						error={err("frame_size")}
						required
					>
						<NativeSelect
							value={frameSize}
							onValueChange={setFrameSize}
							placeholder="— pilih frame —"
							options={FRAME_SIZE_OPTIONS.map(([value, label]) => ({
								value,
								label: label === "—" ? "None" : label,
							}))}
							triggerClassName="w-full"
							aria-invalid={!!err("frame_size")}
						/>
						<input
							type="hidden"
							name="frame_size"
							value={frameSize}
							required
						/>
					</Field>
				</div>
				<Field
					label="Paket"
					name="package_id"
					error={err("package_id")}
					hint={
						!serviceType || !frameSize
							? "Pilih Service Type + Frame Size dulu buat filter paket."
							: filteredPackages.length === 0
								? "Tidak ada paket yang cocok dengan kombinasi ini — pakai custom."
								: `${filteredPackages.length} paket cocok. Pilih untuk auto-fill base price.`
					}
				>
					<NativeSelect
						value={packageId}
						onValueChange={(v) => handlePackageChange(v)}
						placeholder="— custom / belum dipilih —"
						options={[
							{ value: "", label: "— custom / belum dipilih —" },
							...filteredPackages.map((pkg) => ({
								value: pkg.id,
								label: `${pkg.name} · ${pkg.duration_hours}j · ${formatRupiah(pkg.base_price)}`,
							})),
						]}
						triggerClassName="w-full"
					/>
					<input type="hidden" name="package_id" value={packageId} />
				</Field>
			</Section>

			{/* === 6. CUSTOMIZATION & BACKDROP === */}
			<Section
				step={showReferrerBlock ? 6 : 5}
				title="Customization"
				description="Backdrop + flashdisk. Bisa di-update nanti kalau klien belum mutusin."
			>
				<Field
					label="Backdrop"
					name="backdrop_id"
					error={err("backdrop_id")}
					hint={
						selectedBackdrop?.type === "rental_owned"
							? `Premium rental Tetra — auto-add ${formatRupiah(selectedBackdrop.rental_price)} ke grand total`
							: selectedBackdrop?.type === "vendor_decor"
								? "Custom request — Tetra cariin vendor rekanan. Isi markup Tetra di field bawah (vendor charge belum termasuk)."
								: selectedBackdrop?.type === "client_provided"
									? "Klien bawa vendor dekorasi sendiri — Tetra cuma execute, tanpa markup."
									: selectedBackdrop?.type === "basic_included"
										? "Backdrop standar Tetra (gratis bundled di paket)"
										: "Kosongkan kalau belum ditentukan — sistem akan reminder H-7 + H-3"
					}
				>
					<NativeSelect
						value={backdropId}
						onValueChange={setBackdropId}
						placeholder="— Belum ditentukan / nyusul —"
						options={[
							{ value: "", label: "— Belum ditentukan / nyusul —" },
							...backdrops.map((b) => ({
								value: b.id,
								label: `${b.name} · ${BACKDROP_TYPE_LABEL[b.type] ?? b.type}${
									b.type === "rental_owned" && b.rental_price > 0
										? ` · ${formatRupiah(b.rental_price)}`
										: ""
								}`,
							})),
						]}
						triggerClassName="w-full"
					/>
					<input type="hidden" name="backdrop_id" value={backdropId} />
				</Field>

				{backdropMissing && (
					<div className="fade-in-on-mount flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-fluid-caption text-amber-900 dark:text-amber-200">
						<AlertTriangle className="mt-0.5 size-4 shrink-0" />
						<div>
							<p className="font-medium">Backdrop belum ditentukan</p>
							<p className="text-amber-900/80 dark:text-amber-200/80">
								Sistem akan reminder otomatis H-7 + H-3 kalau status masih
								kosong. Owner & klien wajib mutusin sebelum hari H.
							</p>
						</div>
					</div>
				)}

				{isVendorDecor && (
					<div className="fade-in-on-mount">
					<Field
						label="Markup Vendor Decor (Rp)"
						name="vendor_decor_markup"
						error={err("vendor_decor_markup")}
						hint="Otomatis ditambahkan ke grand total. Default Rp 300k baseline."
					>
						<input
							type="number"
							name="vendor_decor_markup"
							min={0}
							step={1}
							value={vendorMarkup === 0 ? "" : vendorMarkup}
							onChange={(e) =>
								setVendorMarkup(Math.max(0, Number(e.target.value || 0)))
							}
							placeholder="300000"
							className={`${inputClass} tabular`}
						/>
					</Field>
					</div>
				)}
				{!isVendorDecor && (
					<input
						type="hidden"
						name="vendor_decor_markup"
						value={String(vendorMarkup || 0)}
					/>
				)}

				<label className="flex items-center gap-3 rounded-md border border-border-default bg-surface-2 p-4">
					<input
						type="checkbox"
						name="include_flashdisk_pouch"
						defaultChecked={
							stateValues
								? stateValues.include_flashdisk_pouch === "on"
								: (defaults?.include_flashdisk_pouch ?? true)
						}
						className="h-4 w-4 rounded text-primary"
					/>
					<div className="space-y-0.5">
						<div className="text-fluid-body font-medium">
							Include flashdisk + pouch
						</div>
						<div className="text-fluid-caption text-muted-foreground">
							Standar Tetra: pouch + flashdisk berisi semua foto/video event.
							Uncheck kalau klien bawa FD sendiri / cuma minta softfile.
						</div>
					</div>
				</label>
			</Section>

			{/* === 7. LOCATION === */}
			<Section
				step={showReferrerBlock ? 7 : 6}
				title="Lokasi Event"
				description="Venue + alamat. Klik 'Cari di Google Maps' buat pin lokasi & paste URL kembali ke kolom."
			>
				<Field
					label="Nama Venue"
					name="venue_name"
					error={err("venue_name")}
					required
				>
					<input
						type="text"
						required
						value={venueName}
						onChange={(e) => setVenueName(e.target.value)}
						placeholder="cth. Grand Ballroom Hotel ABC"
						className={inputClass}
					/>
					<input type="hidden" name="venue_name" value={venueName} required />
				</Field>
				<Field
					label="Google Maps URL"
					name="google_maps_url"
					error={err("google_maps_url")}
					hint={
						resolvingMaps
							? "🔄 Mengambil info dari Maps…"
							: resolveStatus === "ok"
								? "✓ Alamat + kota terisi otomatis dari pin Maps"
								: resolveStatus === "noop"
									? "✓ Pin Maps OK — alamat/kota sudah diisi manual, biarin aja."
									: resolveStatus === "search_only"
										? "⚠ Ini URL halaman search, belum pinpoint venue. Klik salah satu hasil di Maps dulu, lalu copy URL dari address bar."
										: resolveStatus === "no_coordinates"
											? "⚠ URL ini nggak ada info lokasi. Paste URL share dari Maps (yang ada @lat,lng)."
											: resolveStatus === "geocode_failed"
												? "⚠ Pin Maps OK, tapi OSM nggak punya data alamat di koordinat itu. Isi manual."
												: resolveStatus === "error"
													? "⚠ Gagal akses URL — cek koneksi atau paste ulang."
													: "Klik 'Cari di Maps' → pin lokasi → copy share URL → paste di sini. Alamat + kota auto-fill."
					}
				>
					<div className="flex gap-2">
						<input
							type="url"
							value={mapsUrl}
							onChange={(e) => setMapsUrl(e.target.value)}
							placeholder="https://maps.app.goo.gl/..."
							className={`${inputClass} flex-1`}
						/>
						<button
							type="button"
							onClick={openMapsSearch}
							disabled={!venueName}
							title={
								venueName
									? `Cari "${venueName}${venueCity ? `, ${venueCity}` : ""}" di Google Maps`
									: "Isi nama venue dulu"
							}
							className="press-down inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
						>
							<MapPin className="size-4" />
							Cari di Maps
						</button>
					</div>
					<input type="hidden" name="google_maps_url" value={mapsUrl} />
				</Field>

				<Field
					label="Alamat"
					name="venue_address"
					error={err("venue_address")}
					hint={
						addressTouched
							? "Manual override"
							: venueAddress
								? "Auto-fill dari Maps — jalan, kelurahan/desa. Bisa di-edit."
								: "Opsional — jalan + nomor + kelurahan"
					}
				>
					<input
						type="text"
						value={venueAddress}
						onChange={(e) => {
							setVenueAddress(e.target.value);
							setAddressTouched(true);
						}}
						placeholder="Jl. ..."
						className={inputClass}
					/>
					<input
						type="hidden"
						name="venue_address"
						value={venueAddress}
					/>
				</Field>
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Kota / Kabupaten"
						name="venue_city"
						error={err("venue_city")}
						hint={
							cityTouched
								? "Manual override"
								: venueCity
									? "Auto-fill dari Maps — bisa di-edit"
									: "cth. Kota Bogor / Kabupaten Bogor"
						}
					>
						<input
							type="text"
							value={venueCity}
							onChange={(e) => {
								setVenueCity(e.target.value);
								setCityTouched(true);
							}}
							placeholder="Kabupaten Bogor"
							className={inputClass}
						/>
						<input type="hidden" name="venue_city" value={venueCity} />
					</Field>
					<Field
						label="Provinsi"
						name="venue_province"
						error={err("venue_province")}
						hint={
							provinceTouched
								? "Manual override"
								: venueProvince
									? "Auto-fill dari Maps — bisa di-edit"
									: "Opsional"
						}
					>
						<input
							type="text"
							value={venueProvince}
							onChange={(e) => {
								setVenueProvince(e.target.value);
								setProvinceTouched(true);
							}}
							placeholder="Jawa Barat"
							className={inputClass}
						/>
						<input
							type="hidden"
							name="venue_province"
							value={venueProvince}
						/>
					</Field>
				</div>
			</Section>

			{/* === 8. CONTACTS === */}
			<Section
				step={showReferrerBlock ? 8 : 7}
				title="Kontak"
				description="Pembooking (yang booking + utama untuk billing) + PIC di lapangan untuk koordinasi crew hari-H."
			>
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Nama Pembooking"
						name="booker_name"
						error={err("booker_name")}
						hint={
							bookerSameAsVendor
								? `Auto: PIC vendor (${vendorPicName || vendorName || "—"})`
								: bookerSameAsClient
									? `Auto: sama dengan klien (${clientName || "—"})`
									: "Yang booking — bisa klien, kakak, panitia, atau vendor/WO"
						}
					>
						<input
							type="text"
							value={bookerName}
							onChange={(e) => {
								setBookerName(e.target.value);
								setBookerSameAsClient(false);
								setBookerSameAsVendor(false);
							}}
							placeholder="cth. Andi (kakak pengantin)"
							disabled={bookerSameAsClient || bookerSameAsVendor}
							className={`${inputClass} ${bookerSameAsClient || bookerSameAsVendor ? "opacity-60" : ""}`}
						/>
						<input type="hidden" name="booker_name" value={bookerName} />
					</Field>
					<Field
						label="WA Pembooking"
						name="client_wa"
						error={err("client_wa")}
						hint={
							bookerSameAsVendor
								? "Auto: kontak vendor — pakai ini untuk reminder."
								: "Primary contact untuk billing + reminder. Format: 08xxxxxxxxxx"
						}
						required
					>
						<input
							type="tel"
							required
							value={clientWa}
							onChange={(e) => {
								setClientWa(e.target.value);
								setBookerSameAsVendor(false);
							}}
							placeholder="081234567890"
							className={`${inputClass} tabular`}
						/>
						<input type="hidden" name="client_wa" value={clientWa} required />
					</Field>
				</div>

				<div className="space-y-2">
					<label className="flex cursor-pointer items-center gap-2 rounded-md border border-border-default bg-surface-2 px-3 py-2 text-fluid-caption">
						<input
							type="checkbox"
							checked={bookerSameAsClient}
							onChange={(e) => {
								setBookerSameAsClient(e.target.checked);
								if (e.target.checked) setBookerSameAsVendor(false);
							}}
							className="h-4 w-4 rounded text-primary"
						/>
						<span>
							Pembooking sama dengan klien{" "}
							<span className="text-muted-foreground">
								(pengantin/yang punya acara booking sendiri)
							</span>
						</span>
					</label>

					{channel === "vendor" && (
						<label className="fade-in-on-mount flex cursor-pointer items-center gap-2 rounded-md border border-border-default bg-surface-2 px-3 py-2 text-fluid-caption">
							<input
								type="checkbox"
								checked={bookerSameAsVendor}
								onChange={(e) => {
									setBookerSameAsVendor(e.target.checked);
									if (e.target.checked) setBookerSameAsClient(false);
								}}
								className="h-4 w-4 rounded text-primary"
							/>
							<span>
								Pembooking adalah vendor{" "}
								<span className="text-muted-foreground">
									(kami nggak komunikasi langsung sama klien — semua via PIC
									vendor)
								</span>
							</span>
						</label>
					)}
				</div>

				<input type="hidden" name="client_email" value="" />

				<div className="space-y-3 rounded-lg border border-border-default bg-surface-2 p-4">
					<div className="flex items-baseline justify-between gap-2">
						<div className="flex items-center gap-2 text-fluid-body font-medium">
							<Users className="size-4 text-primary" />
							PIC di Lokasi (WO / EO / Panitia / Keluarga)
						</div>
					</div>
					<p className="text-fluid-caption text-muted-foreground">
						Orang yang crew koordinasi di lapangan hari-H. Bisa pembooking
						sendiri, WO, atau keluarga.
					</p>

					<label className="flex cursor-pointer items-center gap-2 text-fluid-caption">
						<input
							type="checkbox"
							checked={picSameAsBooker}
							onChange={(e) => setPicSameAsBooker(e.target.checked)}
							className="h-4 w-4 rounded text-primary"
						/>
						<span>
							PIC sama dengan pembooking{" "}
							<span className="text-muted-foreground">
								(auto-fill dari atas)
							</span>
						</span>
					</label>

					<div className="grid gap-3 md:grid-cols-2">
						<Field
							label="Nama PIC"
							name="pic_name"
							error={err("pic_name")}
							hint="Opsional"
						>
							<input
								type="text"
								value={picName}
								onChange={(e) => {
									setPicName(e.target.value);
									setPicSameAsBooker(false);
								}}
								placeholder="cth. Bu Hanna (WO)"
								disabled={picSameAsBooker}
								className={`${inputClass} ${picSameAsBooker ? "opacity-60" : ""}`}
							/>
							<input type="hidden" name="pic_name" value={picName} />
						</Field>
						<Field
							label="WA PIC"
							name="pic_wa"
							error={err("pic_wa")}
							hint="Akan dipakai di template reminder crew"
						>
							<input
								type="tel"
								value={picWa}
								onChange={(e) => {
									setPicWa(e.target.value);
									setPicSameAsBooker(false);
								}}
								placeholder="081234567890"
								disabled={picSameAsBooker}
								className={`${inputClass} tabular ${picSameAsBooker ? "opacity-60" : ""}`}
							/>
							<input type="hidden" name="pic_wa" value={picWa} />
						</Field>
					</div>
				</div>
			</Section>

			{/* === 9. ADD-ONS === */}
			<Section
				step={showReferrerBlock ? 9 : 8}
				title="Add-ons"
				description="Voucher, print extras, costume, dll."
			>
				<input type="hidden" name="addons_json" value={addonsJson} />
				{addons.length === 0 ? (
					<p className="text-fluid-body italic text-muted-foreground">
						Belum ada add-on aktif. Tambah dari Settings → Add-ons.
					</p>
				) : (
					<div className="space-y-4">
						{addonsByCategory.map(([category, items]) => (
							<div key={category} className="space-y-2">
								<h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									{ADDON_CATEGORY_LABELS[category] ?? category}
								</h4>
								<div className="space-y-1">
									{items.map((addon) => {
										const qty = selectedAddons[addon.id];
										const enabled = qty !== undefined;
										return (
											<label
												key={addon.id}
												className="flex cursor-pointer items-center gap-3 rounded-md border border-border-default bg-surface-2 p-3 hover:bg-muted/30"
											>
												<input
													type="checkbox"
													checked={enabled}
													onChange={(e) =>
														toggleAddon(addon.id, e.target.checked)
													}
													className="h-4 w-4 shrink-0 rounded text-primary"
												/>
												<div className="min-w-0 flex-1">
													<div className="truncate text-fluid-body font-medium">
														{addon.name}
													</div>
													<div className="text-fluid-caption text-muted-foreground">
														{formatRupiah(addon.price)} per {addon.unit}
													</div>
												</div>
												{enabled ? (
													<>
														<input
															type="number"
															min={1}
															max={99}
															value={qty}
															onChange={(e) =>
																setAddonQty(addon.id, Number(e.target.value))
															}
															onClick={(e) => e.stopPropagation()}
															className={`${inputClass} tabular h-8 w-16 shrink-0 text-right`}
														/>
														<span className="tabular w-28 shrink-0 text-right text-fluid-body font-medium text-foreground">
															{formatRupiah(addon.price * qty)}
														</span>
													</>
												) : (
													<span className="w-44 shrink-0 text-right text-fluid-caption text-muted-foreground">
														Klik untuk pilih
													</span>
												)}
											</label>
										);
									})}
								</div>
							</div>
						))}
						<div className="flex items-center justify-between rounded-md bg-muted px-4 py-2 text-fluid-body">
							<span className="text-muted-foreground">Add-ons subtotal</span>
							<span className="tabular font-medium">
								{formatRupiah(addonsTotal)}
							</span>
						</div>
					</div>
				)}
			</Section>

			{/* === BONUS (free items, internal only) === */}
			<Section
				step={showReferrerBlock ? 10 : 9}
				title={
					<span className="inline-flex items-center gap-2">
						<Gift className="size-5 text-primary" />
						Bonus untuk Klien
						<Badge variant="secondary" className="text-[10px]">
							Internal
						</Badge>
					</span>
				}
				description="Item gratis yang kita kasih sebagai itikad baik — klien gak perlu tahu, tapi crew harus tahu biar bisa kasih hari-H. Tidak masuk grand total."
			>
				<input type="hidden" name="bonuses_json" value={bonusesJson} />

				{addons.length === 0 ? (
					<p className="text-fluid-body italic text-muted-foreground">
						Belum ada item aktif di katalog. Tambah dulu dari Settings →
						Add-ons.
					</p>
				) : (
					<div className="space-y-3">
						<div className="flex items-end gap-2">
							<div className="flex-1">
								<label
									htmlFor="bonus-picker"
									className="mb-1 block text-fluid-caption font-medium text-foreground"
								>
									Tambah Bonus
								</label>
								<NativeSelect
									id="bonus-picker"
									value=""
									triggerClassName="w-full"
									onValueChange={(v) => {
										if (v) addBonusRow(v);
									}}
									options={[
										{ value: "", label: "— pilih item bonus —" },
										...addons
											.filter(
												(a) => !bonusRows.some((r) => r.addon_id === a.id),
											)
											.map((a) => ({
												value: a.id,
												label: `${ADDON_CATEGORY_LABELS[a.category] ?? a.category} · ${a.name}`,
											})),
									]}
								/>
							</div>
						</div>

						{bonusRows.length === 0 ? (
							<p className="rounded-md border border-dashed border-border-default bg-surface-2 p-4 text-center text-fluid-caption italic text-muted-foreground">
								Belum ada bonus. Pilih item dari dropdown di atas.
							</p>
						) : (
							<div className="space-y-2">
								{bonusRows.map((row) => {
									const addon = bonusAddonMap.get(row.addon_id);
									if (!addon) return null;
									return (
										<div
											key={row.addon_id}
											className="fade-in-on-mount space-y-2 rounded-md border border-border-default bg-surface-2 p-3"
										>
											<div className="flex items-start gap-3">
												<div className="min-w-0 flex-1">
													<div className="truncate text-fluid-body font-medium">
														{addon.name}
													</div>
													<div className="text-fluid-caption text-muted-foreground">
														{ADDON_CATEGORY_LABELS[addon.category] ??
															addon.category}{" "}
														· {addon.unit}
													</div>
												</div>
												<div className="flex items-center gap-2">
													<label className="text-fluid-caption text-muted-foreground">
														Qty
													</label>
													<input
														type="number"
														min={1}
														max={99}
														value={row.quantity}
														onChange={(e) =>
															setBonusQty(
																row.addon_id,
																Number(e.target.value),
															)
														}
														className={`${inputClass} tabular h-8 w-16 text-right`}
													/>
													<button
														type="button"
														onClick={() => removeBonusRow(row.addon_id)}
														title="Hapus bonus"
														className="press-down inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-default bg-surface-3 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
													>
														<X className="size-4" />
													</button>
												</div>
											</div>
											<textarea
												value={row.notes}
												onChange={(e) =>
													setBonusNotes(row.addon_id, e.target.value)
												}
												placeholder="Catatan (opsional) — cth. 'kasih saat sesi family', 'pre-print sebelum acara'"
												rows={1}
												className={`${inputClass} resize-none text-fluid-caption`}
											/>
										</div>
									);
								})}
							</div>
						)}

						{bonusRows.length > 0 && (
							<p className="rounded-md bg-muted px-4 py-2 text-fluid-caption text-muted-foreground">
								<span className="font-medium text-foreground">
									{bonusRows.length} item
								</span>{" "}
								akan dicatat sebagai bonus. Crew akan lihat di reminder
								WhatsApp + halaman jadwal.
							</p>
						)}
					</div>
				)}
			</Section>

			{/* === 11. FINANCIAL === */}
			<Section
				step={showReferrerBlock ? 11 : 10}
				title="Financial"
				description="Harga dan modifier."
			>
				<Field
					label="Base Price (IDR)"
					name="base_price"
					error={err("base_price")}
					hint="Auto-fill dari paket; bisa override manual"
				>
					<input
						type="number"
						name="base_price"
						min={0}
						step={1}
						value={basePrice || ""}
						onChange={(e) => setBasePrice(Number(e.target.value) || 0)}
						placeholder="3000000"
						className={`${inputClass} tabular`}
					/>
				</Field>

				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Discount (IDR)"
						name="discount_amount"
						error={err("discount_amount")}
						hint="Potongan dalam Rupiah"
					>
						<input
							type="number"
							name="discount_amount"
							min={0}
							step={1}
							value={discount || ""}
							onChange={(e) => setDiscount(Number(e.target.value) || 0)}
							placeholder="0"
							className={`${inputClass} tabular`}
						/>
					</Field>
					<Field
						label="Gross-up PPh (IDR)"
						name="gross_up_pph_amount"
						error={err("gross_up_pph_amount")}
						hint={`Markup pajak untuk corporate. Auto-calc pakai ${grossupRate}% (config di Settings → Financial).`}
					>
						<div className="flex gap-2">
							<input
								type="number"
								name="gross_up_pph_amount"
								min={0}
								step={1}
								value={grossUp || ""}
								onChange={(e) => setGrossUp(Number(e.target.value) || 0)}
								placeholder="0"
								className={`${inputClass} tabular flex-1`}
							/>
							<button
								type="button"
								onClick={() =>
									setGrossUp(
										Math.round((basePrice * grossupRate) / (100 - grossupRate)),
									)
								}
								disabled={basePrice <= 0}
								title={`Hitung otomatis ${grossupRate}% gross-up dari base price (formula: base × ${grossupRate} / ${100 - grossupRate})`}
								className="press-down inline-flex h-10 shrink-0 items-center rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
							>
								Auto {grossupRate}%
							</button>
						</div>
					</Field>
				</div>

				{discount > 0 && (
					<div className="fade-in-on-mount">
					<Field
						label="Tipe Diskon"
						name="discount_type"
						error={err("discount_type")}
						hint="Klasifikasi diskon — dipakai reports untuk slice 'diskon per kategori' dan journal."
						required
					>
						<NativeSelect
							value={discountType}
							onValueChange={setDiscountType}
							options={DISCOUNT_TYPE_OPTIONS}
							triggerClassName="w-full"
						/>
						<input
							type="hidden"
							name="discount_type"
							value={discountType}
						/>
					</Field>
					</div>
				)}
				{discount === 0 && (
					<input type="hidden" name="discount_type" value="" />
				)}

				<Field
					label="Catatan untuk Crew"
					name="crew_notes"
					error={err("crew_notes")}
					hint="Optional — instruksi spesifik untuk tim lapangan"
				>
					<textarea
						name="crew_notes"
						rows={2}
						maxLength={500}
						defaultValue={get("crew_notes")}
						placeholder="cth. Akses parkir di basement, tanya security PIC: Pak Agus"
						className={`${inputClass} resize-none`}
					/>
				</Field>
			</Section>

			<div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border-default bg-surface-2 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-surface-2/85 sm:flex-row sm:items-center sm:justify-between md:-mx-8 md:px-8">
				<dl className="flex items-baseline gap-6 text-fluid-body">
					<div>
						<dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Grand Total
						</dt>
						<dd className="tabular text-xl font-semibold text-foreground">
							{formatRupiah(grandTotal)}
						</dd>
					</div>
					<div className="text-[11px] text-muted-foreground">
						{formatRupiah(basePrice)}
						{addonsTotal > 0 && <> + {formatRupiah(addonsTotal)} addons</>}
						{backdropContribution > 0 && (
							<> + {formatRupiah(backdropContribution)} backdrop</>
						)}
						{discount > 0 && <> − {formatRupiah(discount)}</>}
						{grossUp > 0 && <> + {formatRupiah(grossUp)} PPh</>}
					</div>
				</dl>
				<div className="flex items-center gap-3">
					<Link
						href="/operations"
						className="h-10 rounded-md border border-border-default bg-surface-2 px-4 text-fluid-body font-medium leading-10 hover:bg-muted"
					>
						Cancel
					</Link>
					<button
						type="submit"
						disabled={pending}
						className="press-down h-10 rounded-md bg-primary px-4 text-fluid-body font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
					>
						{pending ? "Menyimpan…" : submitLabel}
					</button>
				</div>
			</div>
		</form>
		</>
	);
}

function SavePopup({
	state,
	onDismissError,
}: {
	state:
		| { kind: "saving" }
		| { kind: "success"; projectId: string; isUpdate: boolean }
		| {
				kind: "error";
				message: string;
				fields: Array<{ name: string; label: string; message: string }>;
		  };
	onDismissError: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
			<div className="fade-in-on-mount max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border-default bg-surface-2 p-6 shadow-[var(--shadow-level-5)]">
				{state.kind === "saving" && (
					<div className="space-y-3 text-center">
						<Loader2 className="mx-auto size-10 animate-spin text-primary" />
						<div>
							<p className="text-fluid-body font-semibold tracking-tight">
								Menyimpan booking…
							</p>
							<p className="text-fluid-caption text-muted-foreground">
								Tunggu sebentar, jangan tutup tab.
							</p>
						</div>
					</div>
				)}
				{state.kind === "success" && (
					<div className="space-y-3 text-center">
						<CheckCircle2 className="mx-auto size-10 text-emerald-500" />
						<div>
							<p className="text-fluid-body font-semibold tracking-tight">
								{state.isUpdate ? "Berhasil disimpan!" : "Booking dibuat!"}
							</p>
							<p className="tabular text-fluid-caption text-muted-foreground">
								{state.projectId}
							</p>
							<p className="mt-2 text-fluid-caption text-muted-foreground">
								Mengarahkan ke halaman detail…
							</p>
						</div>
					</div>
				)}
				{state.kind === "error" && (
					<div className="space-y-4">
						<div className="space-y-2 text-center">
							<AlertTriangle className="mx-auto size-10 text-destructive" />
							<p className="text-fluid-body font-semibold tracking-tight">
								Gagal menyimpan
							</p>
							<p className="text-fluid-caption text-muted-foreground">
								{state.message}
							</p>
						</div>
						{state.fields.length > 0 && (
							<ul className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-fluid-caption">
								{state.fields.map((f) => (
									<li key={f.name} className="flex items-start gap-2">
										<span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-destructive" />
										<span className="flex-1 leading-snug">
											<span className="font-medium text-foreground">
												{f.label}:
											</span>{" "}
											<span className="text-muted-foreground">
												{f.message}
											</span>
										</span>
									</li>
								))}
							</ul>
						)}
						<button
							type="button"
							onClick={onDismissError}
							className="press-down w-full rounded-md border border-border-default bg-surface-3 px-3 py-2 text-fluid-body font-medium transition-colors hover:bg-muted"
						>
							{state.fields.length > 0
								? "Tutup & ke field bermasalah"
								: "Tutup & perbaiki"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

const inputClass =
	"h-10 w-full rounded-md border border-border-default bg-background px-3 text-fluid-body text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Section({
	step,
	title,
	description,
	children,
}: {
	step: number;
	title: React.ReactNode;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-4">
			<div className="flex items-baseline gap-3">
				<Badge
					variant="outline"
					className="h-6 shrink-0 border-primary/30 bg-primary/10 px-2 text-[11px] font-semibold text-primary"
				>
					{step}
				</Badge>
				<div className="space-y-0.5">
					<h3 className="text-fluid-body font-semibold tracking-tight">
						{title}
					</h3>
					<p className="text-fluid-caption text-muted-foreground">
						{description}
					</p>
				</div>
			</div>
			<div className="space-y-4 pl-9">{children}</div>
		</section>
	);
}

function Field({
	label,
	name,
	hint,
	error,
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
	error?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-fluid-body font-medium">
				{label}
				{required && <span className="ml-0.5 text-primary">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-fluid-caption text-destructive">{error}</p>
			) : hint ? (
				<p className="text-fluid-caption text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}
