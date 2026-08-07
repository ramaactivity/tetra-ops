/**
 * merge-unit-alat-7agu.mjs — jadikan alat yang baru didaftarkan sebagai UNIT
 * KE-N dari model yang sudah ada, plus tambah Monitor unit ke-3.
 *
 * Owner konfirmasi barangnya memang sama dengan yang sudah terdaftar. Modul
 * Asset Register mengelompokkan unit berdasarkan NAMA (normalizeModelName),
 * jadi kunci penggabungan = menyamakan nama. SKU ikut disesuaikan ke pola
 * <base>-<N> supaya konsisten dengan konvensi yang dipakai EQ-MONITOR-2 dst.
 *
 * TIDAK menyentuh pembukuan sama sekali — ini murni penataan daftar barang.
 * Jurnal pembeliannya sudah ada & tidak berubah.
 *
 * Aman diulang: yang SKU-nya sudah sesuai target akan dilewati.
 *
 * Jalankan: node scripts/merge-unit-alat-7agu.mjs
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

/** skuLama → { skuBaru, namaModel } */
const MERGE = [
	{ from: "AST-ALBUM-FOTO", to: "EQ-953916-2", name: "Album Foto" },
	{ from: "AST-MONITOR-BRACKET", to: "EQ-138962-2", name: "Bracket Monitor" },
	{ from: "AST-PAYUNG", to: "EQ-PAYUNG-2", name: "Payung" },
	{ from: "AST-PAYUNG-2", to: "EQ-PAYUNG-3", name: "Payung" },
	{ from: "AST-KEPALA-CHARGER", to: "EQ-CHARGER-UGREEN-2", name: "Kepala Charger Ugreen" },
	{ from: "AST-MONITOR-SLEEVE", to: "EQ-860778-2", name: "Sleeve Bag Monitor" },
	// Ketahuan saat verifikasi: USB Hub sudah terdaftar (EQ-986009) — tidak
	// terlihat di pemeriksaan awal karena daftarnya terpotong.
	{ from: "AST-USB-HUB", to: "EQ-986009-2", name: "USB Hub" },
];

let diubah = 0;
for (const m of MERGE) {
	const { data: item } = await sb
		.from("inventory_items")
		.select("id,sku,name")
		.eq("sku", m.from)
		.maybeSingle();
	if (!item) {
		console.log(`  lewati (tidak ada / sudah diubah): ${m.from}`);
		continue;
	}
	const { error: e1 } = await sb
		.from("inventory_items")
		.update({ sku: m.to, name: m.name })
		.eq("id", item.id);
	if (e1) {
		console.error(`  GAGAL ${m.from}: ${e1.message}`);
		continue;
	}
	await sb
		.from("items_fixed_asset_config")
		.update({ asset_number: m.to })
		.eq("item_id", item.id);
	console.log(`  ${m.from.padEnd(26)} → ${m.to.padEnd(22)} "${m.name}"`);
	diubah++;
}

// Monitor unit ke-3 — owner konfirmasi fisiknya ada 3, di daftar baru 2.
// TANPA jurnal: unit lama (EQ-MONITOR, 1 Jan 2026) pun tidak punya jurnal
// pembelian karena nilainya sudah tercakup di saldo awal cutoff. Harga
// perolehan dikosongkan supaya tidak mengarang angka.
const { data: mon3 } = await sb
	.from("inventory_items")
	.select("id")
	.eq("sku", "EQ-MONITOR-3")
	.maybeSingle();
if (mon3) {
	console.log("  lewati: EQ-MONITOR-3 sudah ada");
} else {
	const { data: item, error } = await sb
		.from("inventory_items")
		.insert({
			sku: "EQ-MONITOR-3",
			name: "Monitor",
			category: "fixed_asset",
			unit: "unit",
			is_active: true,
			notes:
				"Unit ke-3 didaftarkan 7 Agu 2026 atas konfirmasi owner (fisiknya ada 3, di daftar baru 2). TIDAK dijurnal: tidak ada catatan pembelian terpisah untuk unit ini — nilainya diasumsikan sudah tercakup di saldo awal pembukuan, sama seperti unit pertama. Harga perolehan belum diisi.",
		})
		.select("id")
		.single();
	if (error) {
		console.error("  GAGAL buat EQ-MONITOR-3:", error.message);
	} else {
		await sb.from("items_fixed_asset_config").insert({
			item_id: item.id,
			asset_number: "EQ-MONITOR-3",
			acquisition_type: "new_commercial",
			purchase_price: 0,
			purchase_date: null,
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
		console.log("  + EQ-MONITOR-3              Monitor (unit ke-3, tanpa jurnal)");
		diubah++;
	}
}

console.log(`\n${diubah} perubahan diterapkan.`);

// Pastikan pembukuan tidak tersentuh.
const { data: lines } = await sb.from("journal_lines").select("debit_amount,credit_amount");
let D = 0, C = 0;
for (const l of lines) { D += Number(l.debit_amount || 0); C += Number(l.credit_amount || 0); }
const rp = (n) => "Rp" + Math.round(n).toLocaleString("id-ID");
console.log(`Buku besar: ${rp(D)} = ${rp(C)} ${D === C ? "✅ seimbang (tidak tersentuh)" : "❌"}`);
