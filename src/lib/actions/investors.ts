"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

async function requireSuperAdmin() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin") {
		throw new Error("Forbidden — super_admin only");
	}
	return me;
}

const InvestorInputSchema = z.object({
	user_id: z.uuid(),
	share_pct: z
		.union([z.coerce.number().min(0).max(100), z.literal("")])
		.transform((v) => (v === "" ? null : v)),
	capital_contributed: z
		.union([z.coerce.number().int().nonnegative(), z.literal("")])
		.transform((v) => (v === "" ? null : v)),
	capital_contributed_at: z
		.union([z.iso.date(), z.literal("")])
		.transform((v) => (v === "" ? null : v)),
});

export async function updateInvestorShare(
	userId: string,
	formData: FormData,
): Promise<{ error?: string }> {
	await requireSuperAdmin();

	const parsed = InvestorInputSchema.safeParse({
		user_id: userId,
		share_pct: formData.get("share_pct") ?? "",
		capital_contributed: formData.get("capital_contributed") ?? "",
		capital_contributed_at: formData.get("capital_contributed_at") ?? "",
	});

	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	const supabase = await createClient();

	// Guard: total share_pct semua owner/super_admin AKTIF tidak boleh > 100%.
	// settle_event membagi owner pool proporsional dari jumlah share ini; >100%
	// = over-alokasi. Substitusi nilai baru utk user ini lalu jumlahkan.
	const { data: activeOwners, error: ownersErr } = await supabase
		.from("users")
		.select("id, share_pct")
		.in("role", ["owner", "super_admin"])
		.eq("is_active", true);

	// Read ini ADALAH guard-nya. Kalau error-nya dibuang, activeOwners jadi
	// null → sumPct tetap 0 → syarat `sumPct > 100` di bawah tidak akan pernah
	// terpenuhi, jadi guard-nya mati diam-diam dan share bisa ditulis melewati
	// 100% (mis. owner 60% berdampingan dengan dua pemegang 50% → settle_event
	// mengalokasikan 160% owner pool ke 2-300 di SETIAP event berikutnya).
	if (ownersErr) {
		return {
			error: `Gagal memverifikasi total share owner: ${ownersErr.message}`,
		};
	}

	let sumPct = 0;
	let userInActiveSet = false;
	for (const u of activeOwners ?? []) {
		if (u.id === parsed.data.user_id) {
			userInActiveSet = true;
			sumPct += parsed.data.share_pct ?? 0;
		} else {
			sumPct += Number(u.share_pct) || 0;
		}
	}
	if (userInActiveSet && (parsed.data.share_pct ?? 0) > 0 && sumPct > 100) {
		const othersSum = sumPct - (parsed.data.share_pct ?? 0);
		return {
			error: `Total share owner aktif jadi ${sumPct}% (maks 100%). Sisa tersedia: ${Math.max(0, 100 - othersSum)}%.`,
		};
	}

	const { error } = await supabase
		.from("users")
		.update({
			share_pct: parsed.data.share_pct,
			capital_contributed: parsed.data.capital_contributed,
			capital_contributed_at: parsed.data.capital_contributed_at,
			updated_at: new Date().toISOString(),
		})
		.eq("id", parsed.data.user_id);

	if (error) return { error: error.message };

	revalidatePath("/settings/crew");
	return {};
}
