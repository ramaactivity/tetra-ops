import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayWIB } from "@/lib/dates";
import { cocokNomor } from "@/lib/events/penerima";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	cocokkanKontak,
	type EventKandidatSrc,
	type Kandidat,
	KontakUsulanSchema,
	kunciKontak,
} from "./core";

export type KontakUsulanRow = {
	id: string;
	kunci: string;
	nomor: string | null;
	wa_jid: string | null;
	nama_kontak: string | null;
	nama_wa: string | null;
	alasan: "nama_kontak_cocok" | "mengaku_booking";
	cuplikan: string | null;
	kandidat: Kandidat[];
	status: "terbuka" | "ditambahkan" | "bukan_klien";
	event_id: string | null;
	peran: "klien" | "pic" | null;
	created_at: string;
	updated_at: string;
};

const EVENT_SELECT =
	"id, project_id, client_name, event_title, event_date, client_wa, pic_name, pic_wa, channel, vendor_name, vendor_pic_name, vendor_contact, extra_pics, booker_contact:contacts!events_booker_contact_id_fkey(name, phone), pic_contact:contacts!events_pic_contact_id_fkey(phone)";

/** Acara mendatang + yang baru selesai ≤3 hari (pelunasan sering menyusul). */
async function eventsTerbuka(admin: SupabaseClient) {
	const sejak = new Date(
		new Date(`${todayWIB()}T00:00:00Z`).getTime() - 3 * 86_400_000,
	)
		.toISOString()
		.slice(0, 10);
	const { data, error } = await admin
		.from("events")
		.select(EVENT_SELECT)
		.is("deleted_at", null)
		.eq("is_demo", false)
		.neq("status", "cancelled")
		.gte("event_date", sejak)
		.order("event_date");
	if (error) throw new Error(`events: ${error.message}`);
	return data ?? [];
}

type Balasan = {
	status: number;
	body: Record<string, unknown>;
};

/** POST /api/bot/kontak-usulan — kontrak hermes-ff 25 Nov 2026. */
export async function handleKontakUsulan(json: unknown): Promise<Balasan> {
	const parsed = KontakUsulanSchema.safeParse(json);
	if (!parsed.success)
		return {
			status: 400,
			body: {
				ok: false,
				error: "Body tidak valid",
				issues: parsed.error.issues,
			},
		};
	const b = parsed.data;
	const admin = createAdminClient();
	const kosong = { ok: true, usulan_id: null, kandidat: 0 };
	const tail = phoneTail(b.nomor);

	// Nomor tim (crew/owner/desainer) bukan klien.
	if (tail.length === 9) {
		const { data: tim, error } = await admin
			.from("users")
			.select("phone_wa")
			.is("deleted_at", null)
			.not("phone_wa", "is", null);
		if (error) throw new Error(`users: ${error.message}`);
		if ((tim ?? []).some((u) => phoneTail(u.phone_wa as string) === tail))
			return { status: 200, body: { ...kosong, tim: true } };
	}

	const events = await eventsTerbuka(admin);
	if (tail.length === 9) {
		const sudah = events.find((e) =>
			cocokNomor(e as Parameters<typeof cocokNomor>[0], tail),
		);
		if (sudah)
			return {
				status: 200,
				body: { ...kosong, sudah_terdaftar: sudah.project_id },
			};
	}

	const kunci = kunciKontak(b);
	const { data: lama } = await admin
		.from("kontak_usulan")
		.select("id, status")
		.eq("kunci", kunci)
		.maybeSingle();
	if (lama?.status === "bukan_klien")
		return {
			status: 200,
			body: { ok: true, usulan_id: lama.id, kandidat: 0, ditutup: true },
		};

	const kandidat = cocokkanKontak(
		b,
		events.map(
			(e): EventKandidatSrc => ({
				id: e.id as string,
				project_id: e.project_id as string,
				client_name: e.client_name as string | null,
				event_title: e.event_title as string | null,
				event_date: e.event_date as string,
				vendor_name: e.vendor_name as string | null,
				vendor_pic_name: e.vendor_pic_name as string | null,
				pic_name: e.pic_name as string | null,
				booker:
					(
						(Array.isArray(e.booker_contact)
							? e.booker_contact[0]
							: e.booker_contact) as { name?: string | null } | null
					)?.name ?? null,
			}),
		),
	);
	// Nama kontak tanpa acara yang cocok = kontak lama/teman → tidak dibuat
	// (supaya Ops tidak banjir). Yang mengaku sudah booking selalu dibuat.
	if (b.alasan === "nama_kontak_cocok" && kandidat.length === 0 && !lama)
		return { status: 200, body: kosong };

	const isi = {
		nomor: b.nomor,
		wa_jid: b.wa_jid,
		nama_kontak: b.nama_kontak,
		nama_wa: b.nama_wa,
		alasan: b.alasan,
		cuplikan: b.cuplikan,
		kandidat,
		status: "terbuka",
		updated_at: new Date().toISOString(),
	};
	if (lama) {
		// Kiriman ulang hanya menimpa yang terisi — nama/cuplikan lama tidak
		// hilang karena kiriman berikutnya kebetulan kosong.
		const { error } = await admin
			.from("kontak_usulan")
			.update(
				Object.fromEntries(
					Object.entries(isi).filter(([, v]) => v !== null && v !== undefined),
				),
			)
			.eq("id", lama.id);
		if (error) throw new Error(error.message);
		return {
			status: 200,
			body: { ok: true, usulan_id: lama.id, kandidat: kandidat.length },
		};
	}
	const { data: baru, error } = await admin
		.from("kontak_usulan")
		.insert({ kunci, ...isi })
		.select("id")
		.single();
	// Dua kiriman balapan: yang kalah membaca baris pemenang.
	if (error?.code === "23505") return handleKontakUsulan(json);
	if (error) throw new Error(error.message);
	await kabariOwner(admin, baru.id as string, b, kandidat);
	return {
		status: 200,
		body: { ok: true, usulan_id: baru.id, kandidat: kandidat.length },
	};
}

async function kabariOwner(
	admin: SupabaseClient,
	id: string,
	b: {
		nama_kontak: string | null;
		nama_wa: string | null;
		nomor: string | null;
	},
	kandidat: Kandidat[],
) {
	const { data: owners } = await admin
		.from("users")
		.select("id")
		.eq("is_active", true)
		.is("deleted_at", null)
		.in("role", ["owner", "super_admin"]);
	if (!owners?.length) return;
	const siapa = b.nama_kontak ?? b.nama_wa ?? b.nomor ?? "Kontak WA";
	const { error } = await admin.from("notifications").insert(
		owners.map((u) => ({
			user_id: u.id,
			severity: "info",
			category: "operational",
			title: `Kontak belum terdaftar: ${siapa}`,
			body: kandidat.length
				? `Mungkin klien ${kandidat[0].client_name ?? kandidat[0].project_id}. Cek di Booking Masuk.`
				: "Mengaku sudah booking tapi nomornya tidak ada di event mana pun. Pilih event-nya di Booking Masuk.",
			entity_type: "kontak_usulan",
			entity_id: id,
			action_url: "/operations/booking-masuk",
		})),
	);
	if (error) console.error("[kontak-usulan] notif:", error.message);
}

/** Lonceng usulan ini selesai begitu owner memutuskan. */
export async function selesaikanNotif(admin: SupabaseClient, id: string) {
	const now = new Date().toISOString();
	const { error } = await admin
		.from("notifications")
		.update({
			is_read: true,
			read_at: now,
			is_resolved: true,
			resolved_at: now,
		})
		.eq("entity_type", "kontak_usulan")
		.eq("entity_id", id)
		.eq("is_resolved", false);
	if (error) console.error("[kontak-usulan] resolve notif:", error.message);
}
