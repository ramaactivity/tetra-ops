/**
 * register-alat-7agu.mjs — daftarkan barang yang dibeli 7 Agu 2026 lewat
 * "Catat transaksi" ke daftar aset, TANPA jurnal baru.
 *
 * Kenapa perlu: 20 pembelian itu masuk pembukuan dengan benar (Dr 5-250 Beban
 * Perlengkapan / Cr BCA) tapi barangnya sendiri tidak terdaftar di Warehouse,
 * jadi tidak muncul di Inventaris maupun Cek Alat. Uangnya sudah tercatat —
 * membuat jurnal lagi = dobel beban. Jadi skrip ini HANYA mendaftarkan barang.
 *
 * Konvensi mengikuti daftar aset yang sudah ada: barang kecil pun didaftarkan
 * (Baut Monitor, Bulldog Klip, dst). Semua di bawah batas kapitalisasi Rp1,5jt
 * → is_capitalized=false, depreciation_method='none' (tidak disusutkan), sama
 * seperti perlakuan aset kecil lain.
 *
 * Nama diambil dari deskripsi pembeliannya, TIDAK digabungkan ke model yang
 * sudah ada — menggabung salah lebih sulit dibetulkan daripada menggabung
 * belakangan. Yang mirip model lama dilaporkan supaya owner bisa memutuskan.
 *
 * Aman diulang: item yang notes-nya sudah menyebut ref jurnal yang sama akan
 * dilewati.
 *
 * Jalankan: node --env-file=.env.local scripts/register-alat-7agu.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
	readFileSync(new URL("../.env.local", import.meta.url), "utf8")
		.split("\n")
		.filter((l) => l.includes("=") && !l.trim().startsWith("#"))
		.map((l) => {
			const i = l.indexOf("=");
			return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
		}),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});
const rp = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

// deskripsi jurnal → { nama alat, berapa unit }. Barang yang bukan alat
// (asuransi) sengaja tidak didaftarkan.
const MAP = {
	"Beli Lightstand dan trigger": { name: "Lightstand & Trigger", units: 1 },
	"Beli Tas Laptop": { name: "Tas Laptop", units: 1 },
	"Beli kepala charger": { name: "Kepala Charger", units: 1 },
	"Beli magic arm ulanzi": { name: "Magic Arm Ulanzi", units: 1 },
	"Beli kabel type c to type c monitor": { name: "Kabel Type-C ke Monitor", units: 1 },
	"Beli Usb Hub": { name: "USB Hub", units: 1 },
	"Beli terminal stop kontak 2": { name: "Terminal Stop Kontak", units: 1 },
	"Beli tas tripod kecil": { name: "Tas Tripod Kecil", units: 1 },
	"Beli dua payung tambahan": { name: "Payung", units: 2 },
	"Beli payung sama U clamp monitor": { name: "Payung & U-Clamp Monitor", units: 1 },
	"Beli set obeng": { name: "Set Obeng", units: 1 },
	"Beli Album Foto": { name: "Album Foto", units: 1 },
	"Beli kacamata": { name: "Kacamata", units: 1 },
	"Beli Type C extender": { name: "Type-C Extender", units: 1 },
	"Beli kabel sub kamera to laptop": { name: "Kabel Sub Kamera ke Laptop", units: 1 },
	"Beli sleeve monitor": { name: "Sleeve Monitor", units: 1 },
	"Beli bracket monitor": { name: "Bracket Monitor", units: 1 },
	"Beli Baut": { name: "Baut", units: 1 },
	"Beli kotak baut": { name: "Kotak Baut", units: 1 },
};

const STOP = new Set(["dan", "atau", "yang", "untuk", "dari", "ke", "di", "&"]);
const HINTS = [
	[/\b(camera|kamera|canon)\b/i, "AST-CAM"],
	[/\b(lens|lensa)\b/i, "AST-LENS"],
	[/\b(printer|dnp)\b/i, "AST-PRINTER"],
	[/\b(light|lighting|godox|flash|strobe)\b/i, "AST-LIGHT"],
	[/\b(tripod|monopod|stand)\b/i, "AST-STAND"],
	[/\b(backdrop|background)\b/i, "AST-BACKDROP"],
	[/\b(laptop|computer|pc)\b/i, "AST-PC"],
	[/\b(monitor|display|tv)\b/i, "AST-MONITOR"],
	[/\b(kabel|cable)\b/i, "AST-CABLE"],
];
function slugify(text, max = 4) {
	const cleaned = text.toUpperCase().replace(/[^A-Z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
	const seg = cleaned.split(/[\s-]+/).filter(Boolean).filter((s) => !STOP.has(s.toLowerCase())).slice(0, max);
	return seg.length ? seg.join("-") : "ITEM";
}
function skuFor(name) {
	for (const [pat, prefix] of HINTS) {
		if (pat.test(name)) {
			const rest = name.replace(pat, "").trim();
			const slug = rest ? slugify(rest, 4) : "";
			return slug ? `${prefix}-${slug}` : prefix;
		}
	}
	return `AST-${slugify(name, 4)}`;
}

async function uniqueSku(base) {
	for (let i = 1; i <= 99; i++) {
		const candidate = i === 1 ? base : `${base}-${i}`;
		const { data } = await sb.from("inventory_items").select("id").eq("sku", candidate).maybeSingle();
		if (!data) return candidate;
	}
	throw new Error(`SKU ${base} tidak bisa dibuat unik`);
}

const { data: entries } = await sb
	.from("journal_entries")
	.select("id,ref_id,description,total_amount,entry_date")
	.gte("created_at", "2026-08-07T00:00:00Z")
	.eq("source_type", "manual");

let dibuat = 0;
let dilewati = 0;
let totalNilai = 0;
for (const e of entries ?? []) {
	const m = MAP[e.description];
	if (!m) continue;

	const { data: sudah } = await sb
		.from("inventory_items")
		.select("id")
		.ilike("notes", `%${e.ref_id}%`)
		.limit(1);
	if (sudah?.length) {
		console.log(`  lewati (sudah terdaftar): ${e.description}`);
		dilewati++;
		continue;
	}

	const perUnit = Math.round(Number(e.total_amount) / m.units);
	for (let u = 0; u < m.units; u++) {
		const sku = await uniqueSku(skuFor(m.name));
		const { data: item, error: itemErr } = await sb
			.from("inventory_items")
			.insert({
				sku,
				name: m.name,
				category: "fixed_asset",
				unit: "unit",
				is_active: true,
				notes: `Dibeli ${e.entry_date} — sudah dibebankan ke Beban Perlengkapan lewat ${e.ref_id}. Didaftarkan menyusul agar masuk Cek Alat; TIDAK dijurnal ulang.`,
			})
			.select("id")
			.single();
		if (itemErr || !item) {
			console.error(`  GAGAL ${m.name}: ${itemErr?.message}`);
			continue;
		}
		const { error: cfgErr } = await sb.from("items_fixed_asset_config").insert({
			item_id: item.id,
			asset_number: sku,
			acquisition_type: "new_commercial",
			purchase_price: perUnit,
			purchase_date: e.entry_date,
			salvage_value: 0,
			useful_life_months: null,
			depreciation_method: "none",
			is_capitalized: false,
			condition: "normal",
			current_location: "gudang_pusat",
			coa_account_asset: "1-400",
			coa_account_accum_depr: "1-401",
			coa_account_depr_expense: "5-500",
		});
		if (cfgErr) {
			await sb.from("inventory_items").delete().eq("id", item.id);
			console.error(`  GAGAL config ${m.name}: ${cfgErr.message}`);
			continue;
		}
		console.log(`  + ${sku.padEnd(26)} ${m.name.padEnd(28)} ${rp(perUnit)}`);
		dibuat++;
		totalNilai += perUnit;
	}
}
console.log(`\nDibuat ${dibuat} unit alat · nilai ${rp(totalNilai)} · dilewati ${dilewati}`);

// Pastikan tidak ada jurbal baru yang ikut lahir.
const { data: lines } = await sb.from("journal_lines").select("debit_amount,credit_amount");
let D = 0, C = 0;
for (const l of lines) { D += Number(l.debit_amount || 0); C += Number(l.credit_amount || 0); }
console.log(`Buku besar: ${rp(D)} = ${rp(C)} ${D === C ? "✅ seimbang" : "❌"}`);
