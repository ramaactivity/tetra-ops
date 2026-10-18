"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { OWNER_PAYER_PREFIX } from "@/lib/finance/emoney";
import { syncOwnerPaidQueue } from "@/lib/rekap/owner-paid-sync";
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
	/** Owner yang membayar sewa (users.id) → otomatis hutang ke owner itu. */
	paid_by_owner_id: z.string().uuid().nullish(),
	/**
	 * Diganti langsung saat settle dari rekening Tetra ini (kode 1-1xx) —
	 * tanpa hutang. Kosong = jadi hutang dulu ke owner.
	 */
	reimburse_account: z.string().trim().max(20).nullish(),
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

	// Pembayar sewa harus owner aktif.
	let paidBy: string | null = null;
	if (rental && d.paid_by_owner_id) {
		const { data: o } = await supabase
			.from("users")
			.select("role")
			.eq("id", d.paid_by_owner_id)
			.maybeSingle();
		if (o?.role !== "owner" && o?.role !== "super_admin")
			return { ok: false, error: "Pembayar sewa harus owner" };
		paidBy = `${OWNER_PAYER_PREFIX}${d.paid_by_owner_id}`;
	}
	let reimburse: string | null = null;
	if (paidBy && d.reimburse_account) {
		const { data: acct } = await supabase
			.from("chart_of_accounts")
			.select("account_type, is_active")
			.eq("code", d.reimburse_account)
			.maybeSingle();
		if (
			!acct?.is_active ||
			acct.account_type !== "asset" ||
			!/^1-1\d{2}$/.test(d.reimburse_account)
		)
			return { ok: false, error: "Pilih rekening Tetra yang aktif" };
		reimburse = d.reimburse_account;
	}

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
			transport_paid_by: paidBy,
			transport_reimburse_account: reimburse,
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
						// Owner tertentu → hutang ke dia (antrean settle); belum
						// dipilih → "dibayar owner" lama (dicatat manual).
						transport: paidBy ?? "owner",
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

	if (rental) {
		const sync = await syncOwnerPaidQueue(d.event_id, me.profile.id);
		if (!sync.ok) return { ok: false, error: sync.error };
	}

	revalidatePath(`/operations/${d.project_id}`);
	revalidatePath(`/operations/${d.project_id}/rekap`);
	revalidatePath(`/crew/jadwal/${d.project_id}`);
	return { ok: true };
}
