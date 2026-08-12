const RP_FORMATTER = new Intl.NumberFormat("id-ID");

export function formatRupiah(amount: number): string {
	return `Rp ${RP_FORMATTER.format(amount)}`;
}

/** Compact Rupiah for dense tables/tiles so values never overflow or wrap:
 *  M / jt / rb tiers, full value belongs in a `title` for hover. E.g.
 *  12_105_000 → "Rp 12,1 jt", 175_000 → "Rp 175 rb", 20_000 → "Rp 20 rb".
 *  Below 10rb stays exact. Uses "−" (minus sign) for negatives. */
export function formatRupiahCompact(amount: number): string {
	const a = Math.abs(amount);
	const sign = amount < 0 ? "−" : "";
	if (a >= 1_000_000_000)
		return `${sign}Rp ${(a / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
	if (a >= 1_000_000)
		return `${sign}Rp ${(a / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
	if (a >= 10_000)
		return `${sign}Rp ${Math.round(a / 1000).toLocaleString("id-ID")} rb`;
	return formatRupiah(amount);
}

/** Two-letter initials from a person's name, for avatar chips. */
export function nameInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const SERVICE_TYPE_LABELS: Record<string, string> = {
	photobooth_classic: "Photobooth Classic",
	videobooth_360: "Videobooth 360",
	magazine_combo: "Magazine Combo",
	magazine_box_only: "Magazine Box",
	photostage_only: "Photostage",
	photostage_combo: "Photostage Combo",
};

export const FRAME_SIZE_LABELS: Record<string, string> = {
	"2R": "2R",
	"4R": "4R",
	polaroid: "Polaroid",
	none: "—",
};

/**
 * Tipe backdrop dalam bahasa manusia. Crew cuma perlu tahu SIAPA yang membawa
 * backdropnya — kode mentah ("client_provided") tidak berarti apa-apa di WA.
 */
export const BACKDROP_TYPE_LABELS: Record<string, string> = {
	basic_included: "bawaan paket",
	rental_owned: "sewa dari Tetra",
	client_provided: "disiapkan klien",
	vendor_decor: "dekor vendor",
};

/**
 * Keterangan asal backdrop untuk ditempel di belakang namanya — atau null kalau
 * namanya sudah menyiratkan hal yang sama ("Dari Klien", "Vendor Decor"), biar
 * tidak jadi "Dari Klien (disiapkan klien)".
 */
export function backdropOriginLabel(
	name: string,
	type?: string | null,
): string | null {
	const origin = type ? BACKDROP_TYPE_LABELS[type] : null;
	if (!origin) return null;
	const lowerName = name.toLowerCase();
	const alreadySaid = origin
		.split(/\s+/)
		.some((w) => w.length >= 4 && lowerName.includes(w.toLowerCase()));
	return alreadySaid ? null : origin;
}

export const ADDON_CATEGORY_LABELS: Record<string, string> = {
	voucher: "Voucher",
	print_extras: "Print Extras",
	time_extras: "Time Extras",
	experience: "Experience",
	costume: "Costume",
};

export const ITEM_CATEGORY_LABELS: Record<string, string> = {
	consumable: "Consumable",
	equipment: "Equipment",
};

export const EQUIPMENT_CONDITION_LABELS: Record<string, string> = {
	normal: "Normal",
	service: "Service",
	damaged: "Damaged",
	lost: "Lost",
};

export const EQUIPMENT_LOCATION_LABELS: Record<string, string> = {
	gudang_pusat: "Gudang",
	event: "On Event",
	service_center: "Service Center",
	crew_carry: "Crew Carry",
	lost: "Lost",
};

export const USER_ROLE_LABELS: Record<string, string> = {
	super_admin: "Super Admin",
	owner: "Owner",
	crew: "Crew",
	pending_approval: "Pending",
};

/**
 * Nama venue untuk ditampilkan. NULL/kosong = lokasi masih TBC (klien booking
 * sebelum tahu tempatnya) — tampilkan kalimatnya, jangan ruang kosong yang
 * bikin crew mengira datanya hilang.
 */
export function venueLabel(name: string | null | undefined): string {
	return name?.trim() ? name : "Lokasi menyusul";
}

export function formatDateID(iso: string): string {
	return new Date(iso).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
	direct: "Direct",
	vendor: "Vendor",
	relasi: "Relasi",
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
	draft: "Draf",
	confirmed: "Terkonfirmasi",
	upcoming: "Mendatang",
	in_progress: "Berlangsung",
	awaiting_settlement: "Menunggu Settle",
	completed: "Selesai",
	cancelled: "Dibatalkan",
	archived: "Diarsipkan",
};

// Design workflow status — separate from the event lifecycle above.
export const DESIGN_STATUS_VALUES = ["belum", "proses", "approved"] as const;
export type DesignStatus = (typeof DESIGN_STATUS_VALUES)[number];

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
	belum: "Belum",
	proses: "Proses",
	approved: "Approved",
};

// Tone classes for design-status badges/dots (palette: muted / sky / emerald).
export const DESIGN_STATUS_TONE: Record<
	DesignStatus,
	{ dot: string; text: string; badge: string }
> = {
	belum: {
		dot: "bg-muted-foreground/40",
		text: "text-muted-foreground",
		badge: "border-border-default bg-secondary text-muted-foreground",
	},
	proses: {
		dot: "bg-[#0070f3]",
		text: "text-[#0070f3] dark:text-[#3b96ff]",
		badge:
			"border-[#0070f3]/30 bg-[#0070f3]/10 text-[#0070f3] dark:text-[#3b96ff]",
	},
	approved: {
		dot: "bg-emerald-500",
		text: "text-emerald-700 dark:text-emerald-400",
		badge:
			"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	},
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
	unpaid: "Unpaid",
	partial: "Partial",
	dp: "DP",
	paid: "Lunas",
	overpaid: "Overpaid",
	overdue: "Overdue",
};
