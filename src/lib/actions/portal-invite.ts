"use server";

/**
 * Dashboard klien untuk event yang dibuat admin (bukan lewat booking portal):
 * buat client_bookings "resmi" yang menempel ke event + anggota "pemesan" dari
 * nomor WA klien, lalu kirim link lewat bot. Idempoten: event yang sudah punya
 * booking portal memakai kode yang sama.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { payerFromCommissionMode } from "@/lib/portal/core";
import {
	EVENT_BOOKING_SELECT,
	type EventForBooking,
	ensureEventBooking,
} from "@/lib/portal/event-booking";
import { portalUrl, sendClientWa } from "@/lib/portal/notify";
import { syncVendorBookings } from "@/lib/portal/vendor";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

type Result =
	| { ok: true; code: string; url: string; sent: boolean }
	| { ok: false; error: string };

const Input = z.object({
	name: z.string().trim().min(2, "Nama klien minimal 2 huruf").max(80),
	phone: z.string().trim().min(8).max(20),
	send: z.boolean(),
	/** Untuk siapa link ini: klien acara atau vendor/WO yang membawa booking. */
	as: z.enum(["klien", "wo"]).default("klien"),
	/** Vendor: peran orang ini (Owner, Planner, PIC lapangan, …). */
	role: z.string().trim().max(40).optional(),
});

export async function inviteClientDashboard(
	eventId: string,
	raw: unknown,
): Promise<Result> {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		return { ok: false, error: "Hanya owner." };
	const parsed = Input.safeParse(raw);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0].message };
	const { name, send, as } = parsed.data;
	if (!isLikelyWaPhone(parsed.data.phone))
		return { ok: false, error: "Nomor WhatsApp klien belum benar." };
	const phone = toWaPhone(parsed.data.phone);

	const admin = createAdminClient();
	const { data: ev } = await admin
		.from("events")
		.select(`${EVENT_BOOKING_SELECT}, vendor_contact_id`)
		.eq("id", eventId)
		.maybeSingle();
	if (!ev || ev.deleted_at)
		return { ok: false, error: "Event tidak ditemukan." };

	// Event vendor: siapa membayar ke Tetra mengikuti mode komisi event.
	const viaVendor = ev.channel === "vendor";
	const payer = viaVendor
		? payerFromCommissionMode(ev.vendor_commission_mode as string | null)
		: null;
	// Peran: vendor → wo; klien di event vendor potongan-langsung → pemilik
	// (tidak melihat harga Tetra); selain itu klien → pemesan.
	const role =
		as === "wo" ? "wo" : viaVendor && payer === "wo" ? "pemilik" : "pemesan";

	// Orang (portal_people) per nomor WA.
	let { data: person } = await admin
		.from("portal_people")
		.select("id")
		.eq("phone", phone)
		.maybeSingle();
	if (!person) {
		const ins = await admin
			.from("portal_people")
			.insert({ phone, name })
			.select("id")
			.single();
		person = ins.data;
	}
	if (!person) return { ok: false, error: "Gagal menyimpan data klien." };

	const b = await ensureEventBooking(
		ev as unknown as EventForBooking,
		person.id,
		{
			asWo: as === "wo",
			...(as === "wo" ? {} : { clientName: name }),
		},
	);
	if (!b) return { ok: false, error: "Gagal membuat akses dashboard." };
	await admin
		.from("booking_members")
		.upsert(
			{ booking_id: b.id, person_id: person.id, role },
			{ onConflict: "booking_id,person_id", ignoreDuplicates: true },
		);

	// Vendor: satu undangan → semua event vendor ini masuk dasbor rekanannya.
	let vendorEvents = 0;
	if (as === "wo" && ev.vendor_contact_id) {
		// Orang ini masuk daftar orang vendor (nama + nomor + peran), tanpa duplikat.
		const { data: vc } = await admin
			.from("contacts")
			.select("vendor_pics")
			.eq("id", ev.vendor_contact_id)
			.maybeSingle();
		const pics = (vc?.vendor_pics ?? []) as Array<{
			name: string;
			contact: string | null;
			role?: string | null;
		}>;
		const tail = (x: string | null) => (x ?? "").replace(/\D/g, "").slice(-9);
		const i = pics.findIndex(
			(p) =>
				tail(p.contact) === tail(phone) ||
				p.name.trim().toLowerCase() === name.toLowerCase(),
		);
		const me2 = {
			name: i >= 0 ? pics[i].name : name,
			contact: i >= 0 && pics[i].contact ? pics[i].contact : phone,
			role: parsed.data.role || (i >= 0 ? (pics[i].role ?? null) : null),
		};
		await admin
			.from("contacts")
			.update({
				vendor_pics:
					i >= 0 ? pics.map((p, j) => (j === i ? me2 : p)) : [...pics, me2],
			})
			.eq("id", ev.vendor_contact_id);
		await admin.from("vendor_members").upsert(
			{
				contact_id: ev.vendor_contact_id,
				person_id: person.id,
				invited_by: me.profile.id,
			},
			{ onConflict: "contact_id,person_id", ignoreDuplicates: true },
		);
		await syncVendorBookings(person.id);
		const { count } = await admin
			.from("events")
			.select("id", { count: "exact", head: true })
			.eq("vendor_contact_id", ev.vendor_contact_id)
			.is("deleted_at", null);
		vendorEvents = count ?? 0;
	}
	const url = vendorEvents > 1 ? portalUrl() : portalUrl(b.public_code);
	if (send) {
		const title = ev.event_title || ev.client_name || "acara kamu";
		await sendClientWa(
			phone,
			as === "wo" && vendorEvents > 1
				? `Halo ${name}! Dasbor rekanan Tetra Photobooth untuk ${ev.vendor_name ?? "tim kamu"} sudah bisa dibuka.\n\nSemua ${vendorEvents} acara klien kamu yang memakai Tetra ada di satu tempat: status, jadwal, desain, galeri, tagihan, dan komisi. Kamu juga bisa mengundang klien ke dashboard acaranya. Masuk pakai nomor WhatsApp ini (tanpa password):\n${url}`
				: as === "wo"
					? `Halo ${name}! Dashboard booking photobooth ${title} untuk klien kamu sudah bisa dibuka di Tetra.\n\nPantau status, pembayaran, desain, dan galeri, lalu undang klien kamu dari menu Orang & akses. Masuk pakai nomor WhatsApp ini (tanpa password):\n${url}`
					: `Halo ${name}! Dashboard ${title} dari Tetra Photobooth sudah bisa dibuka.\n\nDi sana ada detail acara, desain frame, dan galeri foto. Masuk pakai nomor WhatsApp ini (tanpa password):\n${url}`,
		);
	}
	revalidatePath(`/operations/${ev.project_id}`);
	return { ok: true, code: b.public_code, url, sent: send };
}
