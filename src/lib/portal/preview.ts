import "server-only";

/**
 * "Lihat sebagai klien" (owner): link bertanda tangan dari halaman event →
 * /akun/lihat/<kode> menukarnya jadi cookie singkat → dashboard tampil sebagai
 * pemesan. Tidak pernah membuat sesi portal, jadi semua aksi (bayar, undang,
 * batal) tetap ditolak server — murni lihat.
 */
import { cookies } from "next/headers";
import { portalBase } from "@/lib/app-url";
import { signedPdfQuery, verifyPdfSignature } from "@/lib/documents/pdf-link";
import type { PortalPerson } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const PREVIEW_COOKIE = "tp_lihat";
const id = (code: string) => `lihat-klien:${code}`;

/** Link untuk owner; berlaku 2 jam sejak halaman event dibuka. */
export function previewUrl(code: string): string | null {
	const q = signedPdfQuery(id(code), 2 * 3600);
	return q ? `${portalBase()}/akun/lihat/${code}?${q}` : null;
}

export const previewValid = (
	code: string,
	exp: string | null,
	sig: string | null,
) => verifyPdfSignature(id(code), exp, sig);

/** Pemesan booking ini kalau cookie lihat-klien sah untuk kode ini, selain itu null. */
export async function previewPerson(
	code: string,
): Promise<PortalPerson | null> {
	const raw = (await cookies()).get(PREVIEW_COOKIE)?.value;
	const [c, exp, sig] = raw?.split(".") ?? [];
	if (c !== code || !previewValid(code, exp ?? null, sig ?? null)) return null;
	const admin = createAdminClient();
	const { data: b } = await admin
		.from("client_bookings")
		.select("id")
		.eq("public_code", code)
		.maybeSingle();
	if (!b) return null;
	const { data: m } = await admin
		.from("booking_members")
		.select(
			"person:portal_people!booking_members_person_id_fkey(id, phone, name, email)",
		)
		.eq("booking_id", b.id)
		.eq("role", "pemesan")
		.limit(1)
		.maybeSingle();
	// to-one embed → object.
	return (m?.person as unknown as PortalPerson) ?? null;
}
