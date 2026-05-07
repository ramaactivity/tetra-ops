import { AlertTriangle, ChevronLeft, Package } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckInButton } from "@/components/event-equipment/check-in-button";
import {
	type AvailableItem,
	CheckOutDialog,
	type CrewOption,
} from "@/components/event-equipment/check-out-form";
import { IncidentDialog } from "@/components/event-equipment/incident-form";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	EQUIPMENT_CONDITION_LABELS,
	EQUIPMENT_LOCATION_LABELS,
	formatDateID,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type AssignedItem = {
	id: string;
	sku: string;
	name: string;
	condition: string | null;
	current_location: string | null;
	current_crew_id: string | null;
	current_crew: { full_name: string } | null;
};

type IncidentRow = {
	id: string;
	severity: "minor" | "major" | "total";
	description: string;
	resolution_status: string;
	created_at: string;
	item: { name: string; sku: string } | null;
	reporter: { full_name: string } | null;
};

const SEVERITY_TONE: Record<
	string,
	{ variant: "default" | "destructive" | "outline"; className?: string }
> = {
	minor: {
		variant: "outline",
		className:
			"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	},
	major: {
		variant: "outline",
		className:
			"border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
	},
	total: { variant: "destructive" },
};

const RESOLUTION_LABEL: Record<string, string> = {
	pending: "Pending",
	in_progress: "In Progress",
	resolved: "Resolved",
};

export default async function EventEquipmentPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select("id, project_id, client_name, event_date, status")
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	const [
		{ data: assignedData },
		{ data: availableData },
		{ data: crewData },
		{ data: incidentsData },
	] = await Promise.all([
		supabase
			.from("inventory_items")
			.select(
				`
				id, sku, name, condition, current_location, current_crew_id,
				current_crew:users!inventory_items_current_crew_id_fkey(full_name)
			`,
			)
			.eq("category", "equipment")
			.eq("current_event_id", event.id)
			.order("name", { ascending: true }),
		supabase
			.from("inventory_items")
			.select("id, sku, name, condition, current_location")
			.eq("category", "equipment")
			.eq("is_active", true)
			.is("current_event_id", null)
			.is("deleted_at", null)
			.order("name", { ascending: true }),
		supabase
			.from("crew_assignments")
			.select(
				`role_in_event,
				user:users!crew_assignments_user_id_fkey(id, full_name)`,
			)
			.eq("event_id", event.id),
		supabase
			.from("equipment_incidents")
			.select(
				`
				id, severity, description, resolution_status, created_at,
				item:inventory_items!equipment_incidents_item_id_fkey(name, sku),
				reporter:users!equipment_incidents_reported_by_fkey(full_name)
			`,
			)
			.eq("event_id", event.id)
			.order("created_at", { ascending: false }),
	]);

	const assigned = (assignedData ?? []).map((r) => ({
		...r,
		current_crew: Array.isArray(r.current_crew)
			? r.current_crew[0]
			: r.current_crew,
	})) as AssignedItem[];

	const available = (availableData ?? []) as AvailableItem[];
	const crew = (
		(crewData ?? []) as Array<{
			role_in_event: string;
			user:
				| { id: string; full_name: string }
				| { id: string; full_name: string }[]
				| null;
		}>
	)
		.map((c) => {
			const u = Array.isArray(c.user) ? c.user[0] : c.user;
			if (!u) return null;
			return {
				id: u.id,
				full_name: u.full_name,
				role_in_event: c.role_in_event,
			};
		})
		.filter((c): c is CrewOption => c !== null);

	const incidents = (incidentsData ?? []).map((i) => ({
		...i,
		item: Array.isArray(i.item) ? i.item[0] : i.item,
		reporter: Array.isArray(i.reporter) ? i.reporter[0] : i.reporter,
	})) as IncidentRow[];

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-2">
				<Link
					href={`/operations/${projectId}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{projectId}
				</Link>
				<div>
					<h1 className="text-fluid-h1 font-semibold tracking-tight">Equipment</h1>
					<p className="text-muted-foreground text-sm">
						{event.client_name} · {formatDateID(event.event_date)}
					</p>
				</div>
			</div>

			<section className="border-border-default bg-surface-2 space-y-4 rounded-xl border p-5">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="text-base font-semibold tracking-tight">
							Assigned ke event ini
						</h2>
						<p className="text-muted-foreground text-xs">
							{assigned.length} alat di-check-out
						</p>
					</div>
					<CheckOutDialog
						eventId={event.id}
						projectId={projectId}
						availableItems={available}
						assignedCrew={crew}
					/>
				</div>

				{assigned.length === 0 ? (
					<div className="border-border-default bg-muted/20 flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
						<Package className="text-muted-foreground h-8 w-8" />
						<p className="text-muted-foreground text-sm">
							Belum ada equipment di-check-out untuk event ini.
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>SKU</TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Lokasi</TableHead>
									<TableHead>Dibawa</TableHead>
									<TableHead>Kondisi</TableHead>
									<TableHead className="w-[180px] text-right">
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{assigned.map((it) => (
									<TableRow key={it.id}>
										<TableCell className="text-muted-foreground tabular text-xs">
											{it.sku}
										</TableCell>
										<TableCell className="font-medium">{it.name}</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{it.current_location
												? (EQUIPMENT_LOCATION_LABELS[it.current_location] ??
													it.current_location)
												: "—"}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{it.current_crew?.full_name ?? "—"}
										</TableCell>
										<TableCell className="text-sm">
											{it.condition === "normal" ? (
												<span className="text-muted-foreground">Normal</span>
											) : it.condition ? (
												<span className="text-amber-600 dark:text-amber-400">
													{EQUIPMENT_CONDITION_LABELS[it.condition] ??
														it.condition}
												</span>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell>
											<div className="flex items-center justify-end gap-1.5">
												<IncidentDialog
													itemId={it.id}
													eventId={event.id}
													projectId={projectId}
													itemName={it.name}
												/>
												<CheckInButton
													itemId={it.id}
													eventId={event.id}
													projectId={projectId}
													itemName={it.name}
												/>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</section>

			{incidents.length > 0 && (
				<section className="border-border-default bg-surface-2 space-y-3 rounded-xl border p-5">
					<div className="flex items-baseline gap-2">
						<AlertTriangle className="text-amber-500 h-4 w-4" />
						<h2 className="text-base font-semibold tracking-tight">
							Incidents{" "}
							<span className="text-muted-foreground text-xs font-normal">
								({incidents.length})
							</span>
						</h2>
					</div>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Tanggal</TableHead>
									<TableHead>Item</TableHead>
									<TableHead>Severity</TableHead>
									<TableHead>Deskripsi</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Reporter</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{incidents.map((i) => {
									const sev = SEVERITY_TONE[i.severity];
									return (
										<TableRow key={i.id}>
											<TableCell className="text-muted-foreground tabular text-xs">
												{formatDateID(i.created_at)}
											</TableCell>
											<TableCell>
												<div className="font-medium">{i.item?.name ?? "—"}</div>
												<div className="text-muted-foreground tabular text-[10px]">
													{i.item?.sku ?? "—"}
												</div>
											</TableCell>
											<TableCell>
												<Badge variant={sev.variant} className={sev.className}>
													{i.severity}
												</Badge>
											</TableCell>
											<TableCell className="max-w-md text-sm">
												{i.description}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{RESOLUTION_LABEL[i.resolution_status] ??
													i.resolution_status}
											</TableCell>
											<TableCell className="text-muted-foreground text-sm">
												{i.reporter?.full_name ?? "—"}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				</section>
			)}
		</div>
	);
}
