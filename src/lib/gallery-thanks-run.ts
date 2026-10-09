import "server-only";

import { fetchBoothEvents } from "@/lib/booth-sync";
import { endAt } from "@/lib/crew-briefing";
import {
	composeKlien,
	composeWo,
	galleryWindow,
	penerima,
} from "@/lib/gallery-thanks";
import { createAdminClient } from "@/lib/supabase/admin";
import { tgEscape } from "@/lib/telegram/format";

type Result = {
	sent: Array<{
		project_id: string;
		phone: string;
		jenis: string;
		command_id: string;
	}>;
	previews: Array<{
		project_id: string;
		phone: string;
		jenis: string;
		text: string;
	}>;
	waiting: string[];
	alerted: string[];
	errors: string[];
};

/**
 * Satu putaran (tiap 30 menit). Kirim hanya kalau galeri Booth sudah ada
 * fotonya; idempoten per (event, nomor) di event_messages. `dryRun` = susun
 * teks saja (galeri contoh kalau Booth belum punya foto).
 */
export async function runGalleryThanks(
	opts: { now?: Date; dryRun?: boolean; only?: string } = {},
): Promise<Result> {
	const out: Result = {
		sent: [],
		previews: [],
		waiting: [],
		alerted: [],
		errors: [],
	};
	const admin = createAdminClient();
	const now = (opts.now ?? new Date()).getTime();
	const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
	const yesterday = new Date(now + 7 * 3600_000 - 86_400_000)
		.toISOString()
		.slice(0, 10);
	let q = admin
		.from("events")
		.select(
			"id, project_id, client_name, event_title, event_category, event_date, start_time, end_time, client_wa, pic_name, pic_wa, vendor_contact_id, vendor_contact, vendor_pic_name",
		)
		.in("event_date", [yesterday, today])
		.neq("status", "cancelled")
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false);
	if (opts.only) q = q.eq("project_id", opts.only);
	const { data, error } = await q;
	if (error) return { ...out, errors: [error.message] };

	for (const e of data ?? []) {
		const pid = e.project_id as string;
		const end = endAt(
			e.event_date as string,
			e.start_time as string | null,
			e.end_time as string | null,
		);
		if (end === null) continue;
		const { sendAt, deadline } = galleryWindow(e.event_date as string, end);
		if (!opts.dryRun && (now < sendAt || now > deadline)) continue;

		const { data: done } = await admin
			.from("event_messages")
			.select("kind, target")
			.eq("event_id", e.id);
		const sentTo = new Set(
			(done ?? [])
				.filter((d) => d.kind === "galeri")
				.map((d) => d.target as string),
		);
		if (!opts.dryRun && (done ?? []).some((d) => d.kind === "galeri_kosong"))
			continue;

		// Penerima: klien, PIC, anggota portal, WO/vendor — dedupe per nomor.
		const [{ data: bk }, { data: vendor }] = await Promise.all([
			admin
				.from("client_bookings")
				.select(
					"members:booking_members(role, person:portal_people!booking_members_person_id_fkey(name, phone))",
				)
				.eq("event_id", e.id)
				.maybeSingle(),
			e.vendor_contact_id
				? admin
						.from("contacts")
						.select("name, phone, vendor_pics")
						.eq("id", e.vendor_contact_id)
						.maybeSingle()
				: Promise.resolve({ data: null }),
		]);
		const members = (
			(bk?.members ?? []) as unknown as Array<{
				role: string;
				person: { name: string | null; phone: string } | null;
			}>
		).filter((m) => m.person);
		const pics = (vendor?.vendor_pics ?? []) as Array<{
			name: string;
			contact: string | null;
		}>;
		const list = penerima([
			// WO dulu supaya nama WO yang dipakai kalau nomornya juga PIC.
			...members
				.filter((m) => m.role === "wo")
				.map((m) => ({
					phone: m.person?.phone ?? null,
					nama: m.person?.name ?? null,
					jenis: "wo" as const,
				})),
			{
				phone: (e.vendor_contact as string | null) ?? null,
				nama: (e.vendor_pic_name as string | null) ?? null,
				jenis: "wo" as const,
			},
			{
				phone: (vendor?.phone as string | null) ?? null,
				nama: (e.vendor_pic_name as string | null) ?? null,
				jenis: "wo" as const,
			},
			...pics.map((p) => ({
				phone: p.contact,
				nama: p.name,
				jenis: "wo" as const,
			})),
			{
				phone: (e.client_wa as string | null) ?? null,
				nama: (e.client_name as string | null) ?? null,
				jenis: "klien" as const,
			},
			...members
				.filter((m) => m.role !== "wo")
				.map((m) => ({
					phone: m.person?.phone ?? null,
					nama: m.person?.name ?? null,
					jenis: "klien" as const,
				})),
			{
				phone: (e.pic_wa as string | null) ?? null,
				nama: (e.pic_name as string | null) ?? null,
				jenis: "klien" as const,
			},
		]).filter((p) => opts.dryRun || !sentTo.has(p.phone));
		if (!list.length) continue;

		const booth = await fetchBoothEvents(pid);
		const g = (booth ?? []).find(
			(b) =>
				b.gallery_url &&
				((b.photo_count ?? 0) > 0 || (b.thumbs?.length ?? 0) > 0),
		);
		if (!g?.gallery_url && !opts.dryRun) {
			// Masih kosong. Run terakhir sebelum batas (cron tiap 30 menit) → kabari owner sekali.
			if (now >= deadline - 35 * 60_000) {
				const { error: ce } = await admin
					.from("event_messages")
					.insert({ event_id: e.id, kind: "galeri_kosong", target: "owner" });
				if (!ce) {
					// Import di sini: rantai notify menarik modul UI (tak perlu di jalur biasa).
					const { sendToOwnerGroup } = await import("@/lib/telegram/notify");
					await sendToOwnerGroup(
						`📷 Galeri <b>${tgEscape((e.client_name as string | null) ?? pid)}</b> belum ada foto, link belum dikirim ke klien. Cek event di Booth.`,
					);
					out.alerted.push(pid);
				}
			} else out.waiting.push(pid);
			continue;
		}
		const galleryUrl =
			g?.gallery_url ?? "https://booth.tetraphoto.com/g/contoh";
		const judul =
			(e.event_title as string | null) ||
			(e.client_name as string | null) ||
			pid;

		for (const p of list) {
			const text =
				p.jenis === "wo"
					? composeWo({ nama: p.nama, judul, galleryUrl })
					: composeKlien({
							panggilan: p.nama,
							category: e.event_category as string | null,
							nama: (e.client_name as string | null) ?? null,
							galleryUrl,
							expiresAt: g?.client_expires_at ?? null,
						});
			if (opts.dryRun) {
				out.previews.push({
					project_id: pid,
					phone: p.phone,
					jenis: p.jenis,
					text,
				});
				continue;
			}
			const { data: claim, error: ce } = await admin
				.from("event_messages")
				.insert({ event_id: e.id, kind: "galeri", target: p.phone })
				.select("id")
				.single();
			if (ce || !claim) continue;
			const { data: cmd, error: ie } = await admin
				.from("bot_commands")
				.insert({
					command: `send-portal:${JSON.stringify({ nomor: p.phone, pesan: text })}`,
					status: "pending",
				})
				.select("id")
				.single();
			if (ie || !cmd) {
				await admin.from("event_messages").delete().eq("id", claim.id);
				out.errors.push(`${pid} ${p.phone}: ${ie?.message ?? "gagal antre"}`);
				continue;
			}
			await admin
				.from("event_messages")
				.update({ command_id: cmd.id })
				.eq("id", claim.id);
			out.sent.push({
				project_id: pid,
				phone: p.phone,
				jenis: p.jenis,
				command_id: cmd.id as string,
			});
		}
	}
	return out;
}
