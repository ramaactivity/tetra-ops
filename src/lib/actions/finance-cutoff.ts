"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	CUTOFF_BACKUP_TABLES,
	CUTOFF_MAX_DATE,
	type CutoffBackupPayload,
	type ExecuteCutoffInput,
	type ExecuteCutoffResult,
} from "@/lib/cutoff/types";
import {
	createDriveFolder,
	ensureFolder,
	getParentFolderId,
	isDriveConfigured,
	uploadFileToFolder,
} from "@/lib/drive/client";
import { createClient } from "@/lib/supabase/server";

async function requireOwner() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

/**
 * Service-role client for a COMPLETE backup read — RLS could otherwise filter
 * rows and produce an incomplete safety net right before a permanent delete.
 * Returns null if the service key isn't present (caller falls back to session).
 */
function serviceClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return null;
	return createServiceClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

/**
 * Ukuran halaman baca backup. PostgREST punya batas `db-max-rows` (default
 * Supabase 1000): satu `.select("*")` polos DIAM-DIAM terpotong di batas itu.
 * Lihat catatan sama di src/lib/finance/balance-guard.ts:21-27.
 */
const BACKUP_PAGE_SIZE = 1000;

/**
 * Baca SELURUH baris satu tabel dengan paginasi.
 *
 * Diurutkan by `id` supaya jendela halaman stabil — tanpa ORDER BY, urutan
 * baris antar-request tidak dijamin sehingga paginasi bisa melewati/mengulang
 * baris. Kalau tabel tidak punya `id`, query akan error dan kita LEMPAR:
 * gagal berisik jauh lebih aman daripada backup terpotong diam-diam tepat
 * sebelum penghapusan permanen.
 */
async function fetchAllRowsForBackup(
	sb: Awaited<ReturnType<typeof createClient>>,
	table: string,
): Promise<unknown[]> {
	const rows: unknown[] = [];
	for (let from = 0; ; from += BACKUP_PAGE_SIZE) {
		const { data, error } = await sb
			.from(table)
			.select("*")
			.order("id", { ascending: true })
			.range(from, from + BACKUP_PAGE_SIZE - 1);

		if (error) {
			throw new Error(
				`Backup dibatalkan — gagal membaca tabel "${table}": ${error.message}. ` +
					"Cutoff TIDAK dijalankan supaya data tidak hilang tanpa backup.",
			);
		}
		if (!data || data.length === 0) break;
		rows.push(...data);
		if (data.length < BACKUP_PAGE_SIZE) break;
	}
	return rows;
}

/**
 * Snapshot every table the cutoff will wipe. Read-only — used to build the
 * downloadable / Drive backup before the destructive reset.
 *
 * KONTRAK: fungsi ini MELEMPAR kalau ada satu saja tabel yang gagal dibaca.
 * Sebelumnya kegagalan baca diubah jadi `[]` ("0 baris, aman") sementara
 * wizard tetap menampilkan sukses dan membuka kunci wipe 12 tabel ledger —
 * artinya jaring pengaman berlubang persis di titik paling berbahaya.
 * Kedua pemanggil (wizard handleDownload/handleExcel/handleDrive) sudah
 * menangkap error dan hanya menandai `downloaded` saat sukses.
 */
export async function getCutoffBackup(): Promise<CutoffBackupPayload> {
	await requireOwner();
	const svc = serviceClient();
	const sb = (svc ?? (await createClient())) as Awaited<
		ReturnType<typeof createClient>
	>;

	const tables: CutoffBackupPayload["tables"] = {};
	let totalRows = 0;
	for (const t of CUTOFF_BACKUP_TABLES) {
		const rows = await fetchAllRowsForBackup(sb, t);
		tables[t] = { count: rows.length, rows };
		totalRows += rows.length;
	}

	return { generatedAt: new Date().toISOString(), totalRows, tables };
}

/**
 * Upload the backup JSON to Google Drive under
 *   <Parent>/Backup Cutoff Keuangan/Cutoff <timestamp>/backup-keuangan-*.json
 */
export async function backupCutoffToDrive(): Promise<{
	ok: boolean;
	url?: string;
	totalRows?: number;
	error?: string;
}> {
	await requireOwner();
	if (!isDriveConfigured()) {
		return { ok: false, error: "Google Drive belum dikonfigurasi di server." };
	}
	const parent = getParentFolderId();
	if (!parent) {
		return { ok: false, error: "Folder Drive induk tidak ditemukan." };
	}

	try {
		const payload = await getCutoffBackup();
		const root = await ensureFolder("Backup Cutoff Keuangan", parent);
		const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		const folder = await createDriveFolder(`Cutoff ${stamp}`, root.id);
		const json = Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
		const file = await uploadFileToFolder(
			folder.id,
			`backup-keuangan-${stamp}.json`,
			"application/json",
			json,
		);
		return { ok: true, url: file.webViewLink, totalRows: payload.totalRows };
	} catch (e) {
		return { ok: false, error: (e as Error).message };
	}
}

const ExecuteSchema = z.object({
	cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
	cash: z.coerce.number().int().nonnegative().default(0),
	banks: z
		.array(
			z.object({
				coa_code: z.string().min(1),
				amount: z.coerce.number().int().nonnegative(),
			}),
		)
		.default([]),
	items: z
		.array(
			z.object({
				item_id: z.string().uuid(),
				qty_base: z.coerce.number().nonnegative(),
				wac: z.coerce.number().int().nonnegative(),
			}),
		)
		.default([]),
});

/**
 * Execute the finance cutoff: permanently wipe pre-cutoff finance ledgers,
 * record opening balances (Kas/Bank + Stok) as one balanced opening journal
 * entry, anchor an opening opname, and freeze pre-cutoff events. All atomic
 * inside the `execute_finance_cutoff` Postgres RPC.
 */
export async function executeFinanceCutoff(
	input: ExecuteCutoffInput,
): Promise<ExecuteCutoffResult> {
	const me = await requireOwner();
	const parsed = ExecuteSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Input tidak valid",
		};
	}
	const v = parsed.data;
	if (v.cutoffDate > CUTOFF_MAX_DATE) {
		return { ok: false, error: `Tanggal cutoff maksimal ${CUTOFF_MAX_DATE}` };
	}

	const sb = await createClient();
	const { data, error } = await sb.rpc("execute_finance_cutoff", {
		p_actor: me.profile.id,
		p_cutoff_date: v.cutoffDate,
		p_cash: v.cash,
		p_banks: v.banks,
		p_items: v.items,
	});
	if (error) return { ok: false, error: error.message };

	const res = (data ?? {}) as {
		cutoff_date?: string;
		opening_total?: number;
		events_frozen?: number;
		journal_ref?: string | null;
	};

	revalidatePath("/finance");
	revalidatePath("/warehouse");
	revalidatePath("/settings/cutoff");

	return {
		ok: true,
		cutoffDate: res.cutoff_date,
		openingTotal: res.opening_total,
		eventsFrozen: res.events_frozen,
		journalRef: res.journal_ref ?? null,
	};
}
