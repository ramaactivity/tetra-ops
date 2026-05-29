import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

	// Validates the JWT against the Supabase Auth server (not just cookie contents).
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const path = request.nextUrl.pathname;
	const isPublic = PUBLIC_PATHS.some(
		(p) => path === p || path.startsWith(`${p}/`),
	);

	if (!user && !isPublic) {
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
