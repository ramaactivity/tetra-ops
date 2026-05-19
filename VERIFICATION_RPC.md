# VERIFICATION_RPC.md

**Tanggal**: 2026-05-19
**Method**: Source-level trace + smoke test + e2e demo

## Executive Summary

✅ `settle_event` (mapping dari spec `event_recap_settle`) — **all 16 steps verified** via demo run.
✅ Atomicity guaranteed (Postgres function = implicit transaction).
✅ Error handling: RAISE EXCEPTION dengan ERRCODE specific.
✅ Return value: JSONB dengan semua generated IDs.

⚠️ Setelah demo run + e2e verification, ada 2 bug yang ke-detect dan **sudah di-fix** di pass 3 (commit `79c9565`):
1. `uuid_generate_v4()` not resolvable di `SET search_path = public` — fixed dengan `gen_random_uuid()` (built-in)
2. Double-entry journal not balanced (missing Cr Inventory + missing Dr Cash) — fixed dengan proper accounting layout

## §1. Function Signature

```sql
settle_event(
  p_event_id        UUID,       -- target event
  p_owner_user_id   UUID,       -- actor (super_admin | owner)
  p_overrides       JSONB       -- optional: {hpp, opex, revenue_gross, discount_total}
) RETURNS JSONB
```

Return shape:
```json
{
  "settlement_id": "uuid",
  "journal_entry_id": "uuid",
  "stock_batch_id": "uuid",
  "revenue_net": 2000000,
  "hpp_total": 0,
  "opex_total": 485000,
  "net_profit": 1515000,
  "margin_pct": 75.75,
  "is_loss": false,
  "sinking_total": 251500,
  "owner_pool_total": 100000,
  "operating_cash": 1163500
}
```

## §2. Step-by-step Logic Trace

| Step | Action | Function/SQL | Result |
|---|---|---|---|
| 1a | Validate actor | `SELECT role FROM users WHERE id = p_owner_user_id` + check role IN (super_admin, owner) | RAISE EXCEPTION '42501' if not authorized |
| 1b | Validate event exists | `SELECT * FROM events WHERE id = p_event_id` | RAISE if not found |
| 1c | Validate event status | `IN ('in_progress', 'awaiting_settlement')` | RAISE EXCEPTION '42P01' otherwise |
| 1d | Validate no prior settlement | `EXISTS in event_settlements` | RAISE EXCEPTION '23505' if exists |
| 2 | Validate recap | `SELECT * FROM crew_rekap WHERE event_id` + status IN ('reviewed', 'settled') | RAISE 'P0002'/'42P01' |
| 3 | Stock sufficiency | `_validate_recap_stock_sufficient(recap_id)` returns `{sufficient, shortages}` | RAISE EXCEPTION '23514' with shortages JSONB |
| 4a | Compute HPP | `calculate_recap_hpp(recap_id)` returns JSONB | Override applied if `p_overrides ? 'hpp'` |
| 4b | Compute OpEx | `calculate_recap_opex(recap_id)` + reshape to 13-key OpEx schema | Override applied if `p_overrides ? 'opex'` |
| 5 | Compute revenue | `revenue_net = COALESCE(grand_total, base_price + addons_total - discount_amount)` | grand_total preferred (canonical post-discount) |
| 6 | Compute totals | Sum HPP buckets, sum OpEx buckets, compute net_profit & margin | margin guarded against div-by-zero |
| 7 | Sinking allocation | Loop active `sinking_funds`, compute per-fund alloc (percentage or flat) | Skipped if `is_loss` |
| 8 | Owner pool | `owner_count × system_config[owner_pool_per_person]` | Skipped if `is_loss` |
| 9 | Operating cash | `MAX(net_profit - sinking_total - owner_pool_total, 0)` | Clamped non-negative |
| 10 | INSERT event_settlements | Full snapshot row with 30+ columns | RETURNING id |
| 11 | Stock deduction | For each mapped item: INSERT `stock_movements` (direction='out', source='settlement') | Plus bonus item de-stock |
| 12 | Sinking movements | For each active fund: INSERT `sinking_fund_movements` (movement_type='deposit') | Linked via `source_settlement_id` |
| 13 | Owner earnings | For each active owner: INSERT `owner_earnings` (earning_type='profit_share') | Equal split (or proportional if share_pct valid) |
| 14 | Journal entry | `_create_settlement_journal(...)` → INSERT journal_entries + journal_lines | Double-entry balanced |
| 15a | Lock event | `UPDATE events SET status='completed'` | Atomic with rest |
| 15b | Lock recap | `UPDATE crew_rekap SET status='settled', locked=true, locked_at=NOW(), settled_at=NOW()` | Atomic |
| 16 | Audit log | `INSERT audit_log` with `action='settle'`, `changes` JSONB | Trace actor + summary |

## §3. Atomicity Verification

✅ Function declared `SECURITY DEFINER` + Postgres treats single function call as one transaction (kecuali eksplisit BEGIN/COMMIT/ROLLBACK).

✅ `RAISE EXCEPTION` automatically rolls back semua INSERT/UPDATE dalam scope function call.

✅ Tidak ada `SAVEPOINT` atau nested transaction — flow linear, monoteous.

**Verdict**: Atomicity ✅ GUARANTEED.

## §4. Error Handling

Setiap RAISE EXCEPTION pakai ERRCODE Postgres standard:

| Error | ERRCODE | Meaning |
|---|---|---|
| Forbidden actor | 42501 | Insufficient privilege |
| Event not found | P0002 | NO_DATA_FOUND |
| Wrong event status | 42P01 | UNDEFINED_TABLE-like (custom) |
| Already settled | 23505 | UNIQUE_VIOLATION (semantic) |
| Stock insufficient | 23514 | CHECK_VIOLATION |
| Reason too short | 22023 | INVALID_PARAMETER |

✅ Client-side `humanizeRpcError` di [settle-event.ts:108-130](src/lib/actions/settle-event.ts#L108-L130) maps known patterns ke Indonesian friendly message.

## §5. Return Value Verification

Verified via demo run (PRJ-20260515-36078, settlement `b030e3db-...`):

```json
{
  "settlement_id": "b030e3db-5fb8-4b16-b776-8cb443225573",
  "journal_entry_id": "e047910d-f0d7-4c59-8c98-4c02902b43c2",
  "stock_batch_id": "c541ec59-f7ef-4d14-91af-6cd4addae894",
  "revenue_net": 2000000,
  "hpp_total": 0,
  "opex_total": 485000,
  "net_profit": 1515000,
  "margin_pct": 75.75,
  "is_loss": false,
  "sinking_total": 251500,
  "owner_pool_total": 100000,
  "operating_cash": 1163500
}
```

All keys present, types correct, math consistent.

## §6. _create_settlement_journal (helper)

Setelah pass 3 fix, double-entry layout correct:

**Debits** (uses of value):
- `1-100` Cash = revenue_net − opex_total (net cash inflow; HPP doesn't touch cash, only inventory)
- `5-100..5-109, 5-411` HPP per bucket = expense recognition
- `5-201..5-400` OpEx per bucket = expense recognition
- `3-200` Retained Earnings = sinking_total + owner_pool_total (book transfer)

**Credits** (sources of value):
- `4-100` Revenue = revenue_net
- `1-200..1-205, 1-209` Inventory per HPP bucket = asset reduction
- `2-200..2-203` Sinking liabilities per fund (split via query)
- `2-300` Owner pool liability

Balance check: `Total Dr = Total Cr = revenue_net + hpp_total + sinking_total + owner_pool_total`

**Verified live**: JE-20260515-002 di production: 13 lines, Dr=Cr=Rp 2.351.500. ✅

## §7. reopen_settlement (companion RPC)

Mirror logic untuk reverse, dengan validasi:
- Actor harus super_admin
- Reason min 5 char
- Settlement not yet reopened

Operations:
1. Reverse `sinking_fund_movements`: INSERT withdrawals dengan source_settlement_id sama
2. Reverse `owner_earnings`: INSERT adjustments dengan amount negatif
3. Reverse `stock_movements`: INSERT 'in' direction offsets
4. Reverse journal: mark old `is_reversed=true` + INSERT reversal entry (Dr↔Cr flipped)
5. Update `event_settlements`: set is_reopened=true + reopen_reason
6. Unlock event (status → awaiting_settlement)
7. Unlock recap (status → reviewed, locked=false)
8. Audit log entry

**Verified**: demo reopen run successful in pass 3 verification.

## §8. Known Edge Cases at RPC Level

| Edge | RPC behavior |
|---|---|
| Empty event_addons | revenue from grand_total still works |
| Zero owner_pool_per_person | owner_pool_total = 0 (degenerate, but OK) |
| Zero sinking funds active | sinking_total = 0 (degenerate, OK) |
| HPP bucket missing key | COALESCE → 0 (safe) |
| OpEx bucket missing key | COALESCE → 0 (safe) |
| share_pct invalid (sum ≠ 100) | Fall back to equal distribution + audit_log 'fallback' warning |
| Re-settle after reopen | Blocked by UNIQUE constraint on event_id (no fix in this pass) |

## §9. Performance Considerations

- 16 atomic steps include N×INSERTs (stock_movements depends on mapped items; sinking ~4; journal lines ~10-20)
- Single RPC call → low network round-trip
- All inside one transaction → consistent
- Worst case ~100ms for typical event

## §10. Findings

### Working ✅
- Atomic settlement flow (16 steps)
- Error codes meaningful (Postgres standard)
- humanizeRpcError mapping comprehensive
- Double-entry balanced (post pass 3 fix)
- Reopen mirror logic + proper reversal

### Outstanding (low priority, untuk future pass) ⚠️
1. **UNIQUE constraint `event_settlements.event_id`** — block re-settle after reopen. Workaround: `cleanup-reopened` script. Long-term fix: convert to partial unique index `WHERE is_reopened = false`.
2. **`fee_amount > 0` not enforced** — UI gate only. Future: add validation in settle_event RPC.
3. **`proof_photo_urls.length >= 1` not enforced** — UI gate only. Same as above.

### Critical issues ❌
**None.**

**Verdict**: RPC layer ✅ READY untuk Prompt 4.
