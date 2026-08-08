/**
 * datafix_hidayat_uci_4r_20260808.mjs
 *
 * Event 8 Agu 2026 "Hidayat & Uci" (PRJ-20260808-2643) tercatat frame size NULL
 * dengan paket "2R Unlimited 2 Jam". Klien sebenarnya pesan 4R — inilah
 * miskomunikasi yang memicu seluruh perbaikan frame↔paket.
 *
 * Perbaikan: frame_size = '4R', paket → "4R Unlimited 2 Jam".
 * Harga TIDAK berubah (2R dan 4R durasi 2 jam sama-sama Rp2.000.000), jadi
 * grand_total, DP, komisi vendor, dan piutang tidak tersentuh.
 *
 * crew_rekap.frame_size_snapshot dibiarkan NULL: planner memang jatuh ke
 * event.frame_size saat snapshot kosong, jadi rekap yang sudah di-submit
 * otomatis memakai 4R saat di-approve nanti (media + sleeve 4R).
 *
 * Jalankan: node --env-file=.env.local scripts/datafix_hidayat_uci_4r_20260808.mjs [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
	{ auth: { persistSession: false } },
);

const PROJECT_ID = "PRJ-20260808-2643";
const TARGET_FRAME = "4R";

const { data: ev, error } = await sb
	.from("events")
	.select(
		"id, project_id, client_name, service_type, frame_size, package_id, base_price, grand_total, total_paid, remaining_balance, package:packages(name, frame_size, duration_hours, base_price)",
	)
	.eq("project_id", PROJECT_ID)
	.maybeSingle();
if (error) throw error;
if (!ev) throw new Error(`Event ${PROJECT_ID} tidak ditemukan`);

const hours = ev.package?.duration_hours ?? 2;
const { data: target, error: pkgErr } = await sb
	.from("packages")
	.select("id, name, base_price")
	.eq("category", ev.service_type)
	.eq("duration_hours", hours)
	.eq("frame_size", TARGET_FRAME)
	.eq("is_active", true)
	.is("deleted_at", null)
	.maybeSingle();
if (pkgErr) throw pkgErr;
if (!target) throw new Error(`Paket ${TARGET_FRAME} ${hours} jam tidak ada di pricelist`);

console.log(`${ev.client_name} (${ev.project_id})`);
console.log(`  frame : ${ev.frame_size ?? "menyusul"} → ${TARGET_FRAME}`);
console.log(`  paket : ${ev.package?.name ?? "-"} → ${target.name}`);
console.log(
	`  harga : Rp${Number(ev.base_price).toLocaleString("id-ID")} → Rp${Number(target.base_price).toLocaleString("id-ID")}`,
);

if (Number(target.base_price) !== Number(ev.base_price)) {
	console.log(
		"  ⚠ harga paket berbeda — skrip ini sengaja TIDAK mengubah nominal. Sesuaikan manual lewat Edit Event kalau memang harus berubah.",
	);
}

if (!apply) {
	console.log("\n[dry run] jalankan ulang dengan --apply untuk menyimpan.");
	process.exit(0);
}

const { error: upErr } = await sb
	.from("events")
	.update({
		frame_size: TARGET_FRAME,
		package_id: target.id,
		pending_package_hours: null,
		updated_at: new Date().toISOString(),
	})
	.eq("id", ev.id);
if (upErr) throw upErr;

console.log("\n✅ Tersimpan. Nominal tidak berubah.");
