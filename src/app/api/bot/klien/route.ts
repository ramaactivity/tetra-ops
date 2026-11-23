import { type NextRequest, NextResponse } from "next/server";
import { loadDataKlien } from "@/lib/booking-inbox/client-docs";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { cocokNomor } from "@/lib/events/penerima";
import { listMissingFields } from "@/lib/events/tbc";
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
 * `kurang` = listMissingFields (urutan "paling menghambat lapangan dulu", sama
 * dengan banner owner & crew) + `event_id`, untuk tombol "Minta data ke klien"
 * (konsultasi Hermes t_49b6d8e5).
 * `{event_id}` (tanpa phone) = satu acara itu saja: tombol "Minta data" bisa
 * dikirim ke WO/EO/pemesan yang nomornya bukan client_wa/pic_wa event.
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
		event_id?: unknown;
	} | null;
	const eventId = typeof body?.event_id === "string" ? body.event_id : null;
	const tail = phoneTail(String(body?.phone ?? ""));
	if (!eventId && tail.length !== 9)
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
			"id, client_name, client_wa, pic_wa, event_date, start_time, end_time, venue_name, venue_city, status, payment_status, channel, grand_total, total_paid, vendor_commission_mode, vendor_commission_amount, event_date_is_estimate, frame_size, backdrop_id, pic_name, pic_contact_id, pending_package_hours, unit_count, spots, vendor_contact, extra_pics, booker_contact:contacts!events_booker_contact_id_fkey(phone), pic_contact:contacts!events_pic_contact_id_fkey(phone), package:packages(name, frame_size, category)",
		)
		.is("deleted_at", null)
		.eq("is_demo", false)
		.neq("status", "cancelled")
		.gte("event_date", today)
		.order("event_date");
	if (error)
		return NextResponse.json({ ok: false, error: "gagal" }, { status: 500 });
	const booking = (data ?? [])
		.map((e) => ({
			...e,
			cocok: eventId
				? null
				: cocokNomor(e as Parameters<typeof cocokNomor>[0], tail),
		}))
		.filter((e) => (eventId ? e.id === eventId : e.cocok !== null))
		.map((e) => {
			const pkg = (Array.isArray(e.package) ? e.package[0] : e.package) as {
				name?: string;
				frame_size?: string | null;
				category?: string | null;
			} | null;
			return {
				event_id: e.id,
				// Nomor cocok sebagai apa (audit Hermes t_288da914): vendor | client_wa | pic_wa | pemesan | extra_pic.
				matched_by: e.cocok,
				tanggal: e.event_date,
				jam_mulai: e.start_time?.slice(0, 5) ?? null,
				jam_selesai: e.end_time?.slice(0, 5) ?? null,
				paket: pkg?.name ?? null,
				venue: [e.venue_name, e.venue_city].filter(Boolean).join(", ") || null,
				nama_acara: e.client_name,
				status_bayar: STATUS_BAYAR[e.payment_status] ?? "dp",
				lewat_vendor: e.channel === "vendor",
				tagihan:
					e.channel === "vendor" || e.cocok === "vendor" ? null : tagihanBot(e),
				kurang: listMissingFields({
					...e,
					package_frame_size: pkg?.frame_size ?? null,
					package_category: pkg?.category ?? null,
				}),
			};
		});
	return NextResponse.json({ ok: true, booking });
}
