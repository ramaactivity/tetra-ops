/**
 * Pengaturan fitur rekanan per vendor (contacts.vendor_settings, Pusat Vendor
 * DR-046). Murni — dipakai server portal, aksi Ops, dan UI.
 */
export type VendorSettings = {
	/** Dasbor rekanan & akses WO di portal. */
	portal_enabled: boolean;
	/** Rekap komisi tampil di dasbor rekanan. */
	show_commission: boolean;
	/** Vendor boleh mengundang kliennya ke dashboard acara. */
	can_invite_clients: boolean;
	/** Booking baru vendor ini: klien undangan melihat harga Tetra. */
	client_price_visible_default: boolean;
	/** Label internal hubungan kerja sama. */
	partner_level: "reguler" | "prioritas" | "jeda";
};

export const VENDOR_DEFAULTS: VendorSettings = {
	portal_enabled: true,
	show_commission: true,
	can_invite_clients: true,
	client_price_visible_default: false,
	partner_level: "reguler",
};

export const PARTNER_LEVELS: Record<VendorSettings["partner_level"], string> = {
	reguler: "Reguler",
	prioritas: "Prioritas",
	jeda: "Jeda sementara",
};

/** Isi bawaan untuk kunci yang kosong / salah tipe. */
export function vendorSettings(raw: unknown): VendorSettings {
	const r = (raw && typeof raw === "object" ? raw : {}) as Record<
		string,
		unknown
	>;
	const b = (k: keyof VendorSettings) =>
		typeof r[k] === "boolean"
			? (r[k] as boolean)
			: (VENDOR_DEFAULTS[k] as boolean);
	return {
		portal_enabled: b("portal_enabled"),
		show_commission: b("show_commission"),
		can_invite_clients: b("can_invite_clients"),
		client_price_visible_default: b("client_price_visible_default"),
		partner_level:
			r.partner_level === "prioritas" || r.partner_level === "jeda"
				? r.partner_level
				: "reguler",
	};
}
