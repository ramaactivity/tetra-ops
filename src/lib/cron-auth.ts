/**
 * Validate Vercel Cron requests.
 *
 * Vercel Cron sends `Authorization: Bearer ${process.env.CRON_SECRET}` on
 * every cron-triggered request. Endpoints that should ONLY be invoked by
 * Vercel (not arbitrary callers) gate themselves with this check.
 *
 * The CRON_SECRET env var must be set in Vercel Project → Settings → Env.
 * If unset (e.g. local dev), we skip the check so dev/preview still works.
 */
export function isAuthorizedCron(request: Request): boolean {
	const expected = process.env.CRON_SECRET;
	if (!expected) return true; // dev / preview without secret configured
	const auth = request.headers.get("authorization") ?? "";
	return auth === `Bearer ${expected}`;
}
