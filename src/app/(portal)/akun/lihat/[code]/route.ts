import { type NextRequest, NextResponse } from "next/server";
import { PREVIEW_COOKIE, previewValid } from "@/lib/portal/preview";

/** Tukar link lihat-klien bertanda tangan jadi cookie 30 menit, lalu buka dashboard-nya. */
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ code: string }> },
) {
	const code = (await params).code.toUpperCase();
	const exp = req.nextUrl.searchParams.get("exp");
	const sig = req.nextUrl.searchParams.get("sig");
	const url = req.nextUrl.clone();
	url.search = "";
	if (!/^[A-Z2-9]{6}$/.test(code) || !previewValid(code, exp, sig)) {
		url.pathname = "/akun";
		return NextResponse.redirect(url);
	}
	url.pathname = `/akun/booking/${code}`;
	const res = NextResponse.redirect(url);
	res.cookies.set(PREVIEW_COOKIE, `${code}.${exp}.${sig}`, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/akun",
		maxAge: Math.min(1800, Number(exp) - Math.floor(Date.now() / 1000)),
	});
	return res;
}
