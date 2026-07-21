import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { runAnomalyScannerInternal } from "@/lib/actions/anomaly-scanner";
import { runReconciliationCheckInternal } from "@/lib/actions/reconciliation-check";
import { runTbcReminderInternal } from "@/lib/actions/tbc-reminder";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runTelegramDigestInternal } from "@/lib/telegram/digest";

// Vercel Cron triggers this daily — see vercel.json. Manually trigger via
// curl with the same Authorization header for ad-hoc runs.
//
// Runs both anomaly scanner + TBC reminder (H-7/H-3 events with missing fields)
// in the same job to avoid menambah cron entry baru. Errors di salah satu
// tidak mem-block yang lain.
// Route ini menjalankan EMPAT job berat, termasuk seluruh
// runTelegramDigestInternal. Tanpa maxDuration ia memakai batas default
// platform dan bisa dibunuh di tengah jalan — berbahaya karena digest menandai
// item sebagai "terkirim" sebelum benar-benar terkirim, jadi yang keburu
// diklaim tidak akan pernah dikirim ulang. /api/telegram/dispatch yang hanya
// menjalankan digest saja sudah memakai 60.
export const maxDuration = 60;

/**
 * Housekeeping: buang derau `admin_exec_sql` lama dari audit_log.
 *
 * audit_log adalah tabel terbesar sekaligus yang paling sering ditulis
 * (trigger menulis satu baris tiap mutasi), dan tumbuh tanpa batas. RPC-nya
 * HANYA menghapus entri mesin — jejak audit bisnis (events, payments, users)
 * tidak pernah disentuh. Grant EXECUTE-nya khusus service_role.
 */
async function pruneAuditLog(): Promise<unknown> {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return { skipped: "service key tidak tersedia" };
	try {
		const sb = createServiceClient(url, key, {
			auth: { persistSession: false, autoRefreshToken: false },
		});
		const { data, error } = await sb.rpc("prune_audit_log", {
			p_keep_days: 30,
		});
		if (error) return { error: error.message };
		return data;
	} catch (e) {
		return { error: e instanceof Error ? e.message : "unknown" };
	}
}

export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const ranAt = new Date().toISOString();
	const [anomaly, tbc, recon, telegram] = await Promise.allSettled([
		runAnomalyScannerInternal(),
		runTbcReminderInternal(),
		runReconciliationCheckInternal(),
		runTelegramDigestInternal(),
	]);
	return NextResponse.json({
		// SEMUA job harus sukses. Sebelumnya `anomaly || tbc`: `recon` dan
		// `telegram` tidak ikut dihitung sama sekali, dan karena OR, satu job
		// yang hidup menutupi tiga yang mati — monitoring melihat hijau
		// berminggu-minggu sementara digest harian tidak pernah terkirim.
		ok:
			anomaly.status === "fulfilled" &&
			tbc.status === "fulfilled" &&
			recon.status === "fulfilled" &&
			telegram.status === "fulfilled",
		ranAt,
		// Retensi audit_log — membuang derau admin_exec_sql lama. Sengaja TIDAK
		// ikut menentukan `ok`: ini housekeeping, kegagalannya tidak boleh
		// menandai job harian sebagai gagal.
		auditPrune: await pruneAuditLog(),
		anomaly:
			anomaly.status === "fulfilled"
				? anomaly.value
				: { error: anomaly.reason?.message ?? "anomaly scanner failed" },
		tbc:
			tbc.status === "fulfilled"
				? tbc.value
				: { error: tbc.reason?.message ?? "tbc reminder failed" },
		reconciliation:
			recon.status === "fulfilled"
				? recon.value
				: { error: recon.reason?.message ?? "reconciliation check failed" },
		telegram:
			telegram.status === "fulfilled"
				? telegram.value
				: { error: telegram.reason?.message ?? "telegram digest failed" },
	});
}
