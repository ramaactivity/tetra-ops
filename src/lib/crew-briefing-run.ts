import "server-only";

import { appUrl } from "@/lib/app-url";
import {
	type BriefingData,
	composeCrewBriefing,
	composeHariH,
	composeSelesai,
	dueKinds,
	endAt,
} from "@/lib/crew-briefing";
import { FRAME_AGNOSTIC } from "@/lib/events/frame-package";
import { eventSpots, unitCountOf } from "@/lib/events/spots";
import { timeToMinutes } from "@/lib/schedule/segments";
import { createAdminClient } from "@/lib/supabase/admin";
import { type CrewUser, crewDisplayName } from "@/lib/telegram/digest";

type Admin = ReturnType<typeof createAdminClient>;

const EV_COLS =
	"id, project_id, client_name, event_title, event_date, status, setup_time, start_time, end_time, session_segments, venue_name, venue_address, venue_city, google_maps_url, unit_count, spots, frame_size, design_status, backdrop_source, backdrop_color, backdrop_id, pic_name, pic_wa, vendor_name, vendor_pic_name, vendor_contact, logistic_notes, crew_notes, custom_package_name, service_type, package:packages(name, frame_size)";

type Ev = {
	id: string;
	project_id: string;
	client_name: string | null;
	event_title: string | null;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time: string | null;
	session_segments: unknown;
	venue_name: string | null;
	venue_address: string | null;
	venue_city: string | null;
	google_maps_url: string | null;
	unit_count: number | null;
	spots: unknown;
	frame_size: string | null;
	design_status: string | null;
	backdrop_source: string | null;
	backdrop_color: string | null;
	backdrop_id: string | null;
	pic_name: string | null;
	pic_wa: string | null;
	vendor_name: string | null;
	vendor_pic_name: string | null;
	vendor_contact: string | null;
	logistic_notes: string | null;
	crew_notes: string | null;
	custom_package_name: string | null;
	service_type: string | null;
	package: { name: string; frame_size: string | null } | null;
};

const RUNDOWN_PREFIX = "Rundown klien: ";

/** Data briefing satu event (tanpa info uang). */
async function loadBriefing(
	admin: Admin,
	evs: Ev[],
): Promise<Map<string, BriefingData>> {
	const ids = evs.map((e) => e.id);
	const backdropIds = evs
		.map((e) => e.backdrop_id)
		.filter((x): x is string => !!x);
	const [crew, adds, bonus, bks, reqs, outbox, backs, items] =
		await Promise.all([
			admin
				.from("crew_assignments")
				.select(
					"event_id, role_in_event, spot_no, user:users!crew_assignments_user_id_fkey(full_name, nickname)",
				)
				.in("event_id", ids),
			admin
				.from("event_addons")
				.select("event_id, quantity, addon:addons(name)")
				.in("event_id", ids),
			admin
				.from("event_bonuses")
				.select("event_id, quantity, addon:addons(name)")
				.in("event_id", ids),
			admin
				.from("client_bookings")
				.select(
					"event_id, catatan:detail->>catatan, rundown:detail->rundown, wo:detail->>wo_nama",
				)
				.in("event_id", ids),
			admin
				.from("design_requests")
				.select("event_id, spot_no, stage, approved_version_id")
				.in("event_id", ids),
			admin
				.from("booth_webhook_outbox")
				.select("event_id")
				.eq("event", "design.approved")
				.not("delivered_at", "is", null)
				.in("event_id", ids),
			backdropIds.length
				? admin.from("backdrops").select("id, name").in("id", backdropIds)
				: Promise.resolve({
						data: [] as Array<{ id: string; name: string }>,
						error: null,
					}),
			admin
				.from("inventory_items")
				.select("id, name, unit, min_stock_alert")
				.eq("category", "inventory")
				.is("deleted_at", null),
		]);
	for (const r of [crew, adds, bonus, bks, reqs, outbox, items])
		if (r.error) throw new Error(r.error.message);

	// Stok media menipis (aturan sama dengan pengingat_tim / /warehouse).
	const itemRows = (items.data ?? []) as Array<{
		id: string;
		name: string;
		unit: string | null;
		min_stock_alert: number | null;
	}>;
	const level = new Map<string, number>();
	if (itemRows.length) {
		const { data: lv, error } = await admin.rpc("get_stock_levels", {
			p_item_ids: itemRows.map((i) => i.id),
		});
		if (error) throw new Error(`get_stock_levels: ${error.message}`);
		for (const r of (lv ?? []) as Array<{ item_id: string; stock: number }>)
			level.set(r.item_id, Number(r.stock));
	}
	const menipis = itemRows
		.map((i) => ({
			...i,
			sisa: level.get(i.id) ?? 0,
			min: Number(i.min_stock_alert ?? 0),
		}))
		.filter((i) => i.sisa <= 0 || (i.min > 0 && i.sisa <= i.min));

	const delivered = new Set(
		((outbox.data ?? []) as Array<{ event_id: string }>).map((o) => o.event_id),
	);
	const backName = new Map(
		((backs.data ?? []) as Array<{ id: string; name: string }>).map((b) => [
			b.id,
			b.name,
		]),
	);
	const out = new Map<string, BriefingData>();
	for (const e of evs) {
		const units = unitCountOf(e);
		const sizes = eventSpots(e).map((s) => s.frame_size);
		const agnostic =
			e.package?.frame_size === FRAME_AGNOSTIC ||
			e.service_type === "guest_cam";
		const r1 = (
			(reqs.data ?? []) as Array<{
				event_id: string;
				spot_no: number;
				stage: string;
				approved_version_id: string | null;
			}>
		).find((r) => r.event_id === e.id && r.spot_no === 1);
		const desain: BriefingData["desain"] = agnostic
			? "tanpa_frame"
			: e.design_status !== "approved"
				? "belum_acc"
				: r1?.stage === "acc" && r1.approved_version_id && delivered.has(e.id)
					? "booth"
					: "acc_belum_booth";
		const bk = (
			(bks.data ?? []) as Array<{
				event_id: string;
				catatan: string | null;
				rundown: Array<{ jam: string; acara: string }> | null;
				wo: string | null;
			}>
		).find((b) => b.event_id === e.id);
		const crewNotes = e.crew_notes?.trim() ?? "";
		const rundown = Array.isArray(bk?.rundown)
			? bk.rundown.map((x) => `${x.jam} ${x.acara}`.trim()).filter(Boolean)
			: [];
		const catatan = [
			e.logistic_notes?.trim(),
			crewNotes,
			bk?.catatan?.trim() ? `Catatan klien: ${bk.catatan.trim()}` : null,
			// Rundown klien sudah tersalin ke catatan crew; tulis hanya kalau belum.
			rundown.length && !crewNotes.includes(RUNDOWN_PREFIX)
				? `${RUNDOWN_PREFIX}${rundown.join("; ")}`
				: null,
		].filter((x): x is string => !!x);
		const sizeLabels = [...new Set(sizes.filter(Boolean))] as string[];
		const stok = agnostic
			? []
			: menipis
					.filter((i) =>
						sizeLabels.some((s) =>
							i.name.toLowerCase().includes(s.toLowerCase()),
						),
					)
					.map(
						(i) =>
							`Stok ${i.name} menipis: sisa ${i.sisa}${i.unit ? ` ${i.unit}` : ""} — cek sebelum packing`,
					);
		const addonNames = [
			...((adds.data ?? []) as unknown as Array<{
				event_id: string;
				quantity: number | null;
				addon: { name: string } | null;
			}>),
			...((bonus.data ?? []) as unknown as Array<{
				event_id: string;
				quantity: number | null;
				addon: { name: string } | null;
			}>),
		]
			.filter((a) => a.event_id === e.id && a.addon)
			.map(
				(a) =>
					`${a.addon?.name}${(a.quantity ?? 1) > 1 ? ` ×${a.quantity}` : ""}`,
			);
		const backdrop = e.backdrop_id
			? (backName.get(e.backdrop_id) ?? "Backdrop sewa")
			: e.backdrop_source === "basic_tetra"
				? `Basic Tetra${e.backdrop_color ? ` · ${e.backdrop_color}` : " · warna belum dipilih"}`
				: e.backdrop_source === "client" || e.backdrop_source === "klien"
					? "Dari klien"
					: "Belum dipilih";
		out.set(e.id, {
			judul: e.event_title || e.client_name || e.project_id,
			event_date: e.event_date,
			setup_time: e.setup_time,
			start_time: e.start_time,
			end_time: e.end_time,
			session_segments: e.session_segments,
			venue_name: e.venue_name,
			venue_address: e.venue_address,
			venue_city: e.venue_city,
			maps_url: e.google_maps_url,
			crew: (
				(crew.data ?? []) as unknown as Array<{
					event_id: string;
					role_in_event: string;
					spot_no: number | null;
					user: CrewUser | CrewUser[] | null;
				}>
			)
				.filter((c) => c.event_id === e.id)
				.map((c) => ({
					spot: Math.min(units, c.spot_no ?? 1),
					role: c.role_in_event,
					name: crewDisplayName(Array.isArray(c.user) ? c.user[0] : c.user),
				})),
			units,
			paket: e.package?.name ?? e.custom_package_name ?? null,
			sizes: agnostic ? [] : sizes,
			backdrop,
			addons: addonNames,
			desain,
			pic: e.pic_name || e.pic_wa ? { name: e.pic_name, wa: e.pic_wa } : null,
			wo:
				e.vendor_name || bk?.wo
					? {
							vendor: (e.vendor_name ?? bk?.wo) as string,
							name: e.vendor_pic_name,
							wa: e.vendor_contact,
						}
					: null,
			catatan,
			stok,
		});
	}
	return out;
}

export type BriefingRunResult = {
	sent: Array<{ project_id: string; kinds: string[]; command_id: string }>;
	skipped: number;
	errors: string[];
};

/**
 * Satu putaran (dipanggil tiap jam). `dryRun` = hanya menyusun teks, tidak
 * mengantre & tidak mencatat (untuk contoh/uji).
 */
export async function runCrewBriefing(
	opts: { now?: Date; dryRun?: boolean; only?: string } = {},
): Promise<
	BriefingRunResult & {
		previews: Array<{ project_id: string; kinds: string[]; text: string }>;
	}
> {
	const admin = createAdminClient();
	const wib = new Date((opts.now ?? new Date()).getTime() + 7 * 3600_000);
	const today = wib.toISOString().slice(0, 10);
	const tomorrow = new Date(wib.getTime() + 86_400_000)
		.toISOString()
		.slice(0, 10);
	const nowMin = wib.getUTCHours() * 60 + wib.getUTCMinutes();

	let q = admin
		.from("events")
		.select(EV_COLS)
		.in("event_date", [today, tomorrow])
		.eq("status", "upcoming")
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false);
	if (opts.only) q = q.eq("project_id", opts.only);
	const { data, error } = await q;
	if (error)
		return { sent: [], skipped: 0, errors: [error.message], previews: [] };
	const evs = (data ?? []) as unknown as Ev[];
	if (!evs.length) return { sent: [], skipped: 0, errors: [], previews: [] };

	const { data: done } = await admin
		.from("crew_briefings")
		.select("event_id, kind")
		.in(
			"event_id",
			evs.map((e) => e.id),
		);
	const sentOf = (id: string) =>
		new Set(
			(done ?? [])
				.filter((d) => d.event_id === id)
				.map((d) => d.kind as "h1" | "hari_h"),
		);

	const due = evs
		.map((e) => {
			const start = timeToMinutes(e.start_time);
			return {
				e,
				kinds: dueKinds({
					event_date: e.event_date,
					today,
					tomorrow,
					nowMin: opts.dryRun ? 15 * 60 : nowMin,
					started: e.event_date === today && start !== null && nowMin >= start,
					sent: opts.dryRun ? new Set() : sentOf(e.id),
				}),
			};
		})
		.filter((x) => x.kinds.length);
	const result: BriefingRunResult & {
		previews: Array<{ project_id: string; kinds: string[]; text: string }>;
	} = { sent: [], skipped: evs.length - due.length, errors: [], previews: [] };
	if (!due.length) return result;

	const data_ = await loadBriefing(
		admin,
		due.map((d) => d.e),
	);
	for (const { e, kinds } of due) {
		const d = data_.get(e.id);
		if (!d) continue;
		const text = kinds.includes("h1")
			? composeCrewBriefing(d, e.event_date === tomorrow)
			: composeHariH(d);
		if (opts.dryRun) {
			result.previews.push({ project_id: e.project_id, kinds, text });
			continue;
		}
		// Klaim dulu (UNIQUE event+jenis) supaya run paralel tidak mengirim dobel.
		const { data: claimed, error: ce } = await admin
			.from("crew_briefings")
			.insert(kinds.map((kind) => ({ event_id: e.id, kind })))
			.select("id");
		if (ce || !claimed?.length) {
			result.skipped++;
			continue;
		}
		const { data: cmd, error: ie } = await admin
			.from("bot_commands")
			.insert({
				command: `send-grup-crew:${JSON.stringify({ pesan: text })}`,
				status: "pending",
			})
			.select("id")
			.single();
		if (ie || !cmd) {
			await admin
				.from("crew_briefings")
				.delete()
				.in(
					"id",
					claimed.map((c) => c.id),
				);
			result.errors.push(`${e.project_id}: ${ie?.message ?? "gagal antre"}`);
			continue;
		}
		await admin
			.from("crew_briefings")
			.update({ command_id: cmd.id })
			.in(
				"id",
				claimed.map((c) => c.id),
			);
		result.sent.push({
			project_id: e.project_id,
			kinds,
			command_id: cmd.id as string,
		});
	}
	return result;
}

const REKAP_MASUK = ["submitted", "reviewed", "settled"];

/**
 * Pengingat ke grup crew sesudah acara (selesai + 30 menit, malam pun tetap):
 * thank you + isi rekap & bukti + footage ke Iqbal. Idempoten (crew_briefings
 * jenis 'selesai'). Tanpa info uang.
 */
export async function runPostEventCrew(
	opts: { now?: Date; dryRun?: boolean; only?: string } = {},
): Promise<{
	sent: Array<{ project_id: string; command_id: string }>;
	previews: Array<{ project_id: string; text: string }>;
	errors: string[];
}> {
	const admin = createAdminClient();
	const now = (opts.now ?? new Date()).getTime();
	const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
	const yesterday = new Date(now + 7 * 3600_000 - 86_400_000)
		.toISOString()
		.slice(0, 10);
	let q = admin
		.from("events")
		.select(
			"id, project_id, client_name, event_title, event_date, start_time, end_time, status",
		)
		.in("event_date", [yesterday, today])
		.neq("status", "cancelled")
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false);
	if (opts.only) q = q.eq("project_id", opts.only);
	const { data, error } = await q;
	const out = {
		sent: [] as Array<{ project_id: string; command_id: string }>,
		previews: [] as Array<{ project_id: string; text: string }>,
		errors: [] as string[],
	};
	if (error) return { ...out, errors: [error.message] };
	const evs = (data ?? []).filter((e) => {
		const end = endAt(
			e.event_date as string,
			e.start_time as string | null,
			e.end_time as string | null,
		);
		// Selesai + 30 menit sudah lewat, tapi belum lebih dari 12 jam (jangan kirim pesan basi).
		return (
			end !== null &&
			(opts.dryRun || (now >= end + 30 * 60_000 && now <= end + 12 * 3600_000))
		);
	});
	if (!evs.length) return out;
	const ids = evs.map((e) => e.id as string);
	const [done, crew, rekap] = await Promise.all([
		admin
			.from("crew_briefings")
			.select("event_id")
			.eq("kind", "selesai")
			.in("event_id", ids),
		admin
			.from("crew_assignments")
			.select(
				"event_id, role_in_event, user:users!crew_assignments_user_id_fkey(full_name, nickname)",
			)
			.in("event_id", ids),
		admin.from("crew_rekap").select("event_id, status").in("event_id", ids),
	]);
	if (crew.error) return { ...out, errors: [crew.error.message] };
	const sentIds = new Set((done.data ?? []).map((d) => d.event_id as string));
	for (const e of evs) {
		if (!opts.dryRun && sentIds.has(e.id as string)) continue;
		const names = (
			(crew.data ?? []) as unknown as Array<{
				event_id: string;
				role_in_event: string;
				user: CrewUser | CrewUser[] | null;
			}>
		)
			.filter((c) => c.event_id === e.id)
			.sort((a, b) =>
				a.role_in_event === "lead" ? -1 : b.role_in_event === "lead" ? 1 : 0,
			)
			.map((c) => crewDisplayName(Array.isArray(c.user) ? c.user[0] : c.user));
		if (!names.length) continue; // tanpa crew bertugas tidak ada yang diingatkan
		const st = (rekap.data ?? []).find((r) => r.event_id === e.id)?.status as
			| string
			| undefined;
		const text = composeSelesai({
			judul:
				(e.event_title as string | null) ||
				(e.client_name as string | null) ||
				(e.project_id as string),
			project_id: e.project_id as string,
			crew: names,
			rekapUrl: `${appUrl()}/crew/jadwal/${e.project_id}/rekap`,
			rekapMasuk: REKAP_MASUK.includes(st ?? ""),
		});
		if (opts.dryRun) {
			out.previews.push({ project_id: e.project_id as string, text });
			continue;
		}
		const { data: claim, error: ce } = await admin
			.from("crew_briefings")
			.insert({ event_id: e.id, kind: "selesai" })
			.select("id")
			.single();
		if (ce || !claim) continue;
		const { data: cmd, error: ie } = await admin
			.from("bot_commands")
			.insert({
				command: `send-grup-crew:${JSON.stringify({ pesan: text })}`,
				status: "pending",
			})
			.select("id")
			.single();
		if (ie || !cmd) {
			await admin.from("crew_briefings").delete().eq("id", claim.id);
			out.errors.push(`${e.project_id}: ${ie?.message ?? "gagal antre"}`);
			continue;
		}
		await admin
			.from("crew_briefings")
			.update({ command_id: cmd.id })
			.eq("id", claim.id);
		out.sent.push({
			project_id: e.project_id as string,
			command_id: cmd.id as string,
		});
	}
	return out;
}
