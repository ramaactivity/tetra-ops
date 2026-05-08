import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	AssignCrewForm,
	type CrewOption,
} from "@/components/booking/assign-crew-form";
import {
	type AssignmentRow,
	CrewAssignmentList,
} from "@/components/booking/crew-assignment-list";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
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
			"id, project_id, client_name, client_wa, event_date, setup_time, start_time, venue_name, due_date, total_paid, remaining_balance",
		)
		.eq("project_id", projectId)
		.maybeSingle();
	if (!event) notFound();

	// Fetch all crew users
	const { data: allCrew } = await supabase
		.from("users")
		.select("id, full_name, tier")
		.eq("role", "crew")
		.eq("is_active", true)
		.is("deleted_at", null)
		.order("full_name", { ascending: true });

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

	const eventForWa = {
		project_id: event.project_id,
		client_name: event.client_name,
		client_wa: event.client_wa ?? "",
		event_date: event.event_date,
		setup_time: event.setup_time,
		start_time: event.start_time,
		venue_name: event.venue_name,
		due_date: event.due_date ?? null,
		total_paid: event.total_paid ?? null,
		remaining_balance: event.remaining_balance ?? null,
	};

	const { data: assignedRaw } = await supabase
		.from("crew_assignments")
		.select("user_id")
		.eq("event_id", event.id);
	const assignedSet = new Set(
		(assignedRaw ?? []).map((r) => r.user_id as string),
	);

	// Conflict detection: crew already assigned to OTHER events on same date
	const { data: sameDayEvents } = await supabase
		.from("events")
		.select("id")
		.eq("event_date", event.event_date)
		.neq("id", event.id);
	const sameDayIds = (sameDayEvents ?? []).map((e) => e.id as string);

	let conflictUserIds = new Set<string>();
	if (sameDayIds.length > 0) {
		const { data: conflicts } = await supabase
			.from("crew_assignments")
			.select("user_id")
			.in("event_id", sameDayIds);
		conflictUserIds = new Set(
			(conflicts ?? []).map((c) => c.user_id as string),
		);
	}

	const availableCrew: CrewOption[] = (
		(allCrew as Array<{
			id: string;
			full_name: string;
			tier: string | null;
		}> | null) ?? []
	)
		.filter((c) => !assignedSet.has(c.id))
		.map((c) => ({
			id: c.id,
			full_name: c.full_name,
			tier: c.tier,
			hasConflict: conflictUserIds.has(c.id),
		}));

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

			<div className="border-border-default bg-surface-2 space-y-4 rounded-xl border p-5">
				<h2 className="text-base font-semibold">Assignments saat ini</h2>
				<CrewAssignmentList
					projectId={event.project_id}
					assignments={assignments}
					event={eventForWa}
				/>
			</div>

			<div className="border-border-default bg-surface-2 space-y-4 rounded-xl border p-5">
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
