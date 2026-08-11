"use client";

import {
	AlertTriangle,
	Check,
	CheckCircle2,
	Gift,
	HelpCircle,
	Loader2,
	MapPin,
	Plus,
	Sparkles,
	Users,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { NavItem } from "@/components/booking/_shared/section-nav";
import { FieldGrid } from "@/components/operations/_shared/field-grid";
import { SectionCard } from "@/components/operations/_shared/section-card";
import { SummaryRail } from "@/components/operations/_shared/summary-rail";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import { toast } from "@/components/ui/toaster";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BookingFormState, BookingInput } from "@/lib/actions/bookings";
import {
	durationOptions,
	packageFitsFrame,
	resolvePackage,
	serviceNeedsFrame,
	swapPackageFrame,
} from "@/lib/events/frame-package";
import {
	ADDON_CATEGORY_LABELS,
	CHANNEL_TYPE_LABELS,
	FRAME_SIZE_LABELS,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";
import {
	activeMinutes,
	formatDuration,
	hasBreak,
	minutesToTime,
	parseSegments,
	type Segment,
	segmentGaps,
	segmentsEnvelope,
	timeToMinutes,
	validateSegments,
} from "@/lib/schedule/segments";
import { cn } from "@/lib/utils";

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
	type: "basic_included" | "rental_owned" | "vendor_decor" | "client_provided";
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
	/** Durasi paket yang disepakati saat ukuran masih menyusul. */
	pending_package_hours: number | string;
	frame_size: string;
	event_category: string;
	event_date: string;
	/** "on" = tanggal masih perkiraan (TBC). Tanggalnya sendiri tetap wajib. */
	event_date_is_estimate: string;
	setup_time: string;
	start_time: string;
	end_time: string;
	/** JSON string of active session windows for acara dengan jeda. */
	session_segments: string;
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
	sales_user_id: string;
	direct_sales_commission: number;
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
			{
				key: "event_name",
				label: "Nama Acara / Angkatan",
				placeholder: "Wisuda 2026",
			},
		],
		assemble: (v) => [v.instansi, v.event_name].filter(Boolean).join(" — "),
	},
	corporate: {
		hint: "Nama perusahaan/EO + nama acara",
		fields: [
			{ key: "company", label: "Perusahaan / EO", placeholder: "PT Mahaka" },
			{
				key: "event_name",
				label: "Nama Acara",
				placeholder: "Annual Gathering 2026",
			},
		],
		assemble: (v) => [v.company, v.event_name].filter(Boolean).join(" — "),
	},
	gathering: {
		hint: "Nama perusahaan/EO + nama acara",
		fields: [
			{ key: "company", label: "Perusahaan / EO", placeholder: "PT Mahaka" },
			{
				key: "event_name",
				label: "Nama Acara",
				placeholder: "Family Gathering",
			},
		],
		assemble: (v) => [v.company, v.event_name].filter(Boolean).join(" — "),
	},
	event: {
		hint: "Nama acara yang tampil di list operations",
		fields: [
			{
				key: "event_name",
				label: "Nama Acara",
				placeholder: "cth. Grand Opening Cafe Senja",
			},
		],
		assemble: (v) => v.event_name ?? "",
	},
};

/**
 * Segmented toggle for "Tipe Nilai" — Persentase (%) vs Nominal (Rp).
 * Shared by both commission schemes (Komisi Langsung & Potongan Langsung)
 * so the two stay visually and behaviourally identical. Emits a hidden
 * input named `name` so the value rides along with the form submit.
 */
function ValueTypeToggle({
	value,
	onChange,
	name,
}: {
	value: "percent" | "flat";
	onChange: (v: "percent" | "flat") => void;
	name: string;
}) {
	return (
		<div className="space-y-1.5">
			<span className="text-[13px] font-medium text-foreground">
				Tipe Nilai
			</span>
			<div
				role="radiogroup"
				className="inline-flex rounded-md border border-border-default bg-card p-0.5"
			>
				{(["percent", "flat"] as const).map((t) => (
					<button
						key={t}
						type="button"
						role="radio"
						aria-checked={value === t}
						onClick={() => onChange(t)}
						className={`inline-flex h-8 items-center rounded-[4px] px-3 text-[12.5px] font-medium leading-none transition-colors ${
							value === t
								? "bg-[#059669] text-white"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{t === "percent" ? "Persentase (%)" : "Nominal (Rp)"}
					</button>
				))}
			</div>
			<input type="hidden" name={name} value={value} />
		</div>
	);
}

const DISCOUNT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "", label: "Pilih tipe diskon" },
	{ value: "promo", label: "Promo (musiman / campaign)" },
	{ value: "loyalty", label: "Loyalty (klien repeat)" },
	{ value: "relasi", label: "Relasi (kenalan / referral)" },
	{ value: "owner_override", label: "Owner Override (diskon manual)" },
	{ value: "package_deal", label: "Package Deal (bundling)" },
	{ value: "other", label: "Lainnya" },
];

/**
 * Nominal komisi sales yang paling sering dipakai. Rp0 sengaja ikut jadi
 * pilihan sekali klik — banyak event yang sales-nya memang tidak ambil komisi,
 * dan nominalnya baru pasti waktu settle. Sama dengan chip di dialog settle.
 */
const SALES_COMMISSION_PRESETS = [
	{ amount: 0, label: "Tanpa komisi" },
	{ amount: 50_000, label: "Rp 50.000" },
	{ amount: 100_000, label: "Rp 100.000" },
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
	const stateValues = state && "values" in state ? state.values : undefined;
	const stateErrors = state && "errors" in state ? state.errors : undefined;
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
				.filter(([k, v]) => k !== "_form" && Array.isArray(v) && v.length > 0)
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
	// Sales Tetra — nominalnya TENTATIF: boleh Rp0 / tanpa komisi sama sekali,
	// boleh juga dikosongkan sekarang lalu diisi saat settle. Makanya booking
	// baru mulai kosong; Rp100.000 cuma disarankan begitu sales-nya dipilih.
	const [salesUserId, setSalesUserId] = useState(get("sales_user_id"));
	const [salesCommission, setSalesCommission] = useState(() =>
		get("direct_sales_commission"),
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
	// Paket sementara saat ukuran masih menyusul: DURASI saja, tanpa ukuran.
	// Aturan mainnya di lib/events/frame-package.ts — event tidak boleh punya
	// paket ber-ukuran sementara frame size-nya belum pasti (8 Agu 2026: paket
	// 2R terpilih, klien ternyata minta 4R, ketahuan di hari-H).
	const [pendingHours, setPendingHours] = useState(
		String(
			stateValues?.pending_package_hours ??
				defaults?.pending_package_hours ??
				"",
		),
	);
	const initialBase = Number(
		stateValues?.base_price ?? defaults?.base_price ?? 0,
	);
	const [basePrice, setBasePrice] = useState(initialBase);
	// Apakah owner sudah mengetik harga sendiri? Kalau belum, ganti paket wajib
	// menarik ulang harga paket baru. Sebelumnya syaratnya
	// `basePrice === 0 || basePrice === initialBase`, yang langsung false
	// setelah paket PERTAMA dipilih — jadi ganti Paket A (2jt) ke Paket B
	// (3,5jt) menyisakan harga 2jt secara diam-diam, dan invoice/DP/komisi
	// ikut kurang 1,5jt.
	const [basePriceTouched, setBasePriceTouched] = useState(false);

	const selectedPkg = useMemo(
		() => packages.find((p) => p.id === packageId),
		[packageId, packages],
	);

	// Paket yang boleh dipilih: sesuai service, dan ukurannya cocok dengan frame
	// size event. Selama ukuran masih menyusul, HANYA paket yang memang tanpa
	// cetak frame (Videobooth, Photo Stage) yang boleh dipilih langsung —
	// sisanya dipilih sebagai durasi (lihat durationChoices di bawah).
	const filteredPackages = useMemo(() => {
		return packages.filter((p) => {
			if (serviceType && p.category !== serviceType) return false;
			return packageFitsFrame(p.frame_size, frameSize || null);
		});
	}, [packages, serviceType, frameSize]);

	/** Service ini memang mencetak frame? (Videobooth 360 tidak) */
	const frameRelevan = useMemo(
		() => serviceNeedsFrame(packages, serviceType || null),
		[packages, serviceType],
	);

	/** Pilihan "durasi saja" — dipakai saat ukuran belum pasti. */
	const durationChoices = useMemo(
		() => (frameSize ? [] : durationOptions(packages, serviceType || null)),
		[packages, serviceType, frameSize],
	);

	// If currently selected paket no longer in filter, clear it
	useEffect(() => {
		if (!packageId) return;
		const stillVisible = filteredPackages.some((p) => p.id === packageId);
		if (!stillVisible) {
			setPackageId("");
		}
	}, [filteredPackages, packageId]);

	// Idem untuk durasi sementara: ganti service type bisa membuat durasinya
	// tidak ada di pricelist. Kalau dibiarkan, input tersembunyi tetap terkirim
	// dan server menolak dengan pesan yang membingungkan.
	useEffect(() => {
		if (!pendingHours || frameSize) return; // frame terisi → urusan handleFrameChange
		const exists = durationChoices.some(
			(d) => d.hours === Number(pendingHours),
		);
		if (!exists) setPendingHours("");
	}, [durationChoices, pendingHours, frameSize]);

	// === Schedule (auto-fill setup/end)
	const [eventDate, setEventDate] = useState(get("event_date", ""));
	// Tanggal TETAP wajib (kunci jadwal, availability, cutoff, KPI). Yang
	// ditandai TBC cuma kepastiannya — lihat 20260805_booking_tbc_venue_date.sql.
	const [dateIsEstimate, setDateIsEstimate] = useState(
		get("event_date_is_estimate") === "on",
	);
	const [setupTime, setSetupTime] = useState(get("setup_time", ""));
	const [startTime, setStartTime] = useState(get("start_time", ""));
	const [endTime, setEndTime] = useState(get("end_time", ""));
	// Sama seperti venueTbc: eksplisit & default MATI — picker jamnya langsung
	// bisa dipakai, menyusul cuma kalau owner sengaja menandainya.
	const [startTbc, setStartTbc] = useState(false);
	const [setupTouched, setSetupTouched] = useState(Boolean(get("setup_time")));
	const [endTouched, setEndTouched] = useState(Boolean(get("end_time")));

	// Mode "acara dengan jeda" mengisi start_time dari envelope sesi, di luar
	// TimePicker. Tanpa ini, picker bisa tetap terkunci abu-abu padahal jamnya
	// sudah ada — TBC dan isi tidak boleh hidup bersamaan.
	useEffect(() => {
		if (startTime) setStartTbc(false);
	}, [startTime]);

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

	// === Session split — acara dengan JEDA (booth buka → tutup → buka lagi) ===
	// Sesi aktif per-segmen; jeda antar-sesi diturunkan dari selisih (tentatif).
	const initialSegments = parseSegments(
		stateValues?.session_segments ?? defaults?.session_segments,
	);
	const [splitMode, setSplitMode] = useState<boolean>(
		hasBreak(initialSegments),
	);
	const [sessions, setSessions] = useState<Segment[]>(initialSegments ?? []);

	// Saat split aktif: start/end acara = envelope (mulai sesi pertama → selesai
	// sesi terakhir). Ini menjaga setup auto-fill (−1 jam dari mulai) tetap jalan
	// dan hidden input start_time/end_time otomatis benar untuk semua pembaca lama.
	useEffect(() => {
		if (!splitMode) return;
		const env = sessions.length ? segmentsEnvelope(sessions) : null;
		if (!env) return;
		setStartTime(env.start);
		setEndTime(env.end);
		setEndTouched(true);
	}, [splitMode, sessions]);

	const sessionValidation = useMemo(
		() => (splitMode && sessions.length ? validateSegments(sessions) : null),
		[splitMode, sessions],
	);
	const sessionActiveMin = useMemo(() => activeMinutes(sessions), [sessions]);
	const sessionGaps = useMemo(() => segmentGaps(sessions), [sessions]);

	// Masuk mode jeda: seed Sesi 1 = window sekarang (start..end), lalu owner
	// tinggal "+ Tambah sesi" yang auto-isi jeda default + sisa jam paket.
	function enterSplitMode() {
		let seed: Segment[] = sessions;
		if (!seed.length) {
			if (startTime && endTime) seed = [{ start: startTime, end: endTime }];
			else if (startTime)
				seed = [
					{
						start: startTime,
						end: minutesToTime((timeToMinutes(startTime) ?? 0) + 60),
					},
				];
			else seed = [];
		}
		setSessions(seed);
		setSplitMode(true);
	}

	// Keluar mode jeda: kembali ke satu blok, pakai envelope sebagai window.
	function exitSplitMode() {
		const env = sessions.length ? segmentsEnvelope(sessions) : null;
		if (env) {
			setStartTime(env.start);
			setEndTime(env.end);
			setEndTouched(true);
		}
		setSplitMode(false);
		setSessions([]);
	}

	// Tambah sesi: mulai = selesai sesi terakhir + jeda default 30 menit,
	// durasi = sisa jam paket yang belum terjadwal (min 30 menit).
	function addSession() {
		setSessions((prev) => {
			const last = prev[prev.length - 1];
			const anchorEnd = last
				? (timeToMinutes(last.end) ?? 0)
				: (timeToMinutes(startTime) ?? 0);
			const DEFAULT_GAP = 30;
			const newStart = anchorEnd + DEFAULT_GAP;
			const pkgMin = selectedPkg ? selectedPkg.duration_hours * 60 : 0;
			const used = activeMinutes(prev);
			const remaining = pkgMin > 0 ? Math.max(30, pkgMin - used) : 60;
			const newEnd = Math.min(24 * 60, newStart + remaining);
			return [
				...prev,
				{ start: minutesToTime(newStart), end: minutesToTime(newEnd) },
			];
		});
	}

	function updateSession(i: number, patch: Partial<Segment>) {
		setSessions((prev) =>
			prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
		);
	}

	function removeSession(i: number) {
		setSessions((prev) => {
			const next = prev.filter((_, idx) => idx !== i);
			if (next.length < 2) {
				// Turun di bawah 2 sesi → tak ada jeda lagi. Collapse ke satu blok.
				const env = segmentsEnvelope(next.length ? next : prev);
				if (env) {
					setStartTime(env.start);
					setEndTime(env.end);
					setEndTouched(true);
				}
				setSplitMode(false);
				return [];
			}
			return next;
		});
	}

	// Tally: total jam aktif vs durasi paket (soft hint, tidak nge-block simpan).
	const pkgHours = selectedPkg?.duration_hours ?? null;
	const pkgMinTarget = pkgHours !== null ? pkgHours * 60 : null;
	const tallyDiff = pkgMinTarget !== null ? sessionActiveMin - pkgMinTarget : 0;
	const sessionEnvelope = splitMode ? segmentsEnvelope(sessions) : null;
	const serializedSegments =
		splitMode && sessions.length >= 2 ? JSON.stringify(sessions) : "";

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
	// Status TBC disimpan EKSPLISIT, bukan diturunkan dari "venueName kosong",
	// supaya tiap klik selalu mengubah sesuatu yang kelihatan (input aktif ⇄
	// input dikunci).
	//
	// Default MATI, bukan mengikuti kolom yang masih kosong: menandai menyusul
	// itu keputusan sadar owner. Kalau nyala duluan, tiap kali mau mengetik
	// venue harus mematikannya dulu — itu kerja tambahan untuk kasus yang
	// justru paling sering. Kolom kosong tetap kebaca TBC lewat banner di
	// bawah field + lib/events/tbc.ts (reminder H-7/H-3 & tampilan crew).
	const [venueTbc, setVenueTbc] = useState(false);
	const venueInputRef = useRef<HTMLInputElement>(null);
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
	// Pola sama dengan venueTbc/startTbc: eksplisit & default MATI.
	const [picTbc, setPicTbc] = useState(false);
	const picInputRef = useRef<HTMLInputElement>(null);

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

	const addonLines = useMemo(() => {
		const lines: Array<{ name: string; qty: number; total: number }> = [];
		for (const a of addons) {
			const qty = selectedAddons[a.id];
			if (qty && qty > 0) {
				lines.push({ name: a.name, qty, total: a.price * qty });
			}
		}
		return lines.sort((x, y) => y.total - x.total);
	}, [addons, selectedAddons]);

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

	// === Summary panel derived values ===
	// Format event date as "24 Mei 2026" (Indonesian locale)
	const eventDateLabel = useMemo(() => {
		if (!eventDate) return undefined;
		const d = new Date(eventDate);
		if (Number.isNaN(d.getTime())) return undefined;
		return d.toLocaleDateString("id-ID", {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	}, [eventDate]);

	const eventTimeRange = useMemo(() => {
		if (splitMode && sessions.length >= 2) {
			return sessions
				.map((s) => `${s.start.slice(0, 5)}–${s.end.slice(0, 5)}`)
				.join(" · ");
		}
		if (!startTime && !endTime) return undefined;
		const fmt = (t: string) => (t ? t.slice(0, 5) : "—");
		return `${fmt(startTime)}–${fmt(endTime)}`;
	}, [splitMode, sessions, startTime, endTime]);

	// Vendor commission preview (mirrors server-side computeVendorCommissionAmount)
	const vendorCommissionAmount = useMemo(() => {
		if (channel !== "vendor") return 0;
		const v = Number(vendorCommissionValue) || 0;
		if (vendorCommissionMode === "upfront_cut") {
			// Potongan langsung — percent is off the package base price.
			return vendorCommissionValueType === "percent"
				? Math.round(((basePrice || 0) * v) / 100)
				: Math.round(v);
		}
		if (vendorCommissionValueType === "percent") {
			return Math.round((grandTotal * v) / 100);
		}
		return Math.round(v);
	}, [
		channel,
		vendorCommissionMode,
		vendorCommissionValueType,
		vendorCommissionValue,
		grandTotal,
		basePrice,
	]);

	// Section progress — derived from state + server errors.
	const navItems = useMemo<NavItem[]>(() => {
		const errCount = (...keys: string[]) =>
			keys.reduce(
				(n, k) => (stateErrors?.[k as keyof typeof stateErrors] ? n + 1 : n),
				0,
			);

		// A: Source & Vendor
		const aErrN = errCount("channel", "vendor_name", "referrer_user_id");
		const aOk = Boolean(
			channel &&
				(channel === "direct" ||
					(channel === "vendor" && vendorName) ||
					(channel === "relasi" && referrerUserId)),
		);
		// B: Event Details (category + date + venue)
		const bErrN = errCount(
			"event_category",
			"event_date",
			"start_time",
			"venue_name",
		);
		// start_time & venue_name tidak lagi required — owner boleh tandai TBC
		// kalau klien belum kasih jam / belum tahu tempatnya. Yang benar-benar
		// wajib tinggal kategori + tanggal (tanggal tetap wajib karena jadi kunci
		// jadwal, availability, cutoff, dan KPI — lihat migration 20260805).
		const bOk = Boolean(eventCategory && eventDate);
		// C: Service Package (service + package)
		const cErrN = errCount("service_type", "package_id");
		const cOk = Boolean(serviceType && packageId);
		// D: Contact & Pricing (client_wa + basePrice)
		const dErrN = errCount("client_name", "client_wa", "base_price");
		const dOk = Boolean(clientName && clientWa && basePrice > 0);

		return [
			{
				id: "cluster-source",
				label: "Sumber & Vendor",
				status: aErrN > 0 ? "error" : aOk ? "ok" : "empty",
				issueCount: aErrN,
			},
			{
				id: "cluster-event",
				label: "Event Details",
				status: bErrN > 0 ? "error" : bOk ? "ok" : "empty",
				issueCount: bErrN,
			},
			{
				id: "cluster-service",
				label: "Service Package",
				status: cErrN > 0 ? "error" : cOk ? "ok" : "empty",
				issueCount: cErrN,
			},
			{
				id: "cluster-contact",
				label: "Contact & Pricing",
				status: dErrN > 0 ? "error" : dOk ? "ok" : "empty",
				issueCount: dErrN,
			},
		];
	}, [
		stateErrors,
		channel,
		vendorName,
		referrerUserId,
		eventCategory,
		eventDate,
		startTime,
		venueName,
		serviceType,
		packageId,
		clientName,
		clientWa,
		basePrice,
	]);

	function handleCancel() {
		router.push("/operations");
	}

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

	/**
	 * Satu dropdown, dua jenis pilihan: paket konkret (uuid) atau paket
	 * sementara berbasis durasi ("dur:2") saat ukuran masih menyusul.
	 */
	function handlePackageChange(value: string) {
		if (value.startsWith("dur:")) {
			const hours = Number(value.slice(4));
			setPackageId("");
			setPendingHours(String(hours));
			const opt = durationChoices.find((d) => d.hours === hours);
			if (opt && !basePriceTouched) setBasePrice(opt.price);
			return;
		}
		setPackageId(value);
		setPendingHours("");
		if (value) {
			const pkg = packages.find((p) => p.id === value);
			// Ikuti harga paket selama owner belum menimpanya manual — termasuk
			// saat berpindah antar-paket berkali-kali.
			if (pkg && !basePriceTouched) {
				setBasePrice(pkg.base_price);
			}
		}
	}

	/**
	 * Ganti ukuran = ganti paket, otomatis dan terlihat.
	 *
	 * • menyusul → 2R : durasi sementara dikunci jadi paket 2R durasi yang sama
	 * • 2R → 4R       : paket ditukar ke padanannya di 4R (durasi dipertahankan)
	 * • 2R → menyusul : paket dilepas, tinggal durasinya
	 *
	 * Tujuannya satu: tidak pernah ada momen di mana ukuran event dan ukuran
	 * paket berbeda isi.
	 */
	function handleFrameChange(next: string) {
		setFrameSize(next);

		if (packageId) {
			const swapped = swapPackageFrame(packages, packageId, next || null);
			if (swapped) {
				if (swapped.id !== packageId) {
					setPackageId(swapped.id);
					if (!basePriceTouched) setBasePrice(swapped.base_price);
					toast.success(`Paket ikut disesuaikan → ${swapped.name}`);
				}
				setPendingHours("");
				return;
			}
			// Tidak ada padanan (mis. ukuran dikosongkan lagi): simpan durasinya
			// supaya kesepakatan dengan klien tidak hilang, paketnya dilepas.
			const cur = packages.find((p) => p.id === packageId);
			setPackageId("");
			if (cur) {
				setPendingHours(String(cur.duration_hours));
				toast.info(
					next
						? `Belum ada paket ${cur.duration_hours} jam untuk ukuran ${next} — pilih paketnya manual.`
						: `Ukuran jadi menyusul — paket disimpan sebagai "${cur.duration_hours} jam · ukuran menyusul".`,
				);
			}
			return;
		}

		if (pendingHours && next) {
			const exact = resolvePackage(
				packages,
				serviceType || null,
				Number(pendingHours),
				next,
			);
			if (exact) {
				setPackageId(exact.id);
				setPendingHours("");
				if (!basePriceTouched) setBasePrice(exact.base_price);
				toast.success(`Ukuran ${next} → paket dikunci: ${exact.name}`);
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
		<TooltipProvider>
			{saveOverlay && (
				<SavePopup state={saveOverlay} onDismissError={handleDismissError} />
			)}
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
				<form
					id="booking-form"
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

					{/* === 1. CHANNEL (Cluster A anchor — id on the section itself so
					    it's the first flow child; a separate empty div would push
					    Section 1 down by space-y-8 and misalign it with the rail). === */}
					<Section
						step={1}
						id="cluster-source"
						className="scroll-mt-20"
						title="Sumber Booking"
						description="Pilih dulu dari mana booking ini datang — selanjutnya form akan menyesuaikan."
					>
						<Field
							label="Sales Channel"
							name="channel"
							error={err("channel")}
							required
							layoutMode="grid"
						>
							<Combobox
								value={channel}
								onValueChange={setChannel}
								options={CHANNEL_OPTIONS.map(([value, label]) => ({
									value,
									label,
								}))}
								placeholder="Pilih channel"
								allowFreeText={false}
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
									channel === "vendor"
										? "Direferensikan oleh Vendor"
										: "Direferensikan oleh"
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
											hint="Pilih dari master vendor, atau ketik nama baru (auto-create di /vendors saat save)."
											required
											layoutMode="grid"
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
											<input
												type="hidden"
												name="vendor_name"
												value={vendorName}
											/>
										</Field>
										<div className="grid gap-6 md:grid-cols-2">
											<Field
												label="Nama PIC / Sales Vendor"
												name="vendor_pic_name"
												error={err("vendor_pic_name")}
												tooltip="Orang yang kita kontak dari vendor (mis. nama salesnya)."
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
												tooltip="Kontak utama buat koordinasi event. Format: 08xxxxxxxxxx"
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
													Default dari master vendor; override per event kalau
													perlu.
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
															Klien bayar Tetra full, Tetra transfer komisi ke
															vendor.
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
															Vendor potong dari base price — nominal tetap atau
															persen. Tetra terima sisanya.
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
												<ValueTypeToggle
													value={vendorCommissionValueType}
													onChange={setVendorCommissionValueType}
													name="vendor_commission_value_type"
												/>
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
																vendorCommissionValueType === "percent"
																	? 100
																	: undefined
															}
															step={
																vendorCommissionValueType === "percent"
																	? 0.5
																	: 1000
															}
															value={vendorCommissionValue}
															onChange={(e) =>
																setVendorCommissionValue(e.target.value)
															}
															placeholder={
																vendorCommissionValueType === "percent"
																	? "10"
																	: "500000"
															}
															className={`${inputClass} tabular ${
																vendorCommissionValueType === "flat"
																	? "pl-9"
																	: ""
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
												<div className="grid gap-4 md:grid-cols-2">
													<ValueTypeToggle
														value={vendorCommissionValueType}
														onChange={setVendorCommissionValueType}
														name="vendor_commission_value_type"
													/>
													<Field
														label={
															vendorCommissionValueType === "percent"
																? "Potongan Vendor (%)"
																: "Potongan Vendor (Rp)"
														}
														name="vendor_commission_value"
														error={err("vendor_commission_value")}
														hint={
															vendorCommissionValueType === "percent"
																? "Persentase dari base price paket. Standar 10%."
																: "Nominal tetap yang vendor potong dari base price per event."
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
																	vendorCommissionValueType === "percent"
																		? 100
																		: undefined
																}
																step={
																	vendorCommissionValueType === "percent"
																		? 0.5
																		: 50000
																}
																value={vendorCommissionValue}
																onChange={(e) =>
																	setVendorCommissionValue(e.target.value)
																}
																placeholder={
																	vendorCommissionValueType === "percent"
																		? "10"
																		: "500000"
																}
																className={`${inputClass} tabular ${
																	vendorCommissionValueType === "flat"
																		? "pl-9"
																		: ""
																}`}
															/>
															{vendorCommissionValueType === "percent" && (
																<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
																	%
																</span>
															)}
															<input
																type="hidden"
																name="vendor_commission_value"
																value={vendorCommissionValue}
															/>
														</div>
													</Field>
												</div>

												{/* Live preview of vendor cut math. Numbers update as user
									    edits base_price (in Financial section), the percent/flat
									    toggle, or the potongan value. */}
												<div className="rounded-md border border-border-default bg-surface-3/40 p-3">
													<div className="eyebrow mb-1.5">Skema potongan</div>
													<dl className="space-y-1 text-[13px]">
														<div className="flex items-baseline justify-between gap-3">
															<dt className="text-muted-foreground">
																Base price (paket)
															</dt>
															<dd className="tabular font-medium text-foreground">
																{formatRupiah(basePrice || 0)}
															</dd>
														</div>
														<div className="flex items-baseline justify-between gap-3">
															<dt className="text-muted-foreground">
																Potongan vendor
																{vendorCommissionValueType === "percent" &&
																Number(vendorCommissionValue) > 0
																	? ` (${Number(vendorCommissionValue)}%)`
																	: ""}
															</dt>
															<dd className="tabular font-medium text-rose-600 dark:text-rose-400">
																− {formatRupiah(vendorCommissionAmount)}
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
																		(basePrice || 0) - vendorCommissionAmount,
																	),
																)}
															</dd>
														</div>
													</dl>
													<p className="mt-2 text-[11px] leading-snug text-muted-foreground">
														Beda dari{" "}
														<span className="font-medium">Discount</span> di
														section Financial: discount = potongan untuk klien
														(klien bayar lebih sedikit). Potongan vendor =
														vendor ambil fee dari payment flow.
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
												emptyMessage="Nggak ketemu — cek daftar di Settings → Tim"
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
					{/* Komisi sales Tetra berlaku di SEMUA channel: event dari vendor/
					    relasi pun sales/admin yang closing tetap dapat komisinya sendiri
					    (di luar komisi mitra). Boleh dikosongkan & diisi saat settle. */}
					{
						<div className="fade-in-on-mount">
							<Section
								step={2}
								title="Sales Tetra"
								description="Opsional. Pilih sales yang closing event ini kalau memang ada — komisinya tentatif, boleh Rp0 alias tanpa komisi, boleh juga diisi nanti saat settle event."
							>
								<Field
									label="Sales (User Tetra)"
									name="sales_user_id"
									error={err("sales_user_id")}
									hint="Cari nama owner/crew yang closing. Kosongkan kalau nggak ada sales-nya atau belum pasti."
								>
									<Combobox
										value={salesUserId}
										onValueChange={(v) => {
											setSalesUserId(v);
											// Sales baru dipilih & nominal masih kosong → sarankan
											// 100rb (tetap boleh diubah/dinolkan). Sales dikosongkan
											// → nolkan juga, jangan tinggalkan komisi tanpa penerima.
											if (v && salesCommission.trim() === "") {
												setSalesCommission("100000");
											} else if (!v) {
												setSalesCommission("");
											}
										}}
										options={relasiOptions.map(
											(r): ComboboxOption => ({
												value: r.id,
												label: r.full_name,
												sublabel: r.role,
											}),
										)}
										placeholder="Cari nama sales…"
										allowFreeText={false}
										emptyMessage="Nggak ketemu — cek daftar di Settings → Tim"
										aria-label="Cari sales"
									/>
									<input
										type="hidden"
										name="sales_user_id"
										value={salesUserId}
									/>
								</Field>
								<Field
									label="Komisi Sales (Rp)"
									name="direct_sales_commission"
									error={err("direct_sales_commission")}
									hint="Tentatif — boleh Rp0 (tanpa komisi) atau dikosongkan dulu, nanti bisa diatur lagi waktu settle event. Biasanya Rp50.000–100.000."
								>
									<div className="space-y-2">
										<div className="flex flex-wrap gap-1.5">
											{SALES_COMMISSION_PRESETS.map((preset) => {
												const active =
													(Number(salesCommission) || 0) === preset.amount &&
													salesCommission.trim() !== "";
												return (
													<button
														key={preset.amount}
														type="button"
														onClick={() =>
															setSalesCommission(String(preset.amount))
														}
														className={`press-down tabular h-8 rounded-full border px-3 text-[13px] transition-colors ${
															active
																? "border-primary bg-primary text-primary-foreground"
																: "border-border-default bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
														}`}
													>
														{preset.label}
													</button>
												);
											})}
										</div>
										<input
											type="number"
											min={0}
											step={1}
											value={salesCommission}
											onChange={(e) => setSalesCommission(e.target.value)}
											placeholder="0"
											className={`${inputClass} tabular`}
										/>
										{(Number(salesCommission) || 0) > 0 && !salesUserId ? (
											<p className="text-[11px] font-medium text-rose-600">
												Pilih dulu sales penerimanya — kalau tidak, komisinya
												tidak dicatat.
											</p>
										) : null}
									</div>
									<input
										type="hidden"
										name="direct_sales_commission"
										value={
											salesCommission.trim() === "" ? "0" : salesCommission
										}
									/>
								</Field>
							</Section>
						</div>
					}
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

					{/* === Cluster B anchor === */}
					<div id="cluster-event" className="scroll-mt-20" />

					{/* === 3. EVENT TYPE + Category sub-fields === */}
					<Section
						step={3}
						title="Tipe Acara"
						description="Kategori event nentuin field nama klien yang muncul di bawah."
					>
						<Field
							label="Kategori Event"
							name="event_category"
							error={err("event_category")}
							required
							layoutMode="grid"
						>
							<Combobox
								value={eventCategory}
								onValueChange={(v) => {
									setEventCategory(v);
									setCategoryMeta({}); // reset sub-fields
									setClientNameTouched(false); // re-derive client_name
								}}
								placeholder="Pilih kategori"
								options={eventTypes.map((t) => ({
									value: t.code,
									label: t.label,
								}))}
								allowFreeText={false}
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
							tooltip="Nama klien atau acara yang muncul di list operations. Saat kategori event diisi, ini auto-derive — edit manual kalau perlu."
							hint={
								categoryTpl
									? "Auto-derive dari field di atas. Edit manual kalau perlu."
									: undefined
							}
							required
							layoutMode="grid"
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
							<input
								type="hidden"
								name="client_name"
								value={clientName}
								required
							/>
						</Field>
					</Section>

					{/* === 4. SCHEDULE === */}
					<Section
						step={4}
						title="Jadwal"
						description="Setup auto-fill −1 jam dari mulai. Kalau ada jeda, acara bisa dipecah jadi beberapa sesi."
					>
						{/* Hidden inputs — selalu ada di kedua mode. Saat split aktif,
						    start/end = envelope (disinkron dari sesi via effect). */}
						<input type="hidden" name="event_date" value={eventDate} required />
						{dateIsEstimate && (
							<input type="hidden" name="event_date_is_estimate" value="on" />
						)}
						<input type="hidden" name="start_time" value={startTime} />
						<input type="hidden" name="setup_time" value={setupTime} />
						<input type="hidden" name="end_time" value={endTime} />
						<input
							type="hidden"
							name="session_segments"
							value={serializedSegments}
						/>

						<div className="grid gap-6 md:grid-cols-2">
							<Field
								label="Tanggal Event"
								name="event_date"
								error={err("event_date")}
								required
								hint={
									dateIsEstimate
										? "Ditandai perkiraan — tetap dipakai buat jadwal & cek bentrok"
										: "Klien belum pasti? Klik 'Masih perkiraan'"
								}
							>
								<div className="flex items-stretch gap-2">
									<div className="min-w-0 flex-1">
										<DatePicker
											value={eventDate}
											onValueChange={setEventDate}
											placeholder="Pilih tanggal"
											aria-invalid={!!err("event_date")}
										/>
									</div>
									<button
										type="button"
										onClick={() => setDateIsEstimate((v) => !v)}
										aria-pressed={dateIsEstimate}
										className={`shrink-0 rounded-md border px-3 text-fluid-caption font-medium transition ${
											dateIsEstimate
												? "border-amber-500/60 bg-amber-500/15 text-amber-900 dark:text-amber-200"
												: "border-border-default text-foreground/70 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-900 dark:hover:text-amber-200"
										}`}
									>
										{dateIsEstimate ? "✓ Perkiraan" : "Masih perkiraan?"}
									</button>
								</div>
							</Field>

							{splitMode ? (
								<Field
									label="Setup"
									name="setup_time"
									error={err("setup_time")}
									hint={
										setupTouched
											? "Manual override"
											: "Auto: 1 jam sebelum sesi pertama"
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
								</Field>
							) : (
								<Field
									label="Jam Mulai"
									name="start_time"
									error={err("start_time")}
									hint={
										startTbc
											? "Ditandai TBC — klik 'Menyusul' lagi kalau mau isi sekarang"
											: startTime
												? "Set ini dulu, setup + selesai auto-fill"
												: "Klien belum kasih jam? Klik 'Menyusul' untuk tandai TBC"
									}
								>
									<div className="flex items-stretch gap-2">
										<div className="flex-1">
											<TimePicker
												value={startTime}
												disabled={startTbc}
												onValueChange={(v) => {
													setStartTime(v);
													if (v) {
														setSetupTouched(false);
														setEndTouched(false);
													}
												}}
												aria-invalid={!!err("start_time")}
											/>
										</div>
										<TbcToggle
											active={startTbc}
											onClick={() => {
												if (startTbc) {
													// Balik ke isi manual — cukup buka kuncinya; picker
													// yang tadinya redup jadi aktif, jelas terlihat.
													setStartTbc(false);
													return;
												}
												// Ke TBC — kunci + clear semua waktu sekaligus, karena
												// setup + selesai derive dari start
												setStartTbc(true);
												setStartTime("");
												setSetupTime("");
												setEndTime("");
												setSetupTouched(false);
												setEndTouched(false);
											}}
										/>
									</div>
								</Field>
							)}
						</div>

						{dateIsEstimate ? (
							<div className="fade-in-on-mount flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-fluid-caption text-amber-900 dark:text-amber-200">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<div>
									<p className="font-medium">Tanggal masih perkiraan (TBC)</p>
									<p className="text-amber-900/80 dark:text-amber-200/80">
										Tanggalnya tetap dipakai buat jadwal &amp; cek bentrok alat
										/ crew, jadi slot ini aman ditahan. Event ditandai TBC di
										Operations dan sistem reminder H-7 + H-3 sampai klien
										memastikan.
									</p>
								</div>
							</div>
						) : null}

						{!splitMode && !startTime ? (
							<div className="fade-in-on-mount flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-fluid-caption text-amber-900 dark:text-amber-200">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<div>
									<p className="font-medium">
										Jam mulai belum ditentukan (TBC)
									</p>
									<p className="text-amber-900/80 dark:text-amber-200/80">
										Setup + selesai akan auto-fill setelah jam mulai diisi.
										Sistem akan reminder H-7 + H-3 kalau masih kosong.
									</p>
								</div>
							</div>
						) : null}

						{!splitMode && startTime ? (
							<div className="grid gap-6 md:grid-cols-2">
								<Field
									label="Setup"
									name="setup_time"
									error={err("setup_time")}
									hint={
										setupTouched
											? "Manual override"
											: "Auto: 1 jam sebelum mulai"
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
								</Field>
								<Field
									label="Selesai"
									name="end_time"
									error={err("end_time")}
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
								</Field>
							</div>
						) : null}

						{/* Toggle "Ada jeda?" — muncul kalau jam mulai sudah diisi. */}
						{startTime || splitMode ? (
							<div className="flex items-center justify-between gap-3 rounded-xl border border-border-default bg-secondary/40 px-3.5 py-3">
								<div className="flex items-start gap-2.5">
									<Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
									<div>
										<p className="text-fluid-body font-medium">
											Ada jeda di tengah acara?
										</p>
										<p className="text-fluid-caption text-muted-foreground">
											Booth buka, tutup pas dinner/sambutan, buka lagi. Durasi
											paket dihitung dari total jam aktif.
										</p>
									</div>
								</div>
								<Switch
									checked={splitMode}
									onCheckedChange={() =>
										splitMode ? exitSplitMode() : enterSplitMode()
									}
									aria-label="Ada jeda di tengah acara"
								/>
							</div>
						) : null}

						{/* Split mode: daftar sesi + tally */}
						{splitMode ? (
							<div className="fade-in-on-mount space-y-3 rounded-xl border border-border-default bg-secondary/30 p-3 sm:p-4">
								<div className="space-y-1.5">
									{sessions.map((s, i) => {
										const dMin = Math.max(
											0,
											(timeToMinutes(s.end) ?? 0) -
												(timeToMinutes(s.start) ?? 0),
										);
										const gapBefore = i > 0 ? (sessionGaps[i - 1] ?? 0) : 0;
										return (
											<div key={`sesi-${i}`}>
												{i > 0 ? (
													<div className="flex items-center gap-2 py-1 pl-3.5 text-fluid-caption text-muted-foreground">
														<span className="h-4 w-px bg-border-strong" />
														<span>
															{gapBefore > 0
																? `jeda ${formatDuration(gapBefore)}`
																: "langsung lanjut (tanpa jeda)"}
														</span>
													</div>
												) : null}
												<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg bg-card px-3 py-2.5 shadow-[var(--shadow-level-1)]">
													<span className="w-12 shrink-0 text-fluid-caption font-semibold">
														Sesi {i + 1}
													</span>
													<div className="flex items-center gap-1.5">
														<div className="w-[104px]">
															<TimePicker
																value={s.start}
																onValueChange={(v) =>
																	updateSession(i, { start: v })
																}
																aria-label={`Sesi ${i + 1} mulai`}
															/>
														</div>
														<span className="text-muted-foreground">–</span>
														<div className="w-[104px]">
															<TimePicker
																value={s.end}
																onValueChange={(v) =>
																	updateSession(i, { end: v })
																}
																aria-label={`Sesi ${i + 1} selesai`}
															/>
														</div>
													</div>
													<span className="tabular ml-auto text-fluid-caption text-muted-foreground">
														{formatDuration(dMin)}
													</span>
													<button
														type="button"
														onClick={() => removeSession(i)}
														aria-label={`Hapus sesi ${i + 1}`}
														className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-700"
													>
														<X className="size-4" />
													</button>
												</div>
											</div>
										);
									})}
								</div>

								<button
									type="button"
									onClick={addSession}
									className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong py-2 text-fluid-caption font-medium text-foreground/70 transition hover:border-primary/40 hover:bg-card hover:text-foreground"
								>
									<Plus className="size-4" /> Tambah sesi
								</button>

								{sessionValidation && !sessionValidation.ok ? (
									<p className="flex items-center gap-1.5 text-fluid-caption font-medium text-rose-700">
										<AlertTriangle className="size-3.5 shrink-0" />
										{sessionValidation.error}
									</p>
								) : null}

								<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border-subtle pt-2.5">
									<span
										className={cn(
											"inline-flex items-center gap-1.5 text-fluid-caption font-medium",
											pkgMinTarget === null
												? "text-muted-foreground"
												: tallyDiff === 0
													? "text-emerald-800 dark:text-emerald-300"
													: "text-amber-800 dark:text-amber-300",
										)}
									>
										{pkgMinTarget !== null && tallyDiff === 0 ? (
											<CheckCircle2 className="size-3.5 shrink-0" />
										) : null}
										{pkgMinTarget === null
											? `Total aktif ${formatDuration(sessionActiveMin)}`
											: tallyDiff === 0
												? `Total aktif ${formatDuration(sessionActiveMin)} · pas paket ${pkgHours} jam`
												: tallyDiff < 0
													? `Total aktif ${formatDuration(sessionActiveMin)} · paket ${pkgHours} jam — kurang ${formatDuration(-tallyDiff)}`
													: `Total aktif ${formatDuration(sessionActiveMin)} · paket ${pkgHours} jam — lebih ${formatDuration(tallyDiff)}`}
									</span>
									{sessionEnvelope ? (
										<span className="tabular text-fluid-caption text-muted-foreground">
											Acara {sessionEnvelope.start}–{sessionEnvelope.end}
											{setupTime ? ` · setup ${setupTime}` : ""}
										</span>
									) : null}
								</div>
							</div>
						) : null}
					</Section>

					{/* === Cluster C anchor === */}
					<div id="cluster-service" className="scroll-mt-20" />

					{/* === 5. SERVICE & PACKAGE === */}
					<Section
						step={5}
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
								<Combobox
									value={serviceType}
									onValueChange={setServiceType}
									placeholder="Pilih service"
									options={SERVICE_TYPE_OPTIONS.map(([value, label]) => ({
										value,
										label,
									}))}
									allowFreeText={false}
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
								hint={
									frameSize
										? "Paket ikut ukuran ini — ganti ukuran, paket otomatis menyesuaikan."
										: "Klien belum kasih ukuran? Pilih 'Menyusul' — paket cukup dipilih durasinya dulu."
								}
							>
								<Combobox
									value={frameSize}
									onValueChange={handleFrameChange}
									placeholder="Pilih frame"
									options={[
										{ value: "", label: "Menyusul / belum ditentukan" },
										...FRAME_SIZE_OPTIONS.map(([value, label]) => ({
											value,
											label: label === "—" ? "None" : label,
										})),
									]}
									allowFreeText={false}
									aria-invalid={!!err("frame_size")}
								/>
								<input type="hidden" name="frame_size" value={frameSize} />
							</Field>
						</div>

						{!frameSize && frameRelevan && (
							<div className="fade-in-on-mount flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-fluid-caption text-amber-900 dark:text-amber-200">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<div>
									<p className="font-medium">
										Frame size belum ditentukan (TBC)
									</p>
									<p className="text-amber-900/80 dark:text-amber-200/80">
										Paket cuma bisa dipilih <b>durasinya</b> dulu (harga per
										durasi sama untuk 2R/4R/Polaroid, jadi nominal tidak
										berubah). Begitu klien memastikan ukurannya, paket otomatis
										dikunci. Sistem mengingatkan tiap hari di Telegram sampai
										ukurannya diisi.
									</p>
								</div>
							</div>
						)}
						<Field
							label="Paket"
							name="package_id"
							error={err("package_id") ?? err("pending_package_hours")}
							hint={
								!serviceType
									? "Pilih Service Type dulu buat filter paket."
									: !frameSize && frameRelevan
										? "Ukuran masih menyusul — pilih durasinya saja. Paket final dikunci otomatis begitu ukuran diisi."
										: filteredPackages.length === 0
											? "Tidak ada paket yang cocok dengan kombinasi ini — pakai custom."
											: `${filteredPackages.length} paket cocok. Pilih untuk auto-fill base price.`
							}
						>
							<Combobox
								value={packageId || (pendingHours ? `dur:${pendingHours}` : "")}
								onValueChange={(v) => handlePackageChange(v)}
								placeholder="Custom / belum dipilih"
								options={[
									{ value: "", label: "Custom / belum dipilih" },
									...durationChoices.map((d) => ({
										value: `dur:${d.hours}`,
										label: `${d.hours} Jam · ${d.priceVaries ? "mulai " : ""}${formatRupiah(d.price)} · ukuran menyusul`,
									})),
									...filteredPackages.map((pkg) => ({
										value: pkg.id,
										label: `${pkg.name} · ${pkg.duration_hours}j · ${formatRupiah(pkg.base_price)}`,
									})),
								]}
								allowFreeText={false}
							/>
							<input type="hidden" name="package_id" value={packageId} />
							<input
								type="hidden"
								name="pending_package_hours"
								value={packageId ? "" : pendingHours}
							/>
						</Field>
					</Section>

					{/* === 6. CUSTOMIZATION & BACKDROP === */}
					<Section
						step={6}
						title="Customization"
						description="Backdrop + flashdisk. Bisa di-update nanti kalau klien belum mutusin."
					>
						<Field
							label="Backdrop"
							name="backdrop_id"
							error={err("backdrop_id")}
							layoutMode="grid"
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
							<Combobox
								value={backdropId}
								onValueChange={setBackdropId}
								placeholder="Belum ditentukan / nyusul"
								options={[
									{ value: "", label: "Belum ditentukan / nyusul" },
									// Sort priority: client_provided ("Dari Klien") di paling
									// atas karena paling sering dipilih owner. Lalu basic,
									// vendor_decor, rental_owned. Within same type → by name.
									...[...backdrops]
										.sort((a, b) => {
											const order: Record<string, number> = {
												client_provided: 0,
												basic_included: 1,
												vendor_decor: 2,
												rental_owned: 3,
											};
											const pa = order[a.type] ?? 99;
											const pb = order[b.type] ?? 99;
											if (pa !== pb) return pa - pb;
											return a.name.localeCompare(b.name);
										})
										.map((b) => ({
											value: b.id,
											// Label: cuma {name} + suffix yang BENAR-BENAR informatif.
											// Hindari repetisi nama vs type label ("Vendor Decor ·
											// Vendor Decor"). Suffix cuma untuk rental price.
											label:
												b.type === "rental_owned" && b.rental_price > 0
													? `${b.name} · ${formatRupiah(b.rental_price)}`
													: b.name,
										})),
								]}
								allowFreeText={false}
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
									layoutMode="grid"
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
									Standar Tetra: pouch + flashdisk berisi semua foto/video
									event. Uncheck kalau klien bawa FD sendiri / cuma minta
									softfile.
								</div>
							</div>
						</label>
					</Section>

					{/* === 7. LOCATION === */}
					<Section
						step={7}
						title="Lokasi Event"
						description="Venue + alamat. Klik 'Cari di Google Maps' buat pin lokasi & paste URL kembali ke kolom."
					>
						<Field
							label="Nama Venue"
							name="venue_name"
							error={err("venue_name")}
							layoutMode="grid"
							hint={
								venueTbc
									? "Ditandai TBC — klik 'Menyusul' lagi kalau mau isi sekarang"
									: "Klien belum tau tempatnya? Klik 'Menyusul' untuk tandai TBC"
							}
						>
							<div className="flex items-stretch gap-2">
								<input
									ref={venueInputRef}
									type="text"
									value={venueName}
									onChange={(e) => setVenueName(e.target.value)}
									disabled={venueTbc}
									placeholder={
										venueTbc
											? "Menyusul — belum ditentukan"
											: "cth. Grand Ballroom Hotel ABC"
									}
									className={`${inputClass} min-w-0 flex-1 ${
										venueTbc ? "cursor-not-allowed opacity-60" : ""
									}`}
								/>
								<TbcToggle
									active={venueTbc}
									onClick={() => {
										if (venueTbc) {
											// Balik ke isi manual — buka kuncinya lalu taruh kursor
											// di sana, jadi perubahannya langsung terasa.
											setVenueTbc(false);
											requestAnimationFrame(() =>
												venueInputRef.current?.focus(),
											);
											return;
										}
										// Ke TBC — kunci input + kosongkan venue beserta
										// turunannya supaya tak ada sisa alamat/kota dari lokasi
										// yang batal.
										setVenueTbc(true);
										setVenueName("");
										setVenueAddress("");
										setVenueCity("");
										setVenueProvince("");
										setMapsUrl("");
									}}
								/>
							</div>
							<input type="hidden" name="venue_name" value={venueName} />
						</Field>

						{/* Peringatan amber muncul kalau memang ditandai menyusul, atau saat
						    mengedit event lama yang venue-nya masih kosong. Di booking baru
						    yang belum sempat diketik, tidak perlu diomeli duluan — panel
						    amber yang selalu nongol justru bikin state tombol Menyusul
						    susah dibedakan. */}
						{venueTbc || (defaults && !venueName) ? (
							<div className="fade-in-on-mount flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-fluid-caption text-amber-900 dark:text-amber-200">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<div>
									<p className="font-medium">Lokasi belum ditentukan (TBC)</p>
									<p className="text-amber-900/80 dark:text-amber-200/80">
										Booking tetap bisa disimpan. Crew melihat &quot;Lokasi
										menyusul&quot; di jadwalnya, dan sistem reminder H-7 + H-3
										kalau masih kosong.
									</p>
								</div>
							</div>
						) : null}
						<Field
							label="Google Maps URL"
							name="google_maps_url"
							error={err("google_maps_url")}
							layoutMode="grid"
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
							layoutMode="grid"
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
							<input type="hidden" name="venue_address" value={venueAddress} />
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

					{/* === Cluster D anchor === */}
					<div id="cluster-contact" className="scroll-mt-20" />

					{/* === 8. CONTACTS === */}
					<Section
						step={8}
						title="Kontak"
						description="Pembooking (yang booking + utama untuk billing) + PIC di lapangan untuk koordinasi crew hari-H."
					>
						<div className="grid gap-6 md:grid-cols-2">
							<Field
								label="Nama Pembooking"
								name="booker_name"
								error={err("booker_name")}
								tooltip="Yang booking — bisa klien, kakak, panitia, atau vendor/WO. Jadi kontak utama untuk billing."
								hint={
									bookerSameAsVendor
										? `Auto: PIC vendor (${vendorPicName || vendorName || "—"})`
										: bookerSameAsClient
											? `Auto: sama dengan klien (${clientName || "—"})`
											: undefined
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
								tooltip="Primary contact untuk billing + reminder. Format: 08xxxxxxxxxx"
								hint={
									bookerSameAsVendor
										? "Auto: kontak vendor — pakai ini untuk reminder."
										: undefined
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
								<input
									type="hidden"
									name="client_wa"
									value={clientWa}
									required
								/>
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

						<div className="space-y-3 rounded-lg border border-border-default bg-surface-2 p-4">
							<div className="flex items-baseline justify-between gap-2">
								<div className="flex items-center gap-2 text-fluid-body font-medium">
									<Users className="size-4 text-primary" />
									PIC di Lokasi (WO / EO / Panitia / Keluarga)
								</div>
								<TbcToggle
									active={picTbc}
									onClick={() => {
										if (picTbc) {
											setPicTbc(false);
											requestAnimationFrame(() => picInputRef.current?.focus());
											return;
										}
										// Ke TBC — kunci + kosongkan, sekaligus lepas "sama dengan
										// pembooking" supaya tidak diam-diam terisi ulang.
										setPicTbc(true);
										setPicSameAsBooker(false);
										setPicName("");
										setPicWa("");
									}}
								/>
							</div>
							<p className="text-fluid-caption text-muted-foreground">
								Orang yang crew koordinasi di lapangan hari-H. Bisa pembooking
								sendiri, WO, atau keluarga.
							</p>

							{picTbc ? (
								<div className="fade-in-on-mount flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-fluid-caption text-amber-900 dark:text-amber-200">
									<AlertTriangle className="mt-0.5 size-4 shrink-0" />
									<div>
										<p className="font-medium">PIC belum ditentukan (TBC)</p>
										<p className="text-amber-900/80 dark:text-amber-200/80">
											Crew melihat &quot;PIC Event · menyusul&quot; di detail
											jadwalnya dan bisa menekan &quot;Ingatkan owner&quot;
											kalau hari-H makin dekat. Sistem juga reminder H-7 + H-3.
										</p>
									</div>
								</div>
							) : null}

							<label
								className={`flex items-center gap-2 text-fluid-caption ${
									picTbc ? "cursor-not-allowed opacity-60" : "cursor-pointer"
								}`}
							>
								<input
									type="checkbox"
									checked={picSameAsBooker}
									disabled={picTbc}
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
									tooltip="Opsional — orang yang crew koordinasi di lapangan hari-H (WO, EO, panitia, atau keluarga)."
								>
									<input
										ref={picInputRef}
										type="text"
										value={picName}
										onChange={(e) => {
											setPicName(e.target.value);
											setPicSameAsBooker(false);
										}}
										placeholder={
											picTbc
												? "Menyusul — belum ditentukan"
												: "cth. Bu Hanna (WO)"
										}
										disabled={picSameAsBooker || picTbc}
										className={`${inputClass} ${picSameAsBooker || picTbc ? "cursor-not-allowed opacity-60" : ""}`}
									/>
									<input type="hidden" name="pic_name" value={picName} />
								</Field>
								<Field
									label="WA PIC"
									name="pic_wa"
									error={err("pic_wa")}
									tooltip="Akan dipakai di template reminder crew. Format: 08xxxxxxxxxx"
								>
									<input
										type="tel"
										value={picWa}
										onChange={(e) => {
											setPicWa(e.target.value);
											setPicSameAsBooker(false);
										}}
										placeholder={picTbc ? "Menyusul" : "081234567890"}
										disabled={picSameAsBooker || picTbc}
										className={`${inputClass} tabular ${picSameAsBooker || picTbc ? "cursor-not-allowed opacity-60" : ""}`}
									/>
									<input type="hidden" name="pic_wa" value={picWa} />
								</Field>
							</div>
						</div>
					</Section>

					{/* === 9. ADD-ONS === */}
					<Section
						step={9}
						title="Add-ons"
						description="Voucher, print extras, costume, dll."
					>
						<input type="hidden" name="addons_json" value={addonsJson} />
						{addons.length === 0 ? (
							<p className="text-fluid-body italic text-muted-foreground">
								Belum ada add-on aktif. Tambah dari Operations → Add-on.
							</p>
						) : (
							<div className="space-y-4">
								{addonsByCategory.map(([category, items]) => (
									<div key={category} className="space-y-2">
										<h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
											{ADDON_CATEGORY_LABELS[category] ?? category}
										</h4>
										<div className="grid grid-cols-1 gap-1.5 xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
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
															<div className="text-fluid-body font-medium leading-snug">
																{addon.name}
															</div>
															<div className="text-fluid-caption text-muted-foreground">
																<span data-nominal>
																	{formatRupiah(addon.price)}
																</span>{" "}
																per {addon.unit}
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
																		setAddonQty(
																			addon.id,
																			Number(e.target.value),
																		)
																	}
																	onClick={(e) => e.stopPropagation()}
																	className={`${inputClass} tabular h-8 w-16 shrink-0 text-right`}
																/>
																<span className="tabular shrink-0 text-right text-fluid-body font-medium text-foreground">
																	{formatRupiah(addon.price * qty)}
																</span>
															</>
														) : null}
													</label>
												);
											})}
										</div>
									</div>
								))}
								<div className="flex items-center justify-between rounded-md bg-muted px-4 py-2 text-fluid-body">
									<span className="text-muted-foreground">
										Add-ons subtotal
									</span>
									<span className="tabular font-medium">
										{formatRupiah(addonsTotal)}
									</span>
								</div>
							</div>
						)}
					</Section>

					{/* === BONUS (free items, internal only) === */}
					<Section
						step={10}
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
								Belum ada item aktif di katalog. Tambah dulu dari Operations →
								Add-on.
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
										<Combobox
											id="bonus-picker"
											value=""
											placeholder="Pilih item bonus"
											allowFreeText={false}
											emptyMessage="Tidak ada item — coba reset filter atau tambah Add-on di Operations."
											onValueChange={(v) => {
												if (v) addBonusRow(v);
											}}
											options={addons
												.filter(
													(a) => !bonusRows.some((r) => r.addon_id === a.id),
												)
												.map((a) => ({
													value: a.id,
													label: `${ADDON_CATEGORY_LABELS[a.category] ?? a.category} · ${a.name}`,
												}))}
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
															<div className="text-fluid-body font-medium leading-snug">
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
													<RichTextarea
														value={row.notes}
														onChange={(v) => setBonusNotes(row.addon_id, v)}
														placeholder="Catatan (opsional) — cth. 'kasih saat sesi family', 'pre-print sebelum acara'"
														rows={1}
														toolbar={false}
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
						step={11}
						title="Financial"
						description="Harga dan modifier."
					>
						<Field
							label="Base Price (IDR)"
							name="base_price"
							error={err("base_price")}
							hint="Auto-fill dari paket; bisa override manual"
							layoutMode="grid"
						>
							<input
								type="number"
								name="base_price"
								min={0}
								step={1}
								value={basePrice || ""}
								onChange={(e) => {
									setBasePrice(Number(e.target.value) || 0);
									setBasePriceTouched(true);
								}}
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
								hint={`Markup pajak untuk corporate. Auto-calc pakai ${grossupRate}% (config di Settings → Sistem).`}
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
												Math.round(
													(basePrice * grossupRate) / (100 - grossupRate),
												),
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
									layoutMode="grid"
								>
									<Combobox
										value={discountType}
										onValueChange={setDiscountType}
										placeholder="Pilih tipe diskon"
										options={DISCOUNT_TYPE_OPTIONS}
										allowFreeText={false}
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
							layoutMode="grid"
						>
							<RichTextarea
								name="crew_notes"
								rows={2}
								maxLength={500}
								defaultValue={get("crew_notes")}
								placeholder="cth. Akses parkir di basement, tanya security PIC: Pak Agus"
								toolbar={false}
							/>
						</Field>
					</Section>

					<div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border-default bg-surface-2 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-surface-2/85 sm:flex-row sm:items-center sm:justify-between md:-mx-8 md:px-8 lg:hidden">
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
								disabled={
									pending || Boolean(sessionValidation && !sessionValidation.ok)
								}
								className="press-down h-10 rounded-md bg-[#059669] dark:bg-[#0b9e6a] px-4 text-fluid-body font-medium text-white transition-colors hover:bg-[#047857] dark:hover:bg-[#059669] disabled:opacity-60"
							>
								{pending ? "Menyimpan…" : submitLabel}
							</button>
						</div>
					</div>
				</form>
				{/* Sticky summary panel — desktop only (≥lg). Mobile + tablet
		    keep the form's existing sticky bottom footer for save action. */}
				<div className="hidden lg:block">
					<SummaryRail
						width="sm"
						eventDate={eventDateLabel}
						eventTimeRange={eventTimeRange}
						eventTimeline={{
							setup: setupTime || undefined,
							start: startTime || undefined,
							end: endTime || undefined,
						}}
						venueName={venueName || undefined}
						venueCity={venueCity || undefined}
						clientName={clientName || undefined}
						picName={picName || undefined}
						picContact={picWa || undefined}
						basePrice={basePrice}
						addonsTotal={addonsTotal}
						addonLines={addonLines}
						backdropContribution={backdropContribution}
						discount={discount}
						grossUp={grossUp}
						grandTotal={grandTotal}
						vendor={
							channel === "vendor" && Number(vendorCommissionValue) > 0
								? {
										mode: vendorCommissionMode,
										valueType: vendorCommissionValueType,
										value: Number(vendorCommissionValue),
										amount: vendorCommissionAmount,
									}
								: undefined
						}
						navItems={navItems}
						pending={pending}
						submitLabel={submitLabel}
						onCancel={handleCancel}
					/>
				</div>
			</div>
		</TooltipProvider>
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
											<span className="text-muted-foreground">{f.message}</span>
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

/**
 * Tombol "Menyusul" (tandai TBC) untuk venue / jam mulai / PIC.
 *
 * Nyala = amber pekat + centang, mati = outline netral. Sengaja beda blok
 * warna (isi vs garis), bukan beda tipis kepekatan — dulu dua state-nya
 * sama-sama amber muda dan owner tidak sadar tombolnya sedang aktif.
 */
function TbcToggle({
	active,
	onClick,
	className,
	label = "Menyusul",
}: {
	active: boolean;
	onClick: () => void;
	className?: string;
	label?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			title={
				active
					? "Ditandai menyusul — klik lagi kalau mau isi sekarang"
					: "Klik kalau datanya belum ditentukan (menyusul)"
			}
			className={`press-down inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 text-fluid-caption font-medium transition ${
				active
					? "border-amber-600 bg-amber-500 text-amber-950 shadow-sm hover:bg-amber-600"
					: "border-border-default bg-background text-muted-foreground hover:border-amber-500/60 hover:bg-amber-500/10 hover:text-amber-900 dark:hover:text-amber-200"
			} ${className ?? ""}`}
		>
			{active ? <Check className="size-3.5" /> : null}
			{active ? label : `${label}?`}
		</button>
	);
}

function Section({
	step,
	title,
	description,
	children,
	id,
	className,
}: {
	step: number;
	title: React.ReactNode;
	description: string;
	children: React.ReactNode;
	/** Optional scroll-anchor id/class. When set, wraps the card so the anchor
	    is the flow element (avoids a separate empty div that would offset the
	    first section under space-y). */
	id?: string;
	className?: string;
}) {
	const stepLabel = step.toString().padStart(2, "0");
	const titleText = typeof title === "string" ? title.toUpperCase() : title;
	const eyebrowTitle = (
		<span className="eyebrow text-muted-foreground">
			<span className="tabular text-primary">{stepLabel}</span>
			<span className="mx-1.5 text-muted-foreground/50">·</span>
			<span className="text-foreground">{titleText}</span>
		</span>
	);
	const card = (
		<SectionCard title={eyebrowTitle} subtitle={description} defaultOpen>
			<div className="space-y-4">{children}</div>
		</SectionCard>
	);
	return id || className ? (
		<div id={id} className={className}>
			{card}
		</div>
	) : (
		card
	);
}

function Field({
	label,
	name,
	hint,
	tooltip,
	error,
	required,
	children,
	layoutMode = "stacked",
}: {
	label: string;
	name: string;
	hint?: string;
	tooltip?: string;
	error?: string;
	required?: boolean;
	children: React.ReactNode;
	/** "stacked" — label on top (default, used inside paired wrappers).
	 *  "grid" — label-LEFT via FieldGrid.Row (operations-consistency layout). */
	layoutMode?: "stacked" | "grid";
}) {
	if (layoutMode === "grid") {
		return (
			<FieldGrid.Row
				label={label}
				name={name}
				hint={hint}
				tooltip={tooltip}
				error={error}
				required={required}
			>
				{children}
			</FieldGrid.Row>
		);
	}
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5">
				<label htmlFor={name} className="text-fluid-body font-medium">
					{label}
					{required && <span className="ml-0.5 text-primary">*</span>}
				</label>
				{tooltip ? <HelpTooltip text={tooltip} label={label} /> : null}
			</div>
			{children}
			{error ? (
				<p className="text-fluid-caption text-destructive">{error}</p>
			) : hint ? (
				<p className="text-fluid-caption text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

function HelpTooltip({ text, label }: { text: string; label: string }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						aria-label={`Penjelasan untuk ${label}`}
						className="press-down inline-grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					>
						<HelpCircle className="size-3.5" aria-hidden />
					</button>
				}
			/>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}
