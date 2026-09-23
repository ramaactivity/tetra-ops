/**
 * Validate WhatsApp-bot API requests (e.g. GET /api/availability).
 *
 * The bot sends `Authorization: Bearer ${process.env.AVAILABILITY_API_TOKEN}`.
 * Generate the token with `openssl rand -base64 32`, set it in Vercel
 * Project → Settings → Env (production + preview), and hand it to the bot team
 * via a secure channel — never commit it.
 *
 * Security note: unlike `isAuthorizedCron`, these endpoints expose customer
 * booking data, so an UNSET token must NOT fall open in production. We only
 * allow the unset-token bypass in local dev so `next dev` keeps working.
 */
export function isAuthorizedBot(request: Request): boolean {
	return isAuthorizedBearer(request, "AVAILABILITY_API_TOKEN");
}

/** Cek `Authorization: Bearer <token>` terhadap env var bernama `envName`. */
export function isAuthorizedBearer(request: Request, envName: string): boolean {
	const expected = process.env[envName];
	if (!expected) {
		// No token configured → allow only outside production (local dev).
		return process.env.NODE_ENV !== "production";
	}
	const auth = request.headers.get("authorization") ?? "";
	return auth === `Bearer ${expected}`;
}
