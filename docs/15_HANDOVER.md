# 15 — Session Handover & Phase-2 Migration Plan

**Tanggal handover:** 2026-05-07
**Build status:** ✅ green · 30+ routes deployed · 2 migrations live di Supabase
**Last commit:** `f5d8661` — Phase-3 master data (backdrops + event types + investor share + items CSV import)

Dokumen ini buat orient sesi chat Claude berikutnya. Bukan spec — ini *snapshot* state saat ini + konsep yang sudah dirumuskan + rekomendasi langkah berikutnya.

---

## 1. State sekarang — apa yang sudah jadi

### Owner-side (sudah lengkap)
- **Auth + role routing** (super_admin / owner / crew / pending)
- **Dashboard** (KPIs, pipeline, today/tomorrow, recent activity)
- **Operations** dengan 4 view: List, Calendar, Board, Design Hub
- **Event detail** dengan: Klien card, Service card (with backdrop), Event card, Lokasi card, Crew card, Add-ons card, Financial card, Settlement summary card, **Event Readiness checklist (H-N)**, Activity feed (audit_log timeline), Design card, Settlement summary
- **Booking form**: backdrop dropdown (rental auto-add Rp 500k, vendor markup field), event type dropdown, package picker, addon selector, financial breakdown
- **Equipment per event**: check-out/check-in flow + incident reports per row
- **Crew rekap submission** (owner-side) + review/approve flow + auto-display di settle page
- **Per-crew WA reminder** (button per assignment row)
- **Settlement engine** dengan atomic RPC: snapshot P&L, sinking fund deposits, **proportional owner pool** (share-based dari users.share_pct, fallback flat)
- **Billing dashboard** (KPIs + invoice list + payment logging)
- **Warehouse**: real stock tracking, Quick Adjust dialog, Movements log
- **Settings** (semua tab functional):
  - System Configuration (categorized key-value editor)
  - Packages CRUD
  - Add-ons CRUD
  - **Backdrops CRUD** (8 seeded)
  - Items CRUD + **Bulk paste-CSV importer**
  - Bank Accounts
  - Master Crew + **Investor Capital & Share editor** (super_admin only)
  - Sinking Funds CRUD + per-fund movements page
  - WhatsApp Templates CRUD (with insert-variable chips + live preview)
  - Notification Rules editor (read-only trigger_condition)
  - Audit Log viewer (filterable, paginated)

### Crew-side
- **Stub only** — `/crew` cuma ada home + bottom nav. Jadwal, alat, fee, profile pages belum dibikin. Crew app fully-functional adalah blocker terbesar buat go-live tim.

### Mobile / PWA
- iOS HIG pass complete: bottom tab bar (Dashboard/Operations/Billing/More), safe-area insets (Dynamic Island/notch), 44pt touch targets, manifest.json, "Add to Home Screen" feel native
- Crew bottom nav exists tapi page-nya stub

### Database state
- **Schema lengkap** (`05_DATABASE_SCHEMA.sql`) sudah di-apply ke Supabase production
- **2 migration tambahan** sudah di-apply manual oleh Rama di Supabase Dashboard:
  1. `20260507_settlement_close_function.sql` — atomic RPC + reopen
  2. `20260507_backdrops_event_types_investors.sql` — backdrops, event_types, users.share_pct, events.backdrop_id, RPC v2 dengan proportional distribution
- **Tabel master sudah seeded:** sinking_funds (4), notification_rules (~15), whatsapp_templates (~5), backdrops (8), event_types (8), system_config (~25)

### Real production data status
- 1 event live: `PRJ-20260822-7378` Maman Sudarman — sudah di-settle, `payment_status=Unpaid` (Rp 1.8jt outstanding)
- Inventory items belum di-import dari `SYS_ITEMS.csv` — siap diimport via `/settings/items/import`
- Crew belum di-tambah secara penuh (Rama udah ada sebagai super_admin; perlu add Fahmi, Acuy, Iqbal, Mou, Kuku, Ceca, Weni, Bona, Rangga)
- Investor share belum di-set — semua owner masih flat distribution

---

## 2. Konsep cut-off untuk Phase-2 migration (REFINED)

Rama mau import `DB_PROJECTS.csv` dari sistem lama (~120 events, 2024-2026). Ide awal: "import buat rekam jejak, tapi finance fresh start". Saya refine jadi tiga kategori cut-off yang precise:

### Kategori A — Past events (closed, archive-only)
**Definisi:** `event_date < today` AND `Status_Project IN (Done, Lunas)`

- Insert ke `events` dengan flag `is_migrated_legacy = true` (kolom baru)
- Status di-set ke `archived` (atau `completed` jika mau muncul di Operations List default — perlu decide)
- `total_paid = grand_total`, `remaining_balance = 0`, `payment_status = paid` — di-mark "lunas historis"
- **JANGAN insert ke tables ini (financial cut-off):**
  - `payments` — no historical payment trail
  - `event_settlements` — no historical P&L
  - `journal_entries` / `journal_lines` — no historical bookkeeping
  - `owner_earnings` — no historical share distribution
  - `sinking_fund_movements` — no historical fund deposits
  - `stock_movements` — no historical inventory consumption
  - `crew_rekap` — no historical rekap forms
- **Boleh insert (operational track record):**
  - `events` row dengan basic data (project_id, client_name, event_date, venue, package_id mapped, base_price, grand_total, channel, event_category, design status)
  - `crew_assignments` jika nama crew bisa di-resolve (best-effort match by full_name)
- Visual: badge "📦 Migrated" di event detail + filter di Operations List
- Read-only: tidak bisa di-edit / di-settle / di-payment / di-rekap

### Kategori B — Future / in-progress events (live)
**Definisi:** `event_date >= today` OR `Status_Project IN (Upcoming, In Progress)` AND DP/Lunas

- Insert ke `events` sebagai live booking, `is_migrated_legacy = false`
- Status di-map dari kombinasi:
  - `Status_Project = Upcoming` + `Payment_Status = DP` → `confirmed` atau `upcoming` (tergantung H-N)
  - `Payment_Status = Unpaid` + future date → `draft`
  - `Status_Project = In Progress` → `in_progress`
- **Insert ke tables ini (live data):**
  - `payments` row tunggal jika `Paid > 0` — sebagai "DP migration" dengan note "Migrated from Phase 2"
  - `crew_assignments` (best-effort)
- **JANGAN insert** event_settlements / owner_earnings / sinking_fund_movements / stock_movements / journal_entries — itu akan tercipta natural saat owner settle event di sistem baru
- Visual: badge kecil "📥 Imported" — tapi tetap fully editable

### Kategori C — Cut-off financial baseline
- **Tanggal cut-off:** hari migration dijalankan (let's call it `MIGRATION_DATE`)
- Semua event yang event_date < MIGRATION_DATE dan masih belum lunas → owner decide manual: drop atau treat as Kategori A (anggap lunas)
- Sistem tidak auto-backfill historical financial data
- Reports/KPIs di Dashboard sudah filter `is_migrated_legacy = false` untuk:
  - This Month Revenue
  - Outstanding
  - Net Profit MTD
  - Cash position
- Tapi tampilkan Kategori A di Operations history viewer (read-only listing) untuk track record

### Field mapping (Phase 2 → Phase 3)

| Old (DB_PROJECTS) | New (events) | Catatan |
|---|---|---|
| `Project_Id` | `project_id` | as-is, tapi pastikan unique |
| `Invoice_Number` | `legacy_invoice_number` (NEW column) | back-compat reference |
| `Booker_Contact_ID` / `PIC_Contact_ID` | — | skip (no contacts table) |
| `Client_or_Event_Name` | `client_name` | |
| `EventType` | `event_category` | uppercase → lowercase + match ke event_types code |
| `EventDate` | `event_date` | normalize "12/18/2024" → "2024-12-18" |
| `Setup_Time/StartTime/EndTime` | `setup_time/start_time/end_time` | "10:00" → "10:00:00" |
| `Sleeve_Type` | `frame_size` | "2R"→"2R", "4R"→"4R", "PR"→"polaroid" |
| `Package_Name` | `package_id` (resolved) | match by name; null kalau "Custom Package" |
| `Base_Price_Rp` | `base_price` | |
| `Background_Type` | `backdrop_id` (resolved) + `vendor_decor_markup` | "Klien / Dekor" → vendor_decor + markup; "Tetra Gold" → BG-BASIC-GOLD; etc. |
| `Include_Flashdisk` | `include_flashdisk_pouch` | "TRUE"/"Ya"→true |
| `Payment_Status` | `payment_status` | "Lunas"→paid, "DP"→partial, "Unpaid"→unpaid |
| `Payment_Due_Date` | `due_date` | |
| `Balance_Due` | `remaining_balance` | sanity-check: paid + balance == grand_total |
| `Paid` | `total_paid` | |
| `Komisi_Rp` | (skip — financial cut-off) | |
| `Discount` | `discount_amount` | empty/No → 0 |
| `Gross_Up` | `gross_up_pph_amount` | empty → 0 |
| `Tax` | (skip atau lump ke gross_up) | |
| `Total_Price` | `grand_total` | |
| `Crew_Assigned_A` | `crew_assignments` row (lead) | match by users.full_name (case-insensitive contains) |
| `Crew_Assigned_B` | `crew_assignments` row (asisten) | sama |
| `Venue` | `venue_name` | |
| `City` | `venue_city` | |
| `Location_Maps_URL` | `venue_address` (atau new `venue_maps_url`) | |
| `Channel_Code` | `channel` | "Direct"→direct, "Vendor"→vendor, "Relasi"→relasi |
| `Vendor_ID` | (skip atau ke notes) | no vendor master yet |
| `Design_Status` | `design_brief_at` / `design_approved_at` | "Desain ACC"→both timestamps; "Brief Masuk"→brief_at only; "Menunggu ACC"→brief_at; "Diproses"→none |
| `Design_Link` | `design_drive_folder_url` | |
| `Status_Project` | `status` | mapping: Done→archived (or completed), Upcoming→upcoming, In Progress→in_progress |
| `Notes` | `crew_notes` | strip "*Migrasi Historis*" suffix |

### Edge cases
- **Crew name mismatch:** old uses "Eman", "Wahab", "Surya" — gak ada di SYS_CREW. Skip assignment, log ke import report. Owner manual fix later.
- **Empty Package_Name:** insert dengan `package_id=null` + `base_price=0`
- **Custom Package:** insert dengan `package_id=null` + base_price as-is
- **Empty crew names** (kosong di banyak future rows): skip assignment
- **Date format inconsistency:** beberapa "12/18/2024" beberapa "2024-12-18". Parser harus handle keduanya.
- **Tetra Silver/Putih/Merah/Hitam** → match ke BG-BASIC-* by color suffix
- **"Klien / Decor (Sedia Sendiri)"** = vendor_decor type, markup default Rp 0 (klien sediakan sendiri)

---

## 3. Yang sudah dibikin tapi belum di-deploy/applied

Tidak ada — semua up-to-date di main + production.

---

## 4. Roadmap berikutnya — by priority

### Highest impact
1. **DB_PROJECTS migration tool** (sesuai konsep cut-off di atas) — `/settings/operations/import-projects` super_admin only
2. **Crew App functional** — tim 8 crew belum bisa pakai. Blocker terbesar untuk go-live adoption
3. **Crew + Packages CSV bulk importer** — pattern sama dengan Items, gampang
4. **Notifications inbox + bell** — owner dapat anomaly alerts (rules sudah seeded)

### Medium impact
5. **Vendor / Partner Organizer master** — Mba Rahma, Pojok Kreatif, Fervida Planner dari DB_PROJECTS dijadiin entity → dropdown saat channel=vendor
6. **PDF generation** — Invoice, Quotation, BAST (FSD §13)
7. **Status auto-transition cron** — H-7 confirmed→upcoming, on event_day→in_progress, after event_day→awaiting_settlement
8. **Anomaly scanner cron** — fire notifications dari rules yang sudah aktif

### Lower priority
9. **Onboarding wizard** untuk fresh install (FSD §14)
10. **Drive integration** untuk auto-create event folders
11. **Fixed asset depreciation engine** (computed monthly dari useful_life_months)
12. **Reports module** (monthly P&L, owner earnings statement, crew performance)

---

## 5. Konvensi & gotchas yang sudah established

- **Migration approach:** semua migration baru → tulis SQL file di `supabase/migrations/`, instruct user paste ke Supabase Dashboard SQL Editor. Aplikasi bukan auto-applied.
- **No new doc files unless requested:** user prefer existing docs di `docs/` jadi rujukan, tidak suka spawn doc baru tanpa permintaan eksplisit.
- **Feedback memori penting:** lihat `~/.claude/projects/-Users-macbookpro-Desktop-tetra-ops/memory/MEMORY.md`. Khususnya:
  - **Always read** `docs/04_DESIGN_SYSTEM.md` + PRD/FSD/TSD before writing UI code; pakai semantic tokens (bg-card, text-foreground, border-border, dst.) — JANGAN hard-code zinc/slate
  - **Pre-push protocol:** always `pnpm build` + smoke-test new INSERT/UPDATE actions before push. Next.js `'use server'` files cannot export non-async-functions (constants must live in separate non-server module). NOT NULL columns harus di-populate.
- **Permission settings** (`~/.claude/settings.json`): `git push` ke main sudah whitelisted setelah Rama explicit approval
- **Auto mode:** Rama prefer execute-action over plan-and-ask. Tapi tetap pause sebelum risky/destructive operations.
- **Code style:** Biome formatter (4-space indent, double quotes), 'use server'/'use client' directives correct, semantic colors, tabular nums for numbers, `formatRupiah()` helper for IDR.
- **Components grouped per domain:** `src/components/{settlement,backdrops,booking,event-design,event-equipment,investors,items,notification-rules,operations,rekap,sinking-funds,system-config,whatsapp-templates,layouts,ui,...}` — keep this pattern.
- **No mock data, no fake user data** kecuali untuk preview/template (e.g. PREVIEW_VALUES di template editor).

---

## 6. Files yang baru-baru dibuat (untuk awareness)

```
supabase/migrations/
├── 20260507_settlement_close_function.sql       (applied)
└── 20260507_backdrops_event_types_investors.sql (applied)

src/
├── lib/actions/
│   ├── backdrops.ts
│   ├── event-design.ts
│   ├── event-equipment.ts
│   ├── investors.ts
│   ├── items-import.ts
│   ├── items.ts
│   ├── notification-rules.ts
│   ├── rekap.ts
│   ├── settlements.ts
│   ├── sinking-funds.ts
│   ├── stock-movements.ts
│   ├── system-config.ts
│   └── whatsapp-templates.ts
├── components/
│   ├── audit-log/
│   ├── backdrops/
│   ├── event-design/
│   ├── event-equipment/
│   ├── investors/
│   ├── items/
│   ├── notification-rules/
│   ├── operations/  (activity-feed, readiness-card, view-switcher, kpi-card, filter-bar, pipeline-card)
│   ├── rekap/
│   ├── settlement/
│   ├── sinking-funds/
│   ├── system-config/
│   └── whatsapp-templates/
└── app/(owner)/
    ├── operations/
    │   ├── board/page.tsx
    │   ├── calendar/page.tsx
    │   ├── design/page.tsx
    │   └── [projectId]/{equipment,rekap,settle}/page.tsx
    └── settings/
        ├── backdrops/{[id]/edit, new, page}.tsx
        ├── items/{[id]/edit, import, new, page}.tsx
        ├── notification-rules/[id]/edit/page.tsx
        ├── sinking-funds/{[id]/{edit,movements}, new, page}.tsx
        └── whatsapp-templates/{[id]/edit, new, page}.tsx
```

---

## 7. Production env

- **App:** https://tetra-ops.vercel.app (auto-deploy on push to main)
- **Repo:** https://github.com/ramaactivity/tetra-ops
- **Supabase project:** `rdrkzwesykebhibcwcsj` (ramaactivity, FREE tier)
- **DB:** Asia/Singapore region

---

## 8. Open decisions

- **Past-event status:** `archived` (hidden from default list) vs `completed` (visible). Saya prefer `archived` + filter chip "Show archived" supaya operations list bersih, tapi rekam jejak tetap accessible.
- **Vendor master:** belum ada. Untuk sekarang vendor name di-store di `crew_notes` atau `events.notes`. Kalau ada banyak event vendor, dedicated vendor master worth it.
- **Old `backdrop_source` + `backdrop_color` columns** di events table: masih ada untuk back-compat. Suatu saat bisa di-drop kalau confirmed gak ada referensi.
- **Investor pool default Rp 50k** vs proporsional: sekarang RPC sudah support both. Kalau Rama input share_pct di Master Crew, otomatis switch ke proportional.
