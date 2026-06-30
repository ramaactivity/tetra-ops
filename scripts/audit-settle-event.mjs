import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rp = (n) => "Rp" + Math.round(Number(n)||0).toLocaleString("id-ID");
const log = (...a) => console.log(...a);

// 1. Most recent settlements
const { data: settlements } = await sb.from("event_settlements")
  .select("id, event_id, revenue_net, hpp_total, opex_total, net_profit, is_loss, sinking_total, owner_pool_total, operating_cash_kept, journal_entry_id, closed_by, closed_at")
  .order("closed_at", { ascending: false }).limit(6);

log(`\n=== Audit ${settlements?.length ?? 0} settlement terakhir ===\n`);

for (const s of settlements ?? []) {
  log(`▶ settlement ${s.id.slice(0,8)} · event ${String(s.event_id).slice(0,8)} · ${s.closed_at}`);
  log(`  net=${rp(s.net_profit)} hpp=${rp(s.hpp_total)} opex=${rp(s.opex_total)} sink=${rp(s.sinking_total)} ownerpool=${rp(s.owner_pool_total)} ${s.is_loss?"(LOSS)":""}`);

  // a) Journal balance
  let jBal = "NO JE";
  if (s.journal_entry_id) {
    const { data: lines } = await sb.from("journal_lines")
      .select("account_code, debit_amount, credit_amount").eq("entry_id", s.journal_entry_id);
    const dr = (lines??[]).reduce((a,l)=>a+Number(l.debit_amount||0),0);
    const cr = (lines??[]).reduce((a,l)=>a+Number(l.credit_amount||0),0);
    const expDr = Number(s.hpp_total)+Number(s.opex_total)+Number(s.sinking_total)+Number(s.owner_pool_total);
    jBal = `Dr=${rp(dr)} Cr=${rp(cr)} ${dr===cr?"✓balanced":"⚠UNBALANCED"} | expectDr=${rp(expDr)} ${dr===expDr?"✓":"⚠ beda "+rp(dr-expDr)} | ${lines?.length} lines`;
  }
  log(`  [2] Journal:       ${jBal}`);

  // b) Sinking movements
  const { data: sink } = await sb.from("sinking_fund_movements")
    .select("amount").eq("source_settlement_id", s.id).eq("movement_type","deposit");
  const sinkSum = (sink??[]).reduce((a,m)=>a+Number(m.amount||0),0);
  log(`  [3] Sinking:       ${sink?.length??0} movement = ${rp(sinkSum)} ${sinkSum===Number(s.sinking_total)?"✓ cocok":"⚠ beda vs settlement "+rp(s.sinking_total)}`);

  // c) Owner pool earnings
  const { data: own } = await sb.from("owner_earnings")
    .select("amount").eq("source_settlement_id", s.id);
  const ownSum = (own??[]).reduce((a,m)=>a+Number(m.amount||0),0);
  log(`  [4] Owner pool:    ${own?.length??0} earning = ${rp(ownSum)} ${ownSum===Number(s.owner_pool_total)?"✓ cocok":"⚠ beda vs settlement "+rp(s.owner_pool_total)}`);

  // d) Lock state
  const { data: ev } = await sb.from("events").select("status").eq("id", s.event_id).maybeSingle();
  const { data: rk } = await sb.from("crew_rekap").select("status, locked, locked_at, settled_at, stock_committed_at").eq("event_id", s.event_id).maybeSingle();
  log(`  [5] Lock:          event=${ev?.status} rekap=${rk?.status} locked=${rk?.locked} ${ev?.status==="completed"&&rk?.locked?"✓":"⚠"} | stock_committed=${rk?.stock_committed_at?"✓":"⚠ NULL"}`);

  // e) Audit log
  const { data: al } = await sb.from("audit_log")
    .select("action, actor_id, created_at").eq("entity_id", s.id).eq("entity_type","event_settlement").order("created_at");
  const hasSettle = (al??[]).some(a=>a.action==="settle");
  log(`  [6] Audit log:     ${(al??[]).map(a=>a.action).join(", ")||"—"} ${hasSettle?"✓ ada 'settle'+actor+ts":"⚠ tidak ada 'settle'"}`);

  // f) Action [1] potong stok — movements link via source_id=event_id +
  //    source='rekap_consumption' (stock_movements has NO batch_id column).
  const { data: mv } = await sb.from("stock_movements")
    .select("direction, quantity, unit_cost")
    .eq("source_id", s.event_id).eq("source", "rekap_consumption");
  const outN = (mv??[]).filter(m=>m.direction==="out").length;
  const mvVal = (mv??[]).reduce((a,m)=>a+Number(m.quantity)*Number(m.unit_cost||0),0);
  log(`  [1] Potong stok:   ${outN} movement out · nilai ${rp(mvVal)} ${Math.round(mvVal)===Number(s.hpp_total)?"✓ = hpp_total":"⚠ beda vs hpp_total "+rp(s.hpp_total)}`);
  log("");
}

// 2. Global GL balance (all journal_lines)
const { data: gl } = await sb.from("journal_lines").select("debit_amount, credit_amount").limit(100000);
const dr = (gl??[]).reduce((a,l)=>a+Number(l.debit_amount||0),0);
const cr = (gl??[]).reduce((a,l)=>a+Number(l.credit_amount||0),0);
log(`=== GL global ===\nDr=${rp(dr)} Cr=${rp(cr)} ${dr===cr?"✓ BALANCED":"⚠ UNBALANCED diff "+rp(dr-cr)} (${gl?.length} lines)`);
