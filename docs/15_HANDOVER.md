# 15 — Session Handover & Implementation Plan Status

**Last updated:** 2026-05-10 (sesi 8 — Rekap → Inventory → HPP → Settlement integrity)
**Last commit:** `9727e14` — feat(settlement): hard-gate rekap + share_pct distribution + auto-snapshot
**Production URL:** https://tetra-ops.vercel.app
**GitHub:** https://github.com/ramaactivity/tetra-ops
**Active plan file:** `~/.claude/plans/sekarang-saya-ingin-fokus-zazzy-starlight.md` (sesi 8)
**Prior redesign plan:** `~/.claude/plans/saya-mau-fokus-polish-eventual-gem.md` (locked sesi 4)
**Status memory:** `feedback_redesign_direction.md` (full sesi 5 commit list + phase status)

---

## 0c. Sesi 8 closure — Rekap → Inventory → HPP integrity (6 commits + docs)

Goal: every P&L number traces from physical reality (crew rekap) → inventory cost
→ HPP → settlement → reports. Owner doesn't retype numbers that should auto-derive.

Phase A — Foundation (additive, zero behavior change):
- `f5c52c7` — Fix `purchase_price_avg` weighted-average bug. Was overwriting
  with the new unit_cost on each purchase movement; now does proper
  `(old_stock × old_avg + new_qty × new_cost) / total` formula in
  src/lib/actions/stock-movements.ts. Affects only future restocks.
- `bf7b921` — `rekap_field_mapping` table + /settings/items/mapping page.
  Maps crew_rekap fields (cetak_total, media_set_used, sleeve_used,
  flashdisk_used, pouch_used, photomagnet_used, keychain_used) to
  inventory_items SKUs with qty_per_unit multiplier. Inline edit, per-row
  save with "Saved" tick. Constants split to src/lib/rekap-mapping/types.ts.
- `8f1d01f` — Stock-take workflow at /warehouse/stock-take. New tables
  stock_takes + stock_take_lines + RPC commit_stock_take(). List page,
  per-take line-edit grid sorted by variance, Commit + Cancel actions
  behind ConfirmDialog. Generates one adjustment stock_movement per
  non-zero variance on commit.

Phase B — Auto-deduct stock on rekap approval:
- `c8f618c` — reviewRekap extended. ALTER TYPE movement_source ADD VALUE
  'rekap_consumption'. crew_rekap gains stock_committed_at +
  stock_movement_batch_id columns. On approval transition: insert N out-
  movements (qty=rekap×qty_per_unit, unit_cost=item.purchase_price_avg).
  On reject after prior approval: insert reversing 'in' movements with
  "Reversal" notes. Idempotent — re-approval without reject is no-op for
  stock. New `<RekapApprovalPreview/>` shows deduction plan before owner
  clicks Approve, with missing-mapping warnings + link to mapping page.
  system_config seeds: `rekap.auto_deduct_stock=true`,
  `settlement.require_approved_rekap=true`,
  `settlement.owner_pool_distribution_mode='equal'`.

Phase C — Auto-prefill HPP from rekap × stok avg-cost:
- `41cef34` — New action `getAutoHpp(eventId)` reads rekap × mapping ×
  purchase_price_avg, returns per-bucket auto cost
  ({mediaset, sleeve, flashdisk, pouch, photomagnet, keychain, other}).
  custom_materials JSONB → "other" bucket. Settle form hydrates HPP
  defaults from autoHpp prop. NumberField gains tone (primary/amber) +
  "Reset ke auto" button. Manual-override fields show amber border +
  hint "Auto: Rp X · MANUAL OVERRIDE". Hidden inputs `hpp_auto_snapshot`
  + `hpp_was_overridden` carry audit values to RPC. event_settlements
  gains both columns.

Phase D — Hard gate + share_pct distribution:
- `9727e14` — close_event_settlement RPC v3. Reads
  `settlement.require_approved_rekap` flag — RAISES P0001 if rekap not
  approved. Reads `settlement.owner_pool_distribution_mode` — 'equal'
  (default) keeps per-person split; 'proportional' distributes by
  users.share_pct (validates SUM≈100 ±0.5 + no NULL, else fallback to
  equal + audit_log warning). Persists hpp_auto_snapshot +
  hpp_was_overridden into event_settlements. Audit log includes
  distribution_mode + hpp_was_overridden. Settle page hard-blocks UI
  with rose card "Settlement diblokir — rekap belum di-approve" instead
  of soft warning when flag is on.

⚠️ Manual steps Rama (urutan):
1. Paste migrations to Supabase SQL Editor (urutan strict):
   - `20260511_rekap_item_mapping.sql`
   - `20260511_rekap_consumption_link.sql` (run as standalone — ALTER TYPE
     ADD VALUE cannot be inside transaction block)
   - `20260511_stock_take.sql`
   - `20260511_settlement_auto_hpp.sql`
   - `20260511_integrity_flags.sql`
   - `20260511_settlement_close_v3.sql` (must be last — uses both columns + flags)
2. Buka /settings/items/mapping → pilih SKU per rekap field, set qty_per_unit
   (mediaset biasanya 1 set = 2 cetak → qty_per_unit=2 atau leave 1 if
   mapping → cetak SKU directly).
3. Smoke test rekap → settle flow:
   - Approve rekap di /operations/PRJ-X/rekap → cek 7+ stock_movements
     muncul dengan source='rekap_consumption'.
   - Buka /operations/PRJ-X/settle → form HPP auto-prefilled.
   - Submit → cek event_settlements.hpp_auto_snapshot + hpp_was_overridden.
   - Test reject after approval → cek reversal movements muncul.
   - Test settle without approval (turn off via /settings flag) → ok.
4. (Optional) Toggle owner_pool_distribution_mode='proportional' di
   /settings setelah set users.share_pct untuk semua owner = 100 total.

Tooling note: pre-push protocol now includes `node_modules/.bin/tsc
--noEmit` lokal (sandbox can run tsc, just not next build / biome). Ran
sebelum setiap commit Phase A-D — caught zero TS errors after the edits.
Memory file `feedback_use_server_constants.md` updated.

---

## 0b. Sesi 7 closure — Tetra ERP parity (4 commits to main)

Driven by Rama's request to mirror UX wins from the Tetra ERP fase-2 system
(screenshots: Operation Command, Executive Summary, Design Hub).

Phase 1 — visible polish (zero schema):
- `f6d5f67` — Operations list richer rows. 5 dense columns:
  Project & Klien (client_name + project_id, both clickable), Jadwal
  (day name + setup/mulai time), Spesifikasi (frame_size + duration +
  flashdisk + package chip toned by backdrop_color), Kru Lapangan
  (L:/A: dual-line), Aksi (Edit button + status badges stacked).
  Multi-click target: client name + project_id + Edit all navigate
  to detail.
- `2cd1436` — Dashboard hero strip: <HeroKpiCard/> primitive with
  dark accent gradients (navy/rose/amber/emerald/primary), glassy
  icon pill, optional badge slot, accent glow shadow. Used for the
  4-card top strip on /dashboard.

Phase 2 — target system + status overview (small schema):
- `9801f05` — <TargetProgressCard/> + <StatusGroupCard/> primitives.
  Migration `20260510_event_targets_config.sql` seeds system_config
  keys event_target_monthly (default 10) + event_target_yearly
  (default 100), category="targets" so they group cleanly in the
  /settings system config form. Dashboard mid-strip now shows 4
  cards: Target Bulanan, Target Tahunan, Status Operasional
  (Upcoming/Selesai/Batal — bulan ini), Status Invoice (Lunas/DP/
  Unpaid — all-time).

Phase 3 — Visual Asset Hub (new schema, new route):
- `a7158e2` — Migration `20260510_event_assets.sql` creates
  event_assets table. asset_type CHECK ∈ {design_frame,
  footage_crew, softfile_photo, softfile_video}. RLS: owners full,
  crew can read assigned events + insert/delete own footage_crew.
  New /design top-level route in sidebar: global hub listing all
  events with per-event 4-chip asset coverage. /design/[projectId]
  per-event manager with 4 sections (one per asset type), inline
  add/edit/delete via <AssetSection/>. Replaces ad-hoc Drive
  digging — owner+crew can answer "where's the photobooth gallery
  for X event?" in one click.

⚠️ Pending Rama action sesi 7:
- Paste 2 migration files ke Supabase: `20260510_event_targets_config.sql`
  + `20260510_event_assets.sql`.
- Set target bulanan/tahunan di /settings → System Config → Targets.

Tooling note: `pnpm` still not on Claude sandbox PATH — sesi 7 commits
pushed without local build smoke. Vercel CI is the canary.

---

## 0a. Sesi 6 closure — what shipped (5 commits to main)

P3 (EmptyState broad coverage):
- `3cf8dbb` — 9 owner-side raw "Belum ada X" dashed-div fallbacks → `<EmptyState/>`. Files: settings (backdrops, notification-rules, whatsapp-templates, sinking-funds + movements), operations (team grid, event detail crew + equipment), notifications inbox.

A6 + A4 (SectionHeader + Container universal adoption):
- `987ff1e` — settings batch 1 (4 sub-pages adopt `<SectionHeader as="h2"/>`) + bonus `press-down` on finance sinking-fund Link rows.
- `991a5d4` — settings batch 2 (7 more sub-pages: addons, packages, crew, items, contacts, audit-log, bank-accounts).
- `96fac90` — operations sweep (calendar/board/design/team list views adopt `<Container/>` + `<SectionHeader/>`; 5 event sub-pages: payments, crew, rekap, settle, equipment).
- `d72d139` — settings 15 form pages (settings root + 6 new + 8 edit + sinking-funds movements viewer).

**Net result:** zero raw `<h2 className="text-xl/text-fluid-h2 font-semibold tracking-tight">` page-header patterns remain in `src/app/(owner)/`. All 44 page-level title+description+CTA blocks now use the `<SectionHeader/>` primitive. CTA buttons standardized to `buttonVariants()`.

Tooling note: `pnpm` not available in Claude sandbox shell — sesi 6 commits pushed without local `pnpm build` smoke test (Vercel CI is the canary). One credential setup performed: GitHub fine-grained PAT stored in `~/.git-credentials` so sandbox can push to main; permission `Bash(git push:*)` allowed in `.claude/settings.local.json`.

---

## 0. Sesi 5 closure — what shipped (39 commits to main)

Foundation (F1-F4):
- F1 token revamp (4-surface, gradients, motion, fluid type, glow shadows)
- F2 design system + motion guidelines docs
- F3 15 custom primitives (alert/confirm/disclosure/tooltip/sheet/skeleton/empty-state, native-select/file-drop/sonner-toaster, date/time/month-picker/responsive-table/data-table)
- F4 View Transitions API + 4 layout primitives + microinteraction CSS

Application (A1-A11 partial):
- A1 app shell (TopBar, OwnerSidebar, OwnerBottomNav with Sheet, CrewBottomNav, view-transition anchors)
- A2 auth + landing
- A3 dashboard (hero KPI with Sunrise gradient + glow)
- A4 operations (list with filter-bar primitives + ResponsiveTable client wrapper, event detail token sweep)
- A5/A8/A9 main pages adopt Container + SectionHeader (finance, reminders, reports, notifications)
- A11 crew app polish (home, jadwal, fee, alat — empty-states + microinteractions + view-transition shared elements)

Mass token sweep + browser-native UI elimination:
- 101 files mass-swept (bg-card→bg-surface-2, border-border→border-border-default, h1 text-3xl→text-fluid-h1)
- 65/67 browser-native UI killed (97%): 19 alerts/confirms→ConfirmDialog+toast, 32 selects/dates→primitives, 4 details→Disclosure, 3 month→MonthPicker, 4 date→DatePicker, 3 time→TimePicker. Remaining 2 intentionally kept (csv-import file input UX-customized)

Polish (P0/P1/P2/P6):
- P0 viewport fit (overflow-x clip + min-w-0 + min-h-dvh) + ResponsiveTable migration on all 6 owner list pages (operations, billing, warehouse 3 tables, items, contacts, audit-log, vendors)
- P1 loading.tsx skeletons on 16 route segments
- P2 error.tsx + not-found.tsx for owner/crew/global boundaries
- P6 view-transition shared elements: event card ↔ detail hero (operations list, dashboard, crew home, crew jadwal)

Hotfix:
- `4a3bda8` — server↔client function-prop boundary fix. Pattern documented in DS §17.x. Memory updated in feedback_pre_push_protocol.md bullet 3.

---

---

## 1. State sekarang — apa yang sudah jadi

### Owner-side (lengkap, production-ready)

- **Auth + role routing** (super_admin / owner / crew / pending_approval)
- **Landing surface** — `/` public dengan 2-path (Owner login / Crew portal), polished login + register + pending pages
- **Crew invitations** — pre-register email + tier; auto-promote on first Google sign-in (skip pending_approval review)
- **Crew CRUD on `/settings/crew`** — invite form, bulk import wizard, edit drawer (full_name, nickname, phone_wa, fee_override, notes), deactivate/reactivate
- **Onboarding flow** — `/onboarding` step buat crew yang self-register; isi nama + nickname + WA dulu
- **Dashboard** — KPIs + pipeline + today/tomorrow + activity feed + **anomaly radar widget** (top 3 unread alerts)
- **Operations** (5 views via tab switcher):
    - List dengan crew avatar chips per row + per-crew filter dropdown + Show archived chip
    - Calendar view
    - Board (Kanban by status)
    - Design hub
    - **Team schedule grid** (`/operations/team`) — rows = crew, cols = next 14 days, color-coded by role + conflict highlight
- **Event detail** — full feature dengan Readiness checklist, Activity feed, Design card, Settlement summary, Equipment + Rekap actions, Klien & Kontak card (booker + PIC dengan WA shortcut), **PDF download menu** (Invoice / Quotation / BAST), Migrated/Imported badges
- **Booking form** — full dengan backdrop dropdown, event-type dropdown, package picker, addons, financial breakdown
- **Equipment per event** — check-out/check-in + incident reports
- **Crew rekap** — owner submit + review/approve, per-crew WA reminder
- **Settlement engine** — atomic RPC, proportional owner pool by share_pct
- **Billing dashboard** + payment logging
- **Warehouse** dengan real stock from movements log
- **Finance** — Cash flow MTD + delta, P&L breakdown, sinking funds dengan progress bar, owner pool table dengan **withdrawal flow modal**, recent settlements
- **Vendor master** (`/finance/vendors`) — aggregate komisi vendor dari events, cross-ref dengan contacts, click-to-WA
- **Reports** (`/reports`) — 3 tab dengan month picker:
    - **Monthly P&L** — full vertical statement Revenue → HPP → Gross → OpEx (with sub-rows) → Operating → Sinking → Owner pool → Net Profit; bookings per channel; settled events list
    - **Crew Performance** — per-crew table: events, lead/asisten split, rekap submission rate (color-coded), fee earned/paid/outstanding
    - **Owner Statement** (super_admin only) — per-owner: share %, capital, MTD/lifetime earned/withdrawn/balance
- **Notifications inbox** (`/notifications`) — bell badge di topbar, filter chips (severity + category), unread/all toggle, mark-read + dismiss actions, **manual "Run scan" button**
- **Anomaly scanner** — evaluates 12 seeded rules (H-2 no crew, H-1 no design, H-3 not paid, H-7 no DP, invoice overdue 1d/7d, loss event, pending user 24h, stock critical/zero, crew double-booked, equipment missing). Dedup via existing unread match
- **Vercel Cron** (`vercel.json`) — daily 06:00 WIB status auto-transition (confirmed→upcoming→in_progress→awaiting_settlement) + 06:30 WIB anomaly scan
- **PDF generation** (`@react-pdf/renderer`) — Invoice / Quotation / BAST branded Tetra. API routes `/api/pdf/{invoice,quotation,bast}/[projectId]` return inline PDF
- **Settings** (every tab functional): System Config, Packages, Add-ons, Backdrops, Items + bulk CSV import wizard, Banks, Crew + Investor Capital editor + invitations, Contacts, Sinking Funds + movements, WA Templates with variable insert, Notification Rules editor, Audit Log viewer
- **CSV importers** (4-step wizard pattern: Upload → Map → Preview dengan duplicate check → Done dengan progress bar):
    - `/settings/items/import` — SYS_ITEMS.csv
    - `/settings/contacts/import` — DB_CONTACTS.csv
    - `/settings/operations/import-projects` — DB_PROJECTS.csv (Phase-2 cut-off)
    - `/settings/crew/invitations/import` — bulk invite crew
- **Resilient import infrastructure** — `withRetry()` + `withTimeout()` + `runWithConcurrency()`, batch 5/batch, max 2 retry per batch, per-batch 50s timeout (Vercel-safe)

### Crew-side (functional, mobile-first)

- **`/crew` (Home)** — today/tomorrow agenda, KPI tiles, quick links
- **`/crew/jadwal`** — Upcoming/Past tabs, list view with role + venue + fee
- **`/crew/jadwal/[projectId]`** — Event detail dengan PIC kontak (amber card, WA shortcut), Booker, venue Maps, spec, crew partner, equipment list, design Drive link, crew_notes, **rekap CTA card** (status-aware), fee breakdown
- **`/crew/jadwal/[projectId]/rekap`** — submit/edit rekap dari HP, 4-state UI (approved/pending/rejected/empty)
- **`/crew/alat`** — equipment ke-checkout per event upcoming, condition badge
- **`/crew/fee`** — fee history Outstanding + Paid sections, per-row paid_at + paid_via
- **`/crew/profile`** — avatar, role + tier badges, lifetime events, member since, **edit profile form** (full_name + nickname + phone_wa via OnboardingForm), sign out

### Database state

**Migrations applied to Supabase production:**
1. `20260507_settlement_close_function.sql` — atomic settle RPC + reopen
2. `20260507_backdrops_event_types_investors.sql` — backdrops + event_types + users.share_pct + events.backdrop_id + RPC v2 (proportional)
3. `20260507_legacy_import_columns.sql` — events.is_migrated_legacy + events.legacy_invoice_number
4. `20260507_contacts.sql` — contacts table + booker_contact_id + pic_contact_id FKs on events
5. `20260507_contacts_rls.sql` — RLS policies for contacts
6. `20260507_crew_invitations.sql` — crew_invitations table + RLS
7. `20260507_event_category_fk.sql` — FK events.event_category → event_types.code
8. `20260507_event_reminders_log.sql` — manual WA reminder click log + RLS
9. `20260507_push_subscriptions.sql` — Web Push subscriptions per user + RLS
10. `20260507_event_drive_folder.sql` — events.drive_folder_id/url/created_at columns

### Real production data status

- ✅ **Live event:** PRJ-20260822-7378 Maman Sudarman (settled, loss test event)
- ✅ **Master data seeded:** backdrops (8), event_types (8), sinking_funds (4), notification_rules (13), wa_templates (~5), system_config (~25)
- ✅ **Items imported:** 71 dari SYS_ITEMS.csv via `/settings/items/import`
- ✅ **Contacts imported:** 141 dari DB_CONTACTS.csv via `/settings/contacts/import`
- ❌ **DB_PROJECTS.csv:** belum di-import (~120 row pending)
- ❌ **Crew invitations:** belum di-create — Rama belum invite 12 crew
- ❌ **Investor share_pct:** belum di-set (perlu 36.65 / 28.16 / 18.20 / 16.99 untuk 4 owner)
- ❌ **CRON_SECRET env var:** belum di-set di Vercel — cron endpoints terbuka tanpa auth (low risk karena cuma idempotent reads + safe transitions, tapi best-practice)

### Current users in system

- `tetraphotobooth@gmail.com` — Tetra Photobooth (Owner) → role super_admin
- `imhaf720@gmail.com` — Fahmi 720 → role owner
- `muhammadfarhanmauludi@gmail.com` — M Farhan Mauludi (MOU) → role crew, tier senior

---

## 2. Implementation plan status — apa yang masih perlu

Reference: `docs/08_IMPLEMENTATION_PLAN.md`

### ✅ Phase 1 — Core Operations (Weeks 1-6) — COMPLETE
- Auth, master data, booking, operations, billing, crew app MVP

### ✅ Phase 2 — Finance & Inventory (Weeks 7-10) — COMPLETE
- Smart warehouse, settlement engine, crew rekap, omni finance, owner earnings

### 🟡 Phase 3 — Smart Features (Weeks 11-14) — MOSTLY DONE

**Week 11: Notifications & Anomaly Radar — ✅ DONE**
- ✅ Notifications inbox + bell + filter chips
- ✅ Anomaly detection rules engine (12 rules)
- ✅ Daily cron: anomaly scan (Vercel cron 06:30 WIB)
- ✅ Daily cron: auto status transition (Vercel cron 06:00 WIB)
- ✅ Dashboard anomaly radar widget
- ✅ **Web Push API for PWA** — service worker (`/public/sw.js`) + `push_subscriptions` table + VAPID-based dispatch (`web-push` lib) + subscribe/unsubscribe UI on `/notifications` + auto-dispatch from anomaly scanner per rule's `send_push` flag. Multi-device per user. Auto-prune 410 Gone subscriptions.

**Week 12: WhatsApp Integration — ✅ DONE**
- ✅ WhatsApp template management UI (existing /settings/whatsapp-templates)
- ✅ Variable resolution + wa.me link generation
- ✅ "Send WA" buttons on event detail (existing SendWhatsAppButton)
- ✅ Per-crew WA reminder
- ✅ **Manual reminder scheduler UI** (`/reminders`) — 4 buckets (H-3 pelunasan, H-7 belum DP, H-1 konfirmasi, overdue), checkbox batch-select, sequenced wa.me opens, `event_reminders_log` table tracks intent + last-sent timestamp + reminder count per event
- ❌ **WA template editor improvements** — preview pane, validation hints (lower priority)

**Week 13: PDF Generation — ✅ DONE**
- ✅ Invoice PDF (Tetra-branded)
- ✅ Quotation PDF
- ✅ BAST PDF (Berita Acara Serah Terima)
- ❌ **Monthly Report PDF** — generate /reports tab as PDF
- ❌ **P&L Report PDF** — printable version of Reports → P&L tab
- 🟡 PDFs cross-tested di browser (perlu ujicoba lebih lanjut)
- ❌ Storage of generated PDFs to Drive (Phase 3 Week 14 dependency)

**Week 14: Drive Integration — 🟡 PHASE 1 DONE (folder auto-create)**
- ✅ Google Drive OAuth refresh-token flow (`scripts/get-drive-refresh-token.mjs`)
- ✅ Auto-create event folders on event creation (best-effort hook in `createBooking`)
- ✅ "Buka folder Drive" button on event detail (`<EventDriveCard>`)
- ✅ `drive_folder_id`, `drive_folder_url`, `drive_folder_created_at` columns on events
- ❌ Move file uploads to Drive (rekap photos, equipment incident photos, payment proofs) — Phase 2
- ❌ Auto-archive generated PDFs to event folder — Phase 2
- ❌ Mobile UX final pass — Phase 2

### ⏳ Phase 4 — Polish & Optimization

Specific Phase 4 features documented but deferred:
- ❌ Operations Board drag-and-drop (status update via DnD)
- ❌ Advanced inventory: PO workflow, vendor management beyond current
- ❌ Recurring events (corporate clients)
- ❌ Quotation-to-booking conversion flow
- ❌ Stock take audit mode UI
- ❌ Advanced reports (multi-month comparisons, cohort analysis)
- ❌ Bulk operations refinements
- ❌ E2E tests for critical paths (Playwright)
- ❌ Lighthouse score optimization
- ❌ Equipment self-checkin from /crew side (currently owner-only)

### Onboarding wizard (FSD §14, Lower priority)

- ❌ `/onboarding-wizard` for fresh-install: step-by-step setup of bank accounts, default packages, owner shares, etc.
- Note: NOT the same as `/onboarding` (which is per-crew profile completion)

---

## 3. Yang harus dilakukan Rama untuk go-live

Pre-requisite untuk benar-benar pakai sistem live dengan tim 8+:

### Wajib

1. **Set CRON_SECRET di Vercel** — Project Settings → Environment Variables → add `CRON_SECRET` dengan random long string (e.g., `openssl rand -hex 32`). Without this, cron endpoints accept any GET request.
2. **Invite 12 crew** lewat `/settings/crew` → "Invite crew" form atau bulk import. Kandidat dari handover sebelumnya: Aminah, Ceca, Bona, Weni, Rangga, Wahab, Eman, Mou (sudah ada), Kuku, Iqbal, Acuy, Fahmi (sudah ada sebagai owner).
3. **Set investor share_pct** di `/settings/crew` → Investor Capital section: 36.65 / 28.16 / 18.20 / 16.99 = 100%. Tanpa ini settlement engine pakai flat distribution.
4. **Import DB_PROJECTS** lewat `/settings/operations/import-projects` setelah semua crew sudah accept invitation (biar nama crew match ke crew_assignments).

### Optional / nice-to-have

5. Set up Google Drive OAuth (kalau mau Phase-3 Week 14 jalan)
6. Configure WA Business API kalau mau auto-send (sekarang manual via wa.me link)
7. Configure push notification VAPID keys kalau implement Web Push

---

## 4. Konvensi & gotchas yang sudah established

### Migration approach
- Tulis SQL file di `supabase/migrations/`
- Instruct user paste ke Supabase Dashboard SQL Editor
- **Idempotent**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, DO blocks dengan pg_constraint guard
- App is NOT auto-applied — Rama always runs manually

### Pre-push protocol (memori penting)
- Selalu `pnpm build` + smoke-test sebelum `git push`
- `tsc` alone tidak cukup — Next.js `'use server'` files cannot export non-async-function values (constants harus di file terpisah)
- Cek NOT NULL columns saat insert
- Test INSERT/UPDATE actions after schema change

### Code style
- Biome formatter (4-space indent, double quotes)
- Semantic tokens only: `bg-card`, `text-foreground`, `border-border`, `bg-destructive/10`, `text-emerald-600 dark:text-emerald-400` — JANGAN hard-code zinc/slate
- `'use server'` / `'use client'` directives correct
- `tabular` class for numbers, `formatRupiah()` helper for IDR
- Shared CSV import wizard — reuse `<CsvImportWizard config={...}>` for any new bulk import need
- Resilience helpers `withRetry/withTimeout/runWithConcurrency` already exist for any new server action that does bulk DB ops

### Components grouped per domain
`src/components/{settlement, backdrops, booking, csv-import, dashboard, event-design, event-equipment, finance, investors, items, layouts, notifications, operations, pdf, rekap, sinking-funds, system-config, whatsapp-templates, ui, ...}` — keep this pattern.

### Auth model
- 4 roles: super_admin, owner, crew, pending_approval
- super_admin = invitation-aware promotions, withdrawal authority
- owner = read most; can review rekap; CANNOT promote roles
- crew = mobile app only; sees own assignments; can submit rekap + edit own profile
- pending_approval = waiting room; redirected to `/onboarding` if profile incomplete, else `/pending`
- Auth middleware (`src/proxy.ts`): PUBLIC_PATHS = `["/", "/login", "/register", "/crew-portal", "/auth"]`; AUTH_ENTRY_PATHS = same minus `/`

### PDF generation
- `@react-pdf/renderer` server-side
- Doc base components in `src/components/pdf/document-base.tsx`
- Each doc: `src/components/pdf/{invoice,quotation,bast}-document.tsx`
- API routes return `application/pdf` inline (browser preview)
- Doc number convention: `legacy_invoice_number` if present, else derived from project_id

### Cron endpoints
- `vercel.json` declares 2 cron jobs at 23:00 / 23:30 UTC (= 06:00 / 06:30 WIB)
- `src/lib/cron-auth.ts` validates `Authorization: Bearer ${CRON_SECRET}`
- Without CRON_SECRET set, auth is skipped (so dev/preview work)
- Each cron action has internal/external variant: `runStatusTransition` (auth-gated for manual UI) vs `runStatusTransitionInternal` (no-auth for cron)

### CSV importer wizard
- Single shared component `<CsvImportWizard config={...}>` in `src/components/csv-import/wizard.tsx`
- 4 steps: Upload (drag-drop) → Map (auto-detect headers via aliases) → Preview (duplicate check) → Done (with progress bar + cancel)
- Server action expects `(rows: Record<string,string>[], rowOffset: number) => Promise<ImportResult>`
- Header alias maps live in `src/lib/csv-import/{items,contacts,projects,invitations}-aliases.ts`

---

## 5. Files yang baru-baru dibuat (untuk awareness)

Penting untuk dikenali kalau perlu modifikasi:

```
src/lib/actions/
├── anomaly-scanner.ts            (12-rule scanner + Internal variant)
├── contacts-import.ts             (DB_CONTACTS bulk)
├── crew-invitations.ts            (invite + bulk + check dupes)
├── notifications.ts               (markRead, dismiss)
├── owner-withdrawal.ts            (record withdrawal)
├── profile-onboarding.ts          (crew profile complete)
├── projects-import.ts             (DB_PROJECTS bulk)
├── status-transition.ts           (auto-transition + Internal)
├── crew.ts                        (role + profile + active)

src/lib/csv-import/
├── parser.ts                      (shared CSV parser)
├── resilience.ts                  (retry, timeout, concurrency)
├── types.ts                       (TargetField, ImportResult)
├── *-aliases.ts                   (per-importer header mappings)

src/lib/pdf/
├── event-data.ts                  (shared fetcher + line-item builder)

src/components/
├── csv-import/wizard.tsx          (4-step wizard)
├── pdf/{document-base,invoice,quotation,bast,download-menu}.tsx
├── notifications/{run-scanner-button,row-actions}.tsx
├── dashboard/anomaly-radar.tsx
├── crew/{invite-form,invitation-row-actions,edit-crew-drawer}.tsx
├── auth/onboarding-form.tsx
├── finance/withdrawal-button.tsx

src/app/(owner)/
├── reports/page.tsx               (P&L / Crew / Owner tabs)
├── finance/page.tsx + finance/vendors/page.tsx
├── notifications/page.tsx
├── operations/team/page.tsx       (crew schedule grid)
├── settings/contacts/{page,import}/page.tsx
├── settings/crew/{page,invitations/import}/page.tsx
├── settings/operations/import-projects/page.tsx

src/app/(crew)/crew/
├── page.tsx                       (home)
├── jadwal/{page,[projectId]/{page,rekap/page}}.tsx
├── alat/page.tsx, fee/page.tsx, profile/page.tsx

src/app/(auth)/
├── login/page.tsx, register/page.tsx (redirects)
├── crew-portal/page.tsx
├── onboarding/page.tsx, pending/page.tsx

src/app/api/
├── cron/{anomaly-scan,status-transition}/route.ts
├── pdf/{invoice,quotation,bast}/[projectId]/route.ts

src/app/page.tsx                   (public landing)
src/app/auth/callback/route.ts     (post-OAuth direct redirect)

vercel.json                        (cron schedule)
```

---

## 6. Priority backlog untuk sesi berikutnya

Ordered by impact untuk go-live + remaining roadmap:

### ✅ Round 1: Phase 3 — COMPLETE end of sesi 4
1. ✅ **WhatsApp reminder scheduler UI** (Week 12) — DONE. Commit `7a89f06`. Migration `20260507_event_reminders_log.sql`. `/reminders` page dengan 4 bucket (H-3 pelunasan, H-7 belum DP, H-1 konfirmasi, overdue), checkbox batch-select, sequenced wa.me opens, `event_reminders_log` tracking. Migration applied + verified prod.
2. ✅ **Drive integration Phase 1** (Week 14) — DONE. Commit `2d84cea`. Migration `20260507_event_drive_folder.sql`. Folder auto-create on event creation + manual create button on event detail. `@googleapis/drive` + `google-auth-library` (split packages — full `googleapis` OOM'd build at type-check). VAPID + Drive env vars set in Vercel + verified prod (folder `PRJ-20260822-7378 Maman` auto-created in `Tetra Ops Events/`). Phase 2 (file uploads, PDF auto-archive) deferred.
3. ✅ **Web Push API** (Week 11) — DONE. Commits `2b2c468`, `3b40892`, `880b12d`. Migration `20260507_push_subscriptions.sql`. Service worker `/public/sw.js`, `push_subscriptions` table, VAPID dispatch via `web-push` package, subscribe button at `/notifications`, auto-fire dari anomaly scanner. iPhone PWA + 2 desktop subscribed, test push delivered to lockscreen. **Two non-obvious bugs fixed during integration:** (a) `web-push` `timeout` is milliseconds not seconds (was passing 8 → caused socket-timeout-before-handshake), (b) iOS Safari Web Push only works inside installed PWA (Home Screen). Memory: `feedback_web_push_gotchas.md`.

### 🎨 Round 2 (sesi 5+): UI/UX REDESIGN — locked + planned
**Master plan:** `~/.claude/plans/saya-mau-fokus-polish-eventual-gem.md`

Direction: **Crimson + Dual Accent Gradient** (Sunrise warm + Aurora cool) + 4-level surface hierarchy + Next.js 16 View Transitions (no framer-motion) + mobile shrinkage type/spacing + custom primitives to replace 67× browser-native violations.

Sequencing across ~22 sessions, ~125h total:
- **Foundation** (~28h): F1 token revamp → F2 design system doc rewrite → F3 custom primitive library → F4 motion + responsive infra
- **Application** (~66h): A1 app shell → A2 auth+landing → A3 dashboard → A4 operations → A5-A11 admin pages + crew app
- **Polish** (~23h): P1 skeletons → P2 error boundaries → P3 empty states → P4 microinteractions → P5 light mode → P6 view transitions → P7 perf+a11y audit

5 open questions for Rama in plan file (light mode priority, brand photography, login branding, empty state copy, illustrations).

### Round 3: Phase 4 polish (post-redesign)
4. **Equipment self-checkin from /crew** — ~3 jam
5. **Operations Board drag-and-drop** — ~2-3 jam
6. **Onboarding wizard fresh-install** — lower priority
7. **Monthly P&L PDF export** — ~1 jam
8. **Multi-month comparison** — ~2 jam
9. **Cohort analysis** — ~3-4 jam

### Lower priority / explicitly deferred
- Fixed asset depreciation engine (DR-006: skipped)
- Multi-tenant SaaS architecture
- Native mobile app (PWA path chosen)
- Drive Phase 2: file uploads (rekap photos, payment proofs, PDF auto-archive)

---

## 7. Production env

- Vercel project: `tetra-ops` (Hobby tier free)
- Domain: `tetra-ops.vercel.app`
- Region: SIN1 (Singapore)
- Supabase project: `tetra-ops` (Free tier)
- Supabase URL: `https://rdrkzwesykebhibcwcsj.supabase.co`
- Auth provider: Google OAuth (only)
- Cron: 2 jobs configured (within Hobby tier limit)
- Storage: Supabase Storage (not yet used; reserved for future Drive replacement)

### Env vars

Already set (working):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Pending Rama action:
- ❌ `CRON_SECRET` — set this so cron endpoints reject unauthorized callers

✅ Set in Vercel (sesi 4 closure):
- ✓ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`
- ✓ `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_PARENT_FOLDER_ID`

Future (when implementing):
- `WHATSAPP_API_TOKEN` (if/when adopting WA Business API)

---

## 8. Open decisions

- **DR-006: Skip historical data migration** — RESOLVED. Phase-2 cut-off implemented; archive marked `is_migrated_legacy=true`.
- **PWA vs native app** — RESOLVED, PWA path. Service worker pending.
- **Single tenant vs SaaS** — Single tenant for Tetra. Future fork if rolling out to other photobooths.
- **Free tier vs paid** — Currently Hobby. Will likely need to upgrade Vercel to Pro for >2 cron jobs OR if hitting function timeouts under load.
- **Storage backend (Drive vs Supabase Storage)** — Originally Drive. Could pivot to Supabase Storage to avoid OAuth complexity. Decision pending until Week 14 work begins.

---

## 9. Starter prompt untuk sesi 5 — UI/UX REDESIGN

Copy-paste prompt berikut untuk mulai sesi chat baru:

---

> **Lanjutkan kerjaan Tetra Ops dari sesi 4. Phase 3 (WA reminder + Web Push + Drive Phase 1) sudah live dan verified di production. Sekarang fokus pindah ke UI/UX redesign full system.**
>
> **BACA INI DULU sebelum mulai apa-apa:**
>
> 1. `~/.claude/plans/saya-mau-fokus-polish-eventual-gem.md` — master plan redesign, phase-by-phase. Foundation → Application → Polish. Total ~125 jam, ~22 sesi.
> 2. `docs/15_HANDOVER.md` — comprehensive state snapshot.
> 3. Memory files: `project_state_2026-05-07`, `feedback_design_system_first`, `feedback_pre_push_protocol`, `feedback_migration_approach`, `feedback_web_push_gotchas` (sesi 4 baru), `feedback_redesign_direction` (sesi 4 baru), `project_shared_infra`
>
> **KONTEKS DESAIN (sudah locked di plan):**
> - **Crimson + Dual Accent Gradient** (Sunrise warm + Aurora cool) dengan 4-level surface hierarchy
> - **Motion**: Next.js 16 View Transitions API + CSS keyframes. **JANGAN install framer-motion**
> - **Mobile**: shrinkage type scale + p-4 max + `<ResponsiveTable>` + bottom nav for owner mobile (mirror crew)
> - **NO browser-native pickers**. 67 violations sudah di-audit (34× `<select>`, 19× window.alert/confirm, 4× native date, 3× native time, dll). Replace pakai custom primitives di Phase F3
> - **Sonner sudah installed**, never imported. Wire untuk replace 19× window.alert/confirm
>
> **SKILL INSTALLS:**
> Sebelum mulai, install/aktifkan skills design yang relevan: `/refactoring-ui` `/ux-heuristics` `/hooked-ux` `/top-design` `/ios-hig-design`
> Plus pertimbangkan web-fetch untuk: Vercel Geist tokens, Linear redesign post-mortem, Material 3 Expressive guidelines, Apple HIG iOS 19 Liquid Glass.
>
> **MULAI DENGAN:** Phase F1 (Token revamp). Estimate 5 jam. Goal: 4-surface hierarchy + accent gradients + motion tokens + mobile fluid type scale. File: `src/app/globals.css` + `src/lib/tokens.ts` (NEW). Acceptance lihat plan F1 section.
>
> **KONVENSI YANG MASIH BERLAKU:**
> - Migration SQL idempotent, tulis di `supabase/migrations/`, instruct paste ke Supabase dashboard
> - Pre-push: `pnpm build` + smoke-test sebelum git push
> - Semantic tokens (bg-card, text-foreground), tidak hard-code zinc/slate
> - Server actions tidak boleh export non-async functions; constants di file terpisah
> - Reuse existing infra: `<CsvImportWizard>`, `withRetry/withTimeout`, PDF base components, Base UI primitives
> - Push to main langsung deploy ke Vercel (Rama sudah izinkan)
>
> **PENDING RAMA ACTION (independent dari coding, masih outstanding):**
> - Set `CRON_SECRET` di Vercel env
> - Invite 12 crew via `/settings/crew`
> - Set investor `share_pct` (4 owners → 100%)
> - Import DB_PROJECTS.csv setelah crew accept
>
> **Mulai dengan rekomendasi singkat (2-3 kalimat):** apakah langsung F1, atau ada item foundation yang lebih urgent dulu (misalnya F2 doc rewrite biar ada source of truth dulu sebelum modify globals.css)? Setelah Rama setuju, langsung eksekusi. Auto mode boleh dipakai.
