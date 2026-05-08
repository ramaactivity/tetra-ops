import { ChevronLeft, Handshake, UsersRound } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	type VendorStats,
	VendorsListTable,
} from "@/components/finance/vendors-list-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const ID_MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

function startOfMonth(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type VendorEvent = {
	id: string;
	project_id: string;
	vendor_name: string | null;
	vendor_commission_amount: number | null;
	event_date: string;
	client_name: string;
	status: string;
	is_migrated_legacy: boolean | null;
};

export default async function VendorsPage() {
	const supabase = await createClient();
	const today = new Date();
	const ymStart = startOfMonth(today);
	const ymEnd = lastDayOfMonth(today.getFullYear(), today.getMonth() + 1);
	const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
	const monthLabel = `${ID_MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`;

	const [{ data: eventsData, error }, { data: contactsData }] =
		await Promise.all([
			supabase
				.from("events")
				.select(
					"id, project_id, vendor_name, vendor_commission_amount, event_date, client_name, status, is_migrated_legacy",
				)
				.eq("channel", "vendor")
				.is("deleted_at", null)
				.not("vendor_name", "is", null)
				.order("event_date", { ascending: false }),
			supabase
				.from("contacts")
				.select("id, name, phone, type")
				.eq("type", "vendor")
				.eq("is_active", true),
		]);

	if (error) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-destructive bg-destructive/10 p-4">
					<p className="text-fluid-body text-destructive">{error.message}</p>
				</div>
			</Container>
		);
	}

	const events = (eventsData ?? []) as VendorEvent[];
	const contacts = (contactsData ?? []) as Array<{
		id: string;
		name: string;
		phone: string | null;
		type: string;
	}>;

	const contactByName = new Map(
		contacts.map((c) => [c.name.trim().toLowerCase(), c]),
	);

	const vendorMap = new Map<string, VendorStats>();
	for (const e of events) {
		if (!e.vendor_name) continue;
		const name = e.vendor_name.trim();
		if (!name) continue;
		const key = name.toLowerCase();
		const existing = vendorMap.get(key);
		const isUpcoming =
			!e.is_migrated_legacy &&
			e.event_date >= todayISO &&
			!["cancelled", "archived", "completed"].includes(e.status);
		const isThisMonth =
			!e.is_migrated_legacy &&
			e.event_date >= ymStart &&
			e.event_date <= ymEnd;
		const commission = e.vendor_commission_amount ?? 0;

		if (existing) {
			existing.totalEvents += 1;
			existing.totalCommission += commission;
			if (isThisMonth) existing.mtdCommission += commission;
			if (isUpcoming) existing.upcomingCount += 1;
			if (!existing.lastEventDate || e.event_date > existing.lastEventDate) {
				existing.lastEventDate = e.event_date;
			}
		} else {
			const matchingContact = contactByName.get(key);
			vendorMap.set(key, {
				name,
				contactId: matchingContact?.id ?? null,
				contactPhone: matchingContact?.phone ?? null,
				totalEvents: 1,
				totalCommission: commission,
				mtdCommission: isThisMonth ? commission : 0,
				lastEventDate: e.event_date,
				upcomingCount: isUpcoming ? 1 : 0,
			});
		}
	}

	for (const c of contacts) {
		const key = c.name.trim().toLowerCase();
		if (!vendorMap.has(key) && c.name.trim()) {
			vendorMap.set(key, {
				name: c.name.trim(),
				contactId: c.id,
				contactPhone: c.phone,
				totalEvents: 0,
				totalCommission: 0,
				mtdCommission: 0,
				lastEventDate: null,
				upcomingCount: 0,
			});
		}
	}

	const vendors = Array.from(vendorMap.values()).sort(
		(a, b) => b.totalCommission - a.totalCommission,
	);

	const totalCommissionAll = vendors.reduce(
		(s, v) => s + v.totalCommission,
		0,
	);
	const totalCommissionMtd = vendors.reduce((s, v) => s + v.mtdCommission, 0);
	const totalEvents = vendors.reduce((s, v) => s + v.totalEvents, 0);
	const totalUpcoming = vendors.reduce((s, v) => s + v.upcomingCount, 0);

	return (
		<Container size="xl" className="space-y-6">
			<div className="space-y-2">
				<Link
					href="/finance"
					className="inline-flex items-center gap-1 text-fluid-caption text-muted-foreground hover:text-foreground"
				>
					<ChevronLeft className="size-4" />
					Finance
				</Link>
				<SectionHeader
					title="Vendor / Partner Organizer"
					description="Aggregate komisi vendor dari semua event channel=vendor."
				/>
			</div>

			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<SummaryCard
					label="Total komisi"
					value={formatRupiah(totalCommissionAll)}
					hint="All time"
					tone="primary"
				/>
				<SummaryCard
					label={`Komisi ${monthLabel}`}
					value={formatRupiah(totalCommissionMtd)}
					hint="Bulan berjalan"
					tone="emerald"
				/>
				<SummaryCard
					label="Total event vendor"
					value={totalEvents.toLocaleString("id-ID")}
					hint={`Dari ${vendors.length} vendor`}
					tone="muted"
				/>
				<SummaryCard
					label="Upcoming"
					value={totalUpcoming.toLocaleString("id-ID")}
					hint="Event aktif via vendor"
					tone="amber"
				/>
			</dl>

			{vendors.length === 0 ? (
				<EmptyState
					icon={Handshake}
					title="Belum ada vendor"
					description={
						<>
							Tambah lewat{" "}
							<Link
								href="/settings/contacts"
								className="text-primary hover:underline"
							>
								Contacts
							</Link>{" "}
							dengan type=Vendor, atau bikin event channel=vendor.
						</>
					}
				/>
			) : (
				<VendorsListTable vendors={vendors} />
			)}

			<div className="rounded-lg border border-border-default bg-surface-3/40 p-3 text-fluid-caption text-muted-foreground">
				<p className="flex items-start gap-2">
					<UsersRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
					<span>
						Data diaggregat dari <code>events.vendor_name</code> +{" "}
						<code>contacts.type=vendor</code>. Klik nama vendor → filter
						operations list. Komisi diambil dari{" "}
						<code>events.vendor_commission_amount</code> (di-set saat booking
						channel=vendor). Legacy migrated events di-exclude dari MTD &
						upcoming.
					</span>
				</p>
			</div>
		</Container>
	);
}

function SummaryCard({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string;
	hint: string;
	tone: "primary" | "emerald" | "amber" | "muted";
}) {
	const cls =
		tone === "primary"
			? "text-primary"
			: tone === "emerald"
				? "text-emerald-600 dark:text-emerald-400"
				: tone === "amber"
					? "text-amber-600 dark:text-amber-400"
					: "text-foreground";
	return (
		<div className="space-y-1 rounded-xl border border-border-default bg-surface-2 p-4">
			<dt className="text-fluid-caption font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</dt>
			<dd className={`tabular text-fluid-h2 font-semibold ${cls}`}>{value}</dd>
			<p className="text-[10px] text-muted-foreground">{hint}</p>
		</div>
	);
}
