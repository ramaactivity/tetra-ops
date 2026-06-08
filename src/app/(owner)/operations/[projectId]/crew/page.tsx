import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignCrewForm } from "@/components/booking/assign-crew-form";
import {
	type AssignmentRow,
	CrewAssignmentList,
} from "@/components/booking/crew-assignment-list";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { getAssignableCrew } from "@/lib/crew/assignable";
import { createClient } from "@/lib/supabase/server";

export default async function ManageCrewPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select(
			`id, project_id, client_name, client_wa, event_date,
			 setup_time, start_time, end_time,
			 venue_name, venue_address, venue_city, venue_province, google_maps_url,
			 pic_name, pic_wa,
			 frame_size, backdrop_color, include_flashdisk_pouch, crew_notes,
			 channel, vendor_name, vendor_pic_name, vendor_contact,
			 due_date, total_paid, remaining_balance, custom_package_name,
			 package:packages(name, duration_hours),
			 backdrop:backdrops(name, type),
			 event_addons(quantity, addon:addons(name, unit)),
			 event_bonuses(quantity, notes, addon:addons(name, unit))`,
		)
		.eq("project_id", projectId)
		.maybeSingle();
	if (!event) notFound();

	// Existing assignments for this event
	const { data: assignmentsData } = await supabase
		.from("crew_assignments")
		.select(
			"id, role_in_event, fee_amount, bonus_amount, fee_override_reason, user:users!crew_assignments_user_id_fkey(full_name, tier, phone_wa)",
		)
		.eq("event_id", event.id);

	const assignments = (assignmentsData ?? []).map((a) => ({
		id: a.id as string,
		role_in_event: a.role_in_event as string,
		fee_amount: a.fee_amount as number,
		bonus_amount: a.bonus_amount as number,
		fee_override_reason: a.fee_override_reason as string | null,
		user: Array.isArray(a.user) ? a.user[0] : a.user,
	})) as AssignmentRow[];

	const pkg = (
		Array.isArray(event.package) ? event.package[0] : event.package
	) as { name: string | null; duration_hours: number | null } | null;

	const backdrop = (
		Array.isArray(event.backdrop) ? event.backdrop[0] : event.backdrop
	) as { name: string | null; type: string | null } | null;

	const addonRows = ((event.event_addons ?? []) as Array<{
		quantity: number;
		addon: { name: string; unit: string } | Array<{ name: string; unit: string }> | null;
	}>)
		.map((a) => {
			const addon = Array.isArray(a.addon) ? a.addon[0] : a.addon;
			if (!addon) return null;
			return a.quantity > 1
				? `${addon.name} × ${a.quantity}${addon.unit ? ` ${addon.unit}` : ""}`
				: addon.name;
		})
		.filter((s): s is string => Boolean(s));

	const bonusRows = ((event.event_bonuses ?? []) as Array<{
		quantity: number;
		notes: string | null;
		addon: { name: string; unit: string } | Array<{ name: string; unit: string }> | null;
	}>)
		.map((b) => {
			const addon = Array.isArray(b.addon) ? b.addon[0] : b.addon;
			if (!addon) return null;
			const label = `${b.quantity}× ${addon.name}${addon.unit ? ` (${addon.unit})` : ""}`;
			return b.notes ? `${label} — ${b.notes}` : label;
		})
		.filter((s): s is string => Boolean(s));

	const eventForWa = {
		project_id: event.project_id,
		client_name: event.client_name,
		client_wa: event.client_wa ?? "",
		event_date: event.event_date,
		setup_time: event.setup_time,
		start_time: event.start_time,
		end_time: event.end_time,
		venue_name: event.venue_name,
		venue_address: event.venue_address ?? null,
		venue_city: event.venue_city ?? null,
		venue_province: event.venue_province ?? null,
		google_maps_url: event.google_maps_url ?? null,
		pic_name: event.pic_name ?? null,
		pic_wa: event.pic_wa ?? null,
		due_date: event.due_date ?? null,
		total_paid: event.total_paid ?? null,
		remaining_balance: event.remaining_balance ?? null,
		package_name: pkg?.name ?? event.custom_package_name ?? null,
		duration_hours: pkg?.duration_hours ?? null,
		frame_size: event.frame_size ?? null,
		backdrop_color: event.backdrop_color ?? null,
		backdrop_name: backdrop?.name ?? null,
		backdrop_type: backdrop?.type ?? null,
		channel: event.channel ?? null,
		vendor_name: event.vendor_name ?? null,
		vendor_pic_name: event.vendor_pic_name ?? null,
		vendor_contact: event.vendor_contact ?? null,
		include_flashdisk_pouch: event.include_flashdisk_pouch ?? null,
		addons_list: addonRows.length > 0 ? addonRows : null,
		bonuses_list: bonusRows.length > 0 ? bonusRows : null,
		crew_notes: event.crew_notes ?? null,
	};

	const availableCrew = await getAssignableCrew(
		supabase,
		event.id,
		event.event_date,
	);

	return (
		<Container size="sm" className="space-y-6">
			<div className="space-y-2">
				<Link
					href={`/operations/${event.project_id}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{event.project_id}
				</Link>
				<SectionHeader
					title="Manage Crew"
					description={`${event.client_name} · ${event.event_date}`}
				/>
			</div>

			<div className="border-border-default bg-surface-2 space-y-4 rounded-lg border p-5">
				<h2 className="text-base font-semibold">Assignments saat ini</h2>
				<CrewAssignmentList
					projectId={event.project_id}
					assignments={assignments}
					event={eventForWa}
				/>
			</div>

			<div className="border-border-default bg-surface-2 space-y-4 rounded-lg border p-5">
				<div>
					<h2 className="text-base font-semibold">Tambah crew</h2>
					<p className="text-muted-foreground text-xs">
						Fee otomatis dari tier (senior / junior). Tanda ⚠ = crew ini punya
						assignment lain di tanggal sama.
					</p>
				</div>
				<AssignCrewForm
					projectId={event.project_id}
					eventId={event.id}
					availableCrew={availableCrew}
				/>
			</div>
		</Container>
	);
}
