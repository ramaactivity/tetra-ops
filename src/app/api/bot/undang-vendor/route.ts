import { type NextRequest, NextResponse } from "next/server";
import { portalBase } from "@/lib/app-url";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { rateLimit } from "@/lib/portal/auth";
import { createInviteLink } from "@/lib/portal/invite-link";
import { ensureVendorSignup } from "@/lib/portal/vendor-signup";
import {
	JENIS_REKANAN,
	phoneTail,
	type SignupError,
} from "@/lib/portal/vendor-signup-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<SignupError, number> = {
	input_tidak_valid: 400,
	nomor_tidak_valid: 400,
	nomor_tim: 409,
	portal_dimatikan: 409,
	gagal: 500,
};

/**
 * POST /api/bot/undang-vendor — bot WA mengundang calon rekanan dari chat
 * (DR-050). Membuat/menemukan akun rekanan lewat mesin yang sama dengan
 * /rekanan/daftar, lalu mengembalikan link untuk dikirim BOT di percakapan
 * itu (Tetra Ops tidak mengirim WA di jalur ini). Kontrak: docs/06_API_SPEC.md.
 *
 * Nomor tidak diverifikasi di jalur ini, jadi link masuk sekali-ketuk hanya
 * diberikan untuk akun calon yang masih kosong; selain itu `url` = halaman
 * masuk portal (verifikasi kode WA seperti biasa).
 */
export async function POST(req: NextRequest) {
	if (!isAuthorizedBot(req))
		return NextResponse.json(
			{ ok: false, error: "unauthorized" },
			{ status: 401 },
		);
	const body = (await req.json().catch(() => null)) as Record<
		string,
		unknown
	> | null;
	if (!body)
		return NextResponse.json(
			{ ok: false, error: "input_tidak_valid", pesan: "Body bukan JSON." },
			{ status: 400 },
		);
	// Bot boleh mengirim "WO", "Vendor lain", dst.
	const j = String(body.jenis ?? "")
		.trim()
		.toLowerCase();
	const jenis = Object.hasOwn(JENIS_REKANAN, j) ? j : j && "vendor";
	if (
		!(await rateLimit(
			`undang:hp:${phoneTail(String(body.phone ?? ""))}`,
			20,
			3600,
		))
	)
		return NextResponse.json(
			{
				ok: false,
				error: "terlalu_sering",
				pesan: "Terlalu banyak permintaan untuk nomor ini.",
			},
			{ status: 429 },
		);
	try {
		const r = await ensureVendorSignup(
			{ ...body, jenis },
			{
				sumber: "wa_bot",
				waJid:
					typeof body.wa_jid === "string" ? body.wa_jid.slice(0, 100) : null,
			},
		);
		if (!r.ok)
			return NextResponse.json(
				{ ok: false, error: r.code, pesan: r.error },
				{ status: STATUS[r.code] },
			);
		const url = r.akunKosong
			? await createInviteLink(r.personId, "vendor", {
					vendor_name: r.vendorName,
					role_label: "Owner",
					invited_by: "Tetra Photobooth",
					events: r.events || null,
				})
			: `${portalBase()}/akun`;
		return NextResponse.json({
			ok: true,
			url,
			masuk: r.akunKosong ? "link_pribadi" : "login_wa",
			contact_id: r.contactId,
			vendor_name: r.vendorName,
			baru: r.baru,
			status: r.status,
		});
	} catch (e) {
		console.error("[api/bot/undang-vendor]", e);
		return NextResponse.json(
			{ ok: false, error: "gagal", pesan: "Gagal mengundang vendor." },
			{ status: 500 },
		);
	}
}
