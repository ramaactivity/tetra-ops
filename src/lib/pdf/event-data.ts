/**
 * Shared event-data fetcher for PDF generation. Pulls a fully-hydrated
 * event row + line items + bank account + crew lead info so each PDF
 * route doesn't have to repeat the same query.
 *
 * Auth: caller must already be authenticated via the (owner) layout.
 * This helper does NOT do auth — it assumes the route handler has
 * already gated.
 */

import { createClient } from "@/lib/supabase/server";

export type EventForPdf = {
	id: string;
	project_id: string;
	/** Judul event (daftar operations). Bukan klien — lihat client_org. */
	client_name: string;
	/** Klien yang ditagih (perusahaan/instansi/pengantin). */
	client_org: string | null;
	event_title: string | null;
	booker_name: string | null;
	event_category: string | null;
	bill_to_mode: string | null;
	bill_to_name: string | null;
	bill_to_attn: string | null;
	client_wa: string | null;
	client_email: string | null;
	pic_name: string | null;
	pic_wa: string | null;
	frame_size: string;
	/** Jumlah unit/spot photobooth (base_price = total semua unit). */
	unit_count: number;
	/** Override spot ≥2: ukuran frame & backdrop per spot. */
	spots: Array<{
		spot: number;
		frame_size: string | null;
		backdrop_id: string | null;
	}>;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time: string | null;
	/** Raw events.session_segments JSONB — array (multi-sesi) or null. */
	session_segments: unknown;
	venue_name: string;
	venue_address: string | null;
	venue_city: string | null;
	due_date: string | null;
	base_price: number;
	addons_total: number;
	discount_amount: number;
	gross_up_pph_amount: number;
	grand_total: number;
	total_paid: number;
	remaining_balance: number;
	/** Sewa backdrop — sudah termasuk di addons_total, tapi bukan baris event_addons. */
	backdrop_rental_total: number;
	vendor_commission_mode: string | null;
	vendor_commission_amount: number;
	/** Tagihan yang benar-benar ditagihkan: grand_total dikurangi potongan
	 *  langsung vendor (upfront_cut). Sama dengan recalculate_event_payment_status. */
	billable_total: number;
	legacy_invoice_number: string | null;
	package_name: string | null;
	package_duration_hours: number | null;
	custom_package_name: string | null;
	custom_package_price: number | null;
	addons: Array<{
		quantity: number;
		unit_price: number;
		total_price: number;
		addon_name: string | null;
		addon_unit: string | null;
	}>;
	bank_account: {
		bank_name: string;
		account_name: string;
		account_number: string | null;
		account_holder: string | null;
	} | null;
	crew_lead: {
		full_name: string;
		role: string;
	} | null;
	booker_contact: {
		name: string;
		phone: string | null;
	} | null;
	pic_contact: {
		name: string;
		phone: string | null;
	} | null;
};

export async function fetchEventForPdf(
	projectId: string,
	/** Klien lain (mis. admin untuk MCP/link bertanda tangan). Default: sesi login. */
	client?: Awaited<ReturnType<typeof createClient>>,
): Promise<EventForPdf | null> {
	const supabase = client ?? (await createClient());

	const { data: ev, error } = await supabase
		.from("events")
		.select(
			`
			id, project_id, client_name, client_org, event_title, booker_name,
			event_category, bill_to_mode, bill_to_name, bill_to_attn,
			client_wa, client_email,
			pic_name, pic_wa,
			frame_size, unit_count, spots, event_date, setup_time, start_time, end_time, session_segments,
			venue_name, venue_address, venue_city,
			due_date,
			base_price, addons_total, discount_amount, gross_up_pph_amount,
			grand_total, total_paid, remaining_balance,
			backdrop_rental_total, vendor_commission_mode, vendor_commission_amount,
			legacy_invoice_number,
			custom_package_name, custom_package_price,
			package:packages(name, duration_hours),
			event_addons(
				quantity, unit_price, total_price,
				addon:addons(name, unit)
			),
			crew_assignments(
				role_in_event,
				user:users!crew_assignments_user_id_fkey(full_name)
			),
			booker_contact:contacts!events_booker_contact_id_fkey(name, phone),
			pic_contact:contacts!events_pic_contact_id_fkey(name, phone)
		`,
		)
		.eq("project_id", projectId)
		.maybeSingle();

	if (error || !ev) return null;

	const pkg = Array.isArray(ev.package) ? ev.package[0] : ev.package;
	const addons = (
		(ev.event_addons ?? []) as Array<{
			quantity: number;
			unit_price: number;
			total_price: number;
			addon:
				| { name: string; unit: string }
				| Array<{ name: string; unit: string }>
				| null;
		}>
	).map((a) => {
		const ad = Array.isArray(a.addon) ? a.addon[0] : a.addon;
		return {
			quantity: a.quantity,
			unit_price: a.unit_price,
			total_price: a.total_price,
			addon_name: ad?.name ?? null,
			addon_unit: ad?.unit ?? null,
		};
	});

	const crewAssignments = (ev.crew_assignments ?? []) as Array<{
		role_in_event: string;
		user: { full_name: string } | Array<{ full_name: string }> | null;
	}>;
	// Event multi-unit punya lead per spot — BAST menyebut semuanya.
	const leadNames = crewAssignments
		.filter((a) => a.role_in_event === "lead")
		.map((a) => (Array.isArray(a.user) ? a.user[0] : a.user)?.full_name)
		.filter((n): n is string => Boolean(n));
	const leadUser =
		leadNames.length > 0 ? { full_name: leadNames.join(", ") } : null;

	// Default bank account for invoice payment instructions
	const { data: bankData } = await supabase
		.from("bank_accounts")
		.select("bank_name, account_name, account_number, account_holder")
		.eq("is_active", true)
		.eq("is_default_receive", true)
		.maybeSingle();

	const bookerContact = Array.isArray(ev.booker_contact)
		? ev.booker_contact[0]
		: ev.booker_contact;
	const picContact = Array.isArray(ev.pic_contact)
		? ev.pic_contact[0]
		: ev.pic_contact;

	const grandTotal = (ev.grand_total as number) ?? 0;
	const upfrontCut =
		ev.vendor_commission_mode === "upfront_cut"
			? ((ev.vendor_commission_amount as number) ?? 0)
			: 0;

	return {
		id: ev.id as string,
		project_id: ev.project_id as string,
		client_name: ev.client_name as string,
		client_org: (ev.client_org as string | null) ?? null,
		event_title: (ev.event_title as string | null) ?? null,
		booker_name: (ev.booker_name as string | null) ?? null,
		event_category: (ev.event_category as string | null) ?? null,
		bill_to_mode: (ev.bill_to_mode as string | null) ?? null,
		bill_to_name: (ev.bill_to_name as string | null) ?? null,
		bill_to_attn: (ev.bill_to_attn as string | null) ?? null,
		client_wa: (ev.client_wa as string | null) ?? null,
		client_email: (ev.client_email as string | null) ?? null,
		pic_name: (ev.pic_name as string | null) ?? null,
		pic_wa: (ev.pic_wa as string | null) ?? null,
		frame_size: ev.frame_size as string,
		unit_count: Number(ev.unit_count ?? 1) || 1,
		spots: (ev.spots as EventForPdf["spots"] | null) ?? [],
		event_date: ev.event_date as string,
		setup_time: (ev.setup_time as string | null) ?? null,
		start_time: (ev.start_time as string | null) ?? null,
		end_time: (ev.end_time as string | null) ?? null,
		session_segments: ev.session_segments ?? null,
		venue_name: ev.venue_name as string,
		venue_address: (ev.venue_address as string | null) ?? null,
		venue_city: (ev.venue_city as string | null) ?? null,
		due_date: (ev.due_date as string | null) ?? null,
		base_price: (ev.base_price as number) ?? 0,
		addons_total: (ev.addons_total as number) ?? 0,
		discount_amount: (ev.discount_amount as number) ?? 0,
		gross_up_pph_amount: (ev.gross_up_pph_amount as number) ?? 0,
		grand_total: grandTotal,
		total_paid: (ev.total_paid as number) ?? 0,
		remaining_balance: (ev.remaining_balance as number) ?? 0,
		backdrop_rental_total: (ev.backdrop_rental_total as number) ?? 0,
		vendor_commission_mode:
			(ev.vendor_commission_mode as string | null) ?? null,
		vendor_commission_amount: (ev.vendor_commission_amount as number) ?? 0,
		billable_total: Math.max(0, grandTotal - upfrontCut),
		legacy_invoice_number: (ev.legacy_invoice_number as string | null) ?? null,
		package_name: pkg?.name ?? null,
		package_duration_hours: pkg?.duration_hours ?? null,
		custom_package_name: (ev.custom_package_name as string | null) ?? null,
		custom_package_price: (ev.custom_package_price as number | null) ?? null,
		addons,
		bank_account: bankData
			? {
					bank_name: bankData.bank_name,
					account_name: bankData.account_name,
					account_number: bankData.account_number ?? null,
					account_holder: bankData.account_holder ?? null,
				}
			: null,
		crew_lead: leadUser
			? {
					full_name: leadUser.full_name,
					role: "Crew Lead",
				}
			: null,
		booker_contact: bookerContact
			? {
					name: bookerContact.name,
					phone: bookerContact.phone,
				}
			: null,
		pic_contact: picContact
			? {
					name: picContact.name,
					phone: picContact.phone,
				}
			: null,
	};
}

/**
 * Keterangan format cetak untuk dokumen klien. Jangan pernah mencetak "null":
 * ukuran belum dipilih → "menyusul", tanpa cetak (360/Magazine) → kosong.
 */
export function frameFormatLabel(
	frame: string | null | undefined,
): string | null {
	const f = (frame ?? "").trim().toLowerCase();
	if (f === "none") return null;
	if (f === "2r" || f === "4r") return `Format ${f.toUpperCase()}`;
	if (f === "polaroid") return "Format Polaroid";
	return "Format cetak menyusul (2R/4R/Polaroid)";
}

export function buildLineItems(ev: EventForPdf) {
	const items: Array<{
		label: string;
		detail?: string;
		quantity: number;
		unitPrice: number;
		total: number;
	}> = [];

	// Package line
	const packageLabel =
		ev.package_name ?? ev.custom_package_name ?? "Paket photobooth";
	const packagePrice = ev.package_name
		? ev.base_price
		: (ev.custom_package_price ?? ev.base_price);
	if (packagePrice > 0) {
		const units = Math.max(1, ev.unit_count ?? 1);
		const fmtText = formatPerSpot(ev);
		// base_price = total semua unit; tampilkan qty × harga per unit kalau bulat.
		const perUnit = packagePrice / units;
		const splitQty = units > 1 && Number.isInteger(perUnit);
		items.push({
			label: packageLabel,
			detail:
				[
					ev.package_duration_hours
						? `Durasi ${ev.package_duration_hours} jam`
						: null,
					units > 1 ? `${units} unit photobooth (${units} spot)` : null,
					fmtText,
				]
					.filter(Boolean)
					.join(" · ") || undefined,
			quantity: splitQty ? units : 1,
			unitPrice: splitQty ? perUnit : packagePrice,
			total: packagePrice,
		});
	}

	// Addons
	for (const a of ev.addons) {
		items.push({
			label: a.addon_name ?? "Addon",
			detail: a.addon_unit ?? undefined,
			quantity: a.quantity,
			unitPrice: a.unit_price,
			total: a.total_price,
		});
	}

	// Sewa backdrop ikut addons_total tapi tidak punya baris event_addons —
	// tanpa baris ini subtotal PDF tidak pernah cocok dengan grand_total.
	if (ev.backdrop_rental_total > 0) {
		items.push({
			label: "Sewa backdrop",
			quantity: 1,
			unitPrice: ev.backdrop_rental_total,
			total: ev.backdrop_rental_total,
		});
	}

	return items;
}

/**
 * Format cetak: "Format 4R", atau per spot kalau event multi-unit berbeda
 * ukuran ("Spot 1: Format 4R · Spot 2: Format 2R"). Spot 1 = kolom event,
 * spot ≥2 = override (kosong = ikut spot 1).
 */
function formatPerSpot(ev: EventForPdf): string | null {
	const units = Math.max(1, ev.unit_count ?? 1);
	const formats =
		units > 1
			? Array.from({ length: units }, (_, i) => {
					const own = ev.spots?.find((x) => x.spot === i + 1)?.frame_size;
					return frameFormatLabel(
						i === 0 ? ev.frame_size : (own ?? ev.frame_size),
					);
				})
			: [frameFormatLabel(ev.frame_size)];
	return formats.every((f) => f === formats[0])
		? formats[0]
		: formats.map((f, i) => `Spot ${i + 1}: ${f ?? "—"}`).join(" · ");
}

export function buildDeliverables(ev: EventForPdf) {
	const items: Array<{ label: string; quantity: number; notes?: string }> = [];
	const packageLabel =
		ev.package_name ?? ev.custom_package_name ?? "Paket photobooth";
	items.push({
		label: `${packageLabel}${
			ev.package_duration_hours ? ` (${ev.package_duration_hours} jam)` : ""
		}`,
		quantity: Math.max(1, ev.unit_count ?? 1),
		notes: formatPerSpot(ev) ?? undefined,
	});
	for (const a of ev.addons) {
		items.push({
			label: a.addon_name ?? "Addon",
			quantity: a.quantity,
			notes: a.addon_unit ?? undefined,
		});
	}
	return items;
}
