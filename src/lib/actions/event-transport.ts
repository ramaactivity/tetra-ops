"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Rencana transport event — diisi owner saat assign crew. Mobil sewa =
 * dibayar owner, jadi rekap crew ikut terisi dari sini (lihat submitRekap).
 */

const Schema = z.object({
	event_id: z.string().uuid(),
	project_id: z.string().trim().min(1).max(64),
	mode: z.enum(["rental", "online"]).nullable(),
	vehicle: z.string().trim().max(80).nullish(),
	rental_cost: z.coerce.number().int().min(0).max(100_000_000).nullish(),
	nota_url: z.string().trim().url().max(2000).nullish(),
});

export async function saveEventTransport(
	input: z.input<typeof Schema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (
		!me ||
		(me.profile.role !== "owner" && me.profile.role !== "super_admin")
	) {
		return { ok: false, error: "Hanya owner yang bisa mengatur transport" };
	}
	const parsed = Schema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join("; "),
		};
	}
	const d = parsed.data;
	const rental = d.mode === "rental";
	const vehicle = rental ? d.vehicle?.trim() || null : null;
	if (rental && !vehicle) return { ok: false, error: "Pilih mobilnya dulu" };

	const supabase = await createClient();

	// Mobil baru yang diketik langsung masuk daftar pilihan.
	if (vehicle) {
		const { data: known } = await supabase
			.from("transport_vehicles")
			.select("id")
			.ilike("name", vehicle)
			.maybeSingle();
		if (!known) {
			const { error } = await supabase
				.from("transport_vehicles")
				.insert({ name: vehicle });
			if (error) return { ok: false, error: error.message };
		}
	}

	const { data: updated, error } = await supabase
		.from("events")
		.update({
			transport_mode: d.mode,
			transport_vehicle: vehicle,
			transport_rental_cost: rental ? (d.rental_cost ?? null) : null,
			transport_nota_url: rental ? (d.nota_url ?? null) : null,
		})
		.eq("id", d.event_id)
		.select("id");
	if (error) return { ok: false, error: error.message };
	if (!updated?.length) return { ok: false, error: "Event tidak ditemukan" };

	// Rekap sudah masuk (mis. harga sewa baru diisi setelah mobil kembali) →
	// samakan biaya sewanya. Rekap yang sudah terkunci (settle) tidak ikut —
	// update-nya ditolak RLS tanpa error, dan itu memang yang diinginkan.
	if (rental) {
		const { data: rekap } = await supabase
			.from("crew_rekap")
			.select("id, expense_paid_by, expense_nota_urls")
			.eq("event_id", d.event_id)
			.maybeSingle();
		if (rekap) {
			await supabase
				.from("crew_rekap")
				.update({
					transport_method: "rental",
					transport_cost: d.rental_cost ?? 0,
					transport_proof_berangkat_url: null,
					transport_proof_pulang_url: null,
					expense_paid_by: {
						...((rekap.expense_paid_by as Record<string, string>) ?? {}),
						transport: "owner",
					},
					...(d.nota_url
						? {
								expense_nota_urls: {
									...((rekap.expense_nota_urls as Record<string, string>) ??
										{}),
									transport: d.nota_url,
								},
							}
						: {}),
				})
				.eq("id", rekap.id);
		}
	}

	revalidatePath(`/operations/${d.project_id}`);
	revalidatePath(`/operations/${d.project_id}/rekap`);
	revalidatePath(`/crew/jadwal/${d.project_id}`);
	return { ok: true };
}
