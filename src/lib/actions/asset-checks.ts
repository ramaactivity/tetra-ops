"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Cek Alat — ritual bulanan keberadaan & kondisi aset tetap.
 *
 * Sengaja meniru alur Stock Opname v2 yang sudah owner pahami (draft →
 * tandai per item → sisanya anggap ada → selesai), tapi TANPA qty dan TANPA
 * jurnal: hasilnya checklist ada/rusak/hilang yang meng-update kondisi di
 * register aset saat commit (di dalam RPC, atomik).
 */

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

/**
 * Buat draft Cek Alat, seeded dengan semua aset tetap aktif yang belum
 * di-dispose. result NULL = belum dicek. Satu draft aktif — kalau sudah
 * ada, lanjutkan yang itu (mirror guard stock opname).
 */
export async function createAssetCheck(): Promise<
	{ ok: true; id: string; resumed?: boolean } | { ok: false; error: string }
> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();

	const { data: existingDraft } = await supabase
		.from("asset_checks")
		.select("id")
		.eq("status", "draft")
		.order("taken_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (existingDraft) {
		return { ok: true, id: existingDraft.id, resumed: true };
	}

	const { data: check, error } = await supabase
		.from("asset_checks")
		.insert({ checked_by: me.profile.id, status: "draft" })
		.select("id")
		.single();
	if (error || !check) {
		return { ok: false, error: error?.message ?? "Gagal membuat cek alat" };
	}

	// Aset tetap aktif yang belum di-dispose. Join config via item_id supaya
	// aset yang sudah dijual/dibuang tidak ikut dicek.
	const { data: items } = await supabase
		.from("inventory_items")
		.select("id, config:items_fixed_asset_config(disposed_at)")
		.is("deleted_at", null)
		.eq("is_active", true)
		.eq("category", "fixed_asset");

	const rows = (
		(items ?? []) as Array<{
			id: string;
			config:
				| { disposed_at: string | null }
				| Array<{ disposed_at: string | null }>
				| null;
		}>
	).filter((it) => {
		const cfg = Array.isArray(it.config) ? it.config[0] : it.config;
		return !cfg?.disposed_at;
	});

	if (rows.length > 0) {
		await supabase.from("asset_check_lines").insert(
			rows.map((it) => ({
				check_id: check.id,
				item_id: it.id,
				result: null,
			})),
		);
	}

	revalidatePath("/warehouse/asset-check");
	return { ok: true, id: check.id };
}

const UpdateLineSchema = z.object({
	check_id: z.uuid(),
	item_id: z.uuid(),
	// "" = kembali ke belum dicek (owner bisa batalkan tandanya)
	result: z.enum(["ada", "rusak", "hilang", ""]).transform((v) => v || null),
	notes: z
		.string()
		.trim()
		.max(200)
		.nullish()
		.transform((v) => (v ? v : null)),
});

export async function updateAssetCheckLine(
	formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();

	const parsed = UpdateLineSchema.safeParse({
		check_id: formData.get("check_id"),
		item_id: formData.get("item_id"),
		result: formData.get("result"),
		notes: formData.get("notes"),
	});
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues.map((i) => i.message).join(", "),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("asset_check_lines")
		.update({
			result: parsed.data.result,
			notes: parsed.data.notes,
			updated_at: new Date().toISOString(),
		})
		.eq("check_id", parsed.data.check_id)
		.eq("item_id", parsed.data.item_id);
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/warehouse/asset-check/${parsed.data.check_id}`);
	return { ok: true };
}

/** Bulk "anggap ada" untuk semua alat yang belum dicek (1 statement SQL). */
export async function matchAllAssetCheck(
	checkId: string,
): Promise<{ ok: true; matched: number } | { ok: false; error: string }> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("match_all_asset_check_lines", {
		p_check_id: checkId,
	});
	if (error) return { ok: false, error: error.message };

	revalidatePath(`/warehouse/asset-check/${checkId}`);
	return { ok: true, matched: Number(data ?? 0) };
}

export async function commitAssetCheck(
	checkId: string,
): Promise<
	| { ok: true; ada: number; rusak: number; hilang: number }
	| { ok: false; error: string }
> {
	const me = await requireOwnerLevel();

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("commit_asset_check", {
		p_check_id: checkId,
		p_actor: me.profile.id,
	});
	if (error) return { ok: false, error: error.message };

	const result = (data ?? {}) as {
		ada?: number;
		rusak?: number;
		hilang?: number;
	};

	revalidatePath("/warehouse/asset-check");
	revalidatePath(`/warehouse/asset-check/${checkId}`);
	revalidatePath("/warehouse/assets");
	return {
		ok: true,
		ada: Number(result.ada ?? 0),
		rusak: Number(result.rusak ?? 0),
		hilang: Number(result.hilang ?? 0),
	};
}

export async function cancelAssetCheck(
	checkId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { error } = await supabase
		.from("asset_checks")
		.update({ status: "cancelled", updated_at: new Date().toISOString() })
		.eq("id", checkId)
		.eq("status", "draft");
	if (error) return { ok: false, error: error.message };

	revalidatePath("/warehouse/asset-check");
	revalidatePath(`/warehouse/asset-check/${checkId}`);
	return { ok: true };
}

/** Hapus permanen — hanya draft yang dibatalkan. Committed = arsip audit. */
export async function deleteAssetCheck(
	checkId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	await requireOwnerLevel();

	const supabase = await createClient();
	const { data: existing } = await supabase
		.from("asset_checks")
		.select("status")
		.eq("id", checkId)
		.maybeSingle();
	if (!existing) return { ok: false, error: "Cek alat tidak ditemukan" };
	if (existing.status === "committed") {
		return {
			ok: false,
			error: "Cek alat yang sudah selesai adalah arsip — tidak bisa dihapus.",
		};
	}

	const { error } = await supabase
		.from("asset_checks")
		.delete()
		.eq("id", checkId);
	if (error) return { ok: false, error: error.message };

	revalidatePath("/warehouse/asset-check");
	return { ok: true };
}
