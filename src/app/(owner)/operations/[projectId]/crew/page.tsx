import { notFound } from "next/navigation";
import { AssignCrewForm } from "@/components/booking/assign-crew-form";
import {
	type AssignmentRow,
	CrewAssignmentList,
} from "@/components/booking/crew-assignment-list";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { getAssignableCrew } from "@/lib/crew/assignable";
import {
	toEventForWA,
	WA_EVENT_SELECT,
	type WaEventRow,
} from "@/lib/events/wa-event";
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
		.select(`id, due_date, ${WA_EVENT_SELECT}`)
		.eq("project_id", projectId)
		.maybeSingle();
	if (!event) notFound();

	// Existing assignments for this event
	const { data: assignmentsData } = await supabase
		.from("crew_assignments")
		.select(
			"id, user_id, role_in_event, fee_amount, bonus_amount, fee_override_reason, user:users!crew_assignments_user_id_fkey(full_name, tier, phone_wa)",
		)
		.eq("event_id", event.id);

	const assignments = (assignmentsData ?? []).map((a) => ({
		id: a.id as string,
		user_id: a.user_id as string,
		role_in_event: a.role_in_event as string,
		fee_amount: a.fee_amount as number,
		bonus_amount: a.bonus_amount as number,
		fee_override_reason: a.fee_override_reason as string | null,
		user: Array.isArray(a.user) ? a.user[0] : a.user,
	})) as AssignmentRow[];

	const eventForWa = toEventForWA(event as unknown as WaEventRow);

	const availableCrew = await getAssignableCrew(
		supabase,
		event.id,
		event.event_date,
	);

	return (
		<Container size="sm" className="space-y-3">
			<TopbarEntityPortal name={event.client_name} />
			<SectionHeader
				title="Manage Crew"
				description={`${event.client_name} · ${event.event_date}`}
			/>

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
