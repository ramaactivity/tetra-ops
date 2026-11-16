import type { SupabaseClient } from "@supabase/supabase-js";
import { todayWIB } from "@/lib/dates";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/** Ringkasan bagi hasil satu owner (sumber: owner_earnings + owner_pool_arrears). */
export type OwnerShare = {
	id: string;
	full_name: string;
	role: string;
	share_pct: number | null;
	earned: number;
	withdrawn: number;
	/** Yang benar-benar boleh dicairkan sekarang (bulan berjalan belum ikut). */
	available: number;
	/** Jatah dari event bulan berjalan — baru bisa diambil bulan depan. */
	pending: number;
	/** Dipotong untuk patungan beban bersama (kost dll). */
	patungan: number;
	/** Bagi hasil tertunda (event kurang untung) — dilunasi event berikutnya. */
	arrears: number;
};

type EarningRow = {
	owner_user_id: string;
	amount: number;
	earning_type: string;
	period_month: string | null;
};

/**
 * Bagi hasil per owner aktif (role 'owner' — super_admin tidak ikut
 * pembagian). Aturan: jatah dari event bulan M baru boleh ditarik mulai
 * bulan M+1; period_month diisi dari tanggal EVENT (20260806_owner_pool_period),
 * jadi event 31 Jul yang di-settle 2 Agu tetap jatah Juli. Bulan berjalan
 * dihitung WIB.
 */
export async function loadOwnerShares(
	supabase: SupabaseClient,
	/** Owner (bukan super admin) hanya boleh membaca miliknya sendiri (RLS). */
	onlyOwnerId?: string,
): Promise<OwnerShare[]> {
	const currentMonthStart = `${todayWIB().slice(0, 7)}-01`;
	let ownersQ = supabase
		.from("users")
		.select("id, full_name, role, share_pct")
		.eq("role", "owner")
		.eq("is_active", true)
		.order("full_name", { ascending: true });
	if (onlyOwnerId) ownersQ = ownersQ.eq("id", onlyOwnerId);
	const [{ data: owners, error: ownersErr }, earnings, { data: arrears }] =
		await Promise.all([
			ownersQ,
			fetchAllRows<EarningRow>(
				(from, to) =>
					supabase
						.from("owner_earnings")
						.select("owner_user_id, amount, earning_type, period_month")
						.order("id")
						.range(from, to),
				"owner_earnings",
			),
			supabase
				.from("owner_pool_arrears")
				.select("owner_user_id, remaining")
				.is("voided_at", null)
				.gt("remaining", 0),
		]);
	if (ownersErr) throw new Error(`Gagal membaca owner: ${ownersErr.message}`);

	const zero = () => ({
		earned: 0,
		withdrawn: 0,
		available: 0,
		pending: 0,
		patungan: 0,
	});
	const byOwner = new Map<string, ReturnType<typeof zero>>();
	for (const e of earnings) {
		const cur = byOwner.get(e.owner_user_id) ?? zero();
		const amount = Number(e.amount);
		if (e.earning_type === "contribution") {
			// Patungan dipisah dari "sudah diambil" — uangnya tidak sampai ke owner.
			cur.patungan += Math.abs(amount);
			cur.available += amount;
		} else if (e.earning_type === "withdrawal" || amount < 0) {
			// Penarikan selalu mengurangi yang bisa diambil, periode apa pun.
			cur.withdrawn += Math.abs(amount);
			cur.available += amount;
		} else {
			cur.earned += amount;
			if ((e.period_month ?? currentMonthStart) < currentMonthStart)
				cur.available += amount;
			else cur.pending += amount;
		}
		byOwner.set(e.owner_user_id, cur);
	}
	const arrearsByOwner = new Map<string, number>();
	for (const a of arrears ?? [])
		arrearsByOwner.set(
			a.owner_user_id as string,
			(arrearsByOwner.get(a.owner_user_id as string) ?? 0) +
				Number(a.remaining ?? 0),
		);

	return (
		(owners ?? []) as Array<{
			id: string;
			full_name: string;
			role: string;
			share_pct: number | null;
		}>
	).map((o) => ({
		...o,
		...(byOwner.get(o.id) ?? zero()),
		arrears: arrearsByOwner.get(o.id) ?? 0,
	}));
}

export type OwnerShareMove = {
	id: string;
	ownerId: string;
	type: "withdrawal" | "contribution" | "adjustment";
	amount: number;
	description: string | null;
	createdAt: string;
};

/** Riwayat ambil bagi hasil, patungan, dan koreksi (terbaru dulu). */
export async function loadOwnerShareMoves(
	supabase: SupabaseClient,
	onlyOwnerId?: string,
	limit = 50,
): Promise<OwnerShareMove[]> {
	let q = supabase
		.from("owner_earnings")
		.select("id, owner_user_id, earning_type, amount, description, created_at")
		.in("earning_type", ["withdrawal", "contribution", "adjustment"])
		.order("created_at", { ascending: false })
		.limit(limit);
	if (onlyOwnerId) q = q.eq("owner_user_id", onlyOwnerId);
	const { data, error } = await q;
	if (error) throw new Error(`Gagal membaca riwayat: ${error.message}`);
	return (data ?? []).map((r) => ({
		id: r.id as string,
		ownerId: r.owner_user_id as string,
		type: r.earning_type as OwnerShareMove["type"],
		amount: Number(r.amount),
		description: (r.description as string | null) ?? null,
		createdAt: r.created_at as string,
	}));
}
