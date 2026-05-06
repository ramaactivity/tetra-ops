import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
	return await updateSession(request);
}

export const config = {
	matcher: [
		/*
		 * Match all paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization)
		 * - favicon.ico, robots.txt, sitemap.xml
		 * - image and font asset extensions
		 */
		"/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
	],
};
