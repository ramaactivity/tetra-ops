import { notFound } from "next/navigation";
import {
	type AddonOption,
	type BackdropOption,
	BookingForm,
	type EventTypeOption,
	type PackageOption,
	type RelasiOption,
} from "@/components/booking/booking-form";
import { Container } from "@/components/layout/container";
import { MetaBadge } from "@/components/operations/_shared/meta-badge";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { updateBooking } from "@/lib/actions/bookings";
import {
	fetchSalesCandidates,
	fetchVendorCandidates,
} from "@/lib/events/booking-candidates";
import { createClient } from "@/lib/supabase/server";

export default async function EditBookingPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const supabase = await createClient();

	const [
		{ data: event, error },
		{ data: packages },
		{ data: addons },
		{ data: backdrops },
		{ data: eventTypes },
		vendorOptions,
		relasiCandidates,
	] = await Promise.all([
		supabase
			.from("events")
			.select(
				`id, project_id, channel, client_name, client_wa, client_email,
				service_type, package_id, pending_package_hours, frame_size,
				event_category, event_date,
				event_date_is_estimate,
				setup_time, start_time, end_time, session_segments,
				booker_name,
				venue_name, venue_address, venue_city, venue_province, google_maps_url,
				vendor_name, vendor_pic_name, vendor_contact,
				vendor_commission_mode, vendor_commission_value_type, vendor_commission_value,
				vendor_commission_rate, vendor_commission_amount,
				referrer_user_id, referrer_type, referrer_commission,
				sales_user_id, direct_sales_commission,
				pic_name, pic_wa,
				backdrop_id, vendor_decor_markup, include_flashdisk_pouch,
				base_price, discount_amount, gross_up_pph_amount, crew_notes,
				event_addons(addon_id, quantity),
				event_bonuses(addon_id, quantity, notes)`,
			)
			.eq("project_id", projectId)
			.maybeSingle(),
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
		// Vendor + sales/relasi pool — sama persis dengan /operations/new,
		// diurutkan dari yang paling sering dipakai. Tanpa pool sales, Combobox
		// (allowFreeText=false) tidak bisa memetakan UUID tersimpan ke nama,
		// jadi field Sales/Relasi tampil KOSONG saat edit event lama.
		fetchVendorCandidates(supabase),
		fetchSalesCandidates(supabase),
	]);

	if (error) {
		return (
			<Container size="xl">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat event: {error.message}
					</p>
				</div>
			</Container>
		);
	}

	if (!event) notFound();

	// Sales/relasi yang tersimpan bisa saja sudah non-aktif (resign) sehingga
	// tidak ikut di pool di atas. Tarik user-nya sendiri dan tempel ke opsi,
	// supaya nama lama tetap kebaca — bukan malah blank lalu ketimpa null.
	const relasiPool: RelasiOption[] = relasiCandidates.map((u) => ({
		id: u.id,
		full_name: u.full_name,
		role: u.role,
	}));
	const savedUserIds = [
		event.sales_user_id as string | null,
		event.referrer_user_id as string | null,
	].filter((id): id is string => Boolean(id));
	const missingIds = savedUserIds.filter(
		(id) => !relasiPool.some((u) => u.id === id),
	);
	if (missingIds.length > 0) {
		const { data: extraUsers } = await supabase
			.from("users")
			.select("id, full_name, role")
			.in("id", missingIds);
		relasiPool.push(...((extraUsers ?? []) as RelasiOption[]));
	}

	const action = updateBooking.bind(null, event.id);
	const trimTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

	return (
		<Container size="xl" className="space-y-3">
			<PageHeader
				title={`Edit: ${event.client_name}`}
				backHref={`/operations/${event.project_id}`}
				backLabel={event.project_id}
				meta={<MetaBadge projectId={event.project_id} />}
			/>
			<div>
				<BookingForm
					action={action}
					packages={(packages ?? []) as PackageOption[]}
					addons={(addons ?? []) as AddonOption[]}
					backdrops={(backdrops ?? []) as BackdropOption[]}
					eventTypes={(eventTypes ?? []) as EventTypeOption[]}
					relasiOptions={relasiPool}
					vendorOptions={vendorOptions}
					submitLabel="Save changes"
					defaults={{
						channel: event.channel,
						client_name: event.client_name,
						client_wa: event.client_wa,
						client_email: event.client_email ?? "",
						service_type: event.service_type,
						package_id: event.package_id ?? "",
						pending_package_hours: event.pending_package_hours ?? "",
						frame_size: event.frame_size,
						event_category: event.event_category,
						event_date: event.event_date,
						event_date_is_estimate: event.event_date_is_estimate ? "on" : "",
						setup_time: trimTime(event.setup_time),
						start_time: trimTime(event.start_time),
						end_time: trimTime(event.end_time),
						session_segments: event.session_segments
							? JSON.stringify(event.session_segments)
							: "",
						booker_name: event.booker_name ?? "",
						venue_name: event.venue_name ?? "",
						venue_address: event.venue_address ?? "",
						venue_city: event.venue_city ?? "",
						venue_province: event.venue_province ?? "",
						google_maps_url: event.google_maps_url ?? "",
						vendor_name: event.vendor_name ?? "",
						vendor_pic_name: event.vendor_pic_name ?? "",
						vendor_contact: event.vendor_contact ?? "",
						vendor_commission_mode:
							(event.vendor_commission_mode as
								| "commission"
								| "upfront_cut"
								| null) ?? "commission",
						vendor_commission_value_type:
							(event.vendor_commission_value_type as
								| "percent"
								| "flat"
								| null) ?? "percent",
						vendor_commission_value:
							(event.vendor_commission_value as number | null) ??
							(event.vendor_commission_rate as number | null) ??
							0,
						vendor_commission_rate: event.vendor_commission_rate ?? 10,
						vendor_commission_amount: event.vendor_commission_amount ?? 0,
						referrer_user_id: event.referrer_user_id ?? "",
						referrer_type: event.referrer_type ?? "",
						referrer_commission: event.referrer_commission ?? 0,
						sales_user_id: event.sales_user_id ?? "",
						direct_sales_commission: event.direct_sales_commission ?? 0,
						pic_name: event.pic_name ?? "",
						pic_wa: event.pic_wa ?? "",
						backdrop_id: event.backdrop_id ?? "",
						vendor_decor_markup: event.vendor_decor_markup ?? 0,
						include_flashdisk_pouch: event.include_flashdisk_pouch ?? true,
						base_price: event.base_price ?? 0,
						discount_amount: event.discount_amount ?? 0,
						gross_up_pph_amount: event.gross_up_pph_amount ?? 0,
						crew_notes: event.crew_notes ?? "",
						addons: (
							(event.event_addons ?? []) as Array<{
								addon_id: string;
								quantity: number;
							}>
						).map((a) => ({
							addon_id: a.addon_id,
							quantity: a.quantity,
						})),
						bonuses: (
							(event.event_bonuses ?? []) as Array<{
								addon_id: string;
								quantity: number;
								notes: string | null;
							}>
						).map((b) => ({
							addon_id: b.addon_id,
							quantity: b.quantity,
							notes: b.notes,
						})),
					}}
				/>
			</div>
		</Container>
	);
}
