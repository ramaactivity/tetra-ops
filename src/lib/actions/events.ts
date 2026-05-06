"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const STATUSES = [
	"draft",
	"confirmed",
	"design_brief",
	"design_approved",
	"upcoming",
	"in_progress",
	"awaiting_settlement",
	"completed",
	"cancelled",
	"archived",
] as const;

const StatusUpdateSchema = z.object({
	id: z.uuid(),
	status: z.enum(STATUSES),
});

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

export async function updateEventStatus(
	projectId: string,
	id: string,
	status: (typeof STATUSES)[number],
): Promise<{ error?: string }> {
	await requireOwnerLevel();

	const parsed = StatusUpdateSchema.safeParse({ id, status });
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("events")
		.update({ status: parsed.data.status })
		.eq("id", parsed.data.id);

	if (error) return { error: error.message };

	revalidatePath("/operations");
	revalidatePath(`/operations/${projectId}`);
	return {};
}
