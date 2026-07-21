/**
 * Validate Vercel Cron requests.
 *
 * Vercel Cron sends `Authorization: Bearer ${process.env.CRON_SECRET}` on
 * every cron-triggered request. Endpoints that should ONLY be invoked by
 * Vercel (not arbitrary callers) gate themselves with this check.
 *
 * The CRON_SECRET env var must be set in Vercel Project → Settings → Env.
 *
 * Security note: kalau CRON_SECRET tidak terpasang, kita HANYA membuka jalur di
 * luar production (local dev / preview). Sebelumnya fungsi ini `return true`
 * tanpa syarat saat secret kosong — artinya sekali env var terhapus, ter-typo,
 * atau hanya di-scope ke Production sementara Preview publik, endpoint cron
 * berubah jadi endpoint publik tanpa autentikasi. Dampaknya nyata:
 * /api/cron/depreciation MENULIS jurnal penyusutan, /api/cron/status-transition
 * mengubah status event, dan /api/telegram/dispatch?force=1 bisa dipakai
 * membanjiri grup owner dengan angka finansial. Perilaku ini kini sejajar
 * dengan isAuthorizedBot di src/lib/bot-auth.ts.
 */
export function isAuthorizedCron(request: Request): boolean {
	const expected = process.env.CRON_SECRET;
	if (!expected) {
		// Tanpa secret → izinkan hanya di luar production.
		return process.env.NODE_ENV !== "production";
	}
	const auth = request.headers.get("authorization") ?? "";
	return auth === `Bearer ${expected}`;
}
