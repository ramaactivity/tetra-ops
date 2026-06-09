"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { EVENT_STATUSES, type EventStatus } from "@/lib/event-status";
import { createClient } from "@/lib/supabase/server";

// Event lifecycle statuses — see @/lib/event-status. The deprecated
// draft/confirmed/archived enum values are no longer assignable.
const StatusUpdateSchema = z.object({
	id: z.uuid(),
	status: z.enum(EVENT_STATUSES),
});

export async function updateEventStatus(
	projectId: string,
	id: string,
	status: EventStatus,
): Promise<{ error?: string }> {
	// This action is invoked from a client startTransition without a try/catch,
	// so a thrown error would bubble to the route error boundary (full-page
	// crash). Always resolve with { error } instead of throwing.
	try {
		const me = await getCurrentUser();
		if (!me) {
			return { error: "Sesi berakhir. Refresh halaman lalu coba lagi." };
		}
		if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
			return { error: "Hanya owner yang bisa mengubah status event." };
		}

		const parsed = StatusUpdateSchema.safeParse({ id, status });
		if (!parsed.success) {
			return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
		}

		const supabase = await createClient();

		// Guard: event yang sudah settled terkunci. Ubah status manual akan desync
		// dgn settlement/jurnal yang sudah ter-posting. Koreksi event settled HARUS
		// lewat Reopen Settlement, bukan menu status.
		const { data: settled } = await supabase
			.from("event_settlements")
			.select("id")
			.eq("event_id", parsed.data.id)
			.eq("is_reopened", false)
			.maybeSingle();
		if (settled) {
			return {
				error:
					"Event sudah di-settle — status terkunci. Pakai Reopen Settlement dulu kalau perlu koreksi.",
			};
		}

		const { error } = await supabase
			.from("events")
			.update({ status: parsed.data.status })
			.eq("id", parsed.data.id);

		if (error) return { error: error.message };

		revalidatePath("/operations");
		revalidatePath(`/operations/${projectId}`);
		return {};
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : "Gagal mengubah status event.",
		};
	}
}
