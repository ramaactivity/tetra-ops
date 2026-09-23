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
import { quotationToBookingDefaults } from "@/lib/documents/booking-defaults";
import { loadDocument } from "@/lib/documents/load";
import {
	fetchSalesCandidates,
	fetchVendorCandidates,
	fetchVenueCandidates,
} from "@/lib/events/booking-candidates";
import { createClient } from "@/lib/supabase/server";

export default async function NewBookingPage({
	searchParams,
}: {
	searchParams: Promise<{ fromQuotation?: string }>;
}) {
	const { fromQuotation } = await searchParams;
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

	// Deal dari quotation: form terisi dari isi quotation, invoice ikut lahir
	// saat booking disimpan (lihat createBooking).
	const quotation = fromQuotation ? await loadDocument(fromQuotation) : null;
	const fromQuotationDefaults =
		quotation && quotation.doc_type === "quotation"
			? quotationToBookingDefaults(
					quotation,
					(packages ?? []) as PackageOption[],
				)
			: undefined;

	return (
		<Container size="xl" className="space-y-3">
			<PageHeader
				title="New Booking"
				backHref="/operations"
				backLabel="Operations"
				description="Booking baru disimpan sebagai draft. Lu bisa lengkapi detail crew dan DP setelah save."
			/>
			{fromQuotationDefaults ? (
				<div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
					Diisi dari quotation <span className="font-semibold">{quotation?.doc_number}</span>.
					Lengkapi yang kurang lalu simpan — invoice akan dibuat otomatis dari quotation ini.
				</div>
			) : null}
			<div>
				<BookingForm
					action={createBooking}
					defaults={fromQuotationDefaults}
					sourceQuotationId={fromQuotationDefaults ? quotation?.id : undefined}
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
