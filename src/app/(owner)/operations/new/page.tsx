import {
	type AddonOption,
	type BackdropOption,
	BookingForm,
	type EventTypeOption,
	type PackageOption,
	type RelasiOption,
	type VendorOption,
} from "@/components/booking/booking-form";
import {
	type SourceDocOption,
	SourceDocPicker,
} from "@/components/booking/source-doc-picker";
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
	searchParams: Promise<{ fromQuotation?: string; fromInvoice?: string }>;
}) {
	const { fromQuotation, fromInvoice } = await searchParams;
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

	// Isi dari dokumen: invoice DP (ditautkan ke event) atau quotation yang
	// di-deal (invoice baru dari isinya). Lihat createBooking.
	const sourceId = fromInvoice ?? fromQuotation ?? null;
	const sourceDoc = sourceId ? await loadDocument(sourceId) : null;
	const validSource =
		sourceDoc &&
		sourceDoc.status !== "void" &&
		((sourceDoc.doc_type === "invoice" && !sourceDoc.event_id) ||
			sourceDoc.doc_type === "quotation")
			? sourceDoc
			: null;
	const sourceDefaults = validSource
		? quotationToBookingDefaults(
				validSource,
				(packages ?? []) as PackageOption[],
			)
		: undefined;

	// Pilihan dokumen yang belum punya event: invoice DP & quotation terbuka.
	const { data: openDocs } = validSource
		? { data: [] }
		: await supabase
				.from("documents")
				.select("id, doc_type, doc_number, client, event_info")
				.is("event_id", null)
				.in("doc_type", ["invoice", "quotation"])
				.not("status", "in", "(void,accepted,rejected)")
				.order("created_at", { ascending: false })
				.limit(50);
	const sourceOptions: SourceDocOption[] = (openDocs ?? []).map((d) => ({
		id: d.id as string,
		doc_type: d.doc_type as "invoice" | "quotation",
		doc_number: d.doc_number as string,
		client_name: ((d.client as { name?: string }) ?? {}).name ?? "",
		event_date: ((d.event_info as { date?: string }) ?? {}).date ?? null,
	}));

	return (
		<Container size="xl" className="space-y-3">
			<PageHeader
				title="New Booking"
				backHref="/operations"
				backLabel="Operations"
				description="Booking baru disimpan sebagai draft. Lu bisa lengkapi detail crew dan DP setelah save."
			/>
			{validSource ? (
				<div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
					Diisi dari{" "}
					{validSource.doc_type === "invoice" ? "invoice" : "quotation"}{" "}
					<span className="font-semibold">{validSource.doc_number}</span>.{" "}
					{validSource.doc_type === "invoice"
						? "Lengkapi yang kurang lalu simpan — invoice ini akan tertaut ke event (nomor tetap)."
						: "Lengkapi yang kurang lalu simpan — invoice dibuat otomatis dari quotation ini."}
				</div>
			) : (
				<SourceDocPicker options={sourceOptions} />
			)}
			<div>
				<BookingForm
					action={createBooking}
					defaults={sourceDefaults}
					sourceQuotationId={
						validSource?.doc_type === "quotation" ? validSource.id : undefined
					}
					sourceInvoiceId={
						validSource?.doc_type === "invoice" ? validSource.id : undefined
					}
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
