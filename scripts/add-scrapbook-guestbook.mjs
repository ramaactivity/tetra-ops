// One-off: revive Scrapbook persediaan + record 10 unit stok awal (terlewat saat
// cutoff) + link add-on "Guest Books Photo" ke stok Scrapbook.
//
//   - Item ITM-SCRAPBOOK: revive (un-delete), cost Rp25.000/pcs (supplier SHOPEE).
//   - Stok awal 10 pcs @ 25.000 = Rp250.000 → stock_movement (stock_take/in) +
//     journal Dr 1-209 Persediaan / Cr 3-101 Modal Awal (koreksi saldo awal,
//     pola sama dgn JE-RECLAS-FDBOX-OPEN 2026-06-25).
//   - Add-on "Guest Books Photo" (Rp200.000, dibiarkan) → inventory_item_id =
//     Scrapbook (auto-deduct 1 pcs per pakai saat rekap approve).
//
// Idempotent: cek dulu sebelum insert. Jalankan: node scripts/add-scrapbook-guestbook.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(...a);
const rp = (n) => "Rp" + Math.round(n).toLocaleString("id-ID");
const die = (m) => { log("❌", m); process.exit(1); };

const ITEM_ID = "07209020-3529-4281-8b01-e850e02c6bd4"; // ITM-SCRAPBOOK
const ADDON_ID = "8f233d46-d7b4-4d54-bccd-688e798178b5"; // Guest Books Photo
const SHOPEE_ID = "628f6fa7-4fe2-4b6b-a2ab-20c9a3891094";
const USER_ID = "4c23fa8c-a7b1-47c9-96de-92b9b3063ced"; // owner (created_by precedent)
const UNIT_COST = 25_000;
const QTY = 10;
const TOTAL = UNIT_COST * QTY; // 250.000
const INV_ACCT = "1-209"; // Persediaan Lainnya
const OPENING_ACCT = "3-101"; // Modal Awal / Saldo Awal
const TODAY = "2026-06-26";
const rand8 = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0").toUpperCase();
const randDec = () => String(Math.floor(Math.random() * 90000000) + 10000000);

// 0. Sanity: item exists
const { data: item } = await sb.from("inventory_items").select("id,sku,name,is_active,deleted_at,purchase_price_avg").eq("id", ITEM_ID).maybeSingle();
if (!item) die("Item ITM-SCRAPBOOK tidak ditemukan");
log(`Item: ${item.sku} (${item.name})  active=${item.is_active} deleted=${item.deleted_at ? "yes" : "no"}`);

// 1. Revive item + set cost
{
  const { error } = await sb.from("inventory_items").update({
    is_active: true, deleted_at: null, purchase_price_avg: UNIT_COST,
    updated_at: new Date().toISOString(),
  }).eq("id", ITEM_ID);
  if (error) die("revive item: " + error.message);
  log("✅ Item revived + cost set " + rp(UNIT_COST) + "/pcs");
}
{
  const { error } = await sb.from("items_inventory_config").update({
    purchase_price_avg: UNIT_COST, preferred_supplier_id: SHOPEE_ID,
    updated_at: new Date().toISOString(),
  }).eq("item_id", ITEM_ID);
  if (error) die("config cost: " + error.message);
  log("✅ Config purchase_price_avg = " + rp(UNIT_COST));
}

// 2. Supplier price (SHOPEE primary) — best-effort (latent trigger bug on this
//    table: invalid enum movement_source "purchase_request"). Cost already set
//    via purchase_price_avg above, so this is non-fatal.
{
  const { data: existing } = await sb.from("supplier_prices").select("id").eq("item_id", ITEM_ID).eq("supplier_id", SHOPEE_ID).maybeSingle();
  if (existing) {
    const { error } = await sb.from("supplier_prices").update({ pack_price: UNIT_COST, pack_size: 1, pack_unit: "pcs", is_primary: true, updated_at: new Date().toISOString() }).eq("id", existing.id);
    log(error ? "⚠️  Supplier price update skipped (" + error.message + ")" : "✅ Supplier price (SHOPEE) updated → " + rp(UNIT_COST) + "/pcs");
  } else {
    const { error } = await sb.from("supplier_prices").insert({
      supplier_id: SHOPEE_ID, item_id: ITEM_ID, pack_price: UNIT_COST, pack_size: 1, pack_unit: "pcs", is_primary: true,
      notes: "Beli satuan di Shopee Rp25.000/pcs",
    });
    log(error ? "⚠️  Supplier price skipped (trigger bug: " + error.message + ") — cost tetap tersimpan via purchase_price_avg" : "✅ Supplier price (SHOPEE primary) created → " + rp(UNIT_COST) + "/pcs");
  }
}

// 3. Stok awal 10 pcs — guard against double-post
const { data: existingMoves } = await sb.from("stock_movements").select("id,ref_id,quantity").eq("item_id", ITEM_ID).eq("source", "stock_take");
let movementId;
if (existingMoves && existingMoves.length) {
  log("⏭  stock_take movement sudah ada (" + existingMoves.map(m => m.ref_id).join(",") + ") — skip stok + journal");
  movementId = null;
} else {
  const movRef = "MOV-I-" + randDec();
  const { data: mov, error: mErr } = await sb.from("stock_movements").insert({
    ref_id: movRef, item_id: ITEM_ID, direction: "in", quantity: QTY, unit_cost: UNIT_COST,
    source: "stock_take", supplier_id: SHOPEE_ID,
    notes: "Stok awal 10 pcs — terlewat saat cutoff, diinput 2026-06-26",
    performed_by: USER_ID,
  }).select("id,ref_id").single();
  if (mErr || !mov) die("stock_movement: " + (mErr?.message));
  movementId = mov.id;
  log(`✅ Stok masuk ${QTY} pcs @ ${rp(UNIT_COST)} = ${rp(TOTAL)}  (${mov.ref_id})`);

  // 4. Journal: Dr 1-209 / Cr 3-101 (koreksi saldo awal)
  const jeRef = "JE-20260626-" + rand8();
  const { data: je, error: eErr } = await sb.from("journal_entries").insert({
    ref_id: jeRef, entry_date: TODAY, entry_type: "adjustment",
    description: "Koreksi stok awal Scrapbook 10 pcs — terlewat saat cutoff",
    source_type: "manual", source_id: movementId, total_amount: TOTAL, created_by: USER_ID,
  }).select("id").single();
  if (eErr || !je) die("journal_entries: " + (eErr?.message));
  const { error: lErr } = await sb.from("journal_lines").insert([
    { entry_id: je.id, account_code: INV_ACCT, debit_amount: TOTAL, credit_amount: 0, description: "Persediaan Scrapbook masuk 10 pcs", line_order: 1 },
    { entry_id: je.id, account_code: OPENING_ACCT, debit_amount: 0, credit_amount: TOTAL, description: "Koreksi saldo awal (stok terlewat saat cutoff)", line_order: 2 },
  ]);
  if (lErr) { await sb.from("journal_entries").delete().eq("id", je.id); die("journal_lines: " + lErr.message); }
  log(`✅ Journal ${jeRef}:  Dr ${INV_ACCT} ${rp(TOTAL)}  /  Cr ${OPENING_ACCT} ${rp(TOTAL)}`);
}

// 5. Link add-on → Scrapbook stok
{
  const { data: addon } = await sb.from("addons").select("id,name,price,inventory_item_id").eq("id", ADDON_ID).maybeSingle();
  if (!addon) die("Add-on Guest Books Photo tidak ditemukan");
  const { error } = await sb.from("addons").update({ inventory_item_id: ITEM_ID, updated_at: new Date().toISOString() }).eq("id", ADDON_ID);
  if (error) die("link addon: " + error.message);
  log(`✅ Add-on "${addon.name}" (${rp(addon.price)}) → linked ke stok Scrapbook (auto-deduct 1 pcs/pakai)`);
}

// 6. Verify final stock
const { data: levels } = await sb.rpc("get_stock_levels", { p_item_ids: [ITEM_ID] });
log("\n📦 Stok Scrapbook sekarang:", JSON.stringify(levels));
log("✅ SELESAI");
