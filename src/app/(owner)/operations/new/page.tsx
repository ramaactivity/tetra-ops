import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import {
	type AddonOption,
	type BackdropOption,
	BookingForm,
	type EventTypeOption,
	type PackageOption,
	type RelasiOption,
	type VendorOption,
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
		{ data: relasiCandidates },
		{ data: vendorHistory },
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
		// Recent distinct vendor names from past 6 months for autocomplete suggest
		supabase
			.from("events")
			.select("vendor_name, vendor_contact")
			.eq("channel", "vendor")
			.not("vendor_name", "is", null)
			.order("created_at", { ascending: false })
			.limit(50),
	]);

	// Dedupe vendor history by name → most recent contact
	const vendorMap = new Map<string, { name: string; contact: string | null }>();
	for (const row of (vendorHistory ?? []) as Array<{
		vendor_name: string | null;
		vendor_contact: string | null;
	}>) {
		if (!row.vendor_name) continue;
		if (!vendorMap.has(row.vendor_name)) {
			vendorMap.set(row.vendor_name, {
				name: row.vendor_name,
				contact: row.vendor_contact,
			});
		}
	}
	const vendorOptions = Array.from(vendorMap.values()).slice(0, 30);

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
					relasiOptions={
						((relasiCandidates ?? []) as RelasiOption[]).map((u) => ({
							id: u.id,
							full_name: u.full_name,
							role: u.role,
						})) as RelasiOption[]
					}
					vendorOptions={vendorOptions as VendorOption[]}
				/>
			</div>
		</div>
	);
}
