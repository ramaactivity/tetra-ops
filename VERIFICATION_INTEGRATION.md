# VERIFICATION_INTEGRATION.md

**Tanggal**: 2026-05-19
**Method**: Code trace + TypeCheck pass + e2e demo via verify-rekap.ts

## Executive Summary

✅ Integration end-to-end **VERIFIED** via demo `PRJ-20260515-36078` (Naurah & Sahil). Settle + journal balanced (Dr=Cr=Rp 2.351.500) + reopen + re-settle semua jalan.

⚠️ 1 minor issue: hardcoded `POOL_PER_PERSON = 50000` di preview yang harusnya dari `system_config`. Non-blocking.

## §1. Scenario A: Owner Settle Event

### Code path

```
User klik "Settle event" di /operations/[projectId]/rekap
  ↓
<SettleButton> (client component)
  ├─ handleOpen() → checkRecapStock(recapId)
  │                  ↓ RPC _validate_recap_sufficient
  │                  ← {sufficient, shortages[]}
  │  Jika tidak cukup: tampilkan dialog warning + list shortages, blokir submit
  │  Jika cukup: open konfirmasi dialog dengan summary
  ↓
User konfirmasi → handleConfirm()
  ↓ useTransition wrapper (proper async)
  settleEvent(eventId, projectId)  [src/lib/actions/settle-event.ts]
  ├─ getCurrentUser() check
  ├─ role check (super_admin | owner)
  └─ supabase.rpc("settle_event", {p_event_id, p_owner_user_id, p_overrides:null})
       ↓ Postgres function (atomic transaction)
       [16 steps — lihat VERIFICATION_RPC.md]
       ← JSONB {settlement_id, journal_entry_id, stock_batch_id, revenue_net, hpp_total, opex_total, net_profit, margin_pct, is_loss, sinking_total, owner_pool_total, operating_cash}
  ↓
revalidatePath(...) × 5 paths
toast.success("Event berhasil di-settle. Net profit: ...")
router.refresh()
```

### Validation alignment check (UI vs RPC)

| Check | UI (page.tsx) | RPC (settle_event) | Aligned? |
|---|---|---|---|
| Rekap exists | ✅ `!rekap` → "Rekap belum di-submit" | ✅ Throws "Rekap belum di-submit untuk event" | ✅ |
| Rekap approved/reviewed | ✅ `!recapApproved` → "Approve rekap dulu" | ✅ Throws "Rekap belum di-review/approve" | ✅ |
| ≥1 proof photo | ✅ `proofCount < 1` → "Minimal 1 foto bukti" | ❌ Not enforced server-side | ⚠️ Soft (UI gate only) |
| All crew have fee > 0 | ✅ `!allCrewHaveFee` → "Set fee crew dulu" | ❌ Not enforced server-side | ⚠️ Soft (UI gate only) |
| Event status valid | Implicit via `isSettled = event.status === "completed"` | ✅ Throws "Event status must be in_progress or awaiting_settlement" | ✅ Server-side authoritative |
| No prior settlement | UI hides Settle button if settled | ✅ Throws "Event already settled" | ✅ |
| Stock sufficient | ✅ Pre-flight via `checkRecapStock` | ✅ `_validate_recap_stock_sufficient` raises EXCEPTION | ✅ Double check |
| Actor permission | Page redirects non-owner-level | ✅ Throws "Forbidden: actor is not owner/super_admin" | ✅ |

**Verdict**: Validation **layered defense**. UI provides UX-friendly gating; RPC enforces hard rules. Minor gap: proof count & crew fee not server-enforced, but UI gates them well.

### Error handling layers

1. **Service action**: `humanizeRpcError` maps known RPC error patterns → friendly Indonesian message:
   - "Stock tidak cukup" → preserved
   - "already settled" → "Event sudah pernah di-settle. Reopen dulu..."
   - "Rekap belum di-review" → preserved
   - "Forbidden" → "Akses ditolak. Hanya owner/super_admin..."
2. **Client component**: `toast.error(result.error)` shows generic toast
3. **Stock-check dialog**: Shows shortages list per item (sku, name, needed, available, shortage)

### Loading states

- Stock check: `stockChecking` boolean → button shows "Cek stok…" with spinner
- Settlement: `pending` from `useTransition` → button shows "Settling…" with spinner
- Dialog: disabled state when pending

### Optimistic update vs revalidate

❌ No optimistic update.
✅ Uses `router.refresh()` after success → server-side re-fetch.

**Rationale**: Settlement involves 10+ DB writes (event_settlements, stock_movements ×N, journal_entries+lines, sinking_fund_movements ×4, owner_earnings ×N, audit_log, plus 2 UPDATEs). Optimistic update would be complex and error-prone. Server-roundtrip refresh is the safer pattern here.

## §2. Scenario B: Owner Reopen

### Code path

```
User klik "Reopen settlement" di <SettledBanner>
  ↓
<ReopenButton> (client component)
  ├─ Disabled jika !isSuperAdmin OR isReopened (button-level guard)
  ↓
User klik → buka <Dialog> warning
  ├─ Tampilkan list "Apa yang akan dijalankan" (6 reversal actions)
  ├─ Textarea "Alasan reopen *" (min 5 char)
  ↓
User isi reason → klik "Konfirmasi reopen"
  ├─ Client-side check: `reason.trim().length < 5` → toast.error
  ↓ useTransition
  reopenSettlement(eventId, projectId, reason)  [src/lib/actions/settle-event.ts]
  ├─ getCurrentUser() check
  ├─ role check (super_admin only)
  ├─ reason.trim().length < 5 check
  └─ supabase.rpc("reopen_settlement", {p_event_id, p_owner_user_id, p_reason})
       ↓ Postgres function (atomic)
       1. Validate actor = super_admin
       2. Validate reason >= 5 chars (DB-level)
       3. Get settlement (raise if NOT FOUND)
       4. Reject if is_reopened = true already
       5. Reverse sinking_fund_movements (insert withdrawal offset)
       6. Reverse owner_earnings (insert adjustment with negative amount)
       7. Reverse stock_movements (insert "in" direction offsets)
       8. Reverse journal (mark is_reversed + insert reversal entry with flipped Dr/Cr)
       9. Update event_settlements (is_reopened=true)
       10. Update events.status = awaiting_settlement
       11. Update crew_rekap (status=reviewed, locked=false)
       12. Insert audit_log entry
       ← JSONB {settlement_id, reversal_journal_id, reversal_stock_batch, reason}
  ↓
toast.success("Settlement berhasil di-reopen...")
setOpen(false)
setReason("")
router.refresh()
```

### Validation alignment

| Check | UI | RPC | Aligned? |
|---|---|---|---|
| Actor = super_admin | ✅ `isSuperAdmin` prop disables button | ✅ Throws "Forbidden: only super_admin can reopen" | ✅ Double check |
| Reason min 5 chars | ✅ `reason.trim().length < 5` disable submit | ✅ Throws "Reason wajib (minimal 5 karakter)" | ✅ Double check |
| Settlement exists | UI hides button if no settlement | ✅ Throws "Settlement tidak ditemukan" | ✅ |
| Not already reopened | UI disables button via `isReopened` prop | ✅ Throws "Settlement sudah pernah di-reopen" | ✅ Double check |

**Verdict**: Strong client+server double-validation pada semua checks.

### Confirmation modal

✅ Modal warning ditampilkan SEBELUM action (tidak langsung reopen).
✅ List item yang akan di-reverse clearly displayed (6 items).
✅ Mandatory reason input dengan minimum 5 char.

### Refresh data after reopen

✅ `router.refresh()` setelah success → page re-render → SettledBanner hilang, kembali ke pre-settle UI.

## §3. Scenario C: Real-time Profit Preview

### Architecture

ProfitPreviewCard adalah **pure presentation client component**. Tidak melakukan komputasi sendiri.

Real-time effect dicapai via:
```
User edit crew fee di <CrewFeeForm>
  ↓
local state update (useState)
  ↓
User klik "Simpan fee crew"
  ↓
saveCrewFees(eventId, projectId, rows)  [server action]
  ├─ Update crew_assignments rows
  └─ revalidatePath(/operations/[projectId]/rekap)
  ↓
router.refresh()
  ↓
page.tsx (server component) re-render:
  ├─ Fetch crew_rekap, crew_assignments, event_settlements (parallel)
  ├─ Call getProfitPreview(eventId)
  │   ├─ Resolve recap.id
  │   ├─ RPC: calculate_recap_hpp(recap_id) → JSONB
  │   ├─ RPC: calculate_recap_opex(recap_id) → JSONB
  │   ├─ Compute revenue_net from events.grand_total
  │   ├─ Compute totals (hpp_total, opex_total, net_profit, margin)
  │   ├─ Estimate sinking & owner pool (mirror RPC logic)
  │   └─ Return ProfitPreview JSON
  └─ Re-render <ProfitPreviewCard preview={preview}>
```

### Server vs client compute parity

✅ Preview menggunakan **same RPC functions** (`calculate_recap_hpp`, `calculate_recap_opex`) yang akan dipakai oleh `settle_event`. Garansi numerik konsisten.

⚠️ **1 inconsistency**: Preview pakai hardcoded `POOL_PER_PERSON = 50000` di `profit-preview.ts:164`. Actual settle_event RPC baca `system_config['settlement.owner_pool_per_person']` (lihat migration H line 661-664). **Implikasi**: Kalau owner mengubah owner_pool_per_person di system_config ke nilai lain, preview akan misrepresent actual settlement value.

**Severity**: Low (system_config value jarang berubah, default 50k masuk akal).
**Fix**: Ubah `POOL_PER_PERSON` di profit-preview.ts jadi fetch dari `system_config`. Non-blocking.

### Debounce/storm prevention

❌ No debounce dalam re-compute.
✅ Tapi compute hanya di-trigger oleh `router.refresh()` (eksplisit setelah save), bukan setiap keystroke. So no re-render storm.

### Edge cases

| Edge | Behavior |
|---|---|
| Division by zero | ✅ `revenue_net > 0 ? ... : 0` guards margin_pct calc |
| Negative net_profit | ✅ Allowed; flagged `is_loss=true`; sinking & owner pool skipped |
| Empty HPP (no inventory consumed) | ✅ Returns 0 buckets, total=0 |
| No crew_assignments (no fees) | ✅ OpEx fee_lead/asisten = 0; preview still computes |
| `operating_cash < 0` | ✅ Clamped to 0 via `Math.max(net_profit - sinking - owner_pool, 0)` |

## §4. Findings Summary

### Working ✅
- Stock-check pre-flight pattern
- Confirmation modals dengan summary
- humanizeRpcError → friendly Indonesian errors
- Loading states via useTransition
- Server-roundtrip after action (router.refresh)
- Same RPC for preview + actual settle = numerik consistent

### Minor issues ⚠️ (non-blocking)
1. **Hardcoded POOL_PER_PERSON** di profit-preview.ts:164 — should fetch from system_config
2. **Proof count + crew fee gate UI-only** — server RPC doesn't enforce; soft requirement
3. **No debounce in AddonSplitForm useEffect** — auto-derive bonus = total − paid on every keystroke; OK for numeric inputs (React batches), but technically not debounced

### Critical issues ❌
**None.**

## §5. End-to-end demo trace (raw evidence)

Demo run pada PRJ-20260515-36078 (Naurah & Sahil) — lihat REPORT_REKAP_REFACTOR.md Section 2 "Sub-flow: Demo e2e settle_event".

Result:
```
Settlement: revenue_net=Rp 2.000.000, hpp=Rp 0, opex=Rp 485.000
net_profit=Rp 1.515.000 (75.75%) is_loss=false
sinking=Rp 251.500, owner_pool=Rp 100.000, op_cash=Rp 1.163.500

Journal JE-20260515-002 (expense) · 13 lines · 
debit=Rp 2.351.500 credit=Rp 2.351.500 ✅ BALANCED

Stock movements: 4 'out' rows (mediaset, sleeve, flashdisk, pouch)
Sinking movements: 4 'deposit' rows (split per fund)
Owner earnings: 2 'profit_share' rows
Event status: completed
Crew_rekap status: settled, locked=true
```

**Conclusion**: Integration ✅ READY untuk Prompt 4.
