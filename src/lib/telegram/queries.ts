import "server-only";

import {
	type AvailabilityEvent,
	computeAvailability,
	parseHHMM,
	UNITS_TOTAL,
} from "@/lib/availability";
import { getCashAccountBalance } from "@/lib/finance/balance-guard";
import { listUnpaidCrew } from "@/lib/finance/unpaid-crew";
import { createAdminClient } from "@/lib/supabase/admin";
import { tgEscape } from "@/lib/telegram/client";
import {
	addDaysISO,
	dateLabel,
	daysUntil,
	fetchCrewByEvent,
	formatCrewInline,
	isoDateUTC,
	rp,
	wibNow,
} from "@/lib/telegram/digest";

/**
 * Builder untuk perintah on-demand grup owner: /piutang, /saldo, /crew,
 * /ada <tanggal>. Semua read-only via admin client.
 */

/** /piutang — semua event yang belum lunas, urut tanggal event. */
export async function buildPiutangText(): Promise<string> {
	const admin = createAdminClient();
	const todayISO = isoDateUTC(wibNow());
	// Predikat SAMA dengan /billing & get_outstanding_total: belum 'paid' DAN
	// masih ada sisa. Dulu bot memakai status <> 'cancelled' tanpa cek
	// payment_status, jadi totalnya bisa beda dari Outstanding di webapp begitu
	// kedua kolom itu berbeda (mis. jalur upfront_cut / net billing).
	const { data, error } = await admin
		.from("events")
		.select(
			"project_id, client_name, event_date, total_paid, remaining_balance, grand_total",
		)
		.gt("remaining_balance", 0)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.neq("payment_status", "paid")
		.order("event_date", { ascending: true });
	if (error) throw new Error(`Fetch piutang: ${error.message}`);
	const rows = (data ?? []) as Array<{
		project_id: string;
		client_name: string;
		event_date: string;
		total_paid: number;
		remaining_balance: number;
		grand_total: number;
	}>;
	if (rows.length === 0) {
		return "✅ Tidak ada piutang — semua event sudah lunas. 🎉";
	}

	const overdue = rows.filter((r) => r.event_date < todayISO);
	const upcoming = rows.filter((r) => r.event_date >= todayISO);
	const total = rows.reduce((s, r) => s + Number(r.remaining_balance), 0);

	const fmt = (r: (typeof rows)[number]) => {
		const days = daysUntil(todayISO, r.event_date);
		const when =
			r.event_date < todayISO
				? `lewat ${-days} hari`
				: days === 0
					? "HARI INI"
					: `H-${days}`;
		const dp = Number(r.total_paid) === 0 ? " · belum DP sama sekali" : "";
		return `• ${tgEscape(r.client_name)} — ${dateLabel(r.event_date)} (${when}): sisa ${rp(Number(r.remaining_balance))}${dp}`;
	};

	const parts: string[] = [
		`💰 <b>PIUTANG</b> — ${rows.length} event · total ${rp(total)}`,
	];
	if (overdue.length > 0) {
		parts.push(
			`\n🚨 <b>Event sudah lewat, belum lunas (${overdue.length})</b>`,
			...overdue.map(fmt),
		);
	}
	if (upcoming.length > 0) {
		parts.push(
			`\n📅 <b>Event mendatang (${upcoming.length})</b>`,
			...upcoming.map(fmt),
		);
	}
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	// /billing, bukan /reminders: halaman reminders cuma memuat event H-7/H-3/H-1
	// dalam jendela sempit, jadi sebagian besar piutang di daftar ini tidak
	// muncul di sana dan owner melihat halaman kosong.
	if (appUrl) parts.push(`\nTagih via: ${appUrl}/billing`);
	return parts.join("\n");
}

/** /crew — siapa yang pegang event apa, 7 hari ke depan + fee belum dibayar. */
export async function buildCrewText(): Promise<string> {
	const admin = createAdminClient();
	const todayISO = isoDateUTC(wibNow());
	const endISO = addDaysISO(todayISO, 7);

	// Dikelompokkan PER EVENT, bukan per orang: per orang membuat satu event
	// tercetak ulang untuk tiap crew-nya (lead & asisten = 2 baris identik),
	// dan yang justru penting — event yang belum punya crew sama sekali — tak
	// bisa muncul karena tak punya baris crew_assignments.
	// Filter event SAMA dengan digest supaya /crew, /cek dan /minggu sepakat.
	const { data: eventsData, error: evErr } = await admin
		.from("events")
		.select("id, client_name, event_date, start_time, venue_city")
		.gte("event_date", todayISO)
		.lte("event_date", endISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.in("status", ["upcoming", "in_progress"])
		.order("event_date", { ascending: true })
		.order("start_time", { ascending: true, nullsFirst: false });
	if (evErr) throw new Error(`Fetch events: ${evErr.message}`);
	const events = (eventsData ?? []) as Array<{
		id: string;
		client_name: string;
		event_date: string;
		start_time: string | null;
		venue_city: string | null;
	}>;
	const crewByEvent = await fetchCrewByEvent(admin, events);

	const parts: string[] = ["👥 <b>CREW</b>"];
	if (events.length === 0) {
		parts.push("\nTidak ada event 7 hari ke depan.");
	} else {
		parts.push("\n<b>Jadwal 7 hari ke depan</b>");
		for (const ev of events) {
			const crew = crewByEvent.get(ev.id) ?? [];
			const jam = ev.start_time ? `${ev.start_time.slice(0, 5)} ` : "";
			const kota = ev.venue_city ? ` (${tgEscape(ev.venue_city)})` : "";
			parts.push(
				`• <b>${dateLabel(ev.event_date)}</b> ${jam}— ${tgEscape(ev.client_name)}${kota}`,
				`      ${crew.length > 0 ? formatCrewInline(crew) : "🚨 belum di-assign"}`,
			);
		}
	}

	// Fee belum dibayar — definisi SAMA PERSIS dengan halaman Finance (helper
	// bersama), bukan sekadar is_paid=false: hanya event yang ter-settle di buku
	// sekarang. Dulu bot pakai is_paid mentah dan melaporkan utang jutaan rupiah
	// padahal Buku Besar (2-100) nol.
	const { rows: unpaidRows } = await listUnpaidCrew(admin);
	const unpaidByPerson = new Map<string, number>();
	for (const r of unpaidRows) {
		unpaidByPerson.set(
			r.crewName,
			(unpaidByPerson.get(r.crewName) ?? 0) + r.amount,
		);
	}
	if (unpaidByPerson.size > 0) {
		const totalUnpaid = [...unpaidByPerson.values()].reduce((a, b) => a + b, 0);
		parts.push(
			`\n💸 <b>Fee belum dibayar</b> — total ${rp(totalUnpaid)}`,
			...[...unpaidByPerson.entries()].map(
				([name, amt]) => `• ${tgEscape(name)}: ${rp(amt)}`,
			),
		);
	}
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) parts.push(`\nDetail: ${appUrl}/operations/team`);
	return parts.join("\n");
}

/** /saldo — saldo semua rekening kas & bank (dari journal_lines). */
export async function buildSaldoText(): Promise<string> {
	const admin = createAdminClient();
	// Sumber = daftar akun kas/bank di COA (1-1xx), PERSIS seperti halaman
	// Finance yang menjumlahkan journal_lines account_code like '1-1%'. Dulu
	// daftar ini dirakit dari 1-100 hardcoded + bank_accounts aktif: 1-100 ikut
	// dua kali (bank_accounts punya baris "Cash — Kas Tunai" ber-coa 1-100) jadi
	// dihitung dobel, sementara rekening non-aktif hilang dari total.
	const { data: coaRows, error: coaErr } = await admin
		.from("chart_of_accounts")
		.select("code, name")
		.like("code", "1-1%")
		.order("code");
	if (coaErr) throw new Error(`Fetch COA kas/bank: ${coaErr.message}`);
	const accounts = ((coaRows ?? []) as Array<{ code: string; name: string }>)
		.map((a) => ({ label: a.name, code: a.code }))
		.filter(
			(a, i, arr) => arr.findIndex((x) => x.code === a.code) === i, // jaga-jaga
		);
	const balances = await Promise.all(
		accounts.map(async (a) => ({
			...a,
			balance: await getCashAccountBalance(admin, a.code),
		})),
	);
	const total = balances.reduce((s, b) => s + b.balance, 0);
	const lines = [
		"💵 <b>SALDO KAS & BANK</b>",
		"",
		...balances.map(
			(b) =>
				`• ${tgEscape(b.label)}: <b>${rp(b.balance)}</b>${b.balance < 0 ? " 🚨" : ""}`,
		),
		"",
		`Total: <b>${rp(total)}</b>`,
	];
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) lines.push(`\nDetail: ${appUrl}/finance`);
	return lines.join("\n");
}

// ── /ada <tanggal> — cek ketersediaan unit ───────────────────────────────

const BULAN_ALIASES = [
	"januari",
	"februari",
	"maret",
	"april",
	"mei",
	"juni",
	"juli",
	"agustus",
	"september",
	"oktober",
	"november",
	"desember",
];

/** Parse "15 agu", "15/8", "15-8-2026", "2026-08-15" → ISO date (atau null). */
export function parseTanggalArg(arg: string, todayISO: string): string | null {
	const s = arg.trim().toLowerCase();
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

	let day: number | null = null;
	let month: number | null = null; // 0-based
	let year: number | null = null;

	const numeric = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
	const named = s.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
	if (numeric) {
		day = Number(numeric[1]);
		month = Number(numeric[2]) - 1;
		if (numeric[3]) {
			const y = Number(numeric[3]);
			year = y < 100 ? 2000 + y : y;
		}
	} else if (named) {
		day = Number(named[1]);
		const idx = BULAN_ALIASES.findIndex((b) => b.startsWith(named[2]));
		if (idx < 0) return null;
		month = idx;
		if (named[3]) year = Number(named[3]);
	} else {
		return null;
	}
	if (!day || month === null || month < 0 || month > 11 || day > 31) {
		return null;
	}

	const thisYear = Number(todayISO.slice(0, 4));
	const mk = (y: number) =>
		`${y}-${String((month as number) + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	if (year) return mk(year);
	// Tanpa tahun: pakai tahun ini; kalau sudah lewat, maksudnya tahun depan.
	const candidate = mk(thisYear);
	return candidate < todayISO ? mk(thisYear + 1) : candidate;
}

/**
 * Cek ketersediaan unit di satu tanggal. Window opsional ("14:00-18:00");
 * default 08:00–22:00 (konservatif: semua event hari itu dihitung).
 */
export async function buildAdaText(arg: string): Promise<string> {
	const todayISO = isoDateUTC(wibNow());
	const windowMatch = arg.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
	const dateArg = windowMatch
		? arg.replace(windowMatch[0], "").trim()
		: arg.trim();
	const dateISO = parseTanggalArg(dateArg, todayISO);
	if (!dateISO) {
		return [
			"❓ Format tanggal tidak dikenali. Contoh:",
			"<code>/ada 15 agu</code>",
			"<code>/ada 15/8</code>",
			"<code>/ada 15 agustus 14:00-18:00</code>",
		].join("\n");
	}

	const reqStart = parseHHMM(windowMatch?.[1] ?? "08:00") ?? 480;
	const reqEnd = parseHHMM(windowMatch?.[2] ?? "22:00") ?? 1320;

	const admin = createAdminClient();
	const { data, error } = await admin
		.from("events")
		.select(
			"client_name, start_time, end_time, session_segments, venue_city, status, package:packages(duration_hours)",
		)
		.eq("event_date", dateISO)
		.is("deleted_at", null);
	if (error)
		throw new Error(`Fetch booking tanggal ${dateISO}: ${error.message}`);
	type Row = {
		client_name: string | null;
		start_time: string | null;
		end_time: string | null;
		session_segments: unknown;
		venue_city: string | null;
		status: string | null;
		package: { duration_hours: number | null } | null;
	};
	const NON_LOCKING = new Set(["cancelled", "archived"]);
	const events: AvailabilityEvent[] = ((data ?? []) as unknown as Row[])
		.filter((r) => !NON_LOCKING.has(r.status ?? ""))
		.map((r) => ({
			client_name: r.client_name,
			start_time: r.start_time,
			end_time: r.end_time,
			// Acara berjeda: tanpa ini booth yang tutup di tengah tetap dihitung
			// terkunci — /api/availability (dipakai bot WA) sudah mengirimnya,
			// jadi /ada dulu bisa bilang "penuh" untuk jam yang sebenarnya bebas.
			session_segments: r.session_segments,
			venue_city: r.venue_city,
			package_duration_hours: r.package?.duration_hours ?? null,
		}));

	const result = computeAvailability({
		reqStart,
		reqEnd,
		reqCity: null,
		events,
	});

	const icon = result.units_free > 0 ? "✅" : "🚨";
	const lines = [
		`${icon} <b>${dateLabel(dateISO, true)}</b>${windowMatch ? ` · ${windowMatch[1]}–${windowMatch[2]}` : ""}`,
		`Unit free: <b>${result.units_free} dari ${UNITS_TOTAL}</b>${result.units_free === 0 ? " — FULL, jangan terima booking" : ""}`,
	];
	if (events.length > 0) {
		lines.push(
			"",
			`Booking hari itu (${events.length}):`,
			...events.map((e) => {
				const jam = e.start_time
					? `${e.start_time.slice(0, 5)}${e.end_time ? `–${e.end_time.slice(0, 5)}` : ""}`
					: "jam TBC";
				const kota = e.venue_city ? ` · ${tgEscape(e.venue_city)}` : "";
				return `• ${jam} — ${tgEscape(e.client_name ?? "?")}${kota}`;
			}),
		);
	} else {
		lines.push("", "Belum ada booking sama sekali di tanggal itu.");
	}
	if (!windowMatch) {
		lines.push(
			"",
			"<i>Dihitung utk window 08:00–22:00 (konservatif). Utk jam spesifik: /ada 15 agu 14:00-18:00</i>",
		);
	}
	return lines.join("\n");
}

// ── /vendor — event upcoming via vendor ──────────────────────────────────

type VendorEventRow = {
	client_name: string;
	event_date: string;
	venue_city: string | null;
	grand_total: number;
	remaining_balance: number;
	vendor_name: string | null;
	vendor_pic_name: string | null;
	vendor_contact: string | null;
	vendor_commission_mode: string | null;
	vendor_commission_amount: number | null;
};

async function fetchVendorEvents(): Promise<Map<string, VendorEventRow[]>> {
	const admin = createAdminClient();
	const todayISO = isoDateUTC(wibNow());
	const { data } = await admin
		.from("events")
		.select(
			`client_name, event_date, venue_city, grand_total, remaining_balance,
			 vendor_name, vendor_pic_name, vendor_contact,
			 vendor_commission_mode, vendor_commission_amount`,
		)
		.eq("channel", "vendor")
		.gte("event_date", todayISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.neq("status", "cancelled")
		.order("event_date", { ascending: true });
	const rows = (data ?? []) as VendorEventRow[];
	// Urutan insertion Map = urutan event terdekat (rows sudah urut tanggal).
	const byVendor = new Map<string, VendorEventRow[]>();
	for (const r of rows) {
		const key = r.vendor_name?.trim() || "(vendor tanpa nama)";
		const arr = byVendor.get(key) ?? [];
		arr.push(r);
		byVendor.set(key, arr);
	}
	return byVendor;
}

/**
 * Pemilih vendor — daftar tombol "Nama (N event)". callback_data "v:<nama>"
 * (dipotong 58 byte, limit Telegram 64); handler mencocokkan by prefix.
 */
export async function buildVendorPicker(): Promise<{
	text: string;
	buttons: Array<Array<{ text: string; callback_data: string }>>;
}> {
	const byVendor = await fetchVendorEvents();
	if (byVendor.size === 0) {
		return {
			text: "🤝 Tidak ada event upcoming dari channel vendor.",
			buttons: [],
		};
	}
	const buttons = [...byVendor.entries()].map(([vendor, evs]) => [
		{
			text: `${vendor} (${evs.length} event)`,
			callback_data: `v:${vendor.slice(0, 58)}`,
		},
	]);
	buttons.push([{ text: "📋 Semua vendor sekaligus", callback_data: "v:*" }]);
	return {
		text: `🤝 <b>Event upcoming via vendor</b> — ${byVendor.size} vendor.\nPilih vendor yang mau dilihat:`,
		buttons,
	};
}

/** Detail event upcoming utk satu vendor ("*" = semua). */
export async function buildVendorText(filter?: string): Promise<string> {
	const todayISO = isoDateUTC(wibNow());
	let byVendor = await fetchVendorEvents();
	if (byVendor.size === 0) {
		return "🤝 Tidak ada event upcoming dari channel vendor.";
	}
	if (filter && filter !== "*") {
		// Nama di callback bisa terpotong 58 byte → cocokkan exact dulu, lalu prefix.
		const match =
			[...byVendor.keys()].find((k) => k === filter) ??
			[...byVendor.keys()].find((k) => k.startsWith(filter));
		if (!match) return `🤝 Vendor "${tgEscape(filter)}" tidak ditemukan.`;
		byVendor = new Map([[match, byVendor.get(match) ?? []]]);
	}

	const all = [...byVendor.values()].flat();
	const totalNilai = all.reduce((s, r) => s + Number(r.grand_total ?? 0), 0);
	const totalKomisi = all.reduce(
		(s, r) => s + Number(r.vendor_commission_amount ?? 0),
		0,
	);
	const parts: string[] = [
		`🤝 <b>EVENT UPCOMING VIA VENDOR</b> — ${all.length} event dari ${byVendor.size} vendor`,
		`Total nilai ${rp(totalNilai)} · total komisi/potongan ${rp(totalKomisi)}`,
	];

	for (const [vendor, evs] of byVendor.entries()) {
		const komisi = evs.reduce(
			(s, r) => s + Number(r.vendor_commission_amount ?? 0),
			0,
		);
		const pic = evs.find((e) => e.vendor_pic_name);
		const picLabel = pic?.vendor_pic_name
			? ` · PIC ${tgEscape(pic.vendor_pic_name)}${pic.vendor_contact ? ` (${tgEscape(pic.vendor_contact)})` : ""}`
			: "";
		parts.push(
			`\n<b>${tgEscape(vendor)}</b> — ${evs.length} event${komisi > 0 ? ` · komisi ${rp(komisi)}` : ""}${picLabel}`,
		);
		for (const r of evs) {
			const days = daysUntil(todayISO, r.event_date);
			const hLabel = days === 0 ? "HARI INI" : `H-${days}`;
			const kota = r.venue_city ? ` · ${tgEscape(r.venue_city)}` : "";
			const cut =
				r.vendor_commission_mode === "upfront_cut" &&
				Number(r.vendor_commission_amount ?? 0) > 0
					? " · potongan langsung"
					: "";
			const lunas =
				Number(r.remaining_balance ?? 0) > 0
					? ` · sisa ${rp(Number(r.remaining_balance))}`
					: " · LUNAS";
			parts.push(
				`      • ${dateLabel(r.event_date)} (${hLabel}) — ${tgEscape(r.client_name)}${kota} · ${rp(Number(r.grand_total ?? 0))}${cut}${lunas}`,
			);
		}
	}
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (appUrl) parts.push(`\nDetail: ${appUrl}/finance/vendors`);
	return parts.join("\n");
}
