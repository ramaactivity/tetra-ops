import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Routes that don't require auth — accessible to anyone, including the
// landing page and the crew self-register flow. Any path matching one of
// these (exactly OR starting with `${p}/`) is allowed through.
const PUBLIC_PATHS = ["/", "/login", "/register", "/crew-portal", "/auth"];

// Auth pages — if user is already signed in, bounce to root (which then
// dispatches to /dashboard | /crew | /pending based on role).
const AUTH_ENTRY_PATHS = ["/login", "/register", "/crew-portal"];

export async function updateSession(request: NextRequest) {
	let response = NextResponse.next({ request });

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					for (const { name, value } of cookiesToSet) {
						request.cookies.set(name, value);
					}
					response = NextResponse.next({ request });
					for (const { name, value, options } of cookiesToSet) {
						// Force maxAge ke 1 tahun (31_536_000s) supaya cookie tetap
						// persisten across browser restarts. @supabase/ssr default
						// 400 hari, tapi beberapa browser (iOS Safari ITP) cap di
						// 7 hari kalau sites dianggap "tracker". Set explicit + Lax
						// SameSite untuk maksimum cross-tab persistence.
						response.cookies.set(name, value, {
							...options,
							maxAge: 60 * 60 * 24 * 365,
							sameSite: "lax",
						});
					}
				},
			},
		},
	);

	// Verify the session for the redirect gate. getClaims() verifies the JWT
	// signature LOCALLY against the project's asymmetric (ES256) signing key —
	// cached JWKS, no network round-trip per request — instead of getUser()'s
	// call to the Supabase Auth server. This middleware runs on EVERY matched
	// request, so dropping that round-trip is the single biggest per-request
	// CPU/latency win. getClaims() also calls getSession() internally, which
	// still performs token refresh + cookie writes via setAll above. If the
	// project ever falls back to symmetric (HS*) keys, getClaims() transparently
	// falls back to getUser() — so this is never less safe than before.
	const { data: claimsData } = await supabase.auth.getClaims();
	const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null;

	const path = request.nextUrl.pathname;
	const isPublic = PUBLIC_PATHS.some(
		(p) => path === p || path.startsWith(`${p}/`),
	);
	// API routes authenticate themselves (getCurrentUser → 401, or Bearer-token
	// gates like isAuthorizedCron / isAuthorizedBot). Bouncing them to the HTML
	// /login page is wrong — a session-less caller (Vercel cron, the WA bot)
	// would get a 307 to HTML instead of a JSON 401. Let them through; the
	// handler decides. Session cookies are still refreshed above.
	const isApi = path.startsWith("/api/");

	if (!user && !isPublic && !isApi) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		return NextResponse.redirect(url);
	}

	// Already signed-in users shouldn't see the login / register / crew-portal
	// pages — punt to root which dispatches by role.
	if (user && AUTH_ENTRY_PATHS.includes(path)) {
		const url = request.nextUrl.clone();
		url.pathname = "/";
		return NextResponse.redirect(url);
	}

	return response;
}
