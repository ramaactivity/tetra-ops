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
	client_name: string;
	client_wa: string | null;
	client_email: string | null;
	pic_name: string | null;
	pic_wa: string | null;
	frame_size: string;
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
			id, project_id, client_name, client_wa, client_email,
			pic_name, pic_wa,
			frame_size, event_date, setup_time, start_time, end_time, session_segments,
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
	const lead = crewAssignments.find((a) => a.role_in_event === "lead");
	const leadUser = lead
		? Array.isArray(lead.user)
			? lead.user[0]
			: lead.user
		: null;

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
		client_wa: (ev.client_wa as string | null) ?? null,
		client_email: (ev.client_email as string | null) ?? null,
		pic_name: (ev.pic_name as string | null) ?? null,
		pic_wa: (ev.pic_wa as string | null) ?? null,
		frame_size: ev.frame_size as string,
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
		items.push({
			label: packageLabel,
			detail: ev.package_duration_hours
				? `${ev.package_duration_hours} jam · Frame ${ev.frame_size}`
				: `Frame ${ev.frame_size}`,
			quantity: 1,
			unitPrice: packagePrice,
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

export function buildDeliverables(ev: EventForPdf) {
	const items: Array<{ label: string; quantity: number; notes?: string }> = [];
	const packageLabel =
		ev.package_name ?? ev.custom_package_name ?? "Paket photobooth";
	items.push({
		label: `${packageLabel}${
			ev.package_duration_hours ? ` (${ev.package_duration_hours} jam)` : ""
		}`,
		quantity: 1,
		notes: `Frame ${ev.frame_size}`,
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
