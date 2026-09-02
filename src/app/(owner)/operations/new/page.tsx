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
import {
	fetchSalesCandidates,
	fetchVendorCandidates,
	fetchVenueCandidates,
} from "@/lib/events/booking-candidates";
import { createClient } from "@/lib/supabase/server";

export default async function NewBookingPage() {
	const supabase = await createClient();
	const [
		{ data: packages },
		{ data: addons },
		{ data: backdrops },
		{ data: eventTypes },
		relasiCandidates,
		vendorOptions,
		venueOptions,
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
		// Sales/relasi + vendor master — keduanya diurutkan dari yang paling
		// sering dipakai (lihat src/lib/events/booking-candidates.ts), bukan
		// abjad, supaya nama yang tiap minggu dipakai ada di paling atas.
		fetchSalesCandidates(supabase),
		fetchVendorCandidates(supabase),
		fetchVenueCandidates(supabase),
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
						relasiCandidates.map((u) => ({
							id: u.id,
							full_name: u.full_name,
							role: u.role,
						})) as RelasiOption[]
					}
					vendorOptions={vendorOptions as VendorOption[]}
					venueOptions={venueOptions}
					grossupRate={grossupRate}
				/>
			</div>
		</Container>
	);
}
