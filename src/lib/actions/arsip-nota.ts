"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

/**
 * Hapus nota manual. Hanya menghapus ROW (file di Drive dibiarkan untuk audit
 * — file fisik tidak ikut terhapus supaya tidak ada kehilangan permanen tak
 * sengaja). UI memberi tahu file masih ada di Drive.
 */
export async function deleteManualNota(id: string): Promise<ActionResult> {
	try {
		await requireOwnerLevel();
		if (!id) return { ok: false, error: "ID tidak valid" };

		const supabase = await createClient();
		const { error } = await supabase.from("manual_notas").delete().eq("id", id);
		if (error) return { ok: false, error: error.message };

		revalidatePath("/finance/arsip-nota");
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Gagal menghapus nota",
		};
	}
}
