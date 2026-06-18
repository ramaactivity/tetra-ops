import {
	type AddonOption,
	type BackdropOption,
	BookingForm,
	type EventTypeOption,
	type PackageOption,
	type RelasiOption,
	type VendorOption,
} from "@/components/booking/booking-form";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { createBooking } from "@/lib/actions/bookings";
import { createClient } from "@/lib/supabase/server";

export default async function NewBookingPage() {
	const supabase = await createClient();
	const [
		{ data: packages },
		{ data: addons },
		{ data: backdrops },
		{ data: eventTypes },
		{ data: relasiCandidates },
		{ data: vendorHistory },
		{ data: grossupConfig },
	] = await Promise.all([
		supabase
			.from("packages")
			.select("id, name, category, frame_size, duration_hours, base_price")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("category", { ascending: true })
			.order("base_price", { ascending: true }),
		supabase
			.from("addons")
			.select("id, name, category, unit, price")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("category", { ascending: true })
			.order("price", { ascending: true }),
		supabase
			.from("backdrops")
			.select("id, code, name, type, rental_price")
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
		supabase
			.from("event_types")
			.select("code, label")
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
		// Relasi referrer pool: super_admin + owner + crew users
		supabase
			.from("users")
			.select("id, full_name, role")
			.in("role", ["super_admin", "owner", "crew"])
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("full_name"),
		// Vendor master list (contacts where type='vendor' + is_active).
		// Replaces previous "scan past events" approach — source of truth
		// is now the contacts table, and new vendors auto-upsert there on
		// booking submit (see ensureVendorContact in src/lib/actions/vendors.ts).
		supabase
			.from("contacts")
			.select(
				"id, name, default_pic_name, default_pic_contact, commission_mode, commission_value_type, commission_value_default, commission_rate_default",
			)
			.eq("type", "vendor")
			.eq("is_active", true)
			.order("name", { ascending: true })
			.limit(200),
		// Default gross-up PPh rate (Indonesia PPh 23 = 2%)
		supabase
			.from("system_config")
			.select("value")
			.eq("key", "tax.default_grossup_rate_pct")
			.maybeSingle(),
	]);

	const grossupRate = (() => {
		const v = grossupConfig?.value;
		if (typeof v === "number") return v;
		if (typeof v === "string") return Number(v) || 2;
		return 2;
	})();

	// Vendor master → autocomplete options. Carries commission scheme so
	// the booking form can pre-fill mode + type + value when an existing
	// vendor is picked. Legacy commission_rate kept as fallback for old
	// vendor rows that haven't been migrated to the new fields yet.
	const vendorOptions = (
		(vendorHistory ?? []) as Array<{
			id: string;
			name: string;
			default_pic_name: string | null;
			default_pic_contact: string | null;
			commission_mode: "commission" | "upfront_cut" | null;
			commission_value_type: "percent" | "flat" | null;
			commission_value_default: number | null;
			commission_rate_default: number | null;
		}>
	).map((v) => ({
		name: v.name,
		pic_name: v.default_pic_name,
		contact: v.default_pic_contact,
		commission_mode: v.commission_mode,
		commission_value_type: v.commission_value_type,
		commission_value: v.commission_value_default,
		commission_rate: v.commission_rate_default,
	}));

	return (
		<Container size="xl" className="space-y-3">
			<PageHeader
				title="New Booking"
				backHref="/operations"
				backLabel="Operations"
				description="Booking baru disimpan sebagai draft. Lu bisa lengkapi detail crew dan DP setelah save."
			/>
			<div>
				<BookingForm
					action={createBooking}
					packages={(packages ?? []) as PackageOption[]}
					addons={(addons ?? []) as AddonOption[]}
					backdrops={(backdrops ?? []) as BackdropOption[]}
					eventTypes={(eventTypes ?? []) as EventTypeOption[]}
					relasiOptions={
						((relasiCandidates ?? []) as RelasiOption[]).map((u) => ({
							id: u.id,
							full_name: u.full_name,
							role: u.role,
						})) as RelasiOption[]
					}
					vendorOptions={vendorOptions as VendorOption[]}
					grossupRate={grossupRate}
				/>
			</div>
		</Container>
	);
}
