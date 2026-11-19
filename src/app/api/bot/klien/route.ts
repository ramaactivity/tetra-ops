import { type NextRequest, NextResponse } from "next/server";
import { loadDataKlien } from "@/lib/booking-inbox/client-docs";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { type EventTagihan, tagihanEvent } from "@/lib/finance/tagihan";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_BAYAR: Record<string, string> = { paid: "lunas", unpaid: "belum" };

/**
 * GET /api/bot/klien?wa=<digit> — data klien dari quotation/invoice + Booking
 * Masuk, untuk bot mengisi form booking sebelum dikirim (konsultasi Hermes
 * t_8843a9c1). Kunci sama dengan kontrak POST /api/bot/quotation; TANPA
 * nominal uang. Bentuk: src/lib/booking-inbox/klien-data.ts (DataKlien).
 */
export async function GET(req: NextRequest) {
	if (!isAuthorizedBot(req))
		return NextResponse.json(
			{ ok: false, error: "unauthorized" },
			{ status: 401 },
		);
	const wa = req.nextUrl.searchParams.get("wa") ?? "";
	if (phoneTail(wa).length !== 9)
		return NextResponse.json(
			{ ok: false, error: "nomor_tidak_valid" },
			{ status: 400 },
		);
	try {
		const data = await loadDataKlien(createAdminClient(), { wa });
		return NextResponse.json({ ok: true, ...data });
	} catch (e) {
		console.error("[api/bot/klien GET]", e);
		return NextResponse.json({ ok: false, error: "gagal" }, { status: 500 });
	}
}

function tagihanBot(e: EventTagihan) {
	const { billable: total, terbayar, sisa } = tagihanEvent(e);
	if (total <= 0) return null;
	const status = sisa <= 0 ? "lunas" : terbayar > 0 ? "dp" : "belum";
	return { total, terbayar, sisa, status };
}

/**
 * POST /api/bot/klien {phone} — bot WA mengecek apakah lawan bicara sudah
 * punya booking (DR-052). Nomor dicocokkan 9 digit terakhir dengan
 * client_wa / pic_wa event, aturan yang sama dengan KPI konversi (DR-051).
 * Hanya acara hari ini & mendatang yang tidak dibatalkan. `tagihan` (total,
 * terbayar, sisa — rumus checkPayment) supaya bot tidak menebak pelunasan
 * (audit Hermes t_2557c8f2, Syifa 19 Nov); null untuk acara lewat vendor
 * (harga klien akhir = harga vendor, bukan tagihan Tetra) dan event tanpa harga.
 * Kontrak: docs/06_API_SPEC.md §21.
 */
export async function POST(req: NextRequest) {
	if (!isAuthorizedBot(req))
		return NextResponse.json(
			{ ok: false, error: "unauthorized" },
			{ status: 401 },
		);
	const body = (await req.json().catch(() => null)) as {
		phone?: unknown;
	} | null;
	const tail = phoneTail(String(body?.phone ?? ""));
	if (tail.length !== 9)
		return NextResponse.json(
			{ ok: false, error: "nomor_tidak_valid" },
			{ status: 400 },
		);
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
	// ponytail: semua acara mendatang dimuat lalu disaring di sini (puluhan baris);
	// pindah ke RPC berindeks kalau acara mendatang sudah ribuan.
	const { data, error } = await createAdminClient()
		.from("events")
		.select(
			"client_name, client_wa, pic_wa, event_date, start_time, end_time, venue_name, venue_city, status, payment_status, channel, grand_total, total_paid, vendor_commission_mode, vendor_commission_amount, package:packages(name)",
		)
		.is("deleted_at", null)
		.eq("is_demo", false)
		.neq("status", "cancelled")
		.gte("event_date", today)
		.order("event_date");
	if (error)
		return NextResponse.json({ ok: false, error: "gagal" }, { status: 500 });
	const booking = (data ?? [])
		.filter((e) => [e.client_wa, e.pic_wa].some((n) => phoneTail(n) === tail))
		.map((e) => ({
			tanggal: e.event_date,
			jam_mulai: e.start_time?.slice(0, 5) ?? null,
			jam_selesai: e.end_time?.slice(0, 5) ?? null,
			paket: (e.package as { name?: string } | null)?.name ?? null,
			venue: [e.venue_name, e.venue_city].filter(Boolean).join(", ") || null,
			nama_acara: e.client_name,
			status_bayar: STATUS_BAYAR[e.payment_status] ?? "dp",
			lewat_vendor: e.channel === "vendor",
			tagihan: e.channel === "vendor" ? null : tagihanBot(e),
		}));
	return NextResponse.json({ ok: true, booking });
}
