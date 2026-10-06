import { BookingWizard } from "@/components/portal/booking-wizard";
import { getPortalPerson } from "@/lib/portal/auth";
import { loadCatalog } from "@/lib/portal/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking" };

export default async function BookingPage() {
	const [catalog, person] = await Promise.all([
		loadCatalog(),
		getPortalPerson(),
	]);
	return (
		<BookingWizard
			products={catalog.products}
			addons={catalog.addons}
			signedInName={person ? (person.name ?? person.phone) : null}
		/>
	);
}
