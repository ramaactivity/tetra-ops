"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { findCategory } from "@/lib/finance/quick-record-categories";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Aksi halaman Finance › Tagihan rutin. telegram_renewals hanya terbuka SELECT
 * untuk owner (RLS), jadi tulis lewat admin client SETELAH cek peran.
 */

type Result = { ok: true } | { ok: false; error: string };

async function requireOwner() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Tidak terautentikasi");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin")
		throw new Error("Hanya owner yang boleh mengatur tagihan rutin");
}

const BillSchema = z.object({
	id: z.string().uuid().nullish(),
	name: z.string().trim().min(2, "Nama tagihan minimal 2 huruf").max(80),
	amount: z.coerce.number().int().min(0).max(100_000_000).nullish(),
	cycle: z.enum(["monthly", "quarterly", "yearly"]),
	next_due: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Pilih tanggal jatuh tempo"),
	category_id: z.string().trim().max(40).nullish(),
	match_keyword: z.string().trim().max(40).nullish(),
	notes: z.string().trim().max(200).nullish(),
});

export type BillInput = z.input<typeof BillSchema>;

function done() {
	revalidatePath("/finance/tagihan-rutin");
	return { ok: true } as const;
}

export async function saveBill(input: BillInput): Promise<Result> {
	try {
		await requireOwner();
		const p = BillSchema.safeParse(input);
		if (!p.success)
			return {
				ok: false,
				error: p.error.issues[0]?.message ?? "Isian tidak valid",
			};
		const d = p.data;
		if (d.category_id && !findCategory(d.category_id))
			return { ok: false, error: "Kategori tidak dikenal" };
		// Kata kunci kosong → pakai nama tagihan (tetap bisa dicocokkan ke jurnal).
		const keyword = (d.match_keyword || d.name).toLowerCase();
		const row = {
			name: d.name,
			amount: d.amount || null,
			cycle: d.cycle,
			next_due: d.next_due,
			category_id: d.category_id || null,
			match_keyword: keyword,
			notes: d.notes || null,
			updated_at: new Date().toISOString(),
		};
		const admin = createAdminClient();
		const { error } = d.id
			? await admin.from("telegram_renewals").update(row).eq("id", d.id)
			: await admin
					.from("telegram_renewals")
					.insert({ ...row, kind: "bill", is_enabled: true });
		if (error) return { ok: false, error: error.message };
		return done();
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Sembunyikan / aktifkan lagi (data tidak dihapus). */
export async function setBillEnabled(
	id: string,
	enabled: boolean,
): Promise<Result> {
	try {
		await requireOwner();
		const { error } = await createAdminClient()
			.from("telegram_renewals")
			.update({ is_enabled: enabled, updated_at: new Date().toISOString() })
			.eq("id", id);
		if (error) return { ok: false, error: error.message };
		return done();
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Tandai lunas tanpa jurnal (dibayar di luar kas Tetra) — melunasi semua
 * periode sampai jatuh tempo `due`.
 */
export async function markBillPaid(id: string, due: string): Promise<Result> {
	try {
		await requireOwner();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(due))
			return { ok: false, error: "Tanggal tidak valid" };
		const { error } = await createAdminClient()
			.from("telegram_renewals")
			.update({ manual_paid_due: due, updated_at: new Date().toISOString() })
			.eq("id", id);
		if (error) return { ok: false, error: error.message };
		return done();
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
