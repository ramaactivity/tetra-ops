import { type NextRequest, NextResponse } from "next/server";
import {
	type AvailabilityEvent,
	computeAvailability,
	formatHHMM,
	parseHHMM,
} from "@/lib/availability";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/availability?date=YYYY-MM-DD&start=HH:mm&end=HH:mm[&city=...]
 *
 * Dipanggil WA Bot (Bearer token) untuk cek apakah masih ada unit photobooth
 * kosong di window yang diminta. Read-only. Logika + buffer ada di
 * src/lib/availability.ts. Lihat WHATSAPP_BOT_AVAILABILITY_HANDOVER.md.
 *
 * Status yang MENGUNCI unit: semua kecuali `cancelled` & `archived`
 * (termasuk `draft` — Keputusan #1 tim bot). Soft-deleted selalu dibuang.
 */

// Status yang TIDAK menahan unit (booking batal / arsip historis).
const NON_LOCKING_STATUSES = new Set(["cancelled", "archived"]);

export async function GET(req: NextRequest) {
	if (!isAuthorizedBot(req)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const sp = req.nextUrl.searchParams;
	const date = sp.get("date")?.trim() ?? "";
	const startRaw = sp.get("start")?.trim() ?? "";
	const endRaw = sp.get("end")?.trim() ?? "";
	const city = sp.get("city")?.trim() || null;

	// ── Validasi input ───────────────────────────────────────────────────────
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return NextResponse.json(
			{ error: "Param `date` wajib, format YYYY-MM-DD." },
			{ status: 400 },
		);
	}
	const reqStart = parseHHMM(startRaw);
	const reqEnd = parseHHMM(endRaw);
	if (reqStart === null || reqEnd === null) {
		return NextResponse.json(
			{ error: "Param `start` & `end` wajib, format HH:mm." },
			{ status: 400 },
		);
	}
	if (reqEnd <= reqStart) {
		return NextResponse.json(
			{ error: "`end` harus setelah `start`." },
			{ status: 400 },
		);
	}

	// ── Ambil booking tanggal itu DAN H-1 ─────────────────────────────────────
	// H-1 ikut dimuat karena buffer melebarkan window 3-4 jam: event 19:00-23:30
	// di luar kota baru benar-benar melepas unit sekitar 03:30 keesokan harinya.
	// Sebelumnya query hanya `.eq("event_date", date)`, jadi permintaan dini hari
	// dilaporkan bebas padahal unitnya masih tertahan.
	const prevDate = (() => {
		const d = new Date(`${date}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - 1);
		return d.toISOString().slice(0, 10);
	})();

	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("events")
		.select(
			"event_date, client_name, start_time, end_time, session_segments, venue_city, status, package:packages(duration_hours)",
		)
		.in("event_date", [prevDate, date])
		.is("deleted_at", null);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	type Row = {
		event_date: string;
		client_name: string | null;
		start_time: string | null;
		end_time: string | null;
		session_segments: unknown;
		venue_city: string | null;
		status: string | null;
		// to-one embed → object (atau null), bukan array.
		package: { duration_hours: number | null } | null;
	};

	// PostgREST infers the to-one `package` embed as an array in TS, but a forward
	// FK returns an OBJECT at runtime (see reference_postgrest_to_one_embed) — so
	// cast through `unknown`.
	const events: AvailabilityEvent[] = ((data ?? []) as unknown as Row[])
		.filter((r) => !NON_LOCKING_STATUSES.has(r.status ?? ""))
		.map((r) => ({
			client_name: r.client_name,
			start_time: r.start_time,
			end_time: r.end_time,
			session_segments: r.session_segments,
			venue_city: r.venue_city,
			package_duration_hours: r.package?.duration_hours ?? null,
			// Event H-1 digeser ke kerangka waktu tanggal yang diminta, supaya
			// ekor buffer-nya yang melewati tengah malam tetap terhitung.
			day_offset_min: r.event_date === prevDate ? -1440 : 0,
		}));

	const result = computeAvailability({
		reqStart,
		reqEnd,
		reqCity: city,
		events,
	});

	return NextResponse.json({
		date,
		window: `${formatHHMM(reqStart)}-${formatHHMM(reqEnd)}`,
		units_total: result.units_total,
		units_free: result.units_free,
		available: result.available,
		conflicts: result.conflicts.map((c) => ({
			project: c.project,
			time: c.time,
			city: c.city,
			buffer_min: c.buffer_min,
		})),
		buffer_applied_minutes: result.buffer_applied_minutes,
		assumptions: result.assumptions,
	});
}
