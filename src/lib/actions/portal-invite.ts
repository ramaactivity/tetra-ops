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
import { payerFromCommissionMode, randomCode } from "@/lib/portal/core";
import { portalUrl, sendClientWa } from "@/lib/portal/notify";
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
		.select(
			"id, project_id, event_title, client_name, event_date, start_time, end_time, service_type, frame_size, unit_count, grand_total, venue_name, venue_address, venue_city, event_category, deleted_at, channel, vendor_name, vendor_commission_mode, package:packages(duration_hours)",
		)
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

	// Booking portal yang menempel ke event (pakai ulang kalau sudah ada).
	let { data: b } = await admin
		.from("client_bookings")
		.select("id, public_code")
		.eq("event_id", eventId)
		.order("created_at")
		.limit(1)
		.maybeSingle();
	if (!b) {
		const pkg = ev.package as unknown as {
			duration_hours: number | null;
		} | null; // to-one embed
		const hours = Math.min(24, Math.max(1, Number(pkg?.duration_hours ?? 2)));
		const now = new Date();
		for (let attempt = 0; attempt < 3 && !b; attempt++) {
			const { data, error } = await admin
				.from("client_bookings")
				.insert({
					public_code: randomCode(6),
					status: "resmi",
					service_type: ev.service_type,
					package_hours: hours,
					frame_size: ev.frame_size,
					unit_count: Math.min(3, Math.max(1, Number(ev.unit_count ?? 1))),
					quoted_total: Number(ev.grand_total ?? 0),
					event_date: ev.event_date,
					start_time: ev.start_time,
					end_time: ev.end_time,
					venue_city: ev.venue_city,
					event_id: ev.id,
					managed_by: as === "wo" ? "wo" : "klien",
					channel: viaVendor ? "vendor" : "direct",
					payer,
					detail: {
						nama_acara: ev.event_title || ev.client_name || "",
						...(as === "wo"
							? { wo_nama: (ev.vendor_name as string | null) || name }
							: { pemilik_nama: name }),
						...(ev.venue_name ? { venue_nama: ev.venue_name } : {}),
						...(ev.venue_address ? { venue_alamat: ev.venue_address } : {}),
						...(ev.venue_city ? { venue_kota: ev.venue_city } : {}),
						...(ev.event_category ? { kategori: ev.event_category } : {}),
					},
					// Undangan admin: persetujuan PDP dicatat saat undangan; klien tetap
					// melihat kebijakan privasi di portal (terms_version menandai sumbernya).
					pdp_consent_at: now.toISOString(),
					terms_version: "undangan-admin",
					expires_at: new Date(now.getTime() + 365 * 86_400_000).toISOString(),
					created_by_person: person.id,
				})
				.select("id, public_code")
				.single();
			if (error?.code === "23505") continue;
			if (error) return { ok: false, error: "Gagal membuat akses dashboard." };
			b = data;
		}
		if (!b) return { ok: false, error: "Gagal membuat akses dashboard." };
	}

	if (payer)
		await admin
			.from("client_bookings")
			.update({ payer })
			.eq("id", b.id)
			.is("payer", null);
	await admin
		.from("booking_members")
		.upsert(
			{ booking_id: b.id, person_id: person.id, role },
			{ onConflict: "booking_id,person_id", ignoreDuplicates: true },
		);

	const url = portalUrl(b.public_code);
	if (send) {
		const title = ev.event_title || ev.client_name || "acara kamu";
		await sendClientWa(
			phone,
			as === "wo"
				? `Halo ${name}! Dashboard booking photobooth ${title} untuk klien kamu sudah bisa dibuka di Tetra.\n\nPantau status, pembayaran, desain, dan galeri, lalu undang klien kamu dari menu Orang & akses. Masuk pakai nomor WhatsApp ini (tanpa password):\n${url}`
				: `Halo ${name}! Dashboard ${title} dari Tetra Photobooth sudah bisa dibuka.\n\nDi sana ada detail acara, desain frame, dan galeri foto. Masuk pakai nomor WhatsApp ini (tanpa password):\n${url}`,
		);
	}
	revalidatePath(`/operations/${ev.project_id}`);
	return { ok: true, code: b.public_code, url, sent: send };
}
