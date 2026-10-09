import "server-only";

/**
 * Link undangan pribadi portal (DR-045): /akun/masuk/<token>. Halaman sambutan
 * menyebut nama & isi undangan, tombol "Buka" membuat sesi tanpa kode WA.
 * Berlaku 14 hari, boleh dipakai ulang selama berlaku (HP lain).
 */
import { portalBase } from "@/lib/app-url";
import { newToken, sha256 } from "@/lib/portal/core";
import { createAdminClient } from "@/lib/supabase/admin";

export type InviteKind = "vendor" | "klien" | "anggota";
export type InviteContext = {
	/** Nama acara (klien/anggota) atau nama vendor (vendor). */
	title?: string | null;
	vendor_name?: string | null;
	booking_code?: string | null;
	/** Siapa yang mengundang (mis. "Tetra Photobooth", nama WO). */
	invited_by?: string | null;
	/** Peran penerima, mis. "Owner", "Klien", "WO". */
	role_label?: string | null;
	/** Vendor: jumlah acara di dasbornya saat diundang. */
	events?: number | null;
};

const DAYS = 14;

export async function createInviteLink(
	personId: string,
	kind: InviteKind,
	context: InviteContext,
): Promise<string> {
	const token = newToken();
	await createAdminClient()
		.from("portal_invites")
		.insert({
			token_hash: sha256(token),
			person_id: personId,
			kind,
			context,
			expires_at: new Date(Date.now() + DAYS * 86_400_000).toISOString(),
		});
	return `${portalBase()}/akun/masuk/${token}`;
}

export type InviteView = {
	id: string;
	kind: InviteKind;
	context: InviteContext;
	expired: boolean;
	person: { id: string; name: string | null; phone: string };
};

export async function readInvite(token: string): Promise<InviteView | null> {
	if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
	const { data } = await createAdminClient()
		.from("portal_invites")
		.select(
			"id, kind, context, expires_at, person:portal_people(id, name, phone)",
		)
		.eq("token_hash", sha256(token))
		.maybeSingle();
	if (!data) return null;
	// to-one embed → object.
	const person = data.person as unknown as InviteView["person"] | null;
	if (!person) return null;
	return {
		id: data.id,
		kind: data.kind as InviteKind,
		context: (data.context ?? {}) as InviteContext,
		expired: new Date(data.expires_at) < new Date(),
		person,
	};
}

/** Tujuan setelah masuk: vendor → dasbor rekanan, lainnya → dashboard bookingnya. */
export const inviteTarget = (v: InviteView) =>
	v.kind !== "vendor" && v.context.booking_code
		? `/akun/booking/${v.context.booking_code}`
		: "/akun";
