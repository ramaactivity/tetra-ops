# AUDIT — Module Rekap & Settlement Tetra Ops

**Tanggal audit**: 2026-05-19
**Auditor**: Claude (read-only investigation)
**Scope**: Module rekap (crew + owner) + settlement + integrasi warehouse/finance/sinking funds/owner pool
**Branch**: main (commit c2290a8)
**Stack**: Next.js 16.2.4 App Router · React 19.2.4 · Tailwind v4 · shadcn/ui · Supabase · Zod 4.4.3 · TanStack Query 5

---

## 1. Executive Summary

1. **Module sudah cukup matang secara struktur** — 4 phase migration sudah selesai (Phase A status machine → Phase B rekap+stock → Phase C auto-HPP → Phase F1/F2 crew expenses). Crew flow, owner review, settlement, sinking funds, owner pool, dan reopen semua sudah jalan end-to-end.
2. **Satu blocker fungsional yang verified**: **HPP `bonus` key silently dropped** di settlement submission — UI menampilkan + hitung freebie cost, RPC v4 siap menerima, tapi `settlements.ts` HPP_KEYS array tidak include `"bonus"` → kolom `event_settlements.hpp_bonus` selalu 0. **Bug ini menyebabkan P&L event yang punya freebie under-report cost-nya.** Lihat finding [7.1.1](#711-critical---hpp-bonus-key-silently-dropped-pada-settlement-submit).
3. **Finance / Journal integration belum jalan**: Schema `journal_entries` + `journal_lines` sudah ada (lengkap dengan double-entry constraint dan RLS), tetapi `close_event_settlement` RPC v4 **tidak menulis apa-apa** ke ledger. Kolom `event_settlements.journal_entry_id` selalu NULL → financial report dari GL belum bisa di-generate. Ini gap arsitektural, bukan bug.
4. **UX safeguard pada operasi destruktif belum ada**: Tombol "Simpan & Tutup Buku" pakai `bg-primary` (bukan destructive) dan tidak ada confirmation dialog. Klik tidak sengaja = settlement final, hanya `super_admin` yang bisa reopen via RPC. Risiko data integrity tinggi mengingat settlement adalah snapshot immutable + reverse-able hanya lewat audit trail.
5. **Tentang "halaman /create error 500"**: Tidak ada route literal `/create` di codebase. Route booking creation adalah `/operations/new` yang melakukan **7 query Supabase paralel** di Server Component. Akar penyebab 500 paling mungkin: missing table/column di salah satu query (RLS deny → query gagal silently lalu data null lolos sampai render gagal), atau session auth gagal. Klaim "z.iso.date() bug" dari analisis awal **tidak valid** — `z.iso.date()` adalah API resmi Zod v4 (confirmed di `node_modules/zod/v4/classic/external.d.ts`). Lihat [Section 6.5](#65-investigasi-500-di-flow-booking-creation).

### Top 3 prioritas refactoring

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | HPP `bonus` key dropped — fix `settlements.ts` HPP_KEYS array | CRITICAL | XS (1 line) |
| 2 | Confirmation dialog + destructive styling untuk settlement button | CRITICAL | S |
| 3 | Investigasi & fix root cause 500 di `/operations/new` (lihat hipotesis di Section 6.5) | CRITICAL | S–M |

Sebelum refactoring lebih luas (auto-journal, batch RPC, transactions), tiga di atas wajib closed.

---

## 2. Code Structure Audit

### 2.1 File inventory

#### Crew portal (mobile-first)

| File | LOC | Role |
|---|---|---|
| [src/app/(crew)/crew/jadwal/[projectId]/rekap/page.tsx](src/app/(crew)/crew/jadwal/[projectId]/rekap/page.tsx) | ~110 | Crew rekap submission entry; fetches `getRekapContext()` lalu render `<RekapForm>` |
| [src/app/(crew)/crew/jadwal/[projectId]/page.tsx](src/app/(crew)/crew/jadwal/[projectId]/page.tsx) | — | Crew view event detail (read-only) |
| [src/app/(crew)/crew/jadwal/page.tsx](src/app/(crew)/crew/jadwal/page.tsx) | — | Crew calendar |
| [src/app/(crew)/crew/fee/page.tsx](src/app/(crew)/crew/fee/page.tsx) | — | Crew sees own earnings |

⚠️ **Tidak ada** `loading.tsx` atau `error.tsx` di folder `(crew)/crew/jadwal/[projectId]/` — verified via `ls`. Jika `getRekapContext()` throw, crew dapat generic Next.js error page.

#### Owner portal (responsive, desktop-first dengan sidebar)

| File | Role |
|---|---|
| [src/app/(owner)/operations/page.tsx](src/app/(owner)/operations/page.tsx) | Operations dashboard — list events |
| [src/app/(owner)/operations/loading.tsx](src/app/(owner)/operations/loading.tsx) | ✅ Loading skeleton untuk list |
| [src/app/(owner)/operations/new/page.tsx](src/app/(owner)/operations/new/page.tsx) | **New booking form** — 7 query Supabase paralel (lihat 6.5) |
| [src/app/(owner)/operations/[projectId]/page.tsx](src/app/(owner)/operations/[projectId]/page.tsx) | Event detail hub (31KB) — menampilkan rekap status + P&L summary |
| [src/app/(owner)/operations/[projectId]/loading.tsx](src/app/(owner)/operations/[projectId]/loading.tsx) | ✅ Loading skeleton |
| [src/app/(owner)/operations/[projectId]/rekap/page.tsx](src/app/(owner)/operations/[projectId]/rekap/page.tsx) | Review crew rekap — approve/reject |
| [src/app/(owner)/operations/[projectId]/settle/page.tsx](src/app/(owner)/operations/[projectId]/settle/page.tsx) | Settlement form — P&L + sinking + owner pool |
| [src/app/(owner)/operations/[projectId]/tutup-buku/page.tsx](src/app/(owner)/operations/[projectId]/tutup-buku/page.tsx) | Mega-form: rekap submit + approve + settle dalam 1 submit |
| [src/app/(owner)/operations/[projectId]/payments/page.tsx](src/app/(owner)/operations/[projectId]/payments/page.tsx) | Payment tracking |
| [src/app/(owner)/operations/[projectId]/crew/page.tsx](src/app/(owner)/operations/[projectId]/crew/page.tsx) | Crew assignment management |
| [src/app/(owner)/operations/[projectId]/equipment/page.tsx](src/app/(owner)/operations/[projectId]/equipment/page.tsx) | Equipment checklist |
| [src/app/(owner)/operations/[projectId]/edit/page.tsx](src/app/(owner)/operations/[projectId]/edit/page.tsx) | Edit event details |
| [src/app/(owner)/finance/page.tsx](src/app/(owner)/finance/page.tsx) | Finance dashboard (revenue/expenses/P&L) |
| [src/app/(owner)/warehouse/page.tsx](src/app/(owner)/warehouse/page.tsx) | Inventory + stock levels |
| [src/app/(owner)/settings/items/mapping/page.tsx](src/app/(owner)/settings/items/mapping/page.tsx) | Config rekap field → inventory item mapping |
| [src/app/(owner)/settings/sinking-funds/page.tsx](src/app/(owner)/settings/sinking-funds/page.tsx) | Sinking funds config |

#### Server actions (`src/lib/actions/`)

| File | LOC | Functions |
|---|---|---|
| [src/lib/actions/rekap.ts](src/lib/actions/rekap.ts) | 993 | `submitRekap`, `getRekapContext`, `approveRekap`, `rejectRekap`, `planRekapDeduction` |
| [src/lib/actions/settlements.ts](src/lib/actions/settlements.ts) | 217 | `closeSettlement`, `reopenSettlement` |
| [src/lib/actions/settlement-prefill.ts](src/lib/actions/settlement-prefill.ts) | 214 | `getAutoHpp` (frame-size-aware HPP auto-derivation) |
| [src/lib/actions/rekap-mapping.ts](src/lib/actions/rekap-mapping.ts) | 138 | `updateRekapMapping`, `deleteRekapMappingOverride`, `getRekapMappings` |
| [src/lib/actions/tutup-buku.ts](src/lib/actions/tutup-buku.ts) | — | `tutupBuku` (orchestrator) |
| [src/lib/actions/bookings.ts](src/lib/actions/bookings.ts) | — | `createBooking` (event creation entry) |
| [src/lib/actions/stock-movements.ts](src/lib/actions/stock-movements.ts) | — | Manual stock adjustments |
| [src/lib/actions/stock-takes.ts](src/lib/actions/stock-takes.ts) | — | Stock-take workflow |
| [src/lib/actions/sinking-funds.ts](src/lib/actions/sinking-funds.ts) | — | CRUD funds + manual movements |

#### Components

| Path | Notable files |
|---|---|
| [src/components/rekap/](src/components/rekap/) | `rekap-form.tsx` (42KB), `rekap-summary-tab.tsx`, `rekap-audit-tab.tsx`, `approval-preview.tsx`, `review-buttons.tsx`, `rekap-proof-upload.tsx`, `rekap-proof-gallery.tsx`, `single-file-upload.tsx`, `rekap-hero-card.tsx`, `rekap-context-card.tsx`, `rekap-summary-bar.tsx` |
| [src/components/settlement/](src/components/settlement/) | `settlement-form.tsx` (16KB) |
| [src/components/tutup-buku/](src/components/tutup-buku/) | `tutup-buku-form.tsx` (31KB) |
| [src/components/items/](src/components/items/) | `rekap-mapping-form.tsx` (14KB), `item-form.tsx`, `items-list-table.tsx` |
| [src/components/warehouse/](src/components/warehouse/) | `warehouse-tabs.tsx`, `stock-adjust-dialog.tsx`, `stock-take-*` |
| [src/components/sinking-funds/](src/components/sinking-funds/) | `fund-form.tsx`, `toggle-active-button.tsx` |

#### API routes (`src/app/api/`)

| Route | Purpose |
|---|---|
| [src/app/api/cron/status-transition/route.ts](src/app/api/cron/status-transition/route.ts) | Cron: auto-transition status (H-7 → upcoming, H → in_progress, H+1 → awaiting_settlement) |
| [src/app/api/cron/anomaly-scan/route.ts](src/app/api/cron/anomaly-scan/route.ts) | Cron: scan settlement inconsistencies |
| [src/app/api/drive/upload/[projectId]/route.ts](src/app/api/drive/upload/[projectId]/route.ts) | Upload proof photo ke Google Drive |
| [src/app/api/pdf/*](src/app/api/pdf/) | Generate quotation / invoice / BAST PDF |

**Tidak ada API route untuk rekap atau settlement** — semua lewat Server Action.

### 2.2 Supabase tables direferensikan (deduped)

15 tabel:
`events`, `crew_rekap`, `event_settlements`, `inventory_items`, `rekap_field_mapping`, `stock_movements`, `event_bonuses`, `crew_assignments`, `sinking_funds`, `sinking_fund_movements`, `owner_earnings`, `system_config`, `users`, `addons`, `journal_entries`, `journal_lines`, `chart_of_accounts`, `packages`, `event_assets`, `audit_log`.

### 2.3 Supabase RPC functions

| RPC | Caller | Purpose |
|---|---|---|
| `close_event_settlement(p_event_id, p_revenue_gross, p_discount_total, p_hpp, p_opex, p_owner_user_ids, p_owner_pool_per_person, p_closed_by, p_hpp_auto_snapshot, p_hpp_was_overridden)` | [settlements.ts:164](src/lib/actions/settlements.ts#L164) | v4. Validate event status, compute P&L, allocate sinking & owner pool, insert event_settlements + movements |
| `reopen_event_settlement(p_settlement_id, p_reason, p_actor_id)` | [settlements.ts:204](src/lib/actions/settlements.ts#L204) | Super-admin only. Reverse sinking + owner_earnings, mark is_reopened, reset event status |
| `get_current_stock(p_item_id)` | [rekap.ts:283, rekap.ts:376](src/lib/actions/rekap.ts) | Get current stock balance per item — **dipanggil per-item dalam loop** (N+1, lihat 7.2.1) |
| `commit_stock_take(p_stock_take_batch_id, p_committed_by_user_id)` | [stock-takes.ts](src/lib/actions/stock-takes.ts) | Finalize physical stock-take |

### 2.4 Dependency diagram (rekap & settlement flow)

```
┌────────────────────────────────────────────────────────────────────┐
│                          CREW SUBMIT REKAP                         │
└────────────────────────────────────────────────────────────────────┘
crew/jadwal/[projectId]/rekap/page.tsx
   ↓ (Server Component)
getRekapContext(eventId)  [rekap.ts:160-415]
   ├→ events, packages, frame_size
   ├→ rekap_field_mapping (frame-size-aware, exact match or '' fallback)
   ├→ event_addons + addons + inventory_items (paid addons + bonuses)
   ├→ inventory_items (mapping targets + custom pool)
   └→ rpc(get_current_stock) ×N items  ⚠️ N+1
   ↓
<RekapForm action={submitRekap}>
   ↓ (Client → Server Action on submit)
submitRekap(eventId, projectId, _, formData)  [rekap.ts:430-577]
   ├→ Validate via RekapInputSchema (Zod)
   ├→ SELECT crew_rekap WHERE event_id (cek existing)
   ├→ UPDATE or INSERT crew_rekap  ⚠️ No FOR UPDATE lock
   └→ revalidatePath × 3

┌────────────────────────────────────────────────────────────────────┐
│                          OWNER REVIEW REKAP                        │
└────────────────────────────────────────────────────────────────────┘
operations/[projectId]/rekap/page.tsx
   ↓
<ReviewButtons action={approveRekap | rejectRekap}>
   ↓ approve
approveRekap(eventId, projectId, notes)  [rekap.ts:874-988]
   ├→ UPDATE crew_rekap SET is_approved=true, reviewed_at, reviewer_user_id
   ├→ planRekapDeduction(eventId)  [rekap.ts:629-822]
   │    ├→ Read crew_rekap consumption + custom_materials
   │    ├→ Resolve mappings (frame-size-aware)
   │    ├→ For each mapped field: qty × qty_per_unit
   │    ├→ For event_bonuses: addon → inventory_item × qty
   │    └→ Build DeductionLine[] with unit_cost
   ├→ batch_id = uuid()
   ├→ INSERT stock_movements (direction='out', source='rekap_consumption') ×N
   └→ UPDATE crew_rekap SET stock_committed_at, stock_movement_batch_id
   ⚠️ Insert movements + update crew_rekap NOT wrapped in transaction

┌────────────────────────────────────────────────────────────────────┐
│                          OWNER SETTLE                              │
└────────────────────────────────────────────────────────────────────┘
operations/[projectId]/settle/page.tsx
   ↓ (Server Component)
getAutoHpp(eventId)  [settlement-prefill.ts:50-214]
   ├→ Read crew_rekap quantities
   ├→ Read rekap_field_mapping (frame-size-aware)
   ├→ Read inventory_items costs
   ├→ Read event_bonuses → addon → inventory_item costs
   └→ Return {mediaset, sleeve, flashdisk, pouch, photomagnet, keychain, bonus, other}
   ↓
<SettlementForm action={closeSettlement} defaults={...} autoHpp={...}>
   ↓ submit (NO confirmation dialog)
closeSettlement(eventId, projectId, _, formData)  [settlements.ts:129-190]
   ├→ requireOwnerLevel()
   ├→ parseFormData → HPP_KEYS [7 keys, MISSING "bonus"]  🔴 BUG
   ├→ SettlementInputSchema.safeParse
   ├→ SELECT users WHERE role IN owner+super_admin → ownerIds
   └→ rpc("close_event_settlement", {...})
        │
        └─ Postgres function [migration 20260517_settlement_close_v4.sql]
            ├→ Validate event status IN (in_progress, awaiting_settlement)
            ├→ Validate no prior settlement (UNIQUE event_id)
            ├→ Check require_approved_rekap config + crew_rekap.is_approved
            ├→ Compute revenue_net, hpp_total (8 keys INCLUDING bonus), opex_total
            ├→ Compute net_profit, margin, is_loss
            ├→ INSERT event_settlements (snapshot)
            ├→ IF profit > 0: FOR EACH active sinking_fund
            │      INSERT sinking_fund_movements (deposit)
            ├→ IF profit > 0: FOR EACH active owner
            │      INSERT owner_earnings (profit_share)
            ├→ UPDATE events SET status='completed'
            └→ ❌ NOT INSERT journal_entries (stub only)

┌────────────────────────────────────────────────────────────────────┐
│                       OWNER REOPEN SETTLEMENT                      │
└────────────────────────────────────────────────────────────────────┘
operations/[projectId]/page.tsx (button) → reopenSettlement()
   ↓
reopenSettlement(settlementId, projectId, reason)  [settlements.ts:192-216]
   ├→ requireSuperAdmin()
   └→ rpc("reopen_event_settlement", {p_settlement_id, p_reason, p_actor_id})
        │
        └─ Postgres function [migration 20260507]
            ├→ Read prior sinking_fund_movements → INSERT withdrawal (offset)
            ├→ Read prior owner_earnings (profit_share) → INSERT adjustment (negative)
            ├→ UPDATE event_settlements SET is_reopened=true, reopened_at, reason
            ├→ UPDATE events SET status='awaiting_settlement'
            ├→ ❌ NOT reverse stock_movements
            └→ ❌ NOT reverse journal_entries (karena tidak ada)
```

### 2.5 Layout group structure & role-based routing

```
src/app/
├── (auth)/           # login, register — public
├── (crew)/
│   ├── layout.tsx    # Redirects owner/super_admin → /dashboard
│   └── crew/         # Mobile-first; bottom nav (CrewBottomNav)
├── (owner)/
│   ├── layout.tsx    # Redirects crew → /crew
│   ├── operations/   # Sidebar (md:block) + OwnerBottomNav (mobile fallback)
│   ├── finance/
│   ├── warehouse/
│   ├── settings/
│   └── dashboard/
└── api/
```

Role gate dilakukan di **server layout** (bukan middleware) — best practice untuk App Router. Setiap server action juga punya `requireOwnerLevel()` / `requireSuperAdmin()` defence in depth ([settlements.ts:64-80](src/lib/actions/settlements.ts#L64-L80)).

---

## 3. Database Schema Audit

### 3.1 Per-tabel breakdown

#### `events`
- **PK**: `id` (UUID)
- **Unique**: `project_id` (TEXT) — format `PRJ-YYYYMMDD-NNNN`
- **Status**: `event_status` ENUM (lihat 4.1)
- **Revenue cols**: `custom_package_price`, `discount_total`, `direct_sales_commission` (BIGINT)
- **Client cols**: `client_name`, `client_contact`, `client_email`
- **Venue cols**: `venue_name`, `venue_address`, `venue_city`, `venue_province`, `google_maps_url`
- **Event cols**: `event_date` (DATE), `setup_time`, `start_time`, `end_time` (TIME), `frame_size`, `backdrop_source`, `include_flashdisk_pouch` (BOOL)
- **Channel cols**: `channel` ENUM, `vendor_name`, `vendor_pic_name`, `vendor_contact`, `relasi_user_id`
- **Audit**: `created_by`, `created_at`, `updated_at`, `deleted_at`
- **RLS**: ✅ Enabled. Policies untuk owner-level + crew (only assigned events)
- **⚠️ Missing**: tidak ada `locked_at` column → locking de facto via UNIQUE constraint pada `event_settlements.event_id`

#### `crew_rekap`
- **PK**: `id` (UUID), **Unique**: `event_id`
- **Consumption** (NonNegInt, default 0):
  `cetak_total`, `media_set_used`, `sleeve_used`, `flashdisk_used`, `pouch_used`, `photomagnet_used`, `keychain_used`
- **Custom**: `custom_materials` (JSONB `{sku: qty}`)
- **Proof**: `proof_photo_urls` (TEXT[])
- **Approval**: `is_approved` (BOOL), `reviewed_at`, `reviewer_user_id`, `review_notes`
- **Phase F1/F2 expenses** (migration `20260519_crew_rekap_expenses.sql`):
  - `transport_method` ENUM (`online` | `rental` | `none`)
  - `transport_cost`, `transport_proof_berangkat_url`, `transport_proof_pulang_url`
  - `bensin_cost`, `toll_cost`, `parking_cost`, `konsumsi_cost`
  - `lainnya_items` (JSONB `[{note, amount}]`, max 20 items app-side)
- **Stock link**: `stock_committed_at` (TIMESTAMPTZ), `stock_movement_batch_id` (UUID)
- **Submitter**: `submitted_by_user_id`, `created_at`, `updated_at`
- **RLS**: ✅ Enabled. 3 policies:
  - `crew_rekap_read` — owner OR submitter OR crew assigned to event
  - `crew_rekap_write_crew` — crew assigned to event INSERT
  - `crew_rekap_update_owner` — owner or original submitter UPDATE

#### `event_settlements`
- **PK**: `id`, **Unique**: `event_id` (cornerstone of locking mechanism)
- **Revenue**: `revenue_gross`, `discount_total`, `revenue_net`
- **HPP (8 buckets after migration 20260517)**:
  `hpp_mediaset`, `hpp_sleeve`, `hpp_flashdisk`, `hpp_pouch`, `hpp_photomagnet`, `hpp_keychain`, **`hpp_bonus`**, `hpp_other`, `hpp_total`
- **HPP audit**: `hpp_auto_snapshot` (JSONB), `hpp_was_overridden` (BOOL)
- **OpEx (13 keys)**: lihat 5.4 untuk daftar lengkap
- **Result**: `total_biaya`, `net_profit`, `margin_percentage` (DECIMAL 5,2), `is_loss` (BOOL)
- **Allocations**: `sinking_equipment`, `sinking_maintenance`, `sinking_crew_reserve`, `sinking_emergency`, `sinking_total`, `owner_pool_total`, `owner_pool_per_person`, `operating_cash_kept`
- **Reopen**: `is_reopened` (BOOL), `reopened_at`, `reopened_by`, `reopen_reason` (TEXT)
- **Journal link**: `journal_entry_id` (UUID FK, **always NULL** — stub)
- **Audit**: `closed_by`, `closed_at`
- **RLS**: ✅ `settlements_owner` — owner-level only

#### `sinking_funds`
- **PK**: `id`, **Unique**: `code`
- **Config**: `name`, `description`, `allocation_type` (`percentage` | `flat`), `allocation_value` (DECIMAL), `target_balance`, `is_active`, `display_order`
- **Future link**: `coa_account` (TEXT FK chart_of_accounts) — defined but unused
- **RLS**: ✅ `sinking_funds_read_owner` (owner-level read), `sinking_funds_write_super_admin` (super admin write)

#### `sinking_fund_movements`
- **PK**: `id`
- **Source**: `fund_id`, `movement_type` (`deposit` | `withdrawal`), `amount` (BIGINT positive)
- **Trace**: `source_type` (`settlement` | `manual` | `transfer`), `source_event_id`, `source_settlement_id`
- **Withdraw**: `target_bank_account_id` (FK) — defined but no bank logic yet
- **Audit**: `description`, `performed_by`, `created_at`
- **RLS**: ✅ `sinking_movements_owner`

#### `owner_earnings`
- **PK**: `id`
- **Owner**: `owner_user_id` (UUID FK users)
- **Type**: `earning_type` (`profit_share` | `commission_direct` | `commission_relasi` | `withdrawal` | `bonus` | `adjustment`)
- **Amount**: BIGINT (positive earned, negative withdrawn / adjustment)
- **Source**: `source_event_id`, `source_settlement_id`
- **Withdraw**: `withdrawal_method`, `withdrawal_account`, `withdrawal_reference`
- **RLS**: ✅ `owner_earnings_self` (owner sees own), `owner_earnings_super_admin` (full access)

#### `journal_entries` + `journal_lines`
- **`journal_entries`**: `id`, `ref_id` (TEXT unique, format `JE-YYYYMMDD-NNNN`), `entry_date`, `entry_type` (ENUM), `description`, `total_amount`, `source_type/_id/_event_id`, `is_reversed`, `reversed_by_entry_id`, `reversed_at`, `created_by/_at`
- **`journal_lines`**: `id`, `entry_id` (FK CASCADE), `account_code` (FK COA), `debit_amount`, `credit_amount` (XOR CHECK constraint), `description`, `line_order`
- **DB Constraint**: Sum(debits) = Sum(credits) per entry; setiap entry minimal 2 lines
- **RLS**: ✅ `journal_entries_owner`, `journal_lines_owner`
- **Status**: ⚠️ **Schema lengkap, RLS aktif, tapi belum ada code yang INSERT**. Cek `grep -rn "journal_entries" supabase/migrations/20260517_settlement_close_v4.sql` → tidak ada INSERT statement.

#### `inventory_items`
- **PK**: `id`, **Unique**: `sku`
- **Master**: `name`, `category` ENUM (`consumable` | `equipment`), `unit`, `purchase_price_avg` (rolling avg untuk HPP)
- **Equipment-only**: `purchase_date`, `purchase_price`, `useful_life_months`, `condition`, `current_location`, `current_event_id`, `current_crew_id`
- **Soft delete**: `deleted_at`
- **CHECK constraint**: consumable harus NULL pada equipment fields
- **RLS**: ✅ owner-level + crew can read

#### `stock_movements`
- **PK**: `id`, `ref_id` (TEXT)
- **Movement**: `item_id`, `direction` (`in` | `out` | `adjustment`), `quantity`, `unit_cost`
- **Source**: `source` (`rekap_consumption` | `stock_take` | `purchase` | `manual` | `transfer`), `source_id`, `source_description`
- **Batch**: `batch_id` (UUID) — group movements per rekap approval
- **Audit**: `performed_by_user_id`, `movement_reason`, `created_at`
- **RLS**: ✅

#### `rekap_field_mapping` (frame-size-aware)
- **PK** (after migration `20260518_rekap_mapping_frame_size.sql`): **composite `(rekap_field, frame_size)`** — sebelumnya hanya `rekap_field`
- **Cols**: `rekap_field` (TEXT), `frame_size` (TEXT, `''` = default), `item_id` (UUID FK), `qty_per_unit` (DECIMAL), `is_active` (BOOL)
- **Resolution logic** ([rekap/resolver.ts](src/lib/rekap/resolver.ts)): exact match event's frame_size → fallback ke `frame_size = ''` → skip jika tidak ada sama sekali
- **RLS**: ✅

#### `event_bonuses` (freebie tracking, migration `20260516_event_bonuses.sql`)
- **Cols**: `event_id`, `addon_id` (FK), `quantity`, `notes`
- **Linked via**: `addons.inventory_item_id` (migration `20260517_addons_inventory_link.sql`) untuk costing
- **RLS**: ✅ authenticated read, owner write

#### `system_config`
- **PK**: `key`, value: JSONB
- **Relevant keys**:
  - `settlement.require_approved_rekap` (bool, default true)
  - `settlement.owner_pool_distribution_mode` (`equal` | `proportional`)
  - `rekap.auto_deduct_stock` (bool, default true)
  - `tax.default_grossup_rate_pct` (number, default 2)

### 3.2 Migration timeline (chronological)

| Date | File | Highlight |
|---|---|---|
| 20260507 | `settlement_close_function.sql` | RPC v1 `close_event_settlement` + `reopen_event_settlement` |
| 20260510 | `event_assets.sql`, `stock_take.sql` | Photo storage + physical stock-take workflow |
| 20260511 | `rekap_consumption_link.sql` | Tambah `stock_committed_at`, `stock_movement_batch_id` ke `crew_rekap` |
| 20260511 | `rekap_item_mapping.sql` | Tabel `rekap_field_mapping` |
| 20260511 | `settlement_auto_hpp.sql` | Tambah `hpp_auto_snapshot`, `hpp_was_overridden` |
| 20260511 | `settlement_close_v3.sql` | RPC v3 refactor |
| 20260511 | `integrity_flags.sql` | Internal consistency checks |
| 20260516 | `event_bonuses.sql` | Freebie tracking |
| 20260517 | `addons_inventory_link.sql` | `addons.inventory_item_id` FK |
| 20260517 | `event_settlements_hpp_bonus.sql` | Tambah `hpp_bonus` column |
| 20260517 | `settlement_close_v4.sql` | **RPC v4** dengan `bonus` key di JSONB p_hpp |
| 20260518 | `rekap_mapping_frame_size.sql` | **PK change**: composite (rekap_field, frame_size) |
| 20260518 | `rekap_mapping_seed.sql`, `inventory_seed_default.sql` | Default seeds |
| 20260519 | `crew_rekap_expenses.sql` | **Phase F1**: transport/bensin/toll/parkir/konsumsi/lainnya columns |

### 3.3 Missing tables / concepts

| Concept | Status | Gap |
|---|---|---|
| Journal auto-creation | ⚠️ Schema ada, logic tidak | `close_event_settlement` v4 tidak INSERT ke `journal_entries` |
| Bank account integration | ⚠️ Column ada | `sinking_fund_movements.target_bank_account_id` belum dipakai; tidak ada `bank_accounts` table aktif |
| Stock sufficiency check | ❌ | `planRekapDeduction` tidak validasi `quantity ≤ current_stock` sebelum approve |
| Event lock timestamp | ⚠️ Implicit | Tidak ada `events.locked_at` — locking via `event_settlements.event_id` UNIQUE only |
| Settlement idempotency token | ❌ | Tidak ada idempotency key di `closeSettlement` |
| Rekap revision history | ⚠️ Partial | `crew_rekap` di-overwrite (no audit table); ada `rekap-audit-tab.tsx` tapi backing data terbatas |

### 3.4 Frame-size-aware mapping

Pola yang diadopsi di migration `20260518_rekap_mapping_frame_size.sql`:

```
PRIMARY KEY (rekap_field, frame_size)
```

`frame_size` default = empty string `''`. Resolver di [src/lib/rekap/resolver.ts](src/lib/rekap/resolver.ts):

```ts
// pseudo-code dari pemahaman flow
function resolveMapping(field, frameSize) {
  return mappings.find(m => m.rekap_field === field && m.frame_size === frameSize)
      ?? mappings.find(m => m.rekap_field === field && m.frame_size === '');
}
```

Konsekuensi: kalau owner buat override untuk `media_set_used` di frame `4R`, default mapping di `''` tetap aktif untuk semua frame lain. Ini pola yang bagus tapi **harus dipertahankan** saat refactoring — jangan kembali ke single-key PK.

---

## 4. State Machine Audit

### 4.1 Event status ENUM

```sql
CREATE TYPE event_status AS ENUM (
  'draft',
  'confirmed',
  'design_brief',
  'design_approved',
  'upcoming',
  'in_progress',
  'awaiting_settlement',
  'completed',
  'cancelled',
  'archived'
);
```

### 4.2 Transition matrix

| From | To | Trigger | Code | Notes |
|---|---|---|---|---|
| `draft` | `confirmed` | Manual | bookings.ts | Owner action |
| `confirmed` | `design_brief` | Manual | event-design.ts | Owner |
| `design_brief` | `design_approved` | Manual | event-design.ts | Owner |
| `confirmed` / `design_approved` | `upcoming` | Auto (cron) | `/api/cron/status-transition` | `event_date ≤ today + 7d` |
| `upcoming` | `in_progress` | Auto (cron) | same | `event_date = today` |
| `in_progress` | `awaiting_settlement` | Auto (cron) | same | `event_date < today` |
| `awaiting_settlement` | `completed` | Manual | RPC `close_event_settlement` | Owner action; precondition: status check + approved_rekap config gate |
| `completed` | `awaiting_settlement` | Manual | RPC `reopen_event_settlement` | Super-admin only |
| Any | `cancelled` | Manual | bookings.ts | Owner action |
| `completed` | `archived` | TBD | — | Belum ada UI/code untuk archive |

### 4.3 Validasi sebelum transisi

- **Cron transitions**: tidak ada validasi data — pure berdasarkan `event_date`
- **Close settlement** (RPC v4, migration 20260517):
  - `event.status IN ('in_progress', 'awaiting_settlement')` — RAISE EXCEPTION jika tidak match
  - No prior settlement (UNIQUE constraint → DB-level)
  - Jika `system_config['settlement.require_approved_rekap'] = true`: `crew_rekap.is_approved = true` (error message: "Rekap belum di-approve. Approve rekap dulu sebelum settle.")
- **Reopen**: hanya cek `actor.role = 'super_admin'` di server action; RPC sendiri permissive

### 4.4 Locking mechanism

**Tidak ada explicit `locked_at` column** di `events` table. Locking dilakukan via:

1. UNIQUE constraint pada `event_settlements.event_id` — INSERT kedua akan fail
2. Flag `event_settlements.is_reopened` untuk audit trail (settlement lama tetap di-keep, bukan di-DELETE)
3. Status `events.status = 'completed'` — UI tidak menampilkan tombol settle lagi

**Implication**: state lock implicit dan tersebar. Untuk audit/refactor, ini lebih sulit dibanding explicit `locked_at` column.

### 4.5 Cron-driven transitions

Endpoint [src/app/api/cron/status-transition/route.ts](src/app/api/cron/status-transition/route.ts) — dipanggil scheduler (Vercel cron atau external). Hipotesis: jalan harian, batch update events berdasarkan date diff.

### 4.6 State diagram

```
                                    Manual
       draft ──────────────────▶ confirmed ──┐
                                              │
                              ┌───────────────┤
                       Manual │               │ Auto (H-7)
                              ▼               ▼
                       design_brief ─▶ design_approved ─▶ upcoming
                                                              │
                                                              │ Auto (event day)
                                                              ▼
                                                         in_progress
                                                              │
                                                              │ Auto (day after)
                                                              ▼
                                                    awaiting_settlement
                                                              │
                                                      Manual  │  Manual
                                                  (close)     │  (close)
                                                              ▼
                                                          completed ◀─┐
                                                              │       │
                                                              │ Manual│
                                                              │ super │
                                                              │ admin │
                                                              ▼       │ reopen
                                                    awaiting_settlement
                                                       (re-entry loop)
```

`cancelled` & `archived` adalah branch terminal yang dapat dicapai dari sebagian besar non-terminal state.

---

## 5. Integration Audit

### 5.1 Warehouse — ✅ Implemented

**Flow**: Approval rekap → auto-deduct stock.

**File trace**: [src/lib/actions/rekap.ts:874-988](src/lib/actions/rekap.ts) `approveRekap()` → [rekap.ts:629-822](src/lib/actions/rekap.ts) `planRekapDeduction()` → INSERT `stock_movements`.

**Logic**:
1. Read `crew_rekap` consumption + `custom_materials` + `event_bonuses`
2. Resolve `rekap_field_mapping` (frame-size-aware)
3. For each mapped field: `qty × qty_per_unit × purchase_price_avg`
4. For each bonus: `addon.inventory_item × qty`
5. Generate single `batch_id` (UUID), INSERT N rows ke `stock_movements` dengan `direction='out'`, `source='rekap_consumption'`
6. UPDATE `crew_rekap.stock_committed_at = NOW()`, `stock_movement_batch_id = batch_id`

**Reversal on reject**: insert offset movements dengan `direction='in'`, clear `stock_committed_at`.

**Gaps**:
- ❌ **Tidak ada stock sufficiency check** sebelum approve → bisa over-deduct (stock balance jadi negatif)
- ❌ **Stock movements TIDAK auto-reverse pada settlement reopen** — hanya reverse jika rekap reject. Kalau owner reopen settlement setelah rekap approved, stock_movements tetap exist. Apakah ini intentional belum jelas dari kode/dokumentasi.
- ⚠️ **Insert N movements + update crew_rekap tidak atomik** (lihat 8.2)

### 5.2 Finance / Journal — ⚠️ STUBBED

**Status**: Schema lengkap, RLS aktif, **logic kosong**.

**Confirmed**: `grep -n "INSERT INTO journal" supabase/migrations/20260517_settlement_close_v4.sql` → tidak ada hasil. Function v4 hanya INSERT ke `event_settlements`, `sinking_fund_movements`, `owner_earnings`, `audit_log`.

**Expected future behavior** (berdasarkan struktur tabel + comment di schema):
- Settlement close → INSERT journal_entries (entry_type='settlement') + journal_lines (debit revenue / credit COGS+OpEx + sinking + owner_equity)
- Settlement reopen → INSERT reversing entry, link via `reversed_by_entry_id`

**Impact**: 
- Financial report (P&L per period, GL trial balance) tidak bisa di-generate dari `journal_lines` (sumber source-of-truth seharusnya GL, bukan settlement snapshot)
- `finance/page.tsx` saat ini mengaggregasi dari `event_settlements` directly — workable tapi tidak sebaik double-entry

### 5.3 Sinking Funds — ✅ Implemented

**Auto-allocation di RPC** (migration 20260517 v4, lines 200+):

```
IF NOT is_loss AND profit > 0:
  FOR EACH sinking_fund WHERE is_active:
    IF allocation_type = 'percentage':
      alloc = FLOOR(net_profit × allocation_value / 100)
    ELSE: -- 'flat'
      alloc = allocation_value
    INSERT INTO sinking_fund_movements
      (fund_id, movement_type='deposit', amount=alloc,
       source_type='settlement', source_event_id, source_settlement_id, ...)
```

**Reverse on reopen**: RPC reopen membaca prior deposits dengan `source_settlement_id` dan INSERT offset withdrawal.

**4 standard funds**: `equipment`, `maintenance`, `crew_reserve`, `emergency`.

**Gap**:
- ❌ Tidak ada link aktual ke `chart_of_accounts` — kolom `coa_account` exist tapi tidak referenced di kalkulasi
- ❌ Tidak ada bank account transfer (kolom `target_bank_account_id` placeholder)

### 5.4 Owner Pool — ✅ Implemented

**Distribusi di RPC v4**:
```
IF NOT is_loss AND owner_count > 0:
  IF mode = 'proportional':
    Validate SUM(users.share_pct) ≈ 100 AND no NULL
    IF valid: amount = FLOOR(pool_total × share_pct / 100) per owner
    IF invalid: AUDIT LOG warning, fallback ke equal
  IF mode = 'equal' OR fallback:
    amount = owner_pool_per_person per owner
  INSERT owner_earnings (earning_type='profit_share', amount, source_*)
```

**Reverse on reopen**: INSERT `earning_type='adjustment'` dengan amount negatif.

**OpEx keys (13)** — direferensikan di [settlements.ts:19-33](src/lib/actions/settlements.ts#L19-L33):
```
fee_lead, fee_asisten, fee_crew_c, fee_extra,
transport_bbm, sewa_alat, perawatan, konsumsi,
komisi_vendor, komisi_relasi, komisi_sales_direct,
platform_fee, diskon_tambahan
```

**Gap**:
- ⚠️ **Proportional fallback silent** — kalau `share_pct` invalid, sistem fall back ke equal dan hanya tulis ke `audit_log`. UI tidak menampilkan warning ke owner bahwa mode mereka di-skip.

---

## 6. Mobile vs Desktop Audit

### 6.1 Architecture

**Verdict**: **Single responsive design**. Tidak ada route forking per device.

Bukti:
- `find src -type d -name 'mobile' -o -name 'm'` → tidak ada
- Tidak ada `useMediaQuery` / `useIsMobile` / userAgent detection di server-side rendering
- Tailwind breakpoints (`md:`, `lg:`) digunakan luas

### 6.2 Role-based layout groups

| Group | Layout | Audience | Nav |
|---|---|---|---|
| `(crew)` | `layout.tsx` mobile-first | crew users only | `<CrewBottomNav>` — sticky bottom |
| `(owner)` | `layout.tsx` desktop-first | owner + super_admin | `<OwnerSidebar>` (md:block hidden), `<OwnerBottomNav>` mobile fallback |
| `(auth)` | minimal | public | none |

### 6.3 Mobile-first crew flow

- Crew rekap form: `max-w-md` single-column scroll
- Proof photo upload: drag-drop + native picker (mobile camera supported via `accept="image/*" capture`)
- Bottom-fixed save button via `<RekapSummaryBar>`

### 6.4 Desktop-first owner flow

- Sidebar collapsible
- Tables → cards on mobile (via Tailwind responsive prefixes)
- Form rekap review pakai tabs (`<RekapSummaryTab>` / `<RekapAuditTab>` / `<RekapProofGallery>` / `<ApprovalPreview>`)

### 6.5 Investigasi 500 di flow booking creation

**User report**: "halaman /create yang error 500 (kemungkinan di /app/(routes)/create atau sejenis)".

**Finding**: 
- Tidak ada literal `/create` route. Booking creation lewat **`/operations/new`** ([src/app/(owner)/operations/new/page.tsx](src/app/(owner)/operations/new/page.tsx))
- Klaim "z.iso.date() bug" — **TIDAK VALID**. Zod v4.4.3 mendukung `z.iso.date()` (confirmed di `node_modules/zod/v4/classic/external.d.ts:14 export * as iso from "./iso.js"`).
- `/operations/new` page melakukan **7 query Supabase paralel** di Server Component sebelum render:

```ts
// src/app/(owner)/operations/new/page.tsx:17-72
const [
  { data: packages },         // packages WHERE is_active AND deleted_at IS NULL
  { data: addons },           // addons WHERE is_active AND deleted_at IS NULL
  { data: backdrops },        // backdrops WHERE is_active
  { data: eventTypes },       // event_types WHERE is_active
  { data: relasiCandidates }, // users WHERE role IN (super_admin, owner, crew) AND is_active
  { data: vendorHistory },    // events WHERE channel='vendor' AND vendor_name IS NOT NULL LIMIT 50
  { data: grossupConfig },    // system_config WHERE key='tax.default_grossup_rate_pct'
] = await Promise.all([...]);
```

**Hipotesis penyebab 500** (tanpa akses ke server log):

| # | Kemungkinan | Likelihood | Cara verifikasi |
|---|---|---|---|
| H1 | Salah satu tabel/column tidak ada di production DB (mis. `backdrops` atau `event_types` belum di-migrate) | **Tinggi** | Cek `\dt` di Supabase SQL editor; lihat Vercel function logs untuk error "relation does not exist" |
| H2 | RLS policy memblokir `system_config` SELECT untuk role login (owner) | Medium | SQL editor: `SELECT * FROM pg_policies WHERE tablename='system_config'` |
| H3 | `createClient()` gagal (env var Supabase service role / anon key missing/invalid di production) | Medium | Cek Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| H4 | `Promise.all` reject karena salah satu query throw (bukan return `{error}`) | Medium | Wrap di try/catch + log per query; saat ini tidak ada error handling di page |
| H5 | Layout fetch user profile gagal (`requireUser` di `(owner)/layout.tsx`) | Rendah | Cek apakah `/operations` juga 500 |

**Recommendation untuk debugging**: tambahkan logging granular per query (jangan langsung `Promise.all` destructure). Atau pakai `Promise.allSettled` + log mana yang reject. Saat ini error single query meledak page seluruhnya jadi 500.

**Catatan**: di `BookingForm` ada field tanggal yang akhirnya divalidasi oleh `BookingInputSchema` di [bookings.ts:56](src/lib/actions/bookings.ts#L56) `event_date: z.iso.date("Format tanggal tidak valid")`. Schema ini valid dan **tidak akan error pada schema construction time**. Schema validation hanya dipanggil saat form submit (di server action), bukan saat render `/operations/new` — jadi tidak bisa jadi penyebab 500 pada GET request.

---

## 7. Bug Inventory

### 7.1 CRITICAL

#### 7.1.1 [CRITICAL] HPP `bonus` key silently dropped pada settlement submit

**File**: [src/lib/actions/settlements.ts:9-17](src/lib/actions/settlements.ts#L9-L17)

```ts
const HPP_KEYS = [
  "mediaset",
  "sleeve",
  "flashdisk",
  "pouch",
  "photomagnet",
  "keychain",
  "other",
  // ❌ MISSING: "bonus"
] as const;
```

**Konteks**:
- UI `<SettlementForm>` MEMILIKI field bonus ([settlement-form.tsx:36-40](src/components/settlement/settlement-form.tsx#L36-L40))
- `getAutoHpp()` MENGHITUNG bonus dari `event_bonuses × purchase_price_avg` ([settlement-prefill.ts:172-209](src/lib/actions/settlement-prefill.ts#L172-L209))
- RPC v4 `close_event_settlement` MENERIMA bonus di `p_hpp` JSONB (migration 20260517 lines 87-95, 173)
- Kolom `event_settlements.hpp_bonus` ADA (migration 20260517_event_settlements_hpp_bonus.sql)

**Path bug**:
```
UI sends formData "hpp_bonus" = 50000
  ↓
parseFormData() di settlements.ts:82-98 iterates HPP_KEYS array
  ↓
HPP_KEYS tidak include "bonus" → formData.get("hpp_bonus") tidak dipanggil
  ↓
hpp object ke RPC = {mediaset, sleeve, ..., keychain, other} TANPA bonus
  ↓
RPC: COALESCE((p_hpp->>'bonus')::BIGINT, 0) = 0
  ↓
event_settlements.hpp_bonus = 0 selalu
```

**Impact**:
- P&L semua event yang punya freebie (`event_bonuses`) UNDER-REPORT cost-nya
- Net profit OVER-STATED → keputusan owner pool & sinking allocation berdasarkan profit overstate
- Audit trail `hpp_auto_snapshot` menyimpan bonus correctly, tapi `hpp_was_overridden` jadi `true` palsu (karena snapshot ≠ final)

**Suggested fix** (tidak dieksekusi):
```diff
 const HPP_KEYS = [
   "mediaset",
   "sleeve",
   "flashdisk",
   "pouch",
   "photomagnet",
   "keychain",
+  "bonus",
   "other",
 ] as const;
```

Plus update type `HppKey` di tempat lain yang reference HPP_KEYS untuk konsistensi.

#### 7.1.2 [CRITICAL] Settlement tanpa confirmation dialog & destructive styling

**File**: [src/components/settlement/settlement-form.tsx:466-476](src/components/settlement/settlement-form.tsx#L466-L476)

```tsx
<button
  type="submit"
  disabled={pending}
  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium disabled:opacity-60"
>
  {pending
    ? "Menyimpan…"
    : totals.is_loss
      ? "Tutup Buku (Rugi)"
      : "Simpan & Tutup Buku"}
</button>
```

**Impact**: 
- Operasi destruktif (immutable snapshot, locking event, allocation ke sinking + owner_earnings) di-trigger oleh 1 klik tanpa konfirmasi
- Recovery hanya bisa lewat super-admin call `reopenSettlement()` — tidak available di UI standard owner

**Suggested fix**:
- Ganti `bg-primary` → destructive variant atau `bg-rose-600` (sesuai design guide: hanya gunakan biru/hijau, tidak ada merah — perlu cek dengan user)
- Tambah `<AlertDialog>` confirmation dengan summary nilai sebelum confirm

⚠️ **CATATAN UX**: feedback dari memory user mention "fresh blue+green palette (no red/orange)" — destructive styling perlu pakai variant lain (mis. amber/warning) atau pakai modal-only safeguard tanpa color shift.

#### 7.1.3 [CRITICAL] Akar 500 di `/operations/new` belum dipastikan

Lihat [Section 6.5](#65-investigasi-500-di-flow-booking-creation). Tidak ada code change untuk direkomendasikan sampai akar penyebab di-confirm dengan log production.

### 7.2 HIGH

#### 7.2.1 [HIGH] N+1 RPC calls di `getRekapContext`

**File**: [src/lib/actions/rekap.ts:280-288](src/lib/actions/rekap.ts#L280-L288) + [rekap.ts:373-380](src/lib/actions/rekap.ts#L373-L380)

```ts
// Fetch stock in parallel via RPC per item (no batch RPC available)
const stockPairs = await Promise.all(
  (items ?? []).map(async (it) => {
    const { data: stock } = await supabase.rpc("get_current_stock", {
      p_item_id: it.id as string,
    });
    return [it.id as string, Number(stock ?? 0)] as const;
  }),
);
```

**Impact**: 
- 1 RPC call per mapped item (typical 7-15 items) + 1 per custom inventory pool item (bisa puluhan)
- Halaman rekap loading lambat di akun dengan inventory katalog besar
- Comment di line 280 mengakui ini: "no batch RPC available"

**Suggested fix**: tambahkan RPC `get_current_stock_batch(item_ids UUID[])` returning JSONB map, lalu replace loop.

#### 7.2.2 [HIGH] Race condition pada simultaneous rekap submission

**File**: [src/lib/actions/rekap.ts:552-571](src/lib/actions/rekap.ts#L552-L571)

```ts
if (existing) {
  const { error } = await supabase
    .from("crew_rekap")
    .update(payload)
    .eq("id", existing.id);
  // ...
} else {
  const { error } = await supabase.from("crew_rekap").insert(payload);
  // ...
}
```

**Risk**: 
- Two-step read-then-write tanpa `FOR UPDATE` lock atau optimistic concurrency token
- Dua crew submit simultan untuk event yang sama → keduanya read `existing = null` → keduanya INSERT → UNIQUE constraint pada `event_id` akan reject yang kedua dengan error confusing
- Atau keduanya read `existing = X` → kedua UPDATE → last-write-wins, data crew yang submit duluan hilang

**Suggested fix**: pakai `UPSERT` (PostgREST `.upsert({...}, { onConflict: 'event_id' })`) — built-in atomic.

#### 7.2.3 [HIGH] Stock deduction insert + update tidak atomik di `approveRekap`

**Path**: `approveRekap` → INSERT N rows ke `stock_movements` → UPDATE `crew_rekap.stock_committed_at`. Jika failure di antara, stock movements terkomit tapi crew_rekap masih appear "not committed" — reject akan double-reverse atau gagal.

**Suggested fix**: bungkus ke RPC `commit_rekap_deduction(event_id, lines[])` yang melakukan semua dalam 1 transaction.

#### 7.2.4 [HIGH] Tidak ada `error.tsx` di route crew rekap

**Verifikasi**: `ls src/app/(crew)/crew/jadwal/[projectId]/` → hanya `page.tsx` + folder `rekap/`. Tidak ada `error.tsx` atau `loading.tsx`.

**Impact**: kalau `getRekapContext()` throw (mis. RLS deny, broken mapping data), crew dapat generic error page Next.js bukan UI yang friendly.

#### 7.2.5 [HIGH] Settlement button tidak destructive-styled

Lihat 7.1.2 (di-elevate ke critical karena impact-nya operasi destruktif tanpa konfirmasi).

### 7.3 MEDIUM

#### 7.3.1 [MEDIUM] RPC error handling generik

**File**: [src/lib/actions/settlements.ts:177-181](src/lib/actions/settlements.ts#L177-L181)

```ts
if (rpcError) {
  return {
    errors: { _form: [rpcError.message] },
    values: snapshotFormValues(formData),
  };
}
```

**Impact**: Owner lihat raw Postgres error message (mis. `relation "..." does not exist` atau `permission denied for table ...`) yang technical & tidak actionable.

**Suggested fix**: map known error codes (e.g., `SETTLEMENT_001` untuk "event already settled") ke pesan ID. RPC bisa pakai `RAISE EXCEPTION USING ERRCODE` untuk diagnostik.

#### 7.3.2 [MEDIUM] Proportional fallback silent ke equal mode

Lihat 5.4. RPC log ke `audit_log` tapi UI tidak surface.

#### 7.3.3 [MEDIUM] Custom inventory pool tanpa pagination

**File**: [src/lib/actions/rekap.ts:355-361](src/lib/actions/rekap.ts#L355-L361)

Query `inventory_items WHERE category='consumable'` tanpa LIMIT. Skala 1000+ items akan lambat dan blow up memory client.

#### 7.3.4 [MEDIUM] Tidak ada `loading.tsx` di route crew

Verifikasi: hanya `page.tsx` di `(crew)/crew/jadwal/[projectId]/rekap/`.

#### 7.3.5 [MEDIUM] Settlement form tidak inline-validate

NumberField tidak validate on blur — error muncul hanya setelah submit.

### 7.4 LOW

| # | File | Issue |
|---|---|---|
| 7.4.1 | [review-buttons.tsx](src/components/rekap/review-buttons.tsx) | Reject notes hanya cek `!notes.trim()` — bisa lolos "asdf" |
| 7.4.2 | [settlement-form.tsx](src/components/settlement/settlement-form.tsx) | Hidden inputs `hpp_auto_snapshot` & `hpp_was_overridden` tanpa aria-label |
| 7.4.3 | [settlements.ts:147-152](src/lib/actions/settlements.ts#L147-L152) | Owner list filter hard-coded ke `role IN (super_admin, owner)` — tidak ada flag `is_owner_in_pool` |

---

## 8. Data Integrity Risks

### 8.1 Settlement immutability tanpa safeguard UI (CRITICAL)

Sudah covered di 7.1.2. Mitigation: confirmation dialog + summary preview sebelum submit.

### 8.2 Partial transaction failure di approval

**Location**: `approveRekap()` orchestration

**Scenario**: 
1. UPDATE `crew_rekap.is_approved = true` succeeds
2. `planRekapDeduction()` INSERT 10 stock_movements — server timeout setelah row 7
3. UPDATE `crew_rekap.stock_committed_at` never runs
4. Result: rekap marked approved, 7 stock movements exist tapi crew_rekap.stock_committed_at = NULL → state inconsistent

**Mitigation**: bungkus ke single Postgres RPC dengan eksplisit BEGIN/COMMIT.

### 8.3 Race condition pada upsert crew_rekap (HIGH)

Sudah covered di 7.2.2. Mitigation: PostgREST UPSERT atau RPC.

### 8.4 Settlement bisa dibuat setelah rekap baru saja di-reject (MEDIUM)

**Scenario**: Owner approve → stock movements created → reject (stock reversed, is_approved=false) → klik settle → RPC validation `require_approved_rekap=true` akan block. **OK in current state**, tapi rentan kalau config flag di-flip ke false.

**Mitigation**: tambah explicit check di UI (`/settle` page) yang block jika rekap exist tapi not approved.

### 8.5 No idempotency token (LOW)

`closeSettlement` bisa di-call ulang jika network flaky → second call gagal karena UNIQUE event_id, tapi user confused.

**Mitigation**: add hidden form token, RPC reject second call gracefully.

---

## 9. Gap Analysis — Current vs Ideal Workflow

### 9.1 Ideal workflow

```
1. Crew submit rekap via mobile
2. Owner review & lengkapi fee/bonus
3. Owner settle event:
   ↳ auto-deduct warehouse
   ↳ auto-create journal entries (double-entry)
   ↳ sinking funds allocation
   ↳ owner pool allocation
   ↳ lock event data
4. Reopen settlement reverses ALL of the above
```

### 9.2 Current state per-step

| Step | Status | Detail |
|---|---|---|
| 1. Crew submit (mobile) | ✅ | Implemented + Phase F1/F2 expense fields (transport/bensin/toll/parkir/konsumsi/lainnya) |
| 2. Owner review & complete fee/bonus | ⚠️ | Implemented (review-buttons, approval-preview, tutup-buku mega-form), tapi UX tidak mandatory-flow fee/bonus completion (mudah dilupakan) |
| 3a. Auto-deduct warehouse | ✅ | Implemented dengan frame-size-aware mapping |
| 3b. Auto-create journal entries | ❌ | **STUB**: schema ada, logic tidak. Lihat 5.2 |
| 3c. Sinking allocation | ✅ | Percentage/flat per active fund. Lihat 5.3 |
| 3d. Owner pool allocation | ✅ | Equal/proportional dengan silent fallback. Lihat 5.4 |
| 3e. Lock event | ⚠️ | De facto via UNIQUE constraint + `is_reopened` flag. Tidak ada explicit `locked_at` |
| 4. Reopen reverses semua | ⚠️ | Sinking + owner_earnings: ✅. Stock movements: ❌ (apakah intentional?). Journal: N/A. Event status: ✅ reset ke awaiting_settlement |

### 9.3 Tabel comparison

| Capability | Ideal | Actual | Gap | Severity |
|---|---|---|---|---|
| Crew mobile submit | Yes | Yes | — | — |
| Field expenses (transport, BBM, dll) | Yes | Yes (Phase F1/F2) | — | — |
| Owner approval gate | Yes | Yes | — | — |
| HPP auto-derive | Yes | Yes | — | — |
| **HPP bonus inclusion** | Yes | **No (silently dropped)** | Bug 7.1.1 | CRITICAL |
| Stock auto-deduct on approve | Yes | Yes | Stock sufficiency check missing | MEDIUM |
| Settlement P&L compute | Yes | Yes | — | — |
| **Auto-journal (double-entry)** | Yes | **No** | Section 5.2 stub | HIGH |
| Sinking auto-allocate | Yes | Yes | COA link unused | LOW |
| Owner pool auto-distribute | Yes | Yes | Proportional fallback silent | MEDIUM |
| Lock data | Yes | De facto only | Explicit locked_at missing | MEDIUM |
| Reopen: reverse sinking | Yes | Yes | — | — |
| Reopen: reverse owner_earnings | Yes | Yes | — | — |
| **Reopen: reverse stock** | Yes (debatable) | **No** | Intent unclear | MEDIUM |
| Reopen: reverse journal | Yes | N/A | Karena journal belum ada | HIGH (tied to 5.2) |
| Settlement confirmation UI | Yes | **No** | Bug 7.1.2 | CRITICAL |
| Idempotency token | Yes | No | Risk 8.5 | LOW |

---

## 10. Priority Recommendations

### 10.1 CRITICAL — block production / fix segera

| # | Action | File | Effort |
|---|---|---|---|
| C1 | Tambah `"bonus"` ke `HPP_KEYS` di settlements.ts | [src/lib/actions/settlements.ts:9-17](src/lib/actions/settlements.ts#L9-L17) | XS |
| C2 | Tambah confirmation `<AlertDialog>` pre-submit settlement | [src/components/settlement/settlement-form.tsx](src/components/settlement/settlement-form.tsx) | S |
| C3 | Investigasi root cause 500 di `/operations/new` (lihat 6.5 hipotesis) | [src/app/(owner)/operations/new/page.tsx](src/app/(owner)/operations/new/page.tsx) | S |
| C4 | Tambah `error.tsx` di route crew rekap | new file di `(crew)/crew/jadwal/[projectId]/` | XS |

### 10.2 HIGH — next sprint

| # | Action |
|---|---|
| H1 | Implement journal_entries auto-creation di `close_event_settlement` RPC v5 + reversal di reopen |
| H2 | Wrap `approveRekap` insert+update dalam RPC transaction `commit_rekap_deduction()` |
| H3 | Ganti read-then-write di submitRekap ke PostgREST `.upsert({...}, { onConflict: 'event_id' })` |
| H4 | Tambah RPC batch `get_current_stock_batch(item_ids UUID[])` + refactor `getRekapContext` |
| H5 | Tambah `loading.tsx` di `(crew)/crew/jadwal/[projectId]/rekap/` |
| H6 | Surface "settlement is irreversible" warning di summary card sebelum submit |

### 10.3 MEDIUM — technical debt

| # | Action |
|---|---|
| M1 | Klarifikasi intent: apakah `reopen_event_settlement` harus reverse `stock_movements`? Decision → implementation atau document inactionable |
| M2 | Tambah `events.locked_at` column eksplisit + populate di settlement close |
| M3 | Surface proportional-fallback warning ke UI (UI/UX flag, bukan hanya audit_log) |
| M4 | Stock sufficiency check di `planRekapDeduction` — block approve kalau qty > current_stock |
| M5 | Pagination + search di custom inventory pool query (`getRekapContext`) |
| M6 | Idempotency token untuk `closeSettlement` |
| M7 | Map known RPC error codes ke pesan ID friendly di server actions |

### 10.4 LOW — polish

| # | Action |
|---|---|
| L1 | Min-length 5 chars pada reject notes |
| L2 | aria-label pada hidden inputs di `<SettlementForm>` |
| L3 | Consolidate owner pool filter ke flag `users.is_owner_in_pool` (alih-alih hard-coded role list) |

---

## 11. Risk Assessment untuk Refactoring

### 11.1 Risiko TINGGI

| Risk | Mitigation |
|---|---|
| **Mengubah signature `close_event_settlement` RPC** (mis. tambah `p_journal_entry_id` atau ubah `p_hpp` keys) | Buat v5 baru, biarkan v4 untuk backward compat. Update server action `closeSettlement` referensi ke v5. Hanya delete v4 setelah verifikasi tidak ada caller lain (cek `grep -rn "close_event_settlement" src/` — saat ini hanya 1 caller di settlements.ts) |
| **Implementasi auto-journal untuk historical events** | Forward-only — historical events tidak di-backfill (terlalu risky, COA mapping mungkin berbeda untuk record lama). Tambah note di finance dashboard: "Journal entries available from YYYY-MM-DD" |
| **Mengubah event_status ENUM** (mis. tambah `'locked'`) | Hindari kalau tidak benar-benar perlu. ENUM migration di Postgres mahal & deploy harus zero-downtime aware |
| **Memperbaiki HPP bonus bug (C1)** | **Verify dampak ke event sudah settled**: query `SELECT id FROM event_settlements WHERE hpp_bonus = 0 AND id IN (SELECT source_settlement_id FROM event_bonuses ...)` untuk identifikasi event yang under-reported. Decision: reopen + re-settle, atau adjustment entry manual. **Jangan langsung deploy fix tanpa data audit dulu** |

### 11.2 Risiko MEDIUM

| Risk | Mitigation |
|---|---|
| Mengubah RLS policies | Test di staging dengan multi-role user; tambah Playwright test untuk scenario crew/owner/super_admin |
| Menambah FOR UPDATE locks di crew_rekap | Cek apakah tutup-buku mega-form jadi deadlock (locks crew_rekap + event_settlements simultan) |
| Pagination custom inventory pool | Pastikan search behavior konsisten saat berpaginasi (jangan break flow crew yang biasa scroll list) |

### 11.3 Risiko RENDAH

| Risk | Mitigation |
|---|---|
| UI changes (confirmation dialog, styling) | Visual regression test (Playwright screenshot) |
| Error message improvements | — |
| Loading state additions | — |
| Aria-label additions | — |

### 11.4 Mitigation strategy umum

1. **Snapshot audit**: sebelum refactor, dump `event_settlements`, `sinking_fund_movements`, `owner_earnings` ke audit file untuk before/after diff
2. **Staging-first**: test setiap RPC change di staging dengan replica data nyata (anonymized)
3. **Keep `is_reopened` flag**: jangan hapus settlement lama saat reopen — biarkan untuk audit trail
4. **2 hal yang perlu klarifikasi dari user sebelum refactoring**:
   - Apakah stock_movements harus di-reverse pada settlement reopen? (atau intentional bahwa stock sudah "expense"-d permanen)
   - Strategi historical journal entries: forward-only atau backfill?

---

## 12. Appendix

### 12.1 Migration timeline (full)

Lihat 3.2.

### 12.2 RPC signature reference

#### `close_event_settlement` v4 (migration `20260517_settlement_close_v4.sql`)

```sql
close_event_settlement(
  p_event_id              UUID,
  p_revenue_gross         BIGINT,
  p_discount_total        BIGINT,
  p_hpp                   JSONB,  -- {mediaset, sleeve, flashdisk, pouch, photomagnet, keychain, bonus, other}
  p_opex                  JSONB,  -- 13 keys
  p_owner_user_ids        UUID[],
  p_owner_pool_per_person BIGINT,
  p_closed_by             UUID,
  p_hpp_auto_snapshot     JSONB DEFAULT NULL,
  p_hpp_was_overridden    BOOLEAN DEFAULT FALSE
) RETURNS UUID
```

#### `reopen_event_settlement` (migration `20260507_settlement_close_function.sql`)

```sql
reopen_event_settlement(
  p_settlement_id  UUID,
  p_reason         TEXT,
  p_actor_id       UUID
) RETURNS UUID
```

#### `get_current_stock` 

```sql
get_current_stock(p_item_id UUID) RETURNS BIGINT
```

#### `commit_stock_take`

```sql
commit_stock_take(
  p_stock_take_batch_id    UUID,
  p_committed_by_user_id   UUID
) RETURNS UUID
```

### 12.3 `system_config` flags reference

| Key | Type | Default | Used by |
|---|---|---|---|
| `settlement.require_approved_rekap` | bool | `true` | RPC `close_event_settlement` |
| `settlement.owner_pool_distribution_mode` | string | `'equal'` | RPC `close_event_settlement` |
| `rekap.auto_deduct_stock` | bool | `true` | `approveRekap()` server action |
| `tax.default_grossup_rate_pct` | number | `2` | `/operations/new` page (BookingForm gross-up) |

### 12.4 File index dengan LOC count (key files)

| File | LOC |
|---|---|
| [src/lib/actions/rekap.ts](src/lib/actions/rekap.ts) | 993 |
| [src/components/rekap/rekap-form.tsx](src/components/rekap/rekap-form.tsx) | ~42KB (≈ 1100 LOC) |
| [src/components/tutup-buku/tutup-buku-form.tsx](src/components/tutup-buku/tutup-buku-form.tsx) | ~31KB |
| [src/app/(owner)/operations/[projectId]/page.tsx](src/app/(owner)/operations/[projectId]/page.tsx) | ~31KB |
| [src/lib/actions/settlements.ts](src/lib/actions/settlements.ts) | 217 |
| [src/lib/actions/settlement-prefill.ts](src/lib/actions/settlement-prefill.ts) | 214 |
| [src/components/settlement/settlement-form.tsx](src/components/settlement/settlement-form.tsx) | ~16KB (≈ 540 LOC) |
| [src/components/items/rekap-mapping-form.tsx](src/components/items/rekap-mapping-form.tsx) | ~14KB |
| [src/lib/actions/rekap-mapping.ts](src/lib/actions/rekap-mapping.ts) | 138 |

### 12.5 Glossary

| Term | Arti |
|---|---|
| **HPP** | Harga Pokok Penjualan (Cost of Goods Sold). 8 buckets: mediaset, sleeve, flashdisk, pouch, photomagnet, keychain, bonus, other |
| **OpEx** | Operational Expense. 13 buckets: fees, transport, sewa, perawatan, konsumsi, komisi, platform, diskon |
| **Sinking Fund** | Reserve fund untuk biaya non-rutin (equipment, maintenance, crew reserve, emergency). Auto-allocated saat settlement |
| **Owner Pool** | Profit share pool untuk active owners. Distribusi equal atau proportional |
| **Frame-size-aware mapping** | `rekap_field_mapping` dengan composite PK `(rekap_field, frame_size)` — per ukuran frame bisa override item target |
| **Rekap** | Recap / summary konsumsi material event yang di-submit crew |
| **Tutup buku** | Mega-form yang gabungkan rekap submit + auto-approve + settlement close |
| **Reopen** | Buka kembali settlement yang sudah closed; super-admin only; reverse sinking + owner_earnings |
| **Settlement** | P&L closure + allocation; di-snapshot ke `event_settlements` (immutable kecuali via reopen) |

---

**End of audit.**

---

# 13. Database Refactor Completed (Pass 1)

**Tanggal**: 2026-05-19
**Branch**: `feat/rekap-refactor`
**Strategi**: EXTEND existing (no rename, no drop). Semua migration additive + idempotent.
**Status apply**: ⏳ **SQL files ditulis, BELUM di-apply ke Supabase remote**. User apply manual via Supabase Studio.

## 13.1 Migration files yang ditulis

Semua di [supabase/migrations/](supabase/migrations/) prefix `20260520_*`:

| # | File | Lines | Purpose |
|---|---|---|---|
| A | `20260520_chart_of_accounts_extra_seed.sql` | ~50 | Tambah 17 COA accounts (Mediaset Basic/Perforated split, Unearned Revenue, Revenue per event category, Fee Crew per role, Transport granular, Marketing/Bonus) |
| B | `20260520_crew_rekap_assignments_extend.sql` | ~100 | Tambah ke `crew_rekap`: `frame_size_snapshot`, `photomagnet_paid/_bonus`, `keychain_paid/_bonus`, `locked`, `locked_at`, `settled_at`, `status crew_rekap_status` enum. Tambah ke `crew_assignments`: `reimbursement_amount`, `total_fee` (generated), `payment_notes`. Backfill `status` dari `is_approved` historis. |
| C | `20260520_event_recap_proofs.sql` | ~80 | Tabel baru `event_recap_proofs` (proof per row dengan `photo_type` enum) + backfill dari `crew_rekap.proof_photo_urls` array → rows |
| D | `20260520_event_recap_misc_expenses.sql` | ~70 | Tabel baru `event_recap_misc_expenses` (description, amount, receipt_url) + backfill dari `crew_rekap.lainnya_items` JSONB array |
| E | `20260520_frame_size_mapping.sql` | ~70 | Tabel baru `frame_size_mapping` (frame_size → mediaset_type, ratio per print) + seed 3 row: 4R/2R/Polaroid |
| F | `20260520_package_items_mapping.sql` | ~50 | Tabel baru `package_items_mapping` (package → item ratio, is_included flag) |
| G | `20260520_recap_helper_functions.sql` | ~200 | Functions: `generate_journal_reference(date)`, `calculate_recap_hpp(recap_id)`, `calculate_recap_opex(recap_id)` |
| H | `20260520_settle_event_wrappers.sql` | ~950 | Functions: `_validate_recap_stock_sufficient(recap_id)`, `_create_settlement_journal(...)`, **`settle_event(event_id, owner_user_id, overrides JSONB)`**, **`reopen_settlement(event_id, owner_user_id, reason)`** |
| I | `20260520_rls_new_tables.sql` | ~120 | RLS policies untuk 4 tabel baru: event_recap_proofs, event_recap_misc_expenses, frame_size_mapping, package_items_mapping |

**Total**: 9 file SQL, ~1,690 baris.

## 13.2 Tabel baru / enhanced

### Baru (4):
- `event_recap_proofs` — proof photos per-row dengan kategori (counter_dslr, transport_receipt, consumable, area_event, other)
- `event_recap_misc_expenses` — misc costs per-row (description, amount, receipt_url)
- `frame_size_mapping` — frame_size → material recipe (mediaset_type basic/perforated, ratios)
- `package_items_mapping` — package → consumable items mapping

### Enhanced (2):
- `crew_rekap`: +9 kolom (frame_size_snapshot, photomagnet/keychain paid/bonus split, locked, locked_at, settled_at, status enum)
- `crew_assignments`: +3 kolom (reimbursement_amount, total_fee generated, payment_notes)

### Seed enhanced (1):
- `chart_of_accounts`: +17 baru (additive ke 40+ existing)

## 13.3 Functions yang dibuat

| Function | Purpose | Signature |
|---|---|---|
| `generate_journal_reference(p_date DATE)` | Generate next ref ID format JE-YYYYMMDD-NNN | RETURNS TEXT |
| `calculate_recap_hpp(p_recap_id UUID)` | Auto-derive HPP per bucket dari rekap × mapping × inventory cost (frame-size-aware, includes bonus) | RETURNS JSONB |
| `calculate_recap_opex(p_recap_id UUID)` | Auto-derive OpEx dari crew_rekap field expenses + misc_expenses + crew_assignments fees | RETURNS JSONB |
| `_validate_recap_stock_sufficient(p_recap_id UUID)` | Check stock cukup untuk deduction | RETURNS JSONB `{sufficient, shortages[]}` |
| `_create_settlement_journal(...)` | Internal: build journal_entries + journal_lines double-entry untuk settlement | RETURNS UUID |
| **`settle_event(p_event_id, p_owner_user_id, p_overrides JSONB DEFAULT NULL)`** | **Atomic full settlement**: validates, auto-HPP/OpEx, stock deduct, sinking, owner pool, journal, lock event+recap, audit log | RETURNS JSONB |
| **`reopen_settlement(p_event_id, p_owner_user_id, p_reason TEXT)`** | **Atomic reversal** super_admin only: reverse sinking + owner_earnings + stock + journal entries, unlock | RETURNS JSONB |

## 13.4 Fix yang dilakukan vs audit findings

| Audit finding | Fix di refactor |
|---|---|
| 5.2 Finance/Journal STUBBED | ✅ `settle_event` panggil `_create_settlement_journal` yang INSERT 13+ baris journal_lines (double-entry GL) |
| 7.1.1 HPP bonus key silently dropped | ✅ `settle_event` auto-derive HPP via `calculate_recap_hpp` yang HANDLE bonus dari `event_bonuses`. App code refactor masih perlu pakai `settle_event` instead of `close_event_settlement` |
| Stock sufficiency check missing (5.1, 8.2) | ✅ `_validate_recap_stock_sufficient` di-call sebelum deduction; raise exception kalau ada shortage |
| Locking mechanism implicit (4.4) | ✅ `crew_rekap.locked` boolean explicit + `locked_at`, `settled_at`. Event status tetap pakai `'completed'` |
| Stock reversal on reopen tidak ada (5.1) | ✅ `reopen_settlement` INSERT positive `in` movements untuk reverse `out` movements |
| Audit log per state transition (lock/unlock/settle/reopen) | ✅ `settle_event` & `reopen_settlement` INSERT ke `audit_log` |

Note: bug 7.1.1 (HPP bonus drop di `settlements.ts` server action) **belum di-fix di app code** — refactor session berikutnya. Database layer sudah ready menerima settle_event call yang bener.

## 13.5 Cara apply (manual via Supabase Studio)

Apply migration files dalam urutan ini (saling depend):

```
1. 20260520_chart_of_accounts_extra_seed.sql      (independent)
2. 20260520_crew_rekap_assignments_extend.sql     (depends on: crew_rekap, crew_assignments existing)
3. 20260520_event_recap_proofs.sql                (depends on: crew_rekap)
4. 20260520_event_recap_misc_expenses.sql         (depends on: crew_rekap)
5. 20260520_frame_size_mapping.sql                (depends on: frame_size enum, update_updated_at fn)
6. 20260520_package_items_mapping.sql             (depends on: packages, inventory_items)
7. 20260520_recap_helper_functions.sql            (depends on: 2, 3, 4, 5; uses calculate_recap_*)
8. 20260520_settle_event_wrappers.sql             (depends on: 7; uses helper fns)
9. 20260520_rls_new_tables.sql                    (depends on: 3, 4, 5, 6)
```

Setiap file idempotent — bisa di-re-run kalau perlu (CREATE TABLE IF NOT EXISTS, ALTER ... ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS pattern).

**Backup dulu** sebelum apply (user sudah konfirmasi backup manual).

## 13.6 Test queries (post-apply verification)

```sql
-- 1. COA seed verification
SELECT account_type, COUNT(*) FROM chart_of_accounts GROUP BY account_type ORDER BY account_type;
-- Expected: asset~14, liability~10, equity~2, revenue~10, expense~22 (counts after this seed merge)

-- 2. Frame size mapping seed
SELECT frame_size, mediaset_type, mediaset_per_print, sleeve_per_print, prints_per_mediaset
FROM frame_size_mapping ORDER BY frame_size;
-- Expected: 3 rows (4R/2R/polaroid)

-- 3. Backfill proof photos (cross-check)
SELECT
  (SELECT COUNT(*) FROM event_recap_proofs) AS proofs_rows,
  (SELECT SUM(COALESCE(array_length(proof_photo_urls, 1), 0)) FROM crew_rekap) AS proof_urls_total;
-- Expected: equal

-- 4. Backfill misc expenses (cross-check)
SELECT
  (SELECT COUNT(*) FROM event_recap_misc_expenses) AS misc_rows,
  (SELECT SUM(jsonb_array_length(lainnya_items))
     FROM crew_rekap
     WHERE jsonb_typeof(lainnya_items) = 'array') AS lainnya_total;
-- Expected: equal

-- 5. crew_rekap status backfill
SELECT status, COUNT(*) FROM crew_rekap GROUP BY status;
-- Expected: rows distributed across draft/submitted/reviewed/rejected

-- 6. crew_assignments total_fee generated column
SELECT id, fee_amount, bonus_amount, reimbursement_amount, total_fee
FROM crew_assignments LIMIT 5;
-- Expected: total_fee = fee + bonus + reimbursement

-- 7. Helper functions exist & callable
SELECT proname FROM pg_proc
WHERE proname IN ('generate_journal_reference','calculate_recap_hpp','calculate_recap_opex',
                  'settle_event','reopen_settlement','_validate_recap_stock_sufficient',
                  '_create_settlement_journal')
ORDER BY proname;
-- Expected: 7 rows

-- 8. Generate journal ref test
SELECT generate_journal_reference(CURRENT_DATE);
-- Expected: 'JE-YYYYMMDD-001' (or higher counter if entries exist for today)

-- 9. calculate_recap_hpp test (pakai recap yang exist)
SELECT id, event_id, calculate_recap_hpp(id) AS hpp_breakdown
FROM crew_rekap WHERE is_approved = true LIMIT 3;
-- Expected: JSONB dengan keys mediaset/sleeve/.../bonus/other/total

-- 10. calculate_recap_opex test
SELECT id, event_id, calculate_recap_opex(id) AS opex_breakdown
FROM crew_rekap WHERE is_approved = true LIMIT 3;

-- 11. RLS sanity check
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('event_recap_proofs','event_recap_misc_expenses',
                  'frame_size_mapping','package_items_mapping');
-- Expected: all 't'

-- 12. End-to-end settle_event test (DRY — pilih event status='awaiting_settlement' dengan rekap approved)
-- ⚠️ INI DESTRUCTIVE - jangan di-run di prod tanpa konfirmasi
-- SELECT settle_event('<event-uuid>', '<owner-uuid>');
-- Expected: JSONB dengan settlement_id, journal_entry_id, stock_batch_id, dll.
```

## 13.7 Apa yang BELUM dilakukan (sengaja, untuk session berikutnya)

| Item | Alasan |
|---|---|
| App code refactor (`src/lib/actions/settlements.ts` dll) | DB layer dulu. Next session: rewrite server action untuk call `settle_event` instead of `close_event_settlement`. |
| Fix `z.iso.date()` confusion | Bukan bug (verified Zod v4 mendukung). Skip. |
| Confirmation dialog di SettlementForm | UI work, beda scope dari DB schema task ini. |
| Migrasi data event existing yang punya `hpp_bonus = 0` | Audit dulu jumlah event affected (lihat query di Section 11.1). Decide reopen + re-settle vs adjustment entry manual. |
| Deprecate `close_event_settlement` v4 RPC | Co-exist dulu. Hapus setelah app code 100% switch ke `settle_event`. |
| `event_addons.discount` handling | Tidak ada kolom discount di events; sumber discount masih unclear (custom_package_price sudah final, atau pre-discount?). Klarifikasi user dulu. |

## 13.8 Cara rollback (kalau perlu)

Karena semua migration ADD-only (no DROP), rollback bisa selective:

```sql
-- Rollback Migration B columns (DESTRUCTIVE — data hilang):
ALTER TABLE crew_rekap
  DROP COLUMN IF EXISTS frame_size_snapshot,
  DROP COLUMN IF EXISTS photomagnet_paid, DROP COLUMN IF EXISTS photomagnet_bonus,
  DROP COLUMN IF EXISTS keychain_paid, DROP COLUMN IF EXISTS keychain_bonus,
  DROP COLUMN IF EXISTS locked, DROP COLUMN IF EXISTS locked_at, DROP COLUMN IF EXISTS settled_at,
  DROP COLUMN IF EXISTS status;
DROP TYPE IF EXISTS crew_rekap_status;
ALTER TABLE crew_assignments
  DROP COLUMN IF EXISTS reimbursement_amount,
  DROP COLUMN IF EXISTS total_fee, DROP COLUMN IF EXISTS payment_notes;

-- Rollback new tables (DESTRUCTIVE):
DROP TABLE IF EXISTS event_recap_proofs CASCADE;
DROP TABLE IF EXISTS event_recap_misc_expenses CASCADE;
DROP TABLE IF EXISTS frame_size_mapping CASCADE;
DROP TABLE IF EXISTS package_items_mapping CASCADE;
DROP TYPE IF EXISTS event_recap_proof_type;
DROP TYPE IF EXISTS mediaset_type;

-- Rollback functions:
DROP FUNCTION IF EXISTS settle_event(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS reopen_settlement(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS _create_settlement_journal(UUID, UUID, JSONB, JSONB, BIGINT, BIGINT, BIGINT, BIGINT, UUID, DATE);
DROP FUNCTION IF EXISTS _validate_recap_stock_sufficient(UUID);
DROP FUNCTION IF EXISTS calculate_recap_hpp(UUID);
DROP FUNCTION IF EXISTS calculate_recap_opex(UUID);
DROP FUNCTION IF EXISTS generate_journal_reference(DATE);

-- COA seed: tidak rollback (additive seed, tidak mengganggu data existing)
```

⚠️ Rollback Migration B & C akan menghapus data yang sudah di-backfill ke kolom/tabel baru. Pastikan tidak ada app code yang sudah pakai sebelum rollback.

---

**End of refactor pass 1 documentation.**
