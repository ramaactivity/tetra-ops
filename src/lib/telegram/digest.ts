import "server-only";

import { computeForecast } from "@/lib/actions/forecast";
import {
	formatScheduleInline,
	hasBreak,
	parseSegments,
} from "@/lib/schedule/segments";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	isTelegramConfigured,
	sendTelegramMessage,
	tgEscape,
} from "@/lib/telegram/client";

/**
 * Digest kesiapan event untuk grup Telegram owner.
 *
 * Filosofi anti-noisy: SATU pesan digest per hari yang hanya menampilkan item
 * yang BELUM beres (item merah 🚨 dikelompokkan paling atas), plus satu pesan
 * briefing per event H-1 (jam, venue, crew — untuk mencegah salah jadwal).
 * Sinyal finansial berat (event rugi, rekonsiliasi, dsb) sengaja TIDAK ikut —
 * tetap di in-app notifications.
 *
 * Dipanggil dari cron anomaly-scan harian (06:30 WIB) dan endpoint
 * /api/telegram/dispatch. Dedup lewat telegram_sent_log supaya retrigger di
 * hari yang sama tidak mengirim ulang.
 */

type EventRow = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time: string | null;
	session_segments: unknown;
	venue_name: string | null;
	venue_city: string | null;
	google_maps_url: string | null;
	frame_size: string | null;
	backdrop_id: string | null;
	design_status: string | null;
	design_approved_at: string | null;
	total_paid: number;
	remaining_balance: number;
};

export type CrewUser = { full_name: string; nickname: string | null };

type CrewRow = {
	event_id: string;
	role_in_event: string;
	user: CrewUser | Array<CrewUser> | null;
};

/** Nama panggilan seperti yang tampil di webapp (nickname ?? full_name). */
export function crewDisplayName(u: CrewUser | null | undefined): string {
	return u?.nickname?.trim() || u?.full_name || "?";
}

export type TelegramDispatchResult = {
	sent: string[];
	skipped: string[];
	errors: string[];
};

// ── Waktu WIB ────────────────────────────────────────────────────────────
// Cron Vercel jalan 23:30 UTC = 06:30 WIB hari BERIKUTNYA. Tanggal server
// (UTC) salah satu hari — semua hitungan hari di sini pakai UTC+7 eksplisit.

export function wibNow(): Date {
	return new Date(Date.now() + 7 * 3600 * 1000);
}

export function isoDateUTC(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function addDaysISO(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return isoDateUTC(d);
}

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HARI_FULL = [
	"Minggu",
	"Senin",
	"Selasa",
	"Rabu",
	"Kamis",
	"Jumat",
	"Sabtu",
];
const BULAN = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];
const BULAN_FULL = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

export function dateLabel(iso: string, full = false): string {
	const d = new Date(`${iso}T00:00:00Z`);
	const hari = (full ? HARI_FULL : HARI)[d.getUTCDay()];
	return `${hari} ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`;
}

export function rp(n: number): string {
	return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function hhmm(t: string | null): string | null {
	return t ? t.slice(0, 5) : null;
}

const ROLE_LABEL: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

// Urutan tampil crew: Lead dulu, lalu asisten, lalu sisanya — sama seperti
// kolom CREW di /operations (LEAD di atas, ASST di bawah).
const ROLE_ORDER: Record<string, number> = { lead: 0, asisten: 1, crew_c: 2 };

export type CrewMember = { role: string; name: string };

function sortCrew(list: CrewMember[]): CrewMember[] {
	return [...list].sort(
		(a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
	);
}

/** "Lead Mou · Asisten Bona" — satu baris, dipakai di daftar per event. */
export function formatCrewInline(list: CrewMember[]): string {
	return sortCrew(list)
		.map((c) => `${ROLE_LABEL[c.role] ?? c.role} ${tgEscape(c.name)}`)
		.join(" · ");
}

/** ["Lead: Mou", "Asisten: Bona"] — dipakai briefing H-1. */
export function crewLabels(list: CrewMember[]): string[] {
	return sortCrew(list).map(
		(c) => `${ROLE_LABEL[c.role] ?? c.role}: ${c.name}`,
	);
}

// ── Data gathering ───────────────────────────────────────────────────────

type GatheredData = {
	todayISO: string;
	events: EventRow[];
	crewByEvent: Map<string, CrewMember[]>;
	doubleBooked: string[]; // "Farhan: Anita + Naya (5 Jul)"
	stockLines: string[]; // sudah diformat, 🚨/⚠️ prefix
	rutinLines: string[]; // opname / cek alat overdue
	renewalLines: string[]; // langganan VPS/hosting mendekati jatuh tempo
};

/**
 * Crew per event — SATU pintu untuk digest, /cek, /minggu dan /crew supaya
 * keempatnya tak mungkin berbeda.
 *
 * FK hint WAJIB: crew_assignments punya 2 FK ke users (user_id & assigned_by).
 * Tanpa hint PostgREST balas PGRST201 dan data-nya null — dulu bikin digest
 * selalu bilang "crew belum di-assign" padahal sudah ada.
 */
export async function fetchCrewByEvent(
	admin: ReturnType<typeof createAdminClient>,
	events: Array<{ id: string }>,
): Promise<Map<string, CrewMember[]>> {
	const byEvent = new Map<string, CrewMember[]>();
	if (events.length === 0) return byEvent;
	const { data, error } = await admin
		.from("crew_assignments")
		.select(
			"event_id, role_in_event, user:users!crew_assignments_user_id_fkey(full_name, nickname)",
		)
		.in(
			"event_id",
			events.map((e) => e.id),
		);
	if (error) throw new Error(`Fetch crew: ${error.message}`);
	for (const c of (data ?? []) as CrewRow[]) {
		const u = Array.isArray(c.user) ? c.user[0] : c.user;
		const arr = byEvent.get(c.event_id) ?? [];
		arr.push({ role: c.role_in_event, name: crewDisplayName(u) });
		byEvent.set(c.event_id, arr);
	}
	return byEvent;
}

async function gatherData(
	admin: ReturnType<typeof createAdminClient>,
): Promise<GatheredData> {
	const todayISO = isoDateUTC(wibNow());
	const endISO = addDaysISO(todayISO, 7);

	const { data: eventsData, error: evErr } = await admin
		.from("events")
		.select(
			`id, project_id, client_name, event_date, setup_time, start_time,
			 end_time, session_segments, venue_name, venue_city, google_maps_url,
			 frame_size, backdrop_id, design_status, design_approved_at, total_paid,
			 remaining_balance`,
		)
		.gte("event_date", todayISO)
		.lte("event_date", endISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.in("status", ["upcoming", "in_progress"])
		.order("event_date", { ascending: true });
	if (evErr) throw new Error(`Fetch events: ${evErr.message}`);
	const events = (eventsData ?? []) as EventRow[];

	const crewByEvent = await fetchCrewByEvent(admin, events);

	// Double-booked: satu orang dua event di hari yang sama.
	const doubleBooked: string[] = [];
	const byPerson = new Map<string, EventRow[]>();
	for (const ev of events) {
		for (const c of crewByEvent.get(ev.id) ?? []) {
			const k = `${c.name}::${ev.event_date}`;
			const list = byPerson.get(k) ?? [];
			list.push(ev);
			byPerson.set(k, list);
		}
	}
	for (const [k, list] of byPerson.entries()) {
		if (list.length < 2) continue;
		const name = k.split("::")[0];
		doubleBooked.push(
			`${name}: ${list.map((e) => e.client_name).join(" + ")} (${dateLabel(list[0].event_date)})`,
		);
	}

	// Stok, urutan prioritas per item: habis (🚨) → kurang utk event mendatang
	// (⚠️ forecast) → di bawah minimum (⚠️ low). Satu baris per item.
	const stockLines: string[] = [];
	const covered = new Set<string>();
	// Cakupan item HARUS sama dengan /warehouse: semua bahan habis pakai yang
	// belum dihapus. Dulu difilter is_active + min_stock_alert > 0, jadi item
	// stok 0 tanpa minimum (mis. Spidol Metalic) muncul "Habis" di webapp tapi
	// bot diam. Filter min_stock_alert hanya relevan untuk pass "di bawah minimum".
	const { data: items, error: itemsErr } = await admin
		.from("inventory_items")
		.select("id, name, min_stock_alert")
		.eq("category", "inventory")
		.is("deleted_at", null);
	if (itemsErr) throw new Error(`Fetch inventory items: ${itemsErr.message}`);
	const itemRows = (items ?? []) as Array<{
		id: string;
		name: string;
		min_stock_alert: number;
	}>;
	const stockMap = new Map<string, number>();
	if (itemRows.length > 0) {
		// JANGAN telan error: data null → semua item terbaca stok 0 → seluruh
		// katalog dilaporkan HABIS (alarm palsu massal). /warehouse menandai
		// kasus ini dengan "—"; di sini kita bilang terus terang stok tak terbaca.
		const { data: levels, error: levelsErr } = await admin.rpc(
			"get_stock_levels",
			{ p_item_ids: itemRows.map((i) => i.id) },
		);
		if (levelsErr) throw new Error(`get_stock_levels: ${levelsErr.message}`);
		for (const r of (levels ?? []) as Array<{
			item_id: string;
			stock: number;
		}>) {
			stockMap.set(r.item_id, Number(r.stock));
		}
		for (const item of itemRows) {
			if ((stockMap.get(item.id) ?? 0) <= 0) {
				stockLines.push(`🚨 ${tgEscape(item.name)} HABIS — restock segera`);
				covered.add(item.id);
			}
		}
	}
	try {
		const forecast = await computeForecast(admin, todayISO);
		if (!forecast.stock_unknown && forecast.upcoming_count > 0) {
			for (const r of forecast.rows) {
				if (covered.has(r.item_id)) continue;
				stockLines.push(
					// "event mendatang", bukan "event": angkanya seluruh event yang
					// akan datang (bisa sampai akhir tahun), bukan yang 7 hari ke
					// depan seperti judul digest — sama dengan hitungan /warehouse.
					`⚠️ ${tgEscape(r.name)}: stok ${Math.round(r.on_hand)}, butuh ±${Math.round(r.projected_demand)} ${tgEscape(r.unit)} utk ${forecast.upcoming_count} event mendatang (kurang ${Math.round(r.shortfall)})`,
				);
				covered.add(r.item_id);
			}
		}
	} catch {
		// forecast opsional — jangan gagalkan digest
	}
	for (const item of itemRows) {
		const cur = stockMap.get(item.id) ?? 0;
		// `<=` supaya sama dengan hitungan "kritis" di /warehouse — item yang
		// stoknya PAS di angka minimum sudah dianggap kritis di webapp.
		if (
			!covered.has(item.id) &&
			cur > 0 &&
			item.min_stock_alert > 0 &&
			cur <= item.min_stock_alert
		) {
			stockLines.push(
				`⚠️ ${tgEscape(item.name)}: sisa ${cur} (min ${item.min_stock_alert})`,
			);
		}
	}

	const rutinLines = await gatherRutinLines(admin);
	const renewalLines = await gatherRenewalLines(admin, todayISO);

	return {
		todayISO,
		events,
		crewByEvent,
		doubleBooked,
		stockLines,
		rutinLines,
		renewalLines,
	};
}

// ── Rutinitas gudang: stock opname & cek alat ────────────────────────────

const OPNAME_OVERDUE_DAYS = 30;

async function gatherRutinLines(
	admin: ReturnType<typeof createAdminClient>,
): Promise<string[]> {
	const lines: string[] = [];
	try {
		const { data } = await admin
			.from("stock_takes")
			.select("committed_at")
			.eq("status", "committed")
			.order("committed_at", { ascending: false })
			.limit(1);
		const lastMs = data?.[0]?.committed_at
			? new Date(data[0].committed_at as string).getTime()
			: null;
		const daysAgo =
			lastMs !== null ? Math.floor((Date.now() - lastMs) / 86400000) : null;
		if (daysAgo === null || daysAgo >= OPNAME_OVERDUE_DAYS) {
			lines.push(
				`🧮 Stock opname terakhir ${daysAgo === null ? "belum pernah" : `${daysAgo} hari lalu`} — jadwalkan hitung fisik stok`,
			);
		}
	} catch {
		// tabel/aksesnya bermasalah → jangan gagalkan digest
	}
	try {
		const { data } = await admin
			.from("asset_checks")
			.select("committed_at")
			.eq("status", "committed")
			.order("committed_at", { ascending: false })
			.limit(1);
		const lastMs = data?.[0]?.committed_at
			? new Date(data[0].committed_at as string).getTime()
			: null;
		const daysAgo =
			lastMs !== null ? Math.floor((Date.now() - lastMs) / 86400000) : null;
		if (daysAgo === null || daysAgo >= OPNAME_OVERDUE_DAYS) {
			lines.push(
				`🔧 Cek alat terakhir ${daysAgo === null ? "belum pernah" : `${daysAgo} hari lalu`} — cek kondisi & kelengkapan alat`,
			);
		}
	} catch {
		// tabel asset_checks belum ada → skip
	}
	return lines;
}

// ── Langganan (VPS, hosting) — telegram_renewals ─────────────────────────
// Diingatkan H-7 / H-3 / H-1 / hari-H. Lewat jatuh tempo → next_due digeser
// otomatis ke periode berikutnya (monthly/yearly).

const RENEWAL_REMIND_DAYS = new Set([7, 3, 1, 0]);

function advanceDue(dueISO: string, cycle: string, todayISO: string): string {
	const d = new Date(`${dueISO}T00:00:00Z`);
	const today = new Date(`${todayISO}T00:00:00Z`);
	while (d < today) {
		if (cycle === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
		else if (cycle === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3);
		else d.setUTCMonth(d.getUTCMonth() + 1);
	}
	return isoDateUTC(d);
}

async function gatherRenewalLines(
	admin: ReturnType<typeof createAdminClient>,
	todayISO: string,
): Promise<string[]> {
	const lines: string[] = [];
	try {
		const { data, error } = await admin
			.from("telegram_renewals")
			.select("id, name, next_due, cycle")
			.eq("is_enabled", true)
			.not("next_due", "is", null);
		if (error) throw new Error(error.message);
		for (const r of (data ?? []) as Array<{
			id: string;
			name: string;
			next_due: string;
			cycle: string;
		}>) {
			let due = r.next_due;
			if (due < todayISO) {
				// sudah lewat → roll ke periode berikutnya, simpan balik
				due = advanceDue(due, r.cycle, todayISO);
				await admin
					.from("telegram_renewals")
					.update({ next_due: due, updated_at: new Date().toISOString() })
					.eq("id", r.id);
			}
			const days = daysUntil(todayISO, due);
			if (RENEWAL_REMIND_DAYS.has(days)) {
				lines.push(
					days === 0
						? `🚨 ${tgEscape(r.name)} jatuh tempo HARI INI — perpanjang sekarang`
						: `🔔 ${tgEscape(r.name)} jatuh tempo ${days} hari lagi (${dateLabel(due)})`,
				);
			}
		}
	} catch {
		// tabel belum ada / error → skip
	}
	return lines;
}

// ── Issue derivation per event ───────────────────────────────────────────

type EventIssues = {
	critical: string[];
	warning: string[];
};

export function daysUntil(todayISO: string, dateISO: string): number {
	return Math.round(
		(new Date(`${dateISO}T00:00:00Z`).getTime() -
			new Date(`${todayISO}T00:00:00Z`).getTime()) /
			86400000,
	);
}

function deriveIssues(
	ev: EventRow,
	days: number,
	crewCount: number,
): EventIssues {
	const critical: string[] = [];
	const warning: string[] = [];
	const push = (isCritical: boolean, msg: string) =>
		(isCritical ? critical : warning).push(msg);

	// Jadwal — tujuan utama: tidak ada salah jam
	const jamMissing: string[] = [];
	if (!ev.setup_time) jamMissing.push("jam setup");
	if (!ev.start_time) jamMissing.push("jam mulai");
	if (!ev.end_time) jamMissing.push("jam selesai");
	if (jamMissing.length > 0) {
		push(days <= 1, `${jamMissing.join(", ")} belum diisi`);
	}

	// Crew — target H-2
	if (crewCount === 0 && days <= 4) {
		push(days <= 2, "crew belum di-assign");
	}

	// Desain — mulai diingatkan dari H-7 (produksi desain butuh lead time),
	// kritis kalau H-2 belum dibuat sama sekali atau H-1 belum ACC
	const designDone =
		ev.design_status === "approved" || ev.design_approved_at !== null;
	if (!designDone && days <= 7) {
		const st = ev.design_status === "proses" ? "masih proses" : "belum dibuat";
		const isCritical =
			days <= 1 || (days <= 2 && ev.design_status !== "proses");
		push(isCritical, `desain belum ACC (${st})`);
	}

	// Spek cetak — ikut window TBC H-3
	if (days <= 3) {
		const spek: string[] = [];
		if (!ev.frame_size) spek.push("frame size");
		if (!ev.backdrop_id) spek.push("backdrop");
		if (spek.length > 0) warning.push(`${spek.join(" & ")} belum dipilih`);
	}

	// Pembayaran — DP window H-7, pelunasan window H-3
	if (ev.total_paid === 0 && days <= 7) {
		warning.push("belum DP sama sekali");
	} else if (ev.remaining_balance > 0 && days <= 3) {
		warning.push(`💰 sisa pelunasan ${rp(ev.remaining_balance)}`);
	}

	return { critical, warning };
}

// ── Composers ────────────────────────────────────────────────────────────

export function composeDigest(data: GatheredData): string | null {
	const {
		todayISO,
		events,
		crewByEvent,
		doubleBooked,
		stockLines,
		rutinLines,
		renewalLines,
	} = data;

	const allCritical: string[] = [
		...doubleBooked.map((d) => `double-booked — ${tgEscape(d)}`),
	];
	const eventBlocks: string[] = [];
	let readyCount = 0;

	for (const ev of events) {
		const days = daysUntil(todayISO, ev.event_date);
		const crewCount = crewByEvent.get(ev.id)?.length ?? 0;
		const { critical, warning } = deriveIssues(ev, days, crewCount);
		const hLabel = days === 0 ? "HARI INI" : `H-${days}`;
		const name = tgEscape(ev.client_name);
		const tempat = ev.venue_city ? ` · ${tgEscape(ev.venue_city)}` : "";

		for (const c of critical) {
			allCritical.push(`${name} (${hLabel}): ${tgEscape(c)}`);
		}

		const issues = [...critical, ...warning];
		if (issues.length === 0) {
			readyCount++;
			if (days <= 2) {
				// Event dekat yang sudah beres tetap ditampilkan (reassurance);
				// yang masih jauh dan beres cukup masuk hitungan ringkas.
				eventBlocks.push(
					`✅ <b>${hLabel} · ${name}</b> — ${dateLabel(ev.event_date)}${tempat} · siap`,
				);
			}
			continue;
		}
		const icon = critical.length > 0 ? "🚨" : "⚠️";
		const lines = issues.map((i) => `      • ${tgEscape(i)}`).join("\n");
		eventBlocks.push(
			`${icon} <b>${hLabel} · ${name}</b> — ${dateLabel(ev.event_date)}${tempat}\n${lines}`,
		);
	}

	const noEventIssues = eventBlocks.length === 0;
	const nothingToSay =
		events.length === 0 &&
		stockLines.length === 0 &&
		allCritical.length === 0 &&
		rutinLines.length === 0 &&
		renewalLines.length === 0;
	if (nothingToSay) return null; // tidak ada event, stok aman, rutinitas beres → diam

	const parts: string[] = [
		`📋 <b>TETRA OPS — ${dateLabel(todayISO, true)}</b>`,
		`Kesiapan event 7 hari ke depan (${events.length} event)`,
	];

	if (allCritical.length > 0) {
		parts.push(
			`\n🚨 <b>PERLU TINDAKAN HARI INI</b>\n${allCritical.map((c) => `      • ${c}`).join("\n")}`,
		);
	}

	if (eventBlocks.length > 0) {
		parts.push(`\n${eventBlocks.join("\n")}`);
	}
	const silentReady =
		readyCount - eventBlocks.filter((b) => b.startsWith("✅")).length;
	if (noEventIssues && events.length > 0) {
		parts.push(
			`\n✅ Semua ${events.length} event siap — tidak ada yang perlu dikejar.`,
		);
	} else if (silentReady > 0) {
		parts.push(`\n✅ ${silentReady} event lain sudah siap.`);
	}

	if (stockLines.length > 0) {
		parts.push(
			`\n📦 <b>Stok</b>\n${stockLines.map((s) => `      • ${s}`).join("\n")}`,
		);
	}

	if (rutinLines.length > 0) {
		parts.push(
			`\n🧰 <b>Rutinitas</b>\n${rutinLines.map((s) => `      • ${s}`).join("\n")}`,
		);
	}

	if (renewalLines.length > 0) {
		parts.push(
			`\n🔔 <b>Langganan</b>\n${renewalLines.map((s) => `      • ${s}`).join("\n")}`,
		);
	}

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) parts.push(`\nDetail: ${appUrl}/operations`);

	return parts.join("\n");
}

function composeBriefing(ev: EventRow, crew: CrewMember[]): string {
	const segments = parseSegments(ev.session_segments);
	const jadwalLine = hasBreak(segments)
		? // Acara dengan jeda — booth berhenti di tengah. Rincikan tiap sesi.
			`🕐 Setup ${hhmm(ev.setup_time) ?? "❓ TBC"} · Sesi ${formatScheduleInline(
				ev.start_time,
				ev.end_time,
				segments,
			)}`
		: `🕐 Setup ${hhmm(ev.setup_time) ?? "❓ TBC"} · Mulai ${hhmm(ev.start_time) ?? "❓ TBC"} · Selesai ${hhmm(ev.end_time) ?? "❓ TBC"}`;
	const lines: string[] = [
		`📸 <b>BRIEFING BESOK — ${tgEscape(ev.client_name)}</b>`,
		`${dateLabel(ev.event_date, true)}`,
		"",
		jadwalLine,
		`📍 ${tgEscape(ev.venue_name) || "❓ venue TBC"}${ev.venue_city ? `, ${tgEscape(ev.venue_city)}` : ""}`,
	];
	if (ev.google_maps_url) lines.push(`🗺 ${ev.google_maps_url}`);
	lines.push(
		`👥 ${crew.length > 0 ? formatCrewInline(crew) : "🚨 CREW BELUM DI-ASSIGN"}`,
	);
	if (ev.frame_size) lines.push(`🖼 Frame ${tgEscape(ev.frame_size)}`);
	lines.push(
		ev.remaining_balance > 0
			? `💰 Sisa tagihan ${rp(ev.remaining_balance)} — tagih sebelum/saat acara`
			: `💰 LUNAS`,
	);
	lines.push(
		"",
		"☑️ <b>Cek ulang HARI INI sebelum hari H:</b>",
		"      1. Lokasi & titik venue BENAR? Buka maps-nya, jangan sampai salah gedung/hall",
		"      2. Jam setup & jam mulai sudah dikonfirmasi ulang ke klien/PIC?",
		"      3. Crew sudah di-assign DAN sudah dibriefing owner (rundown, dresscode, kontak PIC)?",
		"      4. Alat sudah disiapkan & dicek: booth, kamera, printer, lighting, kabel, backdrop?",
		"      5. Stok bahan cukup & sudah dipacking: media set, kertas, tinta, sleeve, dll?",
		"      6. Desain final sudah ACC & ter-load di sistem?",
	);
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) lines.push(`\nDetail: ${appUrl}/operations/${ev.project_id}`);
	return lines.join("\n");
}

const CYCLE_LABEL: Record<string, string> = {
	monthly: "bulanan",
	quarterly: "per 3 bulan",
	yearly: "tahunan",
};

/** /langganan — daftar semua langganan + sisa hari ke jatuh tempo. */
export async function buildRenewalsText(): Promise<string> {
	const admin = createAdminClient();
	const todayISO = isoDateUTC(wibNow());
	const { data } = await admin
		.from("telegram_renewals")
		.select("name, next_due, cycle, is_enabled, notes")
		.order("next_due", { ascending: true, nullsFirst: false });
	const rows = (data ?? []) as Array<{
		name: string;
		next_due: string | null;
		cycle: string;
		is_enabled: boolean;
		notes: string | null;
	}>;
	if (rows.length === 0) return "Belum ada langganan yang terdaftar.";
	const lines: string[] = ["🔔 <b>LANGGANAN & TAGIHAN RUTIN</b>", ""];
	for (const r of rows) {
		if (!r.is_enabled || !r.next_due) {
			lines.push(`⏸ ${tgEscape(r.name)} — belum aktif`);
			continue;
		}
		const days = daysUntil(todayISO, r.next_due);
		const sisa =
			days === 0 ? "🚨 HARI INI" : days < 0 ? "terlewat" : `${days} hari lagi`;
		lines.push(
			`• ${tgEscape(r.name)} — ${dateLabel(r.next_due, true)} (${sisa}) · ${CYCLE_LABEL[r.cycle] ?? r.cycle}`,
		);
	}
	lines.push(
		"",
		"Reminder otomatis: H-7, H-3, H-1, dan hari-H di digest pagi.",
	);
	return lines.join("\n");
}

// ── Reminder H+1: upload aset digital event kemarin ─────────────────────
// Softfile & footage dicek dari event_assets; design_frame tidak (itu urusan
// pra-event). Satu reminder per event (dedup by event_id).

type AssetUploadReminder = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	missing: string[];
};

async function fetchAssetUploadReminders(
	admin: ReturnType<typeof createAdminClient>,
	todayISO: string,
): Promise<AssetUploadReminder[]> {
	const yesterdayISO = addDaysISO(todayISO, -1);
	const { data: eventsData, error: evErr } = await admin
		.from("events")
		.select("id, project_id, client_name, event_date")
		.eq("event_date", yesterdayISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.neq("status", "cancelled");
	if (evErr) throw new Error(`Fetch event kemarin: ${evErr.message}`);
	const evs = (eventsData ?? []) as Array<
		Pick<EventRow, "id" | "project_id" | "client_name" | "event_date">
	>;
	if (evs.length === 0) return [];

	const { data: assets, error: assetErr } = await admin
		.from("event_assets")
		.select("event_id, asset_type")
		.in(
			"event_id",
			evs.map((e) => e.id),
		);
	if (assetErr) throw new Error(`Fetch event_assets: ${assetErr.message}`);
	const byEvent = new Map<string, Set<string>>();
	for (const a of (assets ?? []) as Array<{
		event_id: string;
		asset_type: string;
	}>) {
		const s = byEvent.get(a.event_id) ?? new Set<string>();
		s.add(a.asset_type);
		byEvent.set(a.event_id, s);
	}

	return evs
		.map((e) => {
			const have = byEvent.get(e.id) ?? new Set<string>();
			const missing: string[] = [];
			if (!have.has("softfile")) missing.push("softfile hasil foto");
			if (!have.has("footage_crew")) missing.push("footage dokumentasi crew");
			return { ...e, missing };
		})
		.filter((e) => e.missing.length > 0);
}

function composeAssetUpload(ev: AssetUploadReminder): string {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	return [
		`📤 <b>UPLOAD ASET — ${tgEscape(ev.client_name)}</b>`,
		`Event kemarin (${dateLabel(ev.event_date, true)}) sudah selesai. Jangan lupa upload aset digitalnya hari ini:`,
		...ev.missing.map((m) => `      • ${m}`),
		"",
		"Klien biasanya nagih cepat — makin cepat terupload makin profesional. (Abaikan kalau sudah upload tapi belum tercatat di app.)",
		...(appUrl ? [`Upload: ${appUrl}/design`] : []),
	].join("\n");
}

// ── Reminder bulanan (tanggal 1) ─────────────────────────────────────────
// Tagihan rutin & ritual keuangan owner. Hardcoded by design: daftarnya
// pendek, jarang berubah, dan mengubahnya = edit satu array ini.

const MONTHLY_ITEMS = [
	"🏠 Bayar kosan",
	"🌐 Bayar internet / WiFi",
	"💸 Withdraw / transfer bagi hasil owner bulan lalu",
];

/** Rekap bisnis bulan LALU — dikirim tanggal 1 bersama reminder bulanan. */
async function composeMonthlyBusinessRecap(
	admin: ReturnType<typeof createAdminClient>,
	todayISO: string,
): Promise<string | null> {
	if (!todayISO.endsWith("-01")) return null;
	const d = new Date(`${todayISO}T00:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() - 1);
	const startISO = isoDateUTC(d); // tanggal 1 bulan lalu
	const bulan = `${BULAN_FULL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
	return composeBusinessRecapRange(admin, startISO, todayISO, bulan);
}

/** /bisnis — rekap bisnis BULAN BERJALAN (on-demand, sampai hari ini). */
export async function buildBusinessRecapText(): Promise<string> {
	const admin = createAdminClient();
	const todayISO = isoDateUTC(wibNow());
	const startISO = `${todayISO.slice(0, 7)}-01`;
	const d = new Date(`${todayISO}T00:00:00Z`);
	const label = `${BULAN_FULL[d.getUTCMonth()]} ${d.getUTCFullYear()} (berjalan)`;
	return composeBusinessRecapRange(
		admin,
		startISO,
		addDaysISO(todayISO, 1),
		label,
	);
}

async function composeBusinessRecapRange(
	admin: ReturnType<typeof createAdminClient>,
	startISO: string,
	endExclusiveISO: string,
	bulan: string,
): Promise<string> {
	const todayISO = endExclusiveISO;

	const lines: string[] = [`📊 <b>REKAP BISNIS — ${bulan.toUpperCase()}</b>`];

	const { count: eventCount } = await admin
		.from("events")
		.select("id", { count: "exact", head: true })
		.gte("event_date", startISO)
		.lt("event_date", todayISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.neq("status", "cancelled");
	lines.push(`🎪 Event terlaksana: ${eventCount ?? 0}`);

	const { data: settlements } = await admin
		.from("event_settlements")
		.select("net_profit, revenue_net, is_loss")
		.eq("is_reopened", false)
		.gte("closed_at", `${startISO}T00:00:00+07:00`)
		.lt("closed_at", `${todayISO}T00:00:00+07:00`);
	const st = (settlements ?? []) as Array<{
		net_profit: number;
		revenue_net: number;
		is_loss: boolean;
	}>;
	if (st.length > 0) {
		const revenue = st.reduce((s, r) => s + Number(r.revenue_net ?? 0), 0);
		const profit = st.reduce((s, r) => s + Number(r.net_profit ?? 0), 0);
		const losses = st.filter((r) => r.is_loss).length;
		const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
		lines.push(
			`🧾 Settled: ${st.length} event${losses > 0 ? ` (🚨 ${losses} rugi)` : ""}`,
			`📈 Omzet settled: ${rp(revenue)}`,
			`💰 Profit bersih: ${rp(profit)} (margin ${margin}%)`,
		);
	} else {
		lines.push(`🧾 Belum ada event yang settled di ${bulan}`);
	}

	const { data: pays } = await admin
		.from("payments")
		.select("amount")
		.eq("is_reversed", false)
		.gte("payment_date", startISO)
		.lt("payment_date", todayISO);
	const cashIn = ((pays ?? []) as Array<{ amount: number }>).reduce(
		(s, p) => s + Number(p.amount ?? 0),
		0,
	);
	lines.push(`💵 Uang masuk (semua pembayaran): ${rp(cashIn)}`);

	try {
		const { count: leadsTotal } = await admin
			.from("whatsapp_bot_leads")
			.select("id", { count: "exact", head: true })
			.gte("received_at", `${startISO}T00:00:00+07:00`)
			.lt("received_at", `${todayISO}T00:00:00+07:00`);
		const { count: leadsConverted } = await admin
			.from("whatsapp_bot_leads")
			.select("id", { count: "exact", head: true })
			.eq("status", "converted")
			.gte("received_at", `${startISO}T00:00:00+07:00`)
			.lt("received_at", `${todayISO}T00:00:00+07:00`);
		lines.push(
			`📞 Leads WA bot: ${leadsTotal ?? 0} masuk · ${leadsConverted ?? 0} closing`,
		);
	} catch {
		// modul leads opsional
	}

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) lines.push(`\nDetail: ${appUrl}/finance`);
	return lines.join("\n");
}

function composeMonthlyReminder(todayISO: string): string | null {
	if (!todayISO.endsWith("-01")) return null;
	const d = new Date(`${todayISO}T00:00:00Z`);
	const bulan = BULAN_FULL[d.getUTCMonth()];
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	return [
		`📅 <b>AWAL BULAN — ${bulan} ${d.getUTCFullYear()}</b>`,
		"Rutinitas tanggal 1, jangan kelewat:",
		"",
		...MONTHLY_ITEMS.map((i) => `      • ${i}`),
		...(appUrl ? [`\nBagi hasil: ${appUrl}/finance`] : []),
	].join("\n");
}

// ── Orchestrator ─────────────────────────────────────────────────────────

async function getGroupChatId(
	admin: ReturnType<typeof createAdminClient>,
): Promise<{ chatId: number | null; enabled: boolean }> {
	const { data } = await admin
		.from("telegram_settings")
		.select("group_chat_id, digest_enabled")
		.eq("id", 1)
		.maybeSingle();
	return {
		chatId: (data?.group_chat_id as number | null) ?? null,
		enabled: (data?.digest_enabled as boolean | undefined) ?? true,
	};
}

/** Klaim slot kirim (dedup). True = boleh kirim, false = sudah pernah. */
async function claimSend(
	admin: ReturnType<typeof createAdminClient>,
	kind: string,
	dedupKey: string,
): Promise<boolean> {
	const { data } = await admin
		.from("telegram_sent_log")
		.upsert(
			{ kind, dedup_key: dedupKey },
			{ onConflict: "kind,dedup_key", ignoreDuplicates: true },
		)
		.select("id");
	return (data?.length ?? 0) > 0;
}

/**
 * Lepas kembali klaim yang gagal dikirim.
 *
 * Tanpa ini, klaim ditandai SEBELUM pesan benar-benar terkirim dan tidak
 * pernah dibatalkan: sekali Telegram membalas 5xx (atau HTML-nya ditolak),
 * barisnya tetap tinggal dan percobaan ulang dijawab "sudah terkirim".
 * Untuk digest harian briefing-nya hilang sehari; untuk klaim "briefing" yang
 * ber-key event id, briefing itu hilang PERMANEN.
 */
async function releaseSend(
	admin: ReturnType<typeof createAdminClient>,
	kind: string,
	dedupKey: string,
): Promise<void> {
	const { error } = await admin
		.from("telegram_sent_log")
		.delete()
		.eq("kind", kind)
		.eq("dedup_key", dedupKey);
	if (error) {
		console.error(
			`[digest] gagal melepas klaim ${kind}/${dedupKey}:`,
			error.message,
		);
	}
}

/**
 * Klaim → kirim → lepas-kalau-gagal, dalam satu langkah supaya kelima jenis
 * kiriman tidak bisa lagi lupa melakukan rollback.
 */
async function sendWithClaim(
	admin: ReturnType<typeof createAdminClient>,
	chatId: number | string,
	kind: string,
	dedupKey: string,
	force: boolean,
	html: string,
	opts?: Parameters<typeof sendTelegramMessage>[2],
): Promise<{ status: "sent" | "skipped" | "error"; error?: string }> {
	const claimed = force ? false : await claimSend(admin, kind, dedupKey);
	if (!force && !claimed) return { status: "skipped" };

	try {
		const res = await sendTelegramMessage(chatId, html, opts);
		if (res.ok) return { status: "sent" };
		if (claimed) await releaseSend(admin, kind, dedupKey);
		return { status: "error", error: res.error };
	} catch (err) {
		if (claimed) await releaseSend(admin, kind, dedupKey);
		throw err;
	}
}

/**
 * Kirim digest pagi + briefing H-1 ke grup owner. force=true melewati dedup
 * (untuk trigger manual/VPS sore hari).
 */
export async function runTelegramDigestInternal(opts?: {
	force?: boolean;
}): Promise<TelegramDispatchResult> {
	const result: TelegramDispatchResult = { sent: [], skipped: [], errors: [] };
	if (!isTelegramConfigured()) {
		result.skipped.push("TELEGRAM_BOT_TOKEN not set");
		return result;
	}
	const admin = createAdminClient();
	const { chatId, enabled } = await getGroupChatId(admin);
	if (!chatId) {
		result.skipped.push("group belum terhubung (invite bot ke grup dulu)");
		return result;
	}
	if (!enabled) {
		result.skipped.push("digest dinonaktifkan di telegram_settings");
		return result;
	}

	const data = await gatherData(admin);

	// 1. Digest harian
	try {
		const digest = composeDigest(data);
		if (!digest) {
			result.skipped.push("digest: tidak ada event & stok aman");
		} else {
			const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
			const r = await sendWithClaim(
				admin,
				chatId,
				"digest",
				data.todayISO,
				opts?.force ?? false,
				digest,
				appUrl
					? {
							replyMarkup: [
								[{ text: "🔗 Buka Tetra Ops", url: `${appUrl}/operations` }],
							],
						}
					: undefined,
			);
			if (r.status === "sent") result.sent.push("digest");
			else if (r.status === "skipped")
				result.skipped.push("digest: sudah terkirim hari ini");
			else result.errors.push(`digest: ${r.error}`);
		}
	} catch (err) {
		result.errors.push(
			`digest: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 2. Reminder bulanan tiap tanggal 1 (kosan, wifi, bagi hasil owner)
	try {
		const monthly = composeMonthlyReminder(data.todayISO);
		if (monthly) {
			const monthKey = data.todayISO.slice(0, 7); // YYYY-MM
			const r = await sendWithClaim(
				admin,
				chatId,
				"monthly",
				monthKey,
				opts?.force ?? false,
				monthly,
			);
			if (r.status === "sent") result.sent.push("monthly");
			else if (r.status === "skipped")
				result.skipped.push("monthly: sudah terkirim bulan ini");
			else result.errors.push(`monthly: ${r.error}`);
		}
	} catch (err) {
		result.errors.push(
			`monthly: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 2b. Rekap bisnis bulan lalu — juga tanggal 1
	try {
		const recap = await composeMonthlyBusinessRecap(admin, data.todayISO);
		if (recap) {
			const d = new Date(`${data.todayISO}T00:00:00Z`);
			d.setUTCMonth(d.getUTCMonth() - 1);
			const prevKey = isoDateUTC(d).slice(0, 7); // YYYY-MM bulan lalu
			const r = await sendWithClaim(
				admin,
				chatId,
				"monthly_recap",
				prevKey,
				opts?.force ?? false,
				recap,
			);
			if (r.status === "sent") result.sent.push("monthly_recap");
			else if (r.status === "skipped")
				result.skipped.push("monthly_recap: sudah terkirim");
			else result.errors.push(`monthly_recap: ${r.error}`);
		}
	} catch (err) {
		result.errors.push(
			`monthly_recap: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 3. Reminder H+1: upload aset digital event kemarin
	try {
		const uploads = await fetchAssetUploadReminders(admin, data.todayISO);
		for (const ev of uploads) {
			const r = await sendWithClaim(
				admin,
				chatId,
				"asset_upload",
				ev.id,
				opts?.force ?? false,
				composeAssetUpload(ev),
			);
			if (r.status === "sent") result.sent.push(`asset_upload ${ev.client_name}`);
			else if (r.status === "skipped")
				result.skipped.push(`asset_upload ${ev.client_name}: sudah terkirim`);
			else result.errors.push(`asset_upload ${ev.client_name}: ${r.error}`);
		}
	} catch (err) {
		result.errors.push(
			`asset_upload: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 4. Briefing per event H-1
	const tomorrowISO = addDaysISO(data.todayISO, 1);
	for (const ev of data.events.filter((e) => e.event_date === tomorrowISO)) {
		try {
			const crew = data.crewByEvent.get(ev.id) ?? [];
			const r = await sendWithClaim(
				admin,
				chatId,
				"briefing",
				ev.id,
				opts?.force ?? false,
				composeBriefing(ev, crew),
			);
			if (r.status === "sent") result.sent.push(`briefing ${ev.client_name}`);
			else if (r.status === "skipped")
				result.skipped.push(`briefing ${ev.client_name}: sudah terkirim`);
			else result.errors.push(`briefing ${ev.client_name}: ${r.error}`);
		} catch (err) {
			result.errors.push(
				`briefing ${ev.client_name}: ${err instanceof Error ? err.message : "unknown"}`,
			);
		}
	}

	return result;
}

/** Untuk perintah /cek dari grup — compose digest tanpa dedup/log. */
export async function buildDigestText(): Promise<string> {
	const admin = createAdminClient();
	const data = await gatherData(admin);
	return (
		composeDigest(data) ??
		"✅ Tidak ada event 7 hari ke depan dan stok aman. Santai dulu 😎"
	);
}

/** /besok — briefing lengkap semua event besok. */
export async function buildTomorrowText(): Promise<string> {
	const admin = createAdminClient();
	const data = await gatherData(admin);
	const tomorrowISO = addDaysISO(data.todayISO, 1);
	const evs = data.events.filter((e) => e.event_date === tomorrowISO);
	if (evs.length === 0) {
		return `😌 Tidak ada event besok (${dateLabel(tomorrowISO, true)}).`;
	}
	return evs
		.map((ev) => composeBriefing(ev, data.crewByEvent.get(ev.id) ?? []))
		.join("\n\n————————————\n\n");
}

/** /minggu — jadwal ringkas semua event 7 hari ke depan. */
export async function buildScheduleText(): Promise<string> {
	const admin = createAdminClient();
	const data = await gatherData(admin);
	if (data.events.length === 0) {
		return "😌 Tidak ada event 7 hari ke depan.";
	}
	const byDate = new Map<string, EventRow[]>();
	for (const ev of data.events) {
		const arr = byDate.get(ev.event_date) ?? [];
		arr.push(ev);
		byDate.set(ev.event_date, arr);
	}
	const parts: string[] = [
		`🗓 <b>JADWAL 7 HARI KE DEPAN</b> (${data.events.length} event)`,
	];
	for (const [date, evs] of byDate.entries()) {
		const days = daysUntil(data.todayISO, date);
		const hLabel = days === 0 ? "HARI INI" : `H-${days}`;
		parts.push(`\n<b>${dateLabel(date, true)}</b> · ${hLabel}`);
		for (const ev of evs) {
			const crew = data.crewByEvent.get(ev.id) ?? [];
			const jam = hhmm(ev.start_time) ?? "❓TBC";
			const kota = ev.venue_city ? ` · ${tgEscape(ev.venue_city)}` : "";
			// Nama crew langsung, bukan cuma jumlah — "👥2" memaksa owner buka app
			// untuk tahu siapa, padahal itu justru yang ingin dicek.
			parts.push(
				`      • ${jam} — ${tgEscape(ev.client_name)}${kota}`,
				`            ${crew.length > 0 ? `👥 ${formatCrewInline(crew)}` : "🚨 crew belum di-assign"}`,
			);
		}
	}
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) parts.push(`\nDetail: ${appUrl}/operations`);
	return parts.join("\n");
}

/** Parse argumen bulan: "8", "08", "agustus", "agu" → 0-based month, atau null. */
function parseMonthArg(arg: string): number | null {
	const s = arg.trim().toLowerCase();
	if (/^\d{1,2}$/.test(s)) {
		const n = Number(s);
		return n >= 1 && n <= 12 ? n - 1 : null;
	}
	if (s.length < 3) return null;
	const idx = BULAN_FULL.findIndex((b) => b.toLowerCase().startsWith(s));
	return idx >= 0 ? idx : null;
}

/** /bulan [bulan] — semua event di satu bulan tahun berjalan (default: bulan ini). */
export async function buildMonthText(arg?: string): Promise<string> {
	const admin = createAdminClient();
	const now = wibNow();
	const year = now.getUTCFullYear();
	const todayISO = isoDateUTC(now);
	let month = now.getUTCMonth();
	if (arg?.trim()) {
		const parsed = parseMonthArg(arg);
		if (parsed === null) {
			return "❓ Bulan tidak dikenali. Contoh: <code>/bulan 8</code> atau <code>/bulan agustus</code>";
		}
		month = parsed;
	}
	const startISO = `${year}-${String(month + 1).padStart(2, "0")}-01`;
	const endISO = isoDateUTC(new Date(Date.UTC(year, month + 1, 0)));

	const { data: eventsData, error } = await admin
		.from("events")
		.select(
			"id, project_id, client_name, event_date, start_time, venue_city, status",
		)
		.gte("event_date", startISO)
		.lte("event_date", endISO)
		.is("deleted_at", null)
		// Event legacy IKUT dihitung supaya jumlahnya sama dengan KPI "Bulan Ini"
		// di /operations (yang menghitung semua event non-deleted). Semuanya
		// bertanggal lampau, jadi tidak memicu alarm crew.
		.neq("status", "cancelled")
		.order("event_date", { ascending: true })
		.order("start_time", { ascending: true, nullsFirst: false });
	if (error) throw new Error(`Fetch events: ${error.message}`);
	const events = (eventsData ?? []) as Array<
		Pick<
			EventRow,
			| "id"
			| "project_id"
			| "client_name"
			| "event_date"
			| "start_time"
			| "venue_city"
		> & { status: string }
	>;

	const judul = `${BULAN_FULL[month].toUpperCase()} ${year}`;
	if (events.length === 0) {
		return `😌 Tidak ada event di bulan ${BULAN_FULL[month]} ${year}.`;
	}

	const crewCount = new Map<string, number>();
	{
		const { data: crewData } = await admin
			.from("crew_assignments")
			.select("event_id")
			.in(
				"event_id",
				events.map((e) => e.id),
			);
		for (const c of (crewData ?? []) as Array<{ event_id: string }>) {
			crewCount.set(c.event_id, (crewCount.get(c.event_id) ?? 0) + 1);
		}
	}

	const byDate = new Map<string, typeof events>();
	for (const ev of events) {
		const arr = byDate.get(ev.event_date) ?? [];
		arr.push(ev);
		byDate.set(ev.event_date, arr);
	}

	const doneCount = events.filter((e) => e.event_date < todayISO).length;
	const parts: string[] = [
		`🗓 <b>EVENT ${judul}</b> — ${events.length} event (${doneCount} sudah lewat, ${events.length - doneCount} akan datang)`,
	];
	for (const [date, evs] of byDate.entries()) {
		const isPast = date < todayISO;
		const isToday = date === todayISO;
		const suffix = isToday ? " · HARI INI" : isPast ? " ✔" : "";
		parts.push(`\n<b>${dateLabel(date)}</b>${suffix}`);
		for (const ev of evs) {
			const jam = hhmm(ev.start_time) ?? "❓TBC";
			const kota = ev.venue_city ? ` · ${tgEscape(ev.venue_city)}` : "";
			// Alarm crew hanya untuk event yang sudah dekat (≤7 hari). Event 3
			// bulan lagi memang belum di-assign — menandainya 🚨 di daftar bulanan
			// cuma bikin owner kebal sama tanda merah.
			const n = crewCount.get(ev.id) ?? 0;
			const soon = !isPast && daysUntil(todayISO, date) <= 7;
			const crew = isPast
				? ""
				: n > 0
					? ` · 👥${n}`
					: soon
						? " · 🚨 crew belum di-assign"
						: "";
			parts.push(`      • ${jam} — ${tgEscape(ev.client_name)}${kota}${crew}`);
		}
	}
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) parts.push(`\nDetail: ${appUrl}/operations`);
	return parts.join("\n");
}

/** /stok — kondisi stok: item habis + perkiraan kekurangan utk event mendatang. */
export async function buildStockText(): Promise<string> {
	const admin = createAdminClient();
	const data = await gatherData(admin);
	if (data.stockLines.length === 0) {
		return "✅ Stok aman — tidak ada item habis dan tidak ada perkiraan kekurangan untuk event mendatang.";
	}
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	return [
		"📦 <b>KONDISI STOK</b>",
		"",
		...data.stockLines.map((s) => `• ${s}`),
		...(appUrl ? [`\nDetail: ${appUrl}/warehouse`] : []),
	].join("\n");
}
