import { dig } from "@/components/portal/booking/logic";
import { BookingWizard } from "@/components/portal/booking/wizard";
import { getPortalPerson } from "@/lib/portal/auth";
import { configNumber, loadCatalog } from "@/lib/portal/data";
import { signedUrls } from "@/lib/portal/design-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWaPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking" };

export default async function BookingPage() {
	const [catalog, person, dpMin, biz, tpl] = await Promise.all([
		loadCatalog(),
		getPortalPerson(),
		configNumber("booking.dp_minimum", 500000),
		createAdminClient()
			.from("system_config")
			.select("value")
			.eq("key", "business_phone")
			.maybeSingle(),
		createAdminClient()
			.from("design_templates")
			.select("id, name, category, frame_size, preview_path, preview_url")
			.eq("is_active", true)
			.eq("booth_archived", false)
			.order("featured", { ascending: false })
			.order("sort")
			.limit(24),
	]);
	// Katalog template asli (Template Frame) untuk layar "Intip desain".
	const tplRows = tpl.data ?? [];
	const urls = await signedUrls(
		tplRows
			.map((t) => t.preview_path as string | null)
			.filter((x): x is string => !!x),
		3600,
	);
	const templates = tplRows
		.map((t) => ({
			id: t.id as string,
			name: t.name as string,
			category: (t.category as string | null) ?? null,
			frame: t.frame_size as string,
			url:
				(t.preview_url as string | null) ??
				(t.preview_path ? (urls.get(t.preview_path as string) ?? null) : null),
		}))
		.filter((t) => t.url);
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
			templates={templates}
			adminWa={
				typeof biz.data?.value === "string" ? toWaPhone(biz.data.value) : null
			}
		/>
	);
}
