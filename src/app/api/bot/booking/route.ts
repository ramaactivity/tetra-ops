import { type NextRequest, NextResponse } from "next/server";
import {
	handleBotBooking,
	type InboxRow,
	type InboxStore,
} from "@/lib/booking-inbox/core";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/booking — bot WA mengirim booking yang sudah DP ke kotak
 * "Booking Masuk". Upsert idempoten per `external_id`; tidak pernah membuat
 * event atau mencatat pembayaran. Auth sama dengan /api/availability.
 * Logika & kontrak: src/lib/booking-inbox/core.ts.
 */
export async function POST(req: NextRequest) {
	const authorized = isAuthorizedBot(req);
	const json = authorized ? await req.json().catch(() => null) : null;

	const supabase = createAdminClient();
	const store: InboxStore = {
		async findByExternalId(externalId) {
			const { data, error } = await supabase
				.from("booking_inbox")
				.select("*")
				.eq("external_id", externalId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return (data as InboxRow | null) ?? null;
		},
		async insert(row) {
			const { data, error } = await supabase
				.from("booking_inbox")
				.insert(row)
				.select("*")
				.single();
			// Dua panggilan bot yang balapan: yang kalah membaca baris pemenang.
			if (error?.code === "23505") {
				const again = await store.findByExternalId(row.external_id);
				if (again) return again;
			}
			if (error) throw new Error(error.message);
			return data as InboxRow;
		},
		async update(id, patch) {
			const { data, error } = await supabase
				.from("booking_inbox")
				.update(patch)
				.eq("id", id)
				.select("*")
				.single();
			if (error) throw new Error(error.message);
			return data as InboxRow;
		},
	};

	try {
		const res = await handleBotBooking({
			authorized,
			json,
			store,
			appUrl: process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin,
		});
		return NextResponse.json(res.body, { status: res.status });
	} catch (e) {
		console.error("[api/bot/booking]", e);
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : "Gagal menyimpan" },
			{ status: 500 },
		);
	}
}
