import { dig } from "@/components/portal/booking/logic";
import { BookingWizard } from "@/components/portal/booking/wizard";
import { getPortalPerson } from "@/lib/portal/auth";
import { configNumber, loadCatalog } from "@/lib/portal/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWaPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking" };

export default async function BookingPage() {
	const [catalog, person, dpMin, biz] = await Promise.all([
		loadCatalog(),
		getPortalPerson(),
		configNumber("booking.dp_minimum", 500000),
		createAdminClient()
			.from("system_config")
			.select("value")
			.eq("key", "business_phone")
			.maybeSingle(),
	]);
	const now = new Date(Date.now() + 7 * 3600_000); // WIB
	return (
		<BookingWizard
			products={catalog.products}
			addons={catalog.addons}
			dpMin={dpMin}
			today={{
				y: now.getUTCFullYear(),
				m: now.getUTCMonth(),
				d: now.getUTCDate(),
			}}
			verifiedPhone={person ? dig(person.phone) : null}
			signedName={person?.name ?? null}
			adminWa={
				typeof biz.data?.value === "string" ? toWaPhone(biz.data.value) : null
			}
		/>
	);
}
