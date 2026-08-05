"use server";

import { dispatchPushToMany, isVapidConfigured } from "@/lib/push/web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scan events H-7 dan H-3 yang masih punya field TBC (start_time / setup_time /
 * end_time / frame_size / backdrop_id). Untuk tiap event yang ketemu, kirim
 * push notification ke semua owner aktif yang sudah subscribe Web Push.
 *
 * Dipanggil dari cron anomaly-scan harian (06:30 WIB) supaya tidak menambah
 * cron entry baru. Idempotent dalam window 1 hari karena cron jalan sekali per
 * hari — tidak ada de-dup khusus karena reminder H-7/H-3 memang harus muncul
 * setiap kali kondisi masih TBC.
 */

type TbcEventRow = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	start_time: string | null;
	setup_time: string | null;
	end_time: string | null;
	frame_size: string | null;
	backdrop_id: string | null;
	venue_name: string | null;
	pic_name: string | null;
	pic_wa: string | null;
	event_date_is_estimate: boolean | null;
};

type TbcResult = {
	scanned: number;
	withTbc: number;
	pushSent: number;
	errors: string[];
};

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
	const c = new Date(d);
	c.setDate(c.getDate() + n);
	return c;
}

function listMissingFields(ev: TbcEventRow): string[] {
	const missing: string[] = [];
	// Tanggal duluan — kalau tanggalnya sendiri masih perkiraan, itu yang paling
	// mendesak dipastikan (H-7/H-3 dihitung dari tanggal itu).
	if (ev.event_date_is_estimate) missing.push("tanggal (masih perkiraan)");
	if (!ev.venue_name) missing.push("lokasi");
	if (!ev.start_time) missing.push("jam mulai");
	if (!ev.frame_size) missing.push("frame size");
	if (!ev.backdrop_id) missing.push("backdrop");
	if (!ev.pic_name && !ev.pic_wa) missing.push("PIC lapangan");
	return missing;
}

export async function runTbcReminderInternal(): Promise<TbcResult> {
	const result: TbcResult = {
		scanned: 0,
		withTbc: 0,
		pushSent: 0,
		errors: [],
	};

	if (!isVapidConfigured()) {
		result.errors.push("VAPID not configured — push notif skipped");
		return result;
	}

	const supabase = createAdminClient();
	const now = new Date();
	const targetDates = [isoDate(addDays(now, 7)), isoDate(addDays(now, 3))];

	const { data: events, error: evErr } = await supabase
		.from("events")
		.select(
			`id, project_id, client_name, event_date, start_time, setup_time,
			 end_time, frame_size, backdrop_id, venue_name, pic_name, pic_wa,
			 event_date_is_estimate`,
		)
		.in("event_date", targetDates)
		.in("status", ["upcoming", "in_progress"]);

	if (evErr) {
		result.errors.push(`Fetch events failed: ${evErr.message}`);
		return result;
	}

	result.scanned = events?.length ?? 0;
	// Satu sumber kebenaran: kalau listMissingFields menyebut sesuatu, event itu
	// perlu diingatkan. Sebelumnya filter di sini punya daftar sendiri yang bisa
	// melenceng dari daftar yang ditampilkan.
	const tbcEvents = (events ?? []).filter(
		(ev: TbcEventRow) =>
			listMissingFields(ev).length > 0 || !ev.setup_time || !ev.end_time,
	) as TbcEventRow[];
	result.withTbc = tbcEvents.length;

	if (tbcEvents.length === 0) return result;

	// Ambil semua owner aktif + subscription push mereka
	const { data: subs, error: subErr } = await supabase
		.from("push_subscriptions")
		.select(
			`id, endpoint, p256dh_key, auth_key,
			 user:users!inner(role, is_active)`,
		)
		.eq("user.role", "owner")
		.eq("user.is_active", true);

	if (subErr) {
		result.errors.push(`Fetch subs failed: ${subErr.message}`);
		return result;
	}

	const ownerSubs = (subs ?? []).map((s) => ({
		id: s.id as string,
		endpoint: s.endpoint as string,
		p256dh_key: s.p256dh_key as string,
		auth_key: s.auth_key as string,
	}));

	if (ownerSubs.length === 0) {
		result.errors.push("No owner push subscriptions found");
		return result;
	}

	for (const ev of tbcEvents) {
		const daysAway = ev.event_date === targetDates[0] ? 7 : 3;
		const missing = listMissingFields(ev);
		if (missing.length === 0) continue;
		try {
			const outcomes = await dispatchPushToMany(ownerSubs, {
				title: `H-${daysAway}: ${ev.client_name} masih TBC`,
				body: `Belum ditentukan: ${missing.join(", ")}. Klik untuk konfirmasi.`,
				url: `/operations/${ev.project_id}/edit`,
				tag: `tbc-${ev.id}-h${daysAway}`,
				severity: "warning",
			});
			result.pushSent += outcomes.filter((o) => o.ok).length;
		} catch (err) {
			result.errors.push(
				`Push event ${ev.id}: ${err instanceof Error ? err.message : "unknown"}`,
			);
		}
	}

	return result;
}
