import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	type AddonOption,
	type BackdropOption,
	BookingForm,
	type EventTypeOption,
	type PackageOption,
} from "@/components/booking/booking-form";
import { updateBooking } from "@/lib/actions/bookings";
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
	] = await Promise.all([
		supabase
			.from("events")
			.select(
				`id, project_id, channel, client_name, client_wa, client_email,
				service_type, package_id, frame_size, event_category, event_date,
				setup_time, start_time, end_time, venue_name, venue_address, venue_city,
				backdrop_id, vendor_decor_markup, include_flashdisk_pouch,
				base_price, discount_amount, gross_up_pph_amount, crew_notes,
				event_addons(addon_id, quantity)`,
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
	]);

	if (error) {
		return (
			<div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat event: {error.message}
					</p>
				</div>
			</div>
		);
	}

	if (!event) notFound();

	const action = updateBooking.bind(null, event.id);
	const trimTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
			<div className="space-y-2">
				<Link
					href={`/operations/${event.project_id}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{event.project_id}
				</Link>
				<div>
					<h1 className="text-fluid-h1 font-semibold tracking-tight">
						Edit: {event.client_name}
					</h1>
					<p className="text-muted-foreground tabular text-sm">
						{event.project_id}
					</p>
				</div>
			</div>
			<div className="mt-6">
				<BookingForm
					action={action}
					packages={(packages ?? []) as PackageOption[]}
					addons={(addons ?? []) as AddonOption[]}
					backdrops={(backdrops ?? []) as BackdropOption[]}
					eventTypes={(eventTypes ?? []) as EventTypeOption[]}
					submitLabel="Save changes"
					defaults={{
						channel: event.channel,
						client_name: event.client_name,
						client_wa: event.client_wa,
						client_email: event.client_email ?? "",
						service_type: event.service_type,
						package_id: event.package_id ?? "",
						frame_size: event.frame_size,
						event_category: event.event_category,
						event_date: event.event_date,
						setup_time: trimTime(event.setup_time),
						start_time: trimTime(event.start_time),
						end_time: trimTime(event.end_time),
						venue_name: event.venue_name,
						venue_address: event.venue_address ?? "",
						venue_city: event.venue_city ?? "",
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
					}}
				/>
			</div>
		</div>
	);
}
