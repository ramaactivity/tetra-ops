"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { revalidateDashboard } from "@/lib/dashboard/stats";

async function requireAuth() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	return me;
}

function bumpCommonPaths() {
	revalidatePath("/notifications");
	revalidateDashboard();
	revalidatePath("/operations");
	revalidatePath("/finance");
}

export async function markNotificationRead(
	id: string,
): Promise<{ error?: string }> {
	try {
		const me = await requireAuth();
		const supabase = await createClient();
		const { error } = await supabase
			.from("notifications")
			.update({ is_read: true, read_at: new Date().toISOString() })
			.eq("id", id)
			.eq("user_id", me.profile.id);
		if (error) return { error: error.message };
		bumpCommonPaths();
		return {};
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

export async function markAllNotificationsRead(): Promise<{
	error?: string;
	updated?: number;
}> {
	try {
		const me = await requireAuth();
		const supabase = await createClient();
		const { error, data } = await supabase
			.from("notifications")
			.update({ is_read: true, read_at: new Date().toISOString() })
			.eq("user_id", me.profile.id)
			.eq("is_read", false)
			.select("id");
		if (error) return { error: error.message };
		bumpCommonPaths();
		return { updated: (data ?? []).length };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

export async function dismissNotification(
	id: string,
): Promise<{ error?: string }> {
	try {
		const me = await requireAuth();
		const supabase = await createClient();
		const { error } = await supabase
			.from("notifications")
			.update({
				is_dismissed: true,
				dismissed_at: new Date().toISOString(),
				is_read: true,
				read_at: new Date().toISOString(),
			})
			.eq("id", id)
			.eq("user_id", me.profile.id);
		if (error) return { error: error.message };
		bumpCommonPaths();
		return {};
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
