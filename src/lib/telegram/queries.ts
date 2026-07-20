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
	type CrewUser,
	crewDisplayName,
	dateLabel,
	daysUntil,
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

/** /crew — jadwal crew 7 hari ke depan per orang + fee belum dibayar. */
export async function buildCrewText(): Promise<string> {
	const admin = createAdminClient();
	const todayISO = isoDateUTC(wibNow());
	// FK hint WAJIB — crew_assignments punya 2 FK ke users (user_id & assigned_by).
	const { data, error } = await admin
		.from("crew_assignments")
		.select(
			`role_in_event, fee_amount, bonus_amount, is_paid,
			 user:users!crew_assignments_user_id_fkey(full_name, nickname),
			 event:events!inner(client_name, event_date, venue_city, status)`,
		)
		// Batas 45 hari ke belakang dihitung dari HARI WIB, sama seperti endISO
		// di bawah — jangan campur zona waktu di fungsi yang sama.
		.gte(
			"event.event_date",
			isoDateUTC(new Date(wibNow().getTime() - 45 * 86400000)),
		);
	if (error) throw new Error(`Fetch crew assignments: ${error.message}`);
	type Row = {
		role_in_event: string;
		fee_amount: number;
		bonus_amount: number;
		is_paid: boolean;
		user: CrewUser | Array<CrewUser> | null;
		event:
			| {
					client_name: string;
					event_date: string;
					venue_city: string | null;
					status: string;
			  }
			| Array<{
					client_name: string;
					event_date: string;
					venue_city: string | null;
					status: string;
			  }>
			| null;
	};
	const rows = ((data ?? []) as Row[])
		.map((r) => ({
			...r,
			u: Array.isArray(r.user) ? r.user[0] : r.user,
			ev: Array.isArray(r.event) ? r.event[0] : r.event,
		}))
		.filter((r) => r.u && r.ev && r.ev.status !== "cancelled");

	const ROLE: Record<string, string> = {
		lead: "Lead",
		asisten: "Asisten",
		crew_c: "Crew C",
	};

	// Jadwal 7 hari ke depan, dikelompokkan per orang
	const endISO = addDaysISO(todayISO, 7);
	const byPerson = new Map<string, string[]>();
	for (const r of rows) {
		const ev = r.ev;
		if (!ev || ev.event_date < todayISO || ev.event_date > endISO) continue;
		const name = crewDisplayName(r.u);
		const kota = ev.venue_city ? ` (${tgEscape(ev.venue_city)})` : "";
		const arr = byPerson.get(name) ?? [];
		arr.push(
			`${dateLabel(ev.event_date)}: ${tgEscape(ev.client_name)}${kota} · ${ROLE[r.role_in_event] ?? r.role_in_event}`,
		);
		byPerson.set(name, arr);
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

	const parts: string[] = ["👥 <b>CREW</b>"];
	if (byPerson.size === 0) {
		parts.push("\nTidak ada penugasan 7 hari ke depan.");
	} else {
		parts.push("\n<b>Jadwal 7 hari ke depan</b>");
		for (const [name, jobs] of byPerson.entries()) {
			parts.push(
				`• <b>${tgEscape(name)}</b>\n${jobs.map((j) => `      ${j}`).join("\n")}`,
			);
		}
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
