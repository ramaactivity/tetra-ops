import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import {
	type AddonOption,
	type BackdropOption,
	BookingForm,
	type EventTypeOption,
	type PackageOption,
} from "@/components/booking/booking-form";
import { createBooking } from "@/lib/actions/bookings";
import { createClient } from "@/lib/supabase/server";

export default async function NewBookingPage() {
	const supabase = await createClient();
	const [
		{ data: packages },
		{ data: addons },
		{ data: backdrops },
		{ data: eventTypes },
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
	]);

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
			<div className="space-y-2">
				<Link
					href="/operations"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Operations
				</Link>
				<div>
					<h1 className="text-fluid-h1 font-semibold tracking-tight">New Booking</h1>
					<p className="text-muted-foreground text-sm">
						Booking baru disimpan sebagai draft. Lu bisa lengkapi detail crew
						dan DP setelah save.
					</p>
				</div>
			</div>
			<div className="mt-6">
				<BookingForm
					action={createBooking}
					packages={(packages ?? []) as PackageOption[]}
					addons={(addons ?? []) as AddonOption[]}
					backdrops={(backdrops ?? []) as BackdropOption[]}
					eventTypes={(eventTypes ?? []) as EventTypeOption[]}
				/>
			</div>
		</div>
	);
}
