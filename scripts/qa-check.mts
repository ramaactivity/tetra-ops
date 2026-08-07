/**
 * QA — periksa & bersihkan data uji dari modul "Tambah Item".
 *
 * Data uji SELALU dinamai dengan awalan "ZZ TEST" (lihat TEST_PREFIX). Skrip
 * ini menolak menghapus apa pun yang namanya tidak berawalan itu — pagar
 * supaya perintah bersih-bersih tidak bisa menyentuh data asli.
 *
 * Jejak yang ditinggalkan satu pembelian:
 *   - inventory_items + items_fixed_asset_config (satu baris per unit)
 *   - journal_entries (source_type = "purchase") + journal_lines
 *   - stock_movements — HANYA untuk persediaan; aset tetap tidak menggerakkan
 *     stok, jadi kosong itu normal
 * Tidak ada tabel "purchases"/"purchase_lines" di aplikasi ini; nota pembelian
 * hidup sebagai jurnal.
 *
 * Pakai:
 *   npx tsx scripts/qa-check.mts                       → daftar data uji + saldo kas/bank
 *   npx tsx scripts/qa-check.mts cleanup               → hapus aset uji (tanpa jurnal)
 *   npx tsx scripts/qa-check.mts cleanup JE-x,JE-y     → hapus aset uji + jurnal tsb
 *
 * Ref jurnal dioper manual karena jurnal pembelian tidak memuat nama barang;
 * ambil ref-nya dari keluaran perintah tanpa argumen (bagian "Jurnal terbaru").
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TEST_PREFIX = "ZZ TEST";

const cleanup = process.argv[2] === "cleanup";
const refs = (process.argv[3] ?? "")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

const env = Object.fromEntries(
	readFileSync("./.env.local", "utf8")
		.split("\n")
		.filter((l) => l.includes("=") && !l.trim().startsWith("#"))
		.map((l) => {
			const i = l.indexOf("=");
			return [
				l.slice(0, i).trim(),
				l
					.slice(i + 1)
					.trim()
					.replace(/^["']|["']$/g, ""),
			];
		}),
) as Record<string, string>;

const sb = createClient(
	env.NEXT_PUBLIC_SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{ auth: { persistSession: false } },
);

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

async function saldoKasBank(): Promise<string> {
	const out: string[] = [];
	for (const code of ["1-100", "1-110", "1-111", "1-112"]) {
		let bal = 0;
		for (let from = 0; ; from += 1000) {
			const { data } = await sb
				.from("journal_lines")
				.select("debit_amount, credit_amount")
				.eq("account_code", code)
				.range(from, from + 999);
			const rows = data ?? [];
			for (const l of rows)
				bal += Number(l.debit_amount) - Number(l.credit_amount);
			if (rows.length < 1000) break;
		}
		out.push(`${code}=${rp(bal)}`);
	}
	return out.join("  ");
}

// ── Data uji yang ada sekarang ──────────────────────────────────────────
const { data: items } = await sb
	.from("inventory_items")
	.select(
		`id, sku, name, category,
		 config:items_fixed_asset_config(serial_number, purchase_price, is_capitalized)`,
	)
	.ilike("name", `${TEST_PREFIX}%`)
	.order("created_at");

const rows = (items ?? []).filter((r) =>
	String(r.name).toUpperCase().startsWith(TEST_PREFIX),
);
const ids = rows.map((r) => r.id as string);

console.log(`Item uji ("${TEST_PREFIX}…"): ${rows.length}`);
for (const r of rows) {
	const c = Array.isArray(r.config) ? r.config[0] : r.config;
	console.log(
		`  ${String(r.sku).padEnd(26)} ${r.name} · S/N ${c?.serial_number ?? "-"} · ${rp(Number(c?.purchase_price ?? 0))}`,
	);
}

const { data: moves } = ids.length
	? await sb
			.from("stock_movements")
			.select("id, ref_id, direction, quantity")
			.in("item_id", ids)
	: { data: [] };
console.log(`stock_movements terkait: ${(moves ?? []).length}`);

// ── Jurnal pembelian terbaru (untuk mencari ref data uji) ───────────────
const { data: recent } = await sb
	.from("journal_entries")
	.select("id, ref_id, source_type, description, total_amount, created_at")
	.eq("source_type", "purchase")
	.order("created_at", { ascending: false })
	.limit(5);

console.log("\nJurnal pembelian terbaru:");
for (const e of recent ?? []) {
	const { data: l } = await sb
		.from("journal_lines")
		.select("account_code, debit_amount, credit_amount, description")
		.eq("entry_id", e.id)
		.order("line_order");
	console.log(
		`  ${e.ref_id} · ${String(e.created_at).slice(0, 19).replace("T", " ")} · ${rp(Number(e.total_amount))} · "${e.description}"`,
	);
	for (const x of l ?? []) {
		const d = Number(x.debit_amount);
		const c = Number(x.credit_amount);
		console.log(
			`      ${x.account_code}  ${d ? `DEBIT  ${rp(d)}` : `KREDIT ${rp(c)}`}   ${x.description ?? ""}`,
		);
	}
}

console.log(`\nsaldo kas/bank: ${await saldoKasBank()}`);

// ── Bersih-bersih (hanya data uji) ──────────────────────────────────────
if (!cleanup) process.exit(0);

console.log("\n— membersihkan —");

// Pagar: jurnal yang dihapus harus jurnal pembelian, dan nominalnya kecil.
// Salah ketik satu huruf pada ref tidak boleh bisa menghapus jurnal asli.
const { data: targetEntries } = refs.length
	? await sb
			.from("journal_entries")
			.select("id, ref_id, source_type, total_amount")
			.in("ref_id", refs)
	: { data: [] };
const safeEntries = (targetEntries ?? []).filter(
	(e) => e.source_type === "purchase" && Number(e.total_amount) <= 100_000,
);
const rejected = (targetEntries ?? []).filter((e) => !safeEntries.includes(e));
for (const e of rejected) {
	console.log(
		`  DILEWATI ${e.ref_id} — bukan jurnal pembelian kecil (${e.source_type}, ${rp(Number(e.total_amount))})`,
	);
}

if ((moves ?? []).length) {
	const { error } = await sb
		.from("stock_movements")
		.delete()
		.in("item_id", ids);
	console.log(
		error
			? `  stok GAGAL: ${error.message}`
			: `  ${moves?.length} stock_movements dihapus`,
	);
}

const entryIds = safeEntries.map((e) => e.id as string);
if (entryIds.length) {
	const { error: le } = await sb
		.from("journal_lines")
		.delete()
		.in("entry_id", entryIds);
	const { error } = await sb
		.from("journal_entries")
		.delete()
		.in("id", entryIds);
	console.log(
		error || le
			? `  jurnal GAGAL: ${(error ?? le)?.message}`
			: `  ${entryIds.length} jurnal dihapus`,
	);
}

if (ids.length) {
	const { error } = await sb.from("inventory_items").delete().in("id", ids);
	console.log(
		error
			? `  item GAGAL: ${error.message}`
			: `  ${ids.length} item uji dihapus`,
	);
}

// ── Bukti bersih ────────────────────────────────────────────────────────
const { data: sisaItem } = await sb
	.from("inventory_items")
	.select("id")
	.ilike("name", `${TEST_PREFIX}%`);
const { data: sisaCfg } = ids.length
	? await sb
			.from("items_fixed_asset_config")
			.select("item_id")
			.in("item_id", ids)
	: { data: [] };
const { data: sisaJe } = entryIds.length
	? await sb.from("journal_entries").select("id").in("id", entryIds)
	: { data: [] };
const { data: sisaJl } = entryIds.length
	? await sb.from("journal_lines").select("id").in("entry_id", entryIds)
	: { data: [] };
const { data: sisaMv } = ids.length
	? await sb.from("stock_movements").select("id").in("item_id", ids)
	: { data: [] };

console.log(
	`  sisa → item:${(sisaItem ?? []).length} config:${(sisaCfg ?? []).length} ` +
		`jurnal:${(sisaJe ?? []).length} baris-jurnal:${(sisaJl ?? []).length} stok:${(sisaMv ?? []).length}`,
);
console.log(`  saldo kas/bank: ${await saldoKasBank()}`);
