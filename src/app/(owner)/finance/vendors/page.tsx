import {
	ChevronLeft,
	ExternalLink,
	Handshake,
	UsersRound,
} from "lucide-react";
import Link from "next/link";
import { formatDateID, formatRupiah } from "@/lib/format";
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

type VendorStats = {
	name: string;
	contactId: string | null;
	contactPhone: string | null;
	totalEvents: number;
	totalCommission: number;
	mtdCommission: number;
	lastEventDate: string | null;
	upcomingCount: number;
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
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm">{error.message}</p>
				</div>
			</div>
		);
	}

	const events = (eventsData ?? []) as VendorEvent[];
	const contacts = (contactsData ?? []) as Array<{
		id: string;
		name: string;
		phone: string | null;
		type: string;
	}>;

	// Build name → contact map for cross-reference
	const contactByName = new Map(
		contacts.map((c) => [c.name.trim().toLowerCase(), c]),
	);

	// Aggregate by vendor_name
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
			if (
				!existing.lastEventDate ||
				e.event_date > existing.lastEventDate
			) {
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

	// Also add vendors from contacts that don't have any events yet
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

	// Aggregate stats
	const totalCommissionAll = vendors.reduce(
		(s, v) => s + v.totalCommission,
		0,
	);
	const totalCommissionMtd = vendors.reduce(
		(s, v) => s + v.mtdCommission,
		0,
	);
	const totalEvents = vendors.reduce((s, v) => s + v.totalEvents, 0);
	const totalUpcoming = vendors.reduce((s, v) => s + v.upcomingCount, 0);

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-2">
				<Link
					href="/finance"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Finance
				</Link>
				<div>
					<h1 className="text-3xl font-semibold tracking-tight">
						Vendor / Partner Organizer
					</h1>
					<p className="text-muted-foreground text-sm">
						Aggregate komisi vendor dari semua event channel=vendor.
					</p>
				</div>
			</div>

			{/* Summary stats */}
			<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
				<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
					<Handshake className="text-muted-foreground h-10 w-10" />
					<div className="space-y-1">
						<h3 className="font-medium">Belum ada vendor</h3>
						<p className="text-muted-foreground text-sm">
							Tambah lewat{" "}
							<Link
								href="/settings/contacts"
								className="text-primary hover:underline"
							>
								Contacts
							</Link>{" "}
							dengan type=Vendor, atau bikin event channel=vendor.
						</p>
					</div>
				</div>
			) : (
				<div className="border-border bg-card overflow-x-auto rounded-xl border">
					<table className="w-full text-sm">
						<thead className="bg-muted/40">
							<tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
								<th className="px-4 py-3 text-left font-medium">Vendor</th>
								<th className="px-4 py-3 text-right font-medium">
									Total event
								</th>
								<th className="px-4 py-3 text-right font-medium">Upcoming</th>
								<th className="px-4 py-3 text-right font-medium">
									Komisi MTD
								</th>
								<th className="px-4 py-3 text-right font-medium">
									Komisi total
								</th>
								<th className="px-4 py-3 text-left font-medium">
									Last event
								</th>
								<th className="px-4 py-3 text-left font-medium">Contact</th>
							</tr>
						</thead>
						<tbody className="divide-border divide-y">
							{vendors.map((v) => (
								<tr key={v.name} className="hover:bg-muted/20">
									<td className="px-4 py-3">
										<div className="space-y-0.5">
											<Link
												href={`/operations?q=${encodeURIComponent(v.name)}`}
												className="text-foreground text-sm font-medium hover:underline"
											>
												{v.name}
											</Link>
											{v.contactId && (
												<p className="text-muted-foreground text-[10px]">
													Linked contact: yes
												</p>
											)}
										</div>
									</td>
									<td className="text-foreground tabular px-4 py-3 text-right">
										{v.totalEvents}
									</td>
									<td
										className={`tabular px-4 py-3 text-right ${
											v.upcomingCount > 0
												? "text-amber-600 dark:text-amber-400 font-semibold"
												: "text-muted-foreground"
										}`}
									>
										{v.upcomingCount > 0 ? v.upcomingCount : "—"}
									</td>
									<td
										className={`tabular px-4 py-3 text-right ${
											v.mtdCommission > 0
												? "text-emerald-600 dark:text-emerald-400 font-medium"
												: "text-muted-foreground"
										}`}
									>
										{v.mtdCommission > 0 ? formatRupiah(v.mtdCommission) : "—"}
									</td>
									<td className="text-foreground tabular px-4 py-3 text-right font-semibold">
										{v.totalCommission > 0
											? formatRupiah(v.totalCommission)
											: "—"}
									</td>
									<td className="text-muted-foreground tabular px-4 py-3 text-xs">
										{v.lastEventDate ? formatDateID(v.lastEventDate) : "—"}
									</td>
									<td className="px-4 py-3">
										{v.contactPhone ? (
											<a
												href={`https://wa.me/${v.contactPhone.replace(/^\+|^0/, "62")}`}
												target="_blank"
												rel="noopener noreferrer"
												className="text-primary tabular inline-flex items-center gap-1 text-xs hover:underline"
											>
												{v.contactPhone}
												<ExternalLink className="h-3 w-3" />
											</a>
										) : (
											<span className="text-muted-foreground/60 text-xs">
												—
											</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<div className="border-border bg-muted/30 text-muted-foreground rounded-lg border p-3 text-xs">
				<p className="flex items-start gap-2">
					<UsersRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
		</div>
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
		<div className="border-border bg-card space-y-1 rounded-xl border p-4">
			<dt className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
				{label}
			</dt>
			<dd className={`tabular text-xl font-semibold ${cls}`}>{value}</dd>
			<p className="text-muted-foreground text-[10px]">{hint}</p>
		</div>
	);
}
