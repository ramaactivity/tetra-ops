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

	// ── Ambil booking di tanggal itu ──────────────────────────────────────────
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("events")
		.select(
			"client_name, start_time, end_time, venue_city, status, package:packages(duration_hours)",
		)
		.eq("event_date", date)
		.is("deleted_at", null);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	type Row = {
		client_name: string | null;
		start_time: string | null;
		end_time: string | null;
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
			venue_city: r.venue_city,
			package_duration_hours: r.package?.duration_hours ?? null,
		}));

	const result = computeAvailability({ reqStart, reqEnd, reqCity: city, events });

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
