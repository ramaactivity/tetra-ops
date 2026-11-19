import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { phoneTail } from "@/lib/portal/vendor-signup-core";
import {
	ALASAN_BERHENTI,
	type AlasanBerhenti,
	type BarisBerhenti,
	planBerhenti,
} from "@/lib/prospek";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
	nomor: z.string().min(9).max(40),
	alasan: z.enum(
		Object.keys(ALASAN_BERHENTI) as [AlasanBerhenti, ...AlasanBerhenti[]],
	),
	catatan: z
		.string()
		.trim()
		.max(500)
		.nullish()
		.transform((v) => v || null),
});

/**
 * POST /api/bot/prospek/berhenti {nomor, alasan, catatan} — bot menandai
 * prospek berhenti (Rama 19 Nov: 3x tak dibalas → jangan di-follow-up lagi).
 * Semua baris prospek bernomor sama (9 digit akhir). Idempoten; tolak /
 * jangan_hubungi tidak diturunkan. Tidak ada baris = ditemukan 0 (tidak dibuat).
 */
export async function POST(req: NextRequest) {
	if (!isAuthorizedBot(req))
		return NextResponse.json(
			{ ok: false, error: "unauthorized" },
			{ status: 401 },
		);
	const parsed = Body.safeParse(await req.json().catch(() => null));
	if (!parsed.success)
		return NextResponse.json(
			{ ok: false, error: "Body tidak valid", issues: parsed.error.issues },
			{ status: 400 },
		);
	const { nomor, alasan, catatan } = parsed.data;
	const tail = phoneTail(nomor);
	if (tail.length !== 9)
		return NextResponse.json(
			{ ok: false, error: "nomor_tidak_valid" },
			{ status: 400 },
		);
	try {
		const admin = createAdminClient();
		// ponytail: semua prospek bertelepon dimuat lalu dicocokkan 9 digit di sini
		// (format telepon bebas, ada spasi/strip); pindah ke kolom digit terindeks
		// kalau prospek sudah puluhan ribu.
		const all = await fetchAllRows<BarisBerhenti & { telepon: string }>(
			(from, to) =>
				admin
					.from("prospek")
					.select("id, nama, status, alasan_berhenti, catatan, telepon")
					.not("telepon", "is", null)
					.order("id")
					.range(from, to),
			"prospek berhenti",
		);
		const rows = all.filter((r) => phoneTail(r.telepon) === tail);
		const now = new Date();
		const tanggal = new Date(now.getTime() + 7 * 3600_000)
			.toISOString()
			.slice(0, 10);
		const plan = planBerhenti(rows, alasan, catatan, tanggal);
		for (const u of plan.ubah) {
			const { error } = await admin
				.from("prospek")
				.update({
					...u.patch,
					berhenti_at: now.toISOString(),
					updated_at: now.toISOString(),
				})
				.eq("id", u.id);
			if (error) throw new Error(error.message);
		}
		return NextResponse.json({
			ok: true,
			ditemukan: rows.length,
			diubah: plan.ubah.map((u) => ({ id: u.id, nama: u.nama })),
			tetap: plan.tetap,
		});
	} catch (e) {
		console.error("[api/bot/prospek/berhenti]", e);
		return NextResponse.json({ ok: false, error: "gagal" }, { status: 500 });
	}
}
