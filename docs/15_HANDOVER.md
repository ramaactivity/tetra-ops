# 15 — Session Handover & Implementation Plan Status

**Last updated:** 2026-05-08 (sesi 4 closure — Phase 3 complete + redesign plan locked)
**Last commit:** `880b12d` — fix(push): timeout option is milliseconds (sesi 4 final fix)
**Production URL:** https://tetra-ops.vercel.app
**GitHub:** https://github.com/ramaactivity/tetra-ops
**Next session plan:** `~/.claude/plans/saya-mau-fokus-polish-eventual-gem.md` — UI/UX redesign master plan (~125h across ~22 sessions)

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
