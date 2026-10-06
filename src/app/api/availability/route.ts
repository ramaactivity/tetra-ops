import { type NextRequest, NextResponse } from "next/server";
import { formatHHMM, parseHHMM } from "@/lib/availability";
import { loadAvailability } from "@/lib/availability-load";
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
 * Apa saja yang menahan unit: lihat src/lib/availability-load.ts.
 */

export async function GET(req: NextRequest) {
	if (!isAuthorizedBot(req)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const sp = req.nextUrl.searchParams;
	const date = sp.get("date")?.trim() ?? "";
	const startRaw = sp.get("start")?.trim() ?? "";
	const endRaw = sp.get("end")?.trim() ?? "";
	const city = sp.get("city")?.trim() || null;
	// Event multi-unit: berapa booth yang diminta klien (default 1, maks 3).
	const unitsRaw = sp.get("units")?.trim() || "1";
	const units = Number(unitsRaw);
	if (!Number.isInteger(units) || units < 1 || units > 3) {
		return NextResponse.json(
			{ error: "Param `units` harus 1–3." },
			{ status: 400 },
		);
	}

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

	let result: Awaited<ReturnType<typeof loadAvailability>>;
	try {
		result = await loadAvailability(createAdminClient(), {
			date,
			reqStart,
			reqEnd,
			city,
		});
	} catch (e) {
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : String(e) },
			{ status: 500 },
		);
	}

	return NextResponse.json({
		date,
		window: `${formatHHMM(reqStart)}-${formatHHMM(reqEnd)}`,
		units_total: result.units_total,
		units_free: result.units_free,
		units_requested: units,
		// Cukup untuk SEMUA unit yang diminta, bukan sekadar ada 1 yang kosong.
		available: result.units_free >= units,
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
