/**
 * datafix_frame_pending_20260808.mjs
 *
 * Membereskan warisan dari kejadian 8 Agustus 2026: event yang menyimpan paket
 * BER-UKURAN (mis. "2R Unlimited 2 Jam") sementara frame size-nya masih NULL.
 * Kombinasi itu yang bikin owner, crew, dan desainer membaca ukuran berbeda —
 * sekarang dilarang sistem (lihat lib/events/frame-package.ts).
 *
 * Yang dilakukan: paket dilepas, DURASI-nya disimpan di pending_package_hours,
 * nama tampilannya jadi "<Service> N Jam · ukuran menyusul". Harga TIDAK
 * berubah — di pricelist, 2R/4R/Polaroid dengan durasi sama harganya identik.
 *
 * Cakupan sengaja dibatasi ke event yang BELUM berjalan (event_date > hari ini):
 * event yang sudah/sedang jalan tetap apa adanya karena package_id-nya sudah
 * dipakai rekap, settlement, dan benchmark HPP.
 *
 * Jalankan: node --env-file=.env.local scripts/datafix_frame_pending_20260808.mjs [--apply]
 * Tanpa --apply = dry run.
 */

import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("❌ Env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum ada");
	process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const SERVICE_LABEL = {
	photobooth_classic: "Photobooth Classic",
	videobooth_360: "Videobooth 360",
	magazine_combo: "Magazine Combo",
	magazine_box_only: "Magazine Box",
	photostage_only: "Photostage",
	photostage_combo: "Photostage Combo",
};

const today = new Date().toISOString().slice(0, 10);

const { data, error } = await sb
	.from("events")
	.select(
		"id, project_id, client_name, event_date, status, service_type, frame_size, base_price, package:packages(id, name, frame_size, duration_hours, base_price)",
	)
	.is("deleted_at", null)
	.eq("is_migrated_legacy", false)
	.in("status", ["upcoming", "in_progress"])
	.gt("event_date", today)
	.is("frame_size", null)
	.not("package_id", "is", null);
if (error) throw error;

const targets = (data ?? []).filter(
	(e) => e.package && e.package.frame_size !== "none",
);

if (targets.length === 0) {
	console.log("✅ Tidak ada event yang perlu dibereskan.");
	process.exit(0);
}

for (const ev of targets) {
	const label = `${SERVICE_LABEL[ev.service_type] ?? ev.service_type} ${ev.package.duration_hours} Jam · ukuran menyusul`;
	console.log(
		`${apply ? "→" : "[dry]"} ${ev.event_date} ${ev.client_name}: "${ev.package.name}" (${ev.package.frame_size}) → "${label}"`,
	);
	if (!apply) continue;
	const { error: upErr } = await sb
		.from("events")
		.update({
			package_id: null,
			pending_package_hours: ev.package.duration_hours,
			custom_package_name: label,
			custom_package_price: ev.base_price,
			updated_at: new Date().toISOString(),
		})
		.eq("id", ev.id);
	if (upErr) console.error(`   ❌ ${upErr.message}`);
}

console.log(
	apply
		? `\n✅ ${targets.length} event dibereskan.`
		: `\n${targets.length} event akan dibereskan. Jalankan ulang dengan --apply.`,
);
