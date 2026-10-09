"use server";

/**
 * Pusat Vendor (DR-046): pengaturan fitur rekanan, daftar orang vendor, dan
 * akses dasbor rekanan per vendor. Owner saja.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createInviteLink } from "@/lib/portal/invite-link";
import { sendClientWa } from "@/lib/portal/notify";
import { syncVendorBookings } from "@/lib/portal/vendor";
import { createAdminClient } from "@/lib/supabase/admin";
import { vendorSettings } from "@/lib/vendor-settings";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

type Result = { ok: true; note?: string } | { ok: false; error: string };

async function owner() {
	const me = await getCurrentUser();
	return me &&
		(me.profile.role === "owner" || me.profile.role === "super_admin")
		? me
		: null;
}

const done = (id: string) => revalidatePath(`/vendors/${id}`);

/** Nyalakan/matikan fitur rekanan & label kerja sama. */
export async function updateVendorSettings(
	contactId: string,
	patch: Record<string, unknown>,
): Promise<Result> {
	if (!(await owner())) return { ok: false, error: "Hanya owner." };
	const admin = createAdminClient();
	const { data: c } = await admin
		.from("contacts")
		.select("vendor_settings")
		.eq("id", contactId)
		.eq("type", "vendor")
		.maybeSingle();
	if (!c) return { ok: false, error: "Vendor tidak ditemukan." };
	const next = vendorSettings({ ...(c.vendor_settings ?? {}), ...patch });
	const { error } = await admin
		.from("contacts")
		.update({ vendor_settings: next })
		.eq("id", contactId);
	if (error) return { ok: false, error: error.message };
	done(contactId);
	return { ok: true };
}

const Person = z.object({
	name: z.string().trim().min(2, "Nama minimal 2 huruf").max(80),
	contact: z.string().trim().max(30).nullable(),
	role: z.string().trim().max(40).nullable(),
});

/** Simpan daftar orang vendor (owner, planner, PIC lapangan, …). */
export async function saveVendorPeople(
	contactId: string,
	people: unknown,
): Promise<Result> {
	if (!(await owner())) return { ok: false, error: "Hanya owner." };
	const parsed = z.array(Person).max(30).safeParse(people);
	if (!parsed.success)
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Isian tidak valid.",
		};
	const list = parsed.data.map((p) => ({
		name: p.name,
		contact:
			p.contact && isLikelyWaPhone(p.contact) ? p.contact : p.contact || null,
		role: p.role || null,
	}));
	const lead = list.find((p) => p.role === "Owner") ?? list[0];
	const { error } = await createAdminClient()
		.from("contacts")
		.update({
			vendor_pics: list,
			...(lead
				? { default_pic_name: lead.name, default_pic_contact: lead.contact }
				: {}),
		})
		.eq("id", contactId)
		.eq("type", "vendor");
	if (error) return { ok: false, error: error.message };
	done(contactId);
	return { ok: true };
}

/** Undang satu orang vendor ke dasbor rekanan (link pribadi lewat WA). */
export async function inviteVendorPerson(
	contactId: string,
	input: { name: string; phone: string; role?: string | null; send: boolean },
): Promise<Result> {
	const me = await owner();
	if (!me) return { ok: false, error: "Hanya owner." };
	if (!isLikelyWaPhone(input.phone))
		return { ok: false, error: "Nomor WhatsApp belum benar." };
	const phone = toWaPhone(input.phone);
	const name = input.name.trim();
	if (name.length < 2) return { ok: false, error: "Nama minimal 2 huruf." };
	const admin = createAdminClient();
	const { data: v } = await admin
		.from("contacts")
		.select("name, vendor_pics, vendor_settings")
		.eq("id", contactId)
		.eq("type", "vendor")
		.maybeSingle();
	if (!v) return { ok: false, error: "Vendor tidak ditemukan." };
	if (!vendorSettings(v.vendor_settings).portal_enabled)
		return {
			ok: false,
			error:
				"Akses dasbor rekanan vendor ini sedang dimatikan. Nyalakan dulu di tab Pengaturan.",
		};

	let { data: person } = await admin
		.from("portal_people")
		.select("id")
		.eq("phone", phone)
		.maybeSingle();
	if (!person)
		person = (
			await admin
				.from("portal_people")
				.insert({ phone, name })
				.select("id")
				.single()
		).data;
	if (!person) return { ok: false, error: "Gagal menyimpan orang." };

	// Masuk daftar orang vendor (tanpa duplikat; peran diperbarui kalau diisi).
	const pics = (v.vendor_pics ?? []) as Array<{
		name: string;
		contact: string | null;
		role?: string | null;
	}>;
	const tail = (x: string | null) => (x ?? "").replace(/\D/g, "").slice(-9);
	const i = pics.findIndex((p) => tail(p.contact) === tail(phone));
	const row = {
		name: i >= 0 ? pics[i].name : name,
		contact: i >= 0 && pics[i].contact ? pics[i].contact : phone,
		role: input.role || (i >= 0 ? (pics[i].role ?? null) : null),
	};
	await admin
		.from("contacts")
		.update({
			vendor_pics:
				i >= 0 ? pics.map((p, j) => (j === i ? row : p)) : [...pics, row],
		})
		.eq("id", contactId);

	await admin.from("vendor_members").upsert(
		{
			contact_id: contactId,
			person_id: person.id,
			invited_by: me.profile.id,
		},
		{ onConflict: "contact_id,person_id", ignoreDuplicates: true },
	);
	await syncVendorBookings(person.id);
	const { count } = await admin
		.from("events")
		.select("id", { count: "exact", head: true })
		.eq("vendor_contact_id", contactId)
		.is("deleted_at", null);
	if (input.send) {
		const url = await createInviteLink(person.id, "vendor", {
			vendor_name: v.name as string,
			role_label: row.role ?? "Vendor / WO",
			invited_by: "Tetra Photobooth",
			events: count ?? null,
		});
		await sendClientWa(
			phone,
			`Halo ${row.name}! Dasbor rekanan Tetra Photobooth untuk ${v.name} sudah bisa dibuka.\n\nSemua ${count ?? 0} acara klien kamu yang memakai Tetra ada di satu tempat: status, jadwal, desain, galeri, tagihan, dan komisi. Buka link ini, satu ketuk langsung masuk (tanpa password):\n${url}`,
		);
	}
	done(contactId);
	return {
		ok: true,
		note: input.send
			? `Undangan dikirim ke ${row.name} lewat WhatsApp.`
			: `${row.name} punya akses (tanpa kirim WA).`,
	};
}

/** Cabut akses dasbor rekanan satu orang dari vendor ini. */
export async function revokeVendorAccess(
	contactId: string,
	personId: string,
): Promise<Result> {
	if (!(await owner())) return { ok: false, error: "Hanya owner." };
	const admin = createAdminClient();
	await admin
		.from("vendor_members")
		.delete()
		.eq("contact_id", contactId)
		.eq("person_id", personId);
	// Lepas peran WO di booking acara vendor ini (booking lain orang ini tetap).
	const { data: evs } = await admin
		.from("events")
		.select("id")
		.eq("vendor_contact_id", contactId);
	const evIds = (evs ?? []).map((e) => e.id as string);
	if (evIds.length) {
		const { data: bks } = await admin
			.from("client_bookings")
			.select("id")
			.in("event_id", evIds);
		const bIds = (bks ?? []).map((b) => b.id as string);
		if (bIds.length)
			await admin
				.from("booking_members")
				.delete()
				.in("booking_id", bIds)
				.eq("person_id", personId)
				.eq("role", "wo");
	}
	done(contactId);
	return { ok: true, note: "Akses dicabut." };
}
