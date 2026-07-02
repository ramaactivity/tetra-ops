import "server-only";

import { computeForecast } from "@/lib/actions/forecast";
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

type CrewRow = {
	event_id: string;
	role_in_event: string;
	user: { full_name: string } | Array<{ full_name: string }> | null;
};

export type TelegramDispatchResult = {
	sent: string[];
	skipped: string[];
	errors: string[];
};

// ── Waktu WIB ────────────────────────────────────────────────────────────
// Cron Vercel jalan 23:30 UTC = 06:30 WIB hari BERIKUTNYA. Tanggal server
// (UTC) salah satu hari — semua hitungan hari di sini pakai UTC+7 eksplisit.

function wibNow(): Date {
	return new Date(Date.now() + 7 * 3600 * 1000);
}

function isoDateUTC(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDaysISO(iso: string, n: number): string {
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

function dateLabel(iso: string, full = false): string {
	const d = new Date(`${iso}T00:00:00Z`);
	const hari = (full ? HARI_FULL : HARI)[d.getUTCDay()];
	return `${hari} ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`;
}

function rp(n: number): string {
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

// ── Data gathering ───────────────────────────────────────────────────────

type GatheredData = {
	todayISO: string;
	events: EventRow[];
	crewByEvent: Map<string, string[]>; // "Lead: Farhan"
	doubleBooked: string[]; // "Farhan: Anita + Naya (5 Jul)"
	stockLines: string[]; // sudah diformat, 🚨/⚠️ prefix
};

async function gatherData(
	admin: ReturnType<typeof createAdminClient>,
): Promise<GatheredData> {
	const todayISO = isoDateUTC(wibNow());
	const endISO = addDaysISO(todayISO, 7);

	const { data: eventsData, error: evErr } = await admin
		.from("events")
		.select(
			`id, project_id, client_name, event_date, setup_time, start_time,
			 end_time, venue_name, venue_city, google_maps_url, frame_size,
			 backdrop_id, design_status, design_approved_at, total_paid,
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

	const crewByEvent = new Map<string, string[]>();
	const doubleBooked: string[] = [];
	if (events.length > 0) {
		const { data: crewData } = await admin
			.from("crew_assignments")
			.select("event_id, role_in_event, user:users(full_name)")
			.in(
				"event_id",
				events.map((e) => e.id),
			);
		const byPerson = new Map<string, EventRow[]>();
		for (const c of (crewData ?? []) as CrewRow[]) {
			const u = Array.isArray(c.user) ? c.user[0] : c.user;
			const name = u?.full_name ?? "?";
			const label = `${ROLE_LABEL[c.role_in_event] ?? c.role_in_event}: ${name}`;
			const arr = crewByEvent.get(c.event_id) ?? [];
			arr.push(label);
			crewByEvent.set(c.event_id, arr);

			const ev = events.find((e) => e.id === c.event_id);
			if (ev) {
				const k = `${name}::${ev.event_date}`;
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
	}

	// Stok: habis (🚨) + forecast kekurangan utk event mendatang (⚠️)
	const stockLines: string[] = [];
	const covered = new Set<string>();
	const { data: items } = await admin
		.from("inventory_items")
		.select("id, name, min_stock_alert")
		.eq("category", "inventory")
		.eq("is_active", true)
		.gt("min_stock_alert", 0);
	const itemRows = (items ?? []) as Array<{
		id: string;
		name: string;
		min_stock_alert: number;
	}>;
	if (itemRows.length > 0) {
		const { data: levels } = await admin.rpc("get_stock_levels", {
			p_item_ids: itemRows.map((i) => i.id),
		});
		const stockMap = new Map(
			((levels ?? []) as Array<{ item_id: string; stock: number }>).map((r) => [
				r.item_id,
				Number(r.stock),
			]),
		);
		for (const item of itemRows) {
			if ((stockMap.get(item.id) ?? 0) === 0) {
				stockLines.push(`🚨 ${tgEscape(item.name)} HABIS — restock segera`);
				covered.add(item.id);
			}
		}
	}
	try {
		const forecast = await computeForecast(admin);
		if (!forecast.stock_unknown && forecast.upcoming_count > 0) {
			for (const r of forecast.rows) {
				if (covered.has(r.item_id)) continue;
				stockLines.push(
					`⚠️ ${tgEscape(r.name)}: stok ${Math.round(r.on_hand)}, butuh ±${Math.round(r.projected_demand)} ${tgEscape(r.unit)} utk ${forecast.upcoming_count} event (kurang ${Math.round(r.shortfall)})`,
				);
			}
		}
	} catch {
		// forecast opsional — jangan gagalkan digest
	}

	return { todayISO, events, crewByEvent, doubleBooked, stockLines };
}

// ── Issue derivation per event ───────────────────────────────────────────

type EventIssues = {
	critical: string[];
	warning: string[];
};

function daysUntil(todayISO: string, dateISO: string): number {
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

	// Desain — target H-1
	const designDone =
		ev.design_status === "approved" || ev.design_approved_at !== null;
	if (!designDone && days <= 3) {
		const st = ev.design_status === "proses" ? "masih proses" : "belum dibuat";
		push(days <= 1, `desain belum ACC (${st})`);
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
	const { todayISO, events, crewByEvent, doubleBooked, stockLines } = data;

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
		events.length === 0 && stockLines.length === 0 && allCritical.length === 0;
	if (nothingToSay) return null; // tidak ada event & stok aman → diam

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

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) parts.push(`\nDetail: ${appUrl}/operations`);

	return parts.join("\n");
}

function composeBriefing(ev: EventRow, crew: string[]): string {
	const lines: string[] = [
		`📸 <b>BRIEFING BESOK — ${tgEscape(ev.client_name)}</b>`,
		`${dateLabel(ev.event_date, true)}`,
		"",
		`🕐 Setup ${hhmm(ev.setup_time) ?? "❓ TBC"} · Mulai ${hhmm(ev.start_time) ?? "❓ TBC"} · Selesai ${hhmm(ev.end_time) ?? "❓ TBC"}`,
		`📍 ${tgEscape(ev.venue_name) || "❓ venue TBC"}${ev.venue_city ? `, ${tgEscape(ev.venue_city)}` : ""}`,
	];
	if (ev.google_maps_url) lines.push(`🗺 ${ev.google_maps_url}`);
	lines.push(
		`👥 ${crew.length > 0 ? crew.map(tgEscape).join(" · ") : "🚨 CREW BELUM DI-ASSIGN"}`,
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

// ── Reminder bulanan (tanggal 1) ─────────────────────────────────────────
// Tagihan rutin & ritual keuangan owner. Hardcoded by design: daftarnya
// pendek, jarang berubah, dan mengubahnya = edit satu array ini.

const MONTHLY_ITEMS = [
	"🏠 Bayar kosan",
	"🌐 Bayar internet / WiFi",
	"💸 Withdraw / transfer bagi hasil owner bulan lalu",
];

function composeMonthlyReminder(todayISO: string): string | null {
	if (!todayISO.endsWith("-01")) return null;
	const d = new Date(`${todayISO}T00:00:00Z`);
	const bulan = [
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
	][d.getUTCMonth()];
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
		} else if (
			opts?.force ||
			(await claimSend(admin, "digest", data.todayISO))
		) {
			const res = await sendTelegramMessage(chatId, digest);
			if (res.ok) result.sent.push("digest");
			else result.errors.push(`digest: ${res.error}`);
		} else {
			result.skipped.push("digest: sudah terkirim hari ini");
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
			if (opts?.force || (await claimSend(admin, "monthly", monthKey))) {
				const res = await sendTelegramMessage(chatId, monthly);
				if (res.ok) result.sent.push("monthly");
				else result.errors.push(`monthly: ${res.error}`);
			} else {
				result.skipped.push("monthly: sudah terkirim bulan ini");
			}
		}
	} catch (err) {
		result.errors.push(
			`monthly: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 3. Briefing per event H-1
	const tomorrowISO = addDaysISO(data.todayISO, 1);
	for (const ev of data.events.filter((e) => e.event_date === tomorrowISO)) {
		try {
			if (!opts?.force && !(await claimSend(admin, "briefing", ev.id))) {
				result.skipped.push(`briefing ${ev.client_name}: sudah terkirim`);
				continue;
			}
			const crew = data.crewByEvent.get(ev.id) ?? [];
			const res = await sendTelegramMessage(chatId, composeBriefing(ev, crew));
			if (res.ok) result.sent.push(`briefing ${ev.client_name}`);
			else result.errors.push(`briefing ${ev.client_name}: ${res.error}`);
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
			const crewCount = data.crewByEvent.get(ev.id)?.length ?? 0;
			const jam = hhmm(ev.start_time) ?? "❓TBC";
			const kota = ev.venue_city ? ` · ${tgEscape(ev.venue_city)}` : "";
			const crewIcon = crewCount > 0 ? `👥${crewCount}` : "🚨 no crew";
			parts.push(
				`      • ${jam} — ${tgEscape(ev.client_name)}${kota} · ${crewIcon}`,
			);
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
