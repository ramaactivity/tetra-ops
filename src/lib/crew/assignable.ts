import type { CrewOption } from "@/components/booking/assign-crew-form";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Crew that can still be assigned to an event: all active crew minus those
 * already on this event, each flagged with `hasConflict` when they're booked
 * on another event the same day. Shared by the event detail page (inline
 * manager) and the standalone Manage Crew page so the logic stays in one place.
 */
export async function getAssignableCrew(
	supabase: ServerClient,
	eventId: string,
	eventDate: string,
): Promise<CrewOption[]> {
	const [{ data: allCrew }, { data: assignedRaw }, { data: sameDayEvents }] =
		await Promise.all([
			supabase
				.from("users")
				.select("id, full_name, tier")
				.eq("role", "crew")
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("full_name", { ascending: true }),
			supabase
				.from("crew_assignments")
				.select("user_id")
				.eq("event_id", eventId),
			// Event yang dibatalkan / terhapus TIDAK menahan crew. Tanpa filter ini,
			// booking Sabtu yang sudah dibatalkan tetap memunculkan badge "bentrok"
			// merah pada setiap crew yang dulu ditugaskan di sana, sehingga owner
			// terdorong memilih crew yang kurang cocok untuk event penggantinya.
			supabase
				.from("events")
				.select("id")
				.eq("event_date", eventDate)
				.neq("id", eventId)
				.is("deleted_at", null)
				.neq("status", "cancelled"),
		]);

	const assignedSet = new Set(
		(assignedRaw ?? []).map((r) => r.user_id as string),
	);

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

	return (
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
}
