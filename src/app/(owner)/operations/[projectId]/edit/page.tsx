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
import { fetchGuestCards } from "@/lib/booth-sync";
import { parseGrossUpRate } from "@/lib/documents/types";
import {
	fetchSalesCandidates,
	fetchVendorCandidates,
	fetchVenueCandidates,
} from "@/lib/events/booking-candidates";
import {
	BOOKING_EDIT_SELECT,
	bookingDefaultsFromEvent,
} from "@/lib/events/booking-defaults";
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
		venueOptions,
		relasiCandidates,
		{ data: grossupConfig },
	] = await Promise.all([
		supabase
			.from("events")
			.select(BOOKING_EDIT_SELECT)
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
			.select(
				"id, name, category, unit, price, addon_group, max_guests, print_size",
			)
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
		fetchVenueCandidates(supabase),
		fetchSalesCandidates(supabase),
		supabase
			.from("system_config")
			.select("value")
			.eq("key", "tax.default_grossup_rate_pct")
			.maybeSingle(),
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
					guestCards={await fetchGuestCards()}
					backdrops={(backdrops ?? []) as BackdropOption[]}
					eventTypes={(eventTypes ?? []) as EventTypeOption[]}
					relasiOptions={relasiPool}
					vendorOptions={vendorOptions}
					venueOptions={venueOptions}
					grossupRate={parseGrossUpRate(grossupConfig?.value)}
					submitLabel="Simpan perubahan"
					defaults={bookingDefaultsFromEvent(event)}
				/>
			</div>
		</Container>
	);
}
