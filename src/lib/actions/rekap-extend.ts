"use server";

import { revalidatePath } from "next/cache";
import { revisiEvent } from "@/lib/ai/tools/revisi-event";
import { getCurrentUser } from "@/lib/auth/get-user";
import { todayWIB } from "@/lib/dates";
import { COMBO, EXTEND_2_CREW, EXTEND_3_CREW } from "@/lib/portal/core";
import { createClient } from "@/lib/supabase/server";

/**
 * Extend hari H (owner 24 Nov 2026): crew melapor tambahan jam di rekap →
 * owner menagihkannya dengan satu tap. Lewat inti yang sama dengan
 * revisi_event (Hermes) & Edit booking, jadi invoice/nota aktif ikut
 * diperbarui (nomor sama) dan ditawarkan ke owner untuk dikirim — tidak
 * pernah terkirim ke klien otomatis.
 */
export async function tagihkanExtend(
	projectId: string,
): Promise<{ ok: true; pesan: string } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		return { ok: false, error: "Hanya owner yang bisa menagihkan." };
	const supabase = await createClient();

	const { data: ev, error } = await supabase
		.from("events")
		.select("id, service_type, event_addons(quantity, addon:addons(name))")
		.eq("project_id", projectId)
		.is("deleted_at", null)
		.maybeSingle();
	if (error || !ev)
		return { ok: false, error: error?.message ?? "Event tidak ditemukan." };
	const { data: rekap } = await supabase
		.from("crew_rekap")
		.select("extend_jam")
		.eq("event_id", ev.id)
		.maybeSingle();
	const lapor = Number(rekap?.extend_jam ?? 0);
	if (lapor <= 0)
		return { ok: false, error: "Crew tidak melaporkan tambahan jam." };

	const nama = COMBO.includes(ev.service_type as string)
		? EXTEND_3_CREW
		: EXTEND_2_CREW;
	const qty = (n: string) =>
		(
			(ev.event_addons ?? []) as Array<{
				quantity: number;
				addon: { name: string } | { name: string }[] | null;
			}>
		)
			.filter((r) => {
				const a = Array.isArray(r.addon) ? r.addon[0] : r.addon;
				return a?.name === n;
			})
			.reduce((t, r) => t + Number(r.quantity || 0), 0);
	const ditagih = qty(EXTEND_2_CREW) + qty(EXTEND_3_CREW);
	if (ditagih >= lapor)
		return { ok: false, error: `Sudah ditagihkan ${ditagih} jam.` };

	const res = (await revisiEvent.run?.(
		{
			project_id: projectId,
			addons: [{ addon: nama, jumlah: qty(nama) + (lapor - ditagih) }],
		},
		{
			supabase,
			role: me.profile.role,
			todayISO: todayWIB(),
			surface: "web",
			actorId: me.profile.id,
		},
	)) as Record<string, unknown> | undefined;
	if (!res || "error" in res)
		return {
			ok: false,
			error: String(res?.error ?? "Gagal memperbarui tagihan."),
		};
	revalidatePath(`/operations/${projectId}`, "layout");
	return {
		ok: true,
		pesan: `Tagihan jadi ${res.total_baru}, sisa ${res.sisa_tagihan_baru}. ${String(res.langkah_berikut ?? "")}`,
	};
}
