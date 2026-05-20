# Per-Module Re-Audit — Tetra Ops (Pre-V3 Design System Migration)

**Audit date:** 2026-05-21
**Auditor:** Claude (code-level analysis; no browser tools available in this environment)
**Baseline comparison:** [AUDIT_UI_UX.md](AUDIT_UI_UX.md) (2026-05-19), [AUDIT_PERFORMANCE.md](AUDIT_PERFORMANCE.md), [AUDIT_SUMMARY.md](AUDIT_SUMMARY.md)
**Scope:** 10 modules + crew portal + cross-cutting concerns. **Operations + Booking excluded** — state is documented in [REPORT_OPERATIONS_CONSISTENCY.md](REPORT_OPERATIONS_CONSISTENCY.md).

> ✅ **Screenshots delivered (38 files)** in [AUDIT_SCREENSHOTS/](AUDIT_SCREENSHOTS/) with full coverage matrix in [AUDIT_SCREENSHOTS/INDEX.md](AUDIT_SCREENSHOTS/INDEX.md). 9 of 11 in-scope modules captured at both 1280 + 375 viewports (Dashboard mobile + Contacts + Audit Log missing — easy fill-in). Each module section below links to its specific screenshot file(s). Crew portal evidence is real-device phone screenshots (not DevTools emulation), so touch UX reflects actual usage.

---

## 0. Reconnaissance baseline (2026-05-21 snapshot)

### 0.1 Route inventory

| Surface | page.tsx count | loading.tsx count | Coverage |
| ------- | -------------- | ----------------- | -------- |
| `src/app/(owner)/**` | 71 | 36 | 51% |
| `src/app/(auth)/**` | 5 | 0 | 0% |
| `src/app/(crew)/**` | 8 | 2 | 25% |
| **Total tracked** | **84** | **38** | **45%** |

AUDIT_PERFORMANCE.md §E.1 claimed "58/74 missing loading.tsx". Current state: 46/84 missing — coverage improved slightly (booking + ops sub-routes gained skeletons during Phase 1) but the gap is still ~55% of all routes. Coverage by major group:

- Operations (incl. booking): 18 page / 12 loading = 67% ✓ (best — Phase 1 work)
- Settings (15 deep routes): 13 page / 8 loading = 62%
- Crew portal (8 routes): 8 page / 2 loading = 25% ✗
- Auth (5 routes): 5 page / 0 loading = 0% ✗
- Single-page modules (dashboard, billing, finance, reports, warehouse, reminders, notifications): 7/7 = 100%

### 0.2 Primitive adoption tally (files importing each primitive)

| Primitive | Files | Status |
| --------- | ----- | ------ |
| `<EmptyState>` | 32 | ✅ Broadly adopted — best primitive penetration |
| `<KpiCard>` | 8 | ⚠️ Coexists with `<StatCard>` (6 files) — old AUDIT §2.9 consolidation issue still open |
| `<StatCard>` | 6 | ⚠️ Same as above |
| `<EventStatusBadge>` | 7 | ✅ Used across operations + billing |
| `<DatePicker>` | 6 | ✅ Used in filter bars + forms |
| `<PaymentStatusBadge>` | 6 | ✅ Used in operations + billing + finance |
| `<SectionCard>` | 4 | 🆕 New — only operations cluster yet |
| `<CollapsibleCard>` | 4 | (Same file as SectionCard alias) |
| `<TimePicker>` | 3 | Booking-form only |
| `<PageHeader>` | 3 | 🆕 New — booking-form pages only |
| `<FieldGrid>` | 3 | 🆕 New — booking-form only |
| `<Combobox>` | 3 | Booking-form only |
| `<MetaBadge>` | 2 | 🆕 New — booking-form edit page only |
| `<SummaryRail>` | 2 | 🆕 New — booking-form only |
| `<EventStatusDot>` | 2 | Operations list + project detail |
| `<KpiRow>` | 1 | 🆕 New — extracted but not consumed yet |
| `<NativeSelect>` (banned in user-facing JSX) | 30 callsites across 22 files | ⚠️ Phase 2 migration target |

### 0.3 Design-system lint snapshot (`npx tsx scripts/lint-design-system.ts --warn`)

| Rule | Hits | Where |
| ---- | ---- | ----- |
| `no-decorative-radius` (warn) | 6 | `(auth)/{login,crew-portal,onboarding,pending}/page.tsx` |
| `no-raw-shadow` (warn) | 4 | same auth pages |
| `no-decorative-color` (warn) | 0 | — |
| `no-hardcoded-eyebrow` (warn) | 0 | — |
| `no-native-form-control` (error) | 0 | clean |
| `no-native-select-usage` (warn) | 30 | see §0.4 |
| `no-handrolled-popup` (error) | 0 | clean |

**Total: 0 errors, 40 warnings.** Both error-level rules are clean.

### 0.4 NativeSelect violations by module (full list)

22 component files, 30 callsites:

| File | Line(s) | Module owner |
| ---- | ------- | ------------ |
| `event-equipment/check-out-form.tsx` | 115, 139 | Operations (equipment) |
| `event-equipment/incident-form.tsx` | 89, 117 | Operations (equipment) |
| `backdrops/backdrop-form.tsx` | 127 | Settings (backdrops) |
| `booking/crew-assignment-list.tsx` | 231 | Operations (booking-adjacent) |
| `notification-rules/rule-form.tsx` | 210 | Settings (notification rules) |
| `addons/addon-form.tsx` | 206, 241 | Settings (addons) |
| `crew/invite-form.tsx` | 151 | Settings (crew) |
| `audit-log/audit-filter-bar.tsx` | 42, 54 | Settings (audit-log) |
| `operations/filter-bar.tsx` | 132, 172 | Operations (list filter) |
| `csv-import/wizard.tsx` | 628 | Cross-cutting (csv import) |
| `packages/package-form.tsx` | 211, 237 | Settings (packages) |
| `sinking-funds/movement-form.tsx` | 163 | Settings (sinking funds) |
| `sinking-funds/fund-form.tsx` | 129 | Settings (sinking funds) |
| `finance/withdrawal-button.tsx` | 103, 228 | Finance |
| `warehouse/stock-adjust-dialog.tsx` | 222 | Warehouse |
| `items/rekap-mapping-form.tsx` | 331, 467, 475 | Settings (items) |
| `billing/payment-form.tsx` | 118, 143 | Billing |
| `items/item-form.tsx` | 133, 289, 310 | Settings (items) |

**Cleanup queue distribution:** Settings owns 17 (57%), Operations owns 7 (23%), Finance/Billing/Warehouse 6 (20%).

### 0.5 Full route tree

```
src/app/(owner)/
├── dashboard/{page, loading}.tsx
├── billing/{page, loading}.tsx
├── finance/{page, loading}.tsx
│   └── vendors/{page, loading}.tsx
├── reports/{page, loading}.tsx
├── warehouse/{page, loading}.tsx
│   └── stock-take/{page}.tsx + /[id]/page.tsx
├── reminders/{page, loading}.tsx
├── notifications/{page, loading}.tsx
├── design/{page}.tsx + /[projectId]/page.tsx
├── operations/                          [SKIPPED — see REPORT_OPERATIONS_CONSISTENCY.md]
└── settings/{page, loading}.tsx
    ├── addons/{page, loading}.tsx + /new + /[id]/edit
    ├── audit-log/{page, loading}.tsx
    ├── backdrops/{page, loading}.tsx + /new + /[id]/edit
    ├── bank-accounts/{page, loading}.tsx
    ├── contacts/{page, loading}.tsx + /import
    ├── crew/{page, loading}.tsx + /invitations/import
    ├── items/{page, loading}.tsx + /new + /[id]/edit + /import + /mapping
    ├── notification-rules/{page, loading}.tsx + /[id]/edit
    ├── operations/import-projects/{page}.tsx
    ├── packages/{page, loading}.tsx + /new + /[id]/edit
    ├── sinking-funds/{page, loading}.tsx + /new + /[id]/{edit, movements}
    ├── vendors/{page, loading}.tsx + /new + /[id]/edit
    └── whatsapp-templates/{page, loading}.tsx + /new + /[id]/edit

src/app/(auth)/
├── login/{page}.tsx
├── register/{page}.tsx
├── onboarding/{page}.tsx
├── pending/{page}.tsx
└── crew-portal/{page}.tsx

src/app/(crew)/crew/
├── {page}.tsx
├── alat/{page}.tsx
├── fee/{page}.tsx
├── profile/{page}.tsx
└── jadwal/
    ├── {page}.tsx
    └── /[projectId]/{page, rekap/{page, success/page}}.tsx
```

### 0.6 Module ownership mapping

User-defined module list → routes:

| Module | Primary route(s) | Status in this audit |
| ------ | ---------------- | -------------------- |
| 1. Dashboard | `/dashboard` (root `/` redirects here) | Pending |
| 2. Reminders | `/reminders` | Pending |
| 3. Notifications | `/notifications` | Pending |
| 4. Billing | `/billing` | Pending |
| 5. Finance | `/finance` + `/finance/vendors` | Pending |
| 6. Reports | `/reports` (+ sub-tabs inside) | Pending |
| 7. Warehouse | `/warehouse` + `/warehouse/stock-take` | Pending |
| 8. Contacts | `/settings/contacts` (+ `/import`) — lives under settings | Pending |
| 9. Audit Log | `/settings/audit-log` — lives under settings | Pending |
| 10. Settings | `/settings` + 12 sub-routes (excl. contacts + audit-log which are called out separately) | Pending |
| 11. Crew Portal | `/crew/*` (8 routes under `(crew)` group) | Pending |

---

## Per-module sections

Each module follows the A–F framework from the audit prompt:
- **A. Current State Snapshot** — screenshots + route tree + LOC + primitive tally
- **B. Visual Hierarchy Audit** — scoring against v1 primitives (1–5 per item)
- **C. P0 Gap Status** — cross-check vs AUDIT_UI_UX.md
- **D. Module-Specific Anti-Patterns** — lint script + grep findings
- **E. Module-Specific Primitive Needs** — what v3 must add
- **F. Recommended Migration Approach** — effort + risk + sequencing

Sections will be filled one commit at a time.

---

## 1. Dashboard (`/dashboard`)

### A. Current State Snapshot

- **Screenshots:** ✅ [01-dashboard-1280.png](AUDIT_SCREENSHOTS/01-dashboard-1280.png) · ❌ mobile 375 missing (gap)
- **Routes:** single page — `/dashboard` (root `/` redirects). Has `loading.tsx`.
- **LOC:**
  - [src/app/(owner)/dashboard/page.tsx](src/app/(owner)/dashboard/page.tsx) — 535 LOC
  - [src/app/(owner)/dashboard/loading.tsx](src/app/(owner)/dashboard/loading.tsx) — 63 LOC
  - [src/components/dashboard/anomaly-radar.tsx](src/components/dashboard/anomaly-radar.tsx) — 186 LOC
  - [src/components/dashboard/target-progress-card.tsx](src/components/dashboard/target-progress-card.tsx) — 110 LOC
  - [src/components/dashboard/status-group-card.tsx](src/components/dashboard/status-group-card.tsx) — 88 LOC
  - [src/components/dashboard/hero-kpi-card.tsx](src/components/dashboard/hero-kpi-card.tsx) — 130 LOC **(dead code — no consumers grep-confirmed)**
- **Primitive usage in page.tsx:** `<Container size="xl">` ✓ · `<StatCard>` ×4 ✓ · `<EmptyState>` ×1 ✓ · `<EventStatusBadge>` ✓ · `<TargetProgressCard>` ×2 (dashboard-local) · `<StatusGroupCard>` ×2 (dashboard-local) · `<PipelineCard>` ×1 (operations-shared) · `<AnomalyRadarWidget>` ×1
- **No data fetching from client:** 15 server-side Supabase queries Promise.all'd at line 71-225. Zero `useEffect` / `useState` in page.tsx.

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader (v1) | 1/5 | Hand-rolled greeting block (page.tsx:243-252): eyebrow `<p className="font-mono text-[11px] uppercase tracking-[0.18em]">` + h1 with clamp() font-size. Pre-dates the v1 PageHeader primitive. |
| SectionCard / CollapsibleCard | 1/5 | Five sections rendered as bare `<section className="space-y-X">` with hand-rolled eyebrow strips. No SectionCard wrapping. |
| FieldGrid | n/a | Read-only dashboard, no forms. |
| KpiRow | 3/5 | Uses correct `<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">` shape (matches KpiRow's spec), but doesn't import `<KpiRow>` — re-rolls the grid inline. |
| StatCard | 5/5 | All 4 KPI tiles use `<StatCard>` ✓ |
| Status badges | 5/5 | `<EventStatusBadge>` ✓ |
| Empty states | 5/5 | `<EmptyState>` used at line 466 for "no upcoming events". ✓ |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.1)

| Old finding | Status | Evidence |
| ----------- | ------ | -------- |
| `hover:-translate-y-px` on event card (page.tsx:408) | ✅ Fixed | grep returns zero hits in dashboard files |
| `rounded-xl` overuse (4 different radius values) | ⚠️ Partially fixed | `rounded-2xl` gone; **`rounded-xl` still in 6 places**: [page.tsx:414, 516, 518](src/app/(owner)/dashboard/page.tsx#L414) + [status-group-card.tsx:44](src/components/dashboard/status-group-card.tsx#L44) + [hero-kpi-card.tsx:91](src/components/dashboard/hero-kpi-card.tsx#L91) + [target-progress-card.tsx:55](src/components/dashboard/target-progress-card.tsx#L55). All should be `rounded-lg` per DS §4.2. Effort to close: ~1h. |
| No multi-owner real-time awareness | ❌ Outstanding | Foundation specced in DESIGN_SYSTEM §3.10 (optimistic-concurrency MVP for Phase 2). No live presence on dashboard. |
| Heading hierarchy skip (no h2) | ❌ Outstanding | page.tsx:341, 390, 460 use h2 now ✓ — but the four eyebrow `<p>` lines above the KPI / Target / Status / Upcoming sections still don't have an accompanying h2. Mixed compliance. Effort: ~30min. |
| AnomalyRadarWidget double getCurrentUser | ✅ Fixed | Widget now takes `userId` prop ([anomaly-radar.tsx:65](src/components/dashboard/anomaly-radar.tsx#L65)). Lifted to parent. |
| Stale "crimson accent" comment line 244 | ✅ Fixed | grep returns zero hits |
| Loading skeleton missing target + anomaly sections (CLS) | ⚠️ Partially fixed | loading.tsx has 4 KPI skeletons + 2 grid skeletons (63 LOC). Doesn't model the AnomalyRadar shape — minor CLS risk remains. Effort: 30min. |
| Eyebrow font tracking `[0.18em]` doesn't match `.eyebrow` utility | ⚠️ Same | page.tsx still uses inline `font-mono text-[11px] uppercase tracking-[0.18em]` rather than the `.eyebrow` class (lint rule `no-hardcoded-eyebrow` doesn't fire because regex is narrower; visual diff exists). Effort: 15min find-replace. |
| Target progress `rounded-full` (should be `rounded-sm`) | ❓ Needs verification | Spec'd in DESIGN.md but visual inspection required. Read [target-progress-card.tsx](src/components/dashboard/target-progress-card.tsx) before fixing. |

### D. Module-Specific Anti-Patterns

Anti-pattern violation counts within dashboard scope (`src/app/(owner)/dashboard/**` + `src/components/dashboard/**`):

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-2xl` | 0 | — |
| `rounded-xl` (should be `rounded-lg`) | 6 | [page.tsx:414](src/app/(owner)/dashboard/page.tsx#L414), [page.tsx:516, 518](src/app/(owner)/dashboard/page.tsx#L516); [status-group-card.tsx:44](src/components/dashboard/status-group-card.tsx#L44); [hero-kpi-card.tsx:91](src/components/dashboard/hero-kpi-card.tsx#L91); [target-progress-card.tsx:55](src/components/dashboard/target-progress-card.tsx#L55) |
| `transition-all` | 2 | [page.tsx:516, 518](src/app/(owner)/dashboard/page.tsx#L516) — should be `transition-colors` per DS §4.4 |
| Hardcoded eyebrow (visual, not lint-rule match) | 5 | page.tsx:246, 256, 292, 339, 388 — repeated `font-mono text-[11px] uppercase tracking-[0.18em]` pattern instead of `.eyebrow` class |
| Decorative colors | 0 | — |
| Native form controls | 0 | — (no forms on dashboard) |
| NativeSelect | 0 | — |
| Handrolled popups | 0 | — |
| Cards-in-cards | 0 visible | — |
| Glassmorphism on rest | 0 | — |
| Side-stripe borders | 0 | — |
| Gradient text | 0 | — |
| Pure black/white | 0 | — uses semantic tokens |
| Raw hex | 0 | — |
| Missing tabular on money | 0 | `formatRupiah()` callsites pass through StatCard which applies `tabular` |
| Dead code | 1 file | [hero-kpi-card.tsx](src/components/dashboard/hero-kpi-card.tsx) — 130 LOC, zero consumers grep-confirmed |

### E. Module-Specific Primitive Needs

Dashboard is already well-served by current primitives (`<StatCard>`, `<EmptyState>`, `<EventStatusBadge>`). What's missing for v3:

- **`<PageHeader>` migration target** — current hand-rolled greeting block (eyebrow + clamp h1) should adopt v1 `<PageHeader>` once it supports a "greeting" mode (no back-link, no meta-line, no actions; just title + optional eyebrow). Today PageHeader requires `title` only — works as-is, just needs the consumer to opt in. **No new primitive required.**
- **`<EyebrowText>` or `<SectionEyebrow>`** — page repeats `font-mono text-[11px] uppercase tracking-[0.18em]` 5× as section headers. Either consolidate into the `.eyebrow` utility class (already exists in globals.css per DESIGN.md) or wrap in a tiny `<Eyebrow>` component. Either way, **no new primitive of v3 scope** — fix during v3 migration via lint extension (add rule that flags this exact regex pattern).
- **`<TargetProgressCard>` / `<StatusGroupCard>` / `<AnomalyRadarWidget>`** — dashboard-local components. They're not consumed elsewhere. Decision for v3: keep as dashboard-local, OR if Reports/Finance dashboards land that need progress bars, promote to a `<ProgressMeter>` primitive in `src/components/ui/`. **Defer** — no second consumer yet.
- **`<KpiRow>` adoption** — wrap the existing inline `<dl className="grid …">` with the `<KpiRow>` primitive (already extracted in `operations/_shared/`). Trivial swap. Counts as v3 migration cleanup.

**No new v3 primitives demanded by dashboard alone.**

### F. Recommended Migration Approach

- **Pattern type:** dashboard-style (read-only widget grid)
- **v3 migration effort:** **~4-6 hours total**
  - Adopt `<PageHeader>` for greeting header (1h)
  - Replace 5× inline eyebrow with `.eyebrow` class (15min)
  - Swap inline `<dl>` for `<KpiRow>` (15min)
  - `rounded-xl` → `rounded-lg` across page.tsx + 3 dashboard-local components (45min)
  - `transition-all` → `transition-colors` (5min)
  - Delete `hero-kpi-card.tsx` (5min)
  - Fix h2 hierarchy under the 4 section eyebrows + verify Target progress bar radius (1h)
  - Update loading.tsx to mirror anomaly section (30min)
  - QA at 1280/1440/1920 + 375 (1h)
- **Migration risk:** **LOW** — no business logic touched, no server actions, purely presentational tidy-up.
- **Pre-requisites for v3:** none — all required primitives shipped.
- **Suggested order in v3 rollout:** Week 1 — Dashboard is the cleanest module to migrate first. Use it as the canary for v3's PageHeader + eyebrow class enforcement.

---

## 2. Reminders (`/reminders`)

### A. Current State Snapshot

- **Screenshots:** ✅ [02-reminders-1280.png](AUDIT_SCREENSHOTS/02-reminders-1280.png) · ✅ [02-reminders-375.png](AUDIT_SCREENSHOTS/02-reminders-375.png)
- **Routes:** single page — `/reminders`. Has `loading.tsx` (30 LOC).
- **LOC:**
  - [src/app/(owner)/reminders/page.tsx](src/app/(owner)/reminders/page.tsx) — 395 LOC (server-rendered shell + 4-bucket query orchestration)
  - [src/components/reminders/batch-client.tsx](src/components/reminders/batch-client.tsx) — 459 LOC (client component, batch send + optimistic UI)
  - [src/components/reminders/buckets.ts](src/components/reminders/buckets.ts) — 26 LOC (bucket config — pure data, no UI)
- **Primitive usage:** `<Container size="xl">` ✓ · `<SectionHeader>` (legacy `layout/section-header.tsx`) · `<Badge>` from ui · `<PaymentStatusBadge>` ×1 in batch-client. No StatCard, no EmptyState in current shape.

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader (v1) | 1/5 | Uses legacy `<SectionHeader>` from `components/layout/`. Pre-dates v1 PageHeader. |
| SectionCard / CollapsibleCard | 2/5 | Bucket cards rendered as bare `<div>` + custom styling. No SectionCard wrap. |
| FieldGrid | n/a | No editable fields on this page. |
| KpiRow | 1/5 | No KPI row currently — 4 bucket counts are inline `<Badge>`s in the bucket headers, not real KPI tiles. Real opportunity to add KpiRow for "Today's outstanding", "H+1 critical", "H-7 DP needed", "Total outstanding". |
| StatCard | 1/5 | Not used; rolls counts as small badges. |
| Status badges | 4/5 | `<PaymentStatusBadge>` ✓ in client component. |
| Empty states | 2/5 | Inline italic gray text per empty bucket ("Belum ada reminder hari ini"). Should adopt `<EmptyState variant="inline">`. |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.7)

Old audit: 8.5/10 — strongest module, no P0.

| Old finding | Status | Evidence |
| ----------- | ------ | -------- |
| Delivery unverified (wa.me) | ❌ Architectural — still applies | wa.me intent-only by design. Beyond v3 design system scope. |
| Template preview mobile overflow | ❓ Needs verification | `[Screenshot pending — mobile 375px]` |
| Batch send without confirmation for >5 | ❓ Needs verification | Read batch-client.tsx send handler — should add ConfirmDialog at threshold |
| "Outstanding" label English in Indonesian UI | ⚠️ Still in place | grep "Outstanding" → still appears in page chrome |
| No re-send cooldown | ❌ Outstanding | No backend timestamp guard found |
| Template dropdown — last-used badge | ❌ Outstanding | Not implemented |
| No "select by payment status" quick filter | ❌ Outstanding | Filter is bucket-only |

### D. Module-Specific Anti-Patterns

Anti-pattern violation counts within reminders scope:

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-2xl` / `rounded-xl` | 0 | — clean |
| `transition-all` | 0 | — |
| Hardcoded eyebrow `font-mono text-[11px]` | 0 | — |
| `hover:translate` | 0 | — |
| Decorative colors | 0 | — |
| Native form controls | 0 | — |
| NativeSelect | 0 | — |
| Handrolled popups | 0 | — |
| English label leakage | 1 | "Outstanding" in page chrome (old audit P2) |

### E. Module-Specific Primitive Needs

- **`<ReminderBucket>` (proposed)** — a SectionCard-shaped card with: bucket title + eyebrow ("H+3 PELUNASAN") + count badge + filter chip + scrollable contact list. Currently rolled inline in batch-client.tsx. Promotion to a primitive would help if Notifications (next module) re-uses the same shape. **Decision: defer until Notifications audit confirms shape overlap.**
- **`<RecipientRow>` (proposed)** — single contact line with checkbox + name + WA-arrow + outstanding amount + status pill + "Send" action. Repeats inside each bucket. Could become a primitive if same shape recurs in other batch-action surfaces (notification rule recipients, crew assignment). **Defer.**
- **`<ConfirmDialog>` adoption** — primitive exists. Reminders should adopt for batch-send threshold (≥5 recipients) per old audit P1.

### F. Recommended Migration Approach

- **Pattern type:** list-detail with batch action workflow
- **v3 migration effort:** **~6-8 hours**
  - Replace `<SectionHeader>` with `<PageHeader>` (1h)
  - Add KpiRow for 4 bucket counts as proper tiles (1h)
  - Wrap each bucket in `<SectionCard collapsible defaultOpen={i === 0}>` (1h — exposes empty-state slot)
  - Adopt `<EmptyState variant="inline">` per empty bucket (30min)
  - "Outstanding" → "Sisa Pembayaran" rename (15min)
  - Add `<ConfirmDialog>` for batch send ≥5 (30min)
  - Add tabular numerals to amounts (verify) (15min)
  - QA + responsive (1h)
- **Migration risk:** **MEDIUM** — batch-client.tsx is 459 LOC client component with optimistic state + wa.me timing. Don't refactor logic; only re-wrap the presentation layer.
- **Pre-requisites for v3:** none — existing primitives sufficient.
- **Suggested order in v3 rollout:** Week 2 — after Dashboard canary proves v1 primitive adoption pattern. Reminders is the second-cleanest module, low risk for migration.

---

## 3. Notifications (`/notifications`)

### A. Current State Snapshot

- **Screenshots:** ✅ [03-notifications-1280.png](AUDIT_SCREENSHOTS/03-notifications-1280.png) · ✅ [03-notifications-375.png](AUDIT_SCREENSHOTS/03-notifications-375.png)
- **Routes:** single page — `/notifications`. Has `loading.tsx` (29 LOC).
- **LOC:**
  - [src/app/(owner)/notifications/page.tsx](src/app/(owner)/notifications/page.tsx) — 446 LOC
  - [src/components/notifications/notification-row-actions.tsx](src/components/notifications/notification-row-actions.tsx) — 84 LOC
  - [src/components/notifications/run-scanner-button.tsx](src/components/notifications/run-scanner-button.tsx) — 50 LOC
- **Primitive usage:** `<Container size="md">` (notable — uses `md` not `xl` like other modules) · `<SectionHeader>` legacy · `<EmptyState>` ✓ ×1 · `<Badge>` · `<RunScannerButton>` · `<PushSubscribeButton>`. **Container size diverges from operations cluster's `xl` standard.**

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader (v1) | 1/5 | Uses legacy `<SectionHeader>`. |
| SectionCard | 2/5 | Notification rows are bare `<div className="… rounded-xl border …">` (page.tsx:326) — should be `<SectionCard>` or smaller `<NotificationRow>` primitive. |
| FieldGrid | n/a | No editable form on this page (rule editing lives in `/settings/notification-rules`). |
| KpiRow | 2/5 | No KPI tiles for unread / by-severity counts — opportunity for 4 small StatCard tiles ("Critical", "Warning", "Info", "All time"). |
| StatCard | 1/5 | Not used. |
| Status badges | 3/5 | Custom severity badges hand-rolled (not via `<Badge variant>`). Inconsistent with `<EventStatusBadge>` discipline. |
| Empty states | 5/5 | `<EmptyState>` ✓ (line 293). |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.8)

Old: 7.3/10 — functional inbox, DB design flaw + cache lag. No P0.

| Old finding | Status | Evidence |
| ----------- | ------ | -------- |
| `expires_at` not filtered (DB bloat) | ❌ Outstanding | Beyond UI scope — backend SELECT to verify. Cheap to fix (`AND (expires_at IS NULL OR expires_at > NOW())`). |
| Mark-read cache lag | ❓ Needs verification | Read [notification-row-actions.tsx](src/components/notifications/notification-row-actions.tsx) for revalidatePath usage. |
| Similar notifications not batched (10× "Low inventory") | ❌ Outstanding | Query-level fix (GROUP BY rule_id + hour bucket); beyond design scope. |
| NotificationBell badge SSR-only (no realtime) | ❌ Outstanding | Foundation = §3.10 real-time MVP (deferred). |
| Severity badges hard to scan | ⚠️ Same | Custom hand-rolled severity colors. Adopt `<Badge variant>` discipline. |
| Read/unread distinction subtle | ⚠️ Same | Bare `<div className="rounded-xl border">` + thin ring. Need visual treatment via SectionCard variant. |
| `expires_at` filter | ❌ Same — outstanding |

### D. Module-Specific Anti-Patterns

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-xl` (should be `rounded-lg`) | 1 | [page.tsx:326](src/app/(owner)/notifications/page.tsx#L326) — notification row card |
| `transition-all` | 0 | — |
| Hardcoded eyebrow | 0 | — |
| Container size mismatch | 1 | page.tsx:183 — uses `size="md"` (max-w-5xl) instead of the operations-cluster `xl` (max-w-7xl) standard |
| Native form controls | 0 | — |
| NativeSelect | 0 | — |
| Hand-rolled severity badges | yes | Inline severity color logic instead of routing through a `<SeverityBadge>` or extending `<Badge variant>` |

### E. Module-Specific Primitive Needs

- **`<NotificationRow>` (proposed for v3)** — pattern: severity icon left · title + body + meta right · action button(s) far right. Currently rolled inline. If we add a unified inbox to topbar later (per audit §G), this row primitive would be reused.
- **`<SeverityBadge>` (proposed)** — `<Badge variant="critical|warning|info|success">`. Today's `<Badge>` variants are `default | secondary | outline | success | warning | info | destructive` — close to enough, but Notifications hand-rolls colors via inline logic instead of consuming a "severity" variant. Either (a) extend `<Badge>` with severity-named aliases, or (b) build a thin `<SeverityBadge>` wrapper.
- **`<NotificationInbox>` (proposed)** — composite that owns: filter bar (by severity + category) + list of `<NotificationRow>` + empty state. Useful for v3 topbar bell dropdown pattern (per cross-cutting §G).

### F. Recommended Migration Approach

- **Pattern type:** list with filter + row-level actions (read/dismiss/resolve)
- **v3 migration effort:** **~5-7 hours**
  - Bump Container to `size="xl"` (matches cluster) (5min)
  - `<SectionHeader>` → `<PageHeader>` with run-scanner + push-subscribe as actions (1h)
  - Add KpiRow for 4 severity counts (45min)
  - Replace inline `<div className="rounded-xl …">` notification rows with new `<NotificationRow>` primitive (1.5h, includes building the primitive)
  - Severity badges → `<Badge variant>` or new `<SeverityBadge>` (45min)
  - `rounded-xl` → `rounded-lg` in row chrome (5min)
  - QA (1h)
- **Migration risk:** **MEDIUM** — read/unread/dismiss state has subtle cache semantics (revalidatePath); test thoroughly post-refactor.
- **Pre-requisites for v3:** new `<NotificationRow>` + `<SeverityBadge>` primitives must ship first. Both are small (≤80 LOC each).
- **Suggested order in v3 rollout:** Week 2 — alongside Reminders. Both modules are list-heavy with similar SectionCard adoption needs.

---

## 4. Billing (`/billing`)

### A. Current State Snapshot

- **Screenshots:** ✅ [04-billing-1280.png](AUDIT_SCREENSHOTS/04-billing-1280.png) · ✅ [04-billing-375.png](AUDIT_SCREENSHOTS/04-billing-375.png) · [04-billing-list-scrolled-375.png](AUDIT_SCREENSHOTS/04-billing-list-scrolled-375.png) (scrolled list view)
- **Routes:** single page — `/billing`. Has `loading.tsx`.
- **LOC:**
  - [src/app/(owner)/billing/page.tsx](src/app/(owner)/billing/page.tsx) — 247 LOC
  - [src/components/billing/billing-list-table.tsx](src/components/billing/billing-list-table.tsx) — 187 LOC
  - [src/components/billing/payment-form.tsx](src/components/billing/payment-form.tsx) — 249 LOC
  - [src/components/billing/payment-list.tsx](src/components/billing/payment-list.tsx) — 150 LOC
  - [src/components/billing/billing-filter-bar.tsx](src/components/billing/billing-filter-bar.tsx) — 97 LOC
  - [src/components/billing/proof-upload-button.tsx](src/components/billing/proof-upload-button.tsx) — 166 LOC
  - [src/components/billing/billing-tabs.tsx](src/components/billing/billing-tabs.tsx) — 70 LOC
  - Total billing component LOC: **919**
- **Primitive usage:** `<Container size="xl">` ✓ · `<SectionHeader>` legacy · `<KpiCard>` ×4 ✓ · `<EmptyState>` ×1 ✓ · `<PaymentStatusBadge>` ✓ (via list table)

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader | 1/5 | Legacy SectionHeader. |
| SectionCard | 1/5 | Tabs (Invoices / Quotations / BAST / Payments) inside page-level container, no SectionCard wrapping per tab content. |
| FieldGrid | 1/5 | `payment-form.tsx` uses inline labeled inputs (~249 LOC); not migrated to FieldGrid. |
| KpiRow | 3/5 | Same `<div className="grid">` shape as Dashboard — not wrapped in `<KpiRow>`. |
| KpiCard | 5/5 | ✓ used. |
| Status badges | 5/5 | `<PaymentStatusBadge>` ✓ |
| Empty states | 5/5 | `<EmptyState>` ✓ |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.4)

Old: 7.5/10.

| Old finding | Status | Evidence |
| ----------- | ------ | -------- |
| No quick PDF action on billing list | ❌ Outstanding | List table doesn't surface PdfDownloadMenu inline |
| PDF brand color `#be123c` (rose) vs web ink | ❓ Backend concern | Verify against current `src/lib/pdf/` |
| "unpaid" badge `outline` (should be `warning`) | ❓ Needs verification | Check `PaymentStatusBadge` mapping |
| Invoice/Tagihan/Quotation/Penawaran/BAST naming inconsistent | ❌ Outstanding | No central constants file found |
| Payment flow split between /billing + /operations/[id]/payments | ❌ Architectural | Not a v3 concern — feature scope |
| Quotation 30% DP hardcoded | ❌ Outstanding | Setting key missing |

### D. Module-Specific Anti-Patterns

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-2xl` / `rounded-xl` | 0 | Clean |
| `transition-all` | 0 | — |
| NativeSelect | 2 | [payment-form.tsx:118, 143](src/components/billing/payment-form.tsx#L118) — payment-method + bank-account pickers |
| Hardcoded eyebrow | 0 | — |
| Native form controls | 0 | — |

### E. Module-Specific Primitive Needs

- **`<InvoiceLineItem>` / `<PaymentLine>`** — repeated row shape in payment-list + billing-list. Currently 187 + 150 LOC of bespoke list rendering. Could collapse to one shared primitive if Operations payments page (Phase 2) also adopts.
- **`<PaymentTimeline>`** — payment history is a chronological list; if Phase 2 ops/payments page surfaces the same, lift to a primitive.
- **`<InvoiceStatus>` pill (extend PaymentStatusBadge)** — current PaymentStatusBadge covers `paid/unpaid/partial/dp/overpaid/overdue`. Acceptable.

### F. Recommended Migration Approach

- **Pattern type:** list with tabs + form modal (payment entry)
- **v3 migration effort:** **~8-10 hours**
  - PageHeader migration (1h)
  - 2 NativeSelect → Combobox in payment-form (45min)
  - Wrap each tab's content in SectionCard (1.5h)
  - KpiRow adoption (15min)
  - FieldGrid migration in payment-form (2h)
  - PdfDownloadMenu inline action on list rows (1h)
  - Billing terms central constants file (45min)
  - QA (1h)
- **Migration risk:** **MEDIUM** — payment-form has Zod + Server Action + optimistic UI. Logic untouched; presentation only.
- **Pre-requisites:** none for v3 design migration.
- **Suggested order:** Week 3 — after Reminders + Notifications (similar list-with-action pattern).

---

## 5. Finance (`/finance` + `/finance/vendors`)

### A. Current State Snapshot

- **Screenshots:** ✅ [05-finance-1280.png](AUDIT_SCREENSHOTS/05-finance-1280.png) · ✅ [05-finance-375.png](AUDIT_SCREENSHOTS/05-finance-375.png) · [05-finance-profit-scrolled-375.png](AUDIT_SCREENSHOTS/05-finance-profit-scrolled-375.png) (mobile profit breakdown) · [05-finance-settlements-scrolled-1280.png](AUDIT_SCREENSHOTS/05-finance-settlements-scrolled-1280.png) (settlements section scrolled) · ❌ `/finance/vendors` not captured
- **Routes:**
  - `/finance` — main dashboard
  - `/finance/vendors` — vendor commission summary
- **LOC:**
  - [src/app/(owner)/finance/page.tsx](src/app/(owner)/finance/page.tsx) — **791 LOC monolith** (P1 in old audit, still standing)
  - [src/app/(owner)/finance/vendors/page.tsx](src/app/(owner)/finance/vendors/page.tsx) — verify separately
  - [src/components/finance/vendors-list-table.tsx](src/components/finance/vendors-list-table.tsx) — 140 LOC
  - [src/components/finance/withdrawal-button.tsx](src/components/finance/withdrawal-button.tsx) — 265 LOC
- **Primitive usage:** `<Container size="xl">` ✓ · `<SectionHeader>` legacy · `<KpiCard>` ×4 ✓ · `<Badge>` ad-hoc. **No EmptyState, no PageHeader, no SectionCard.**

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader | 1/5 | Legacy. |
| SectionCard | 1/5 | Settlement table + sinking fund + owner pool + withdrawal — all in bare divs. |
| FieldGrid | 1/5 | Withdrawal form (`withdrawal-button.tsx`, 265 LOC) uses inline labeled inputs. |
| KpiRow | 3/5 | Inline grid, not wrapped. |
| KpiCard | 5/5 | ✓ |
| Status badges | 2/5 | Ad-hoc `<Badge>` variants instead of typed status badges. |
| Empty states | 1/5 | Bare italic gray "tidak ada" text. |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.6)

Old: 7.3/10 — **strong backend, 4 critical UX gaps. Most P0-dense module after Warehouse.**

| Old P0 finding | Status | Evidence |
| -------------- | ------ | -------- |
| **No OpEx input UI** (sewa kantor, internet, asuransi) | ❌ Outstanding | grep "opex" in src — no input form found. Owner still cannot record non-event expenses. **Feature gap, not design.** Must decide for v3 scope: include or defer? |
| **No journal entry browser** — GL blackbox | ❌ Outstanding | No `/finance/journal` or `/finance/gl` route. journal_entries/journal_lines populated but un-surfaced. **Feature gap.** |
| **No chart of accounts management UI** | ❌ Outstanding | No `/finance/accounts` or `/settings/chart-of-accounts` route. 68 accounts seeded read-only. **Feature gap.** |
| **No bank reconciliation** | ❌ Outstanding | No `/finance/reconciliation` route. **Feature gap.** |
| N+1 sinking fund RPC | ❓ Verify | Read sinking funds query. |
| Vendor page missing sort/filter | ❓ Verify | vendors-list-table.tsx 140 LOC — read for filter UI |
| Owner pool withdrawal terse | ⚠️ Same | withdrawal-button.tsx 265 LOC modal — no history visible alongside |
| Sinking fund UI split across 3 views | ❌ Outstanding | settings/sinking-funds/{list,movements} + finance dashboard summary |

### D. Module-Specific Anti-Patterns

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-xl` | 1 | [vendors-list-table.tsx:132](src/components/finance/vendors-list-table.tsx#L132) — mobile card wrapper, should be `rounded-lg` |
| `transition-all` | 1 | [finance/page.tsx:536](src/app/(owner)/finance/page.tsx#L536) — progress bar fill |
| NativeSelect | 2 | [withdrawal-button.tsx:103, 228](src/components/finance/withdrawal-button.tsx#L103) |
| Hardcoded eyebrow | 0 | — |
| 791 LOC monolith | yes | finance/page.tsx — old §2.5 still applies |

### E. Module-Specific Primitive Needs

**This module has the largest v3 primitive demand** because the P0 feature gaps unlock new surfaces.

- **`<JournalEntry>` / `<JournalLine>`** — debit/credit row pair with account lookup + amount + memo. **Required for journal browser P0.**
- **`<AccountPicker>`** — autocomplete + filter by account type (asset/liability/equity/income/expense). **Required for CoA management + OpEx form.**
- **`<TransactionList>` / `<LedgerRow>`** — chronological group-by-date with running balance column. **Required for journal browser + bank reconciliation.**
- **`<ReconciliationTable>`** — 2-column "bank statement | gl entries" with match toggles. **Required for bank reconciliation.**
- **`<OpExForm>` composite** — date + account + amount + vendor + receipt. **Required for OpEx input.**
- **`<PeriodFilter>` (could be a v3-generalized DateRangePicker)** — used here + Reports. Currently a hand-rolled month picker.

### F. Recommended Migration Approach

- **Pattern type:** ledger / financial dashboard (the most complex pattern in the app)
- **v3 migration effort:**
  - **Design refactor only**: ~10-14 hours (PageHeader + SectionCard + KpiRow + FieldGrid + 2 NativeSelect swap + EmptyState + rounded-xl fix + monolith split into per-section files)
  - **Plus P0 feature work**: each P0 gap is its own multi-day workstream:
    - OpEx input UI: 2-3 days (form + server action + journal posting + tests)
    - Journal browser: 3-4 days (paginated GL viewer + filters + drill-down)
    - CoA management: 2-3 days (CRUD + activation toggle + integrity guards)
    - Bank reconciliation: 4-5 days (matching algorithm + UI + audit trail)
- **Migration risk:** **HIGH** (if including P0 feature work) — touches journal_entries / journal_lines, server actions, GL invariants. **LOW** if design refactor only.
- **Pre-requisites for v3:** 6 new primitives listed in §E (3-4 days to build the primitive set).
- **Suggested order in v3 rollout:**
  - **Week 1**: build the 6 new primitives in `_shared/` (defer feature work)
  - **Week 4**: Finance design refactor (after Reports lands — they share KpiRow patterns)
  - **Week 5+**: P0 feature work as **separate post-v3 epics** — do NOT bundle with v3 design migration (HIGH risk).

**This is the single biggest decision in `AUDIT_DECISION_INPUT.md`:** does v3 scope include closing Finance P0 feature gaps, or only design refactor?

---

## 6. Reports (`/reports`)

### A. Current State Snapshot

- **Screenshots:** ✅ [06-reports-1280.png](AUDIT_SCREENSHOTS/06-reports-1280.png) · ✅ [06-reports-375.png](AUDIT_SCREENSHOTS/06-reports-375.png) · [06-reports-pnl-scrolled-375.png](AUDIT_SCREENSHOTS/06-reports-pnl-scrolled-375.png) (P&L breakdown scrolled)
- **Routes:** single page — `/reports` (sub-views via in-page month nav + tab switcher).
- **LOC:** [src/app/(owner)/reports/page.tsx](src/app/(owner)/reports/page.tsx) — **1140 LOC mega-file** (P1 in old audit, still standing). loading.tsx 31 LOC. No support component directory.
- **Primitive usage:** `<Container size="xl">` ✓ · `<SectionHeader>` legacy · `<KpiCard>` ×10+ ✓ · `<Badge>` ad-hoc. No EmptyState, no PageHeader.

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader | 1/5 | Legacy. |
| SectionCard | 1/5 | P&L / Operational / Owner Statement sections — all bare divs. |
| KpiRow | 3/5 | Inline grids; not wrapped. Same shape repeated 3 times across sections. |
| KpiCard | 5/5 | ✓ (now consumes the shared one — local duplicate from old audit is GONE) |
| Status badges | 3/5 | Ad-hoc `<Badge>`. |
| Empty states | 1/5 | No `<EmptyState>` for zero-revenue month or empty owner statement. |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.9)

Old: 6.7/10, 3 critical issues.

| Old P0 finding | Status | Evidence |
| -------------- | ------ | -------- |
| **Missing financial statements** (Balance Sheet, Cash Flow, GAAP Income Statement) | ❌ Outstanding | grep "Balance Sheet" / "Cash Flow" in /reports source — not present. Current P&L is settlement aggregate, not GAAP accrual. **Feature gap.** |
| **65% feature overlap with Finance** | ❌ Outstanding | Both modules surface MTD revenue + outstanding + vendor commission. Not consolidated. **Architectural.** |
| **No GL integration** (journal_entries unused) | ❌ Outstanding | grep "journal_entries" in /reports — 0 references. Cannot generate accrual-basis reports. |
| 1180 LOC monolith | ⚠️ Same | Now 1140 LOC — marginal trim, still mega-file |
| No period comparison (Finance has it, Reports doesn't) | ❌ Outstanding | No prev-month delta in any Reports KPI |
| No export capability (PDF/Excel/CSV) | ❌ Outstanding | No export action found |
| KpiCard defined locally (duplicate) | ✅ Fixed | grep "function KpiCard" or "const KpiCard" in reports/page.tsx returns 0. Now imports from `@/components/operations/kpi-card`. |
| Month switcher missing focus ring | ❓ Verify | Needs visual + a11y check |

### D. Module-Specific Anti-Patterns

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-xl` | 0 | Clean ✓ |
| `transition-all` | 0 | — |
| NativeSelect | 0 | — |
| Hardcoded eyebrow | 0 | — |
| 1140 LOC monolith | yes | Old §2.5 still applies — extract sections to component files |

### E. Module-Specific Primitive Needs

- **`<PnLTable>`** — nested category × month grid with subtotals + totals row. Currently rolled inline. **Required for v3 P&L surface.**
- **`<MetricComparison>`** — period-vs-period delta + arrow indicator + tone. Reports needs this; Finance already has prev-month delta logic. Unify.
- **`<DateRangeFilter>` (generalize)** — month + quarter + year + custom range. Reports + Finance + Billing all want.
- **`<ExportButton>`** — dropdown with PDF / Excel / CSV options. Required for "No export" P1.
- **`<KpiRow>` adoption** — same as elsewhere.

If financial statements (Balance Sheet / Cash Flow) become v3 scope:
- **`<FinancialStatement>` composite** — section per statement, with comparative columns + drill-down to journal lines.
- **`<TrialBalance>`** — GL summary by account, debit/credit columns.

### F. Recommended Migration Approach

- **Pattern type:** ledger / report dashboard with tabbed views
- **v3 migration effort:**
  - **Design refactor only**: ~6-8h (PageHeader + SectionCard + KpiRow + EmptyState + month-nav focus ring + monolith split)
  - **Plus P0 feature**: financial statements + GL integration = **2-3 weeks of new work**
- **Migration risk:** **LOW** for design refactor; **HIGH** for feature work (touches new domain model).
- **Pre-requisites:** `<PnLTable>`, `<MetricComparison>`, `<DateRangeFilter>`, `<ExportButton>` primitives (3-4 days to build).
- **Suggested order:** Week 4 — alongside or after Finance refactor. Share primitive builds (DateRangeFilter, MetricComparison).

---

## 7. Warehouse (`/warehouse` + `/warehouse/stock-take`)

### A. Current State Snapshot

- **Screenshots:** ✅ [07-warehouse-1280.png](AUDIT_SCREENSHOTS/07-warehouse-1280.png) · ✅ [07-warehouse-375.png](AUDIT_SCREENSHOTS/07-warehouse-375.png) · [07-warehouse-consumables-375.png](AUDIT_SCREENSHOTS/07-warehouse-consumables-375.png) (consumables tab scrolled) · ❌ `/warehouse/stock-take` not captured
- **Routes:** `/warehouse`, `/warehouse/stock-take`, `/warehouse/stock-take/[id]`
- **LOC:**
  - [src/app/(owner)/warehouse/page.tsx](src/app/(owner)/warehouse/page.tsx) — 177 LOC
  - [src/components/warehouse/warehouse-tables.tsx](src/components/warehouse/warehouse-tables.tsx) — 423 LOC
  - [src/components/warehouse/stock-adjust-dialog.tsx](src/components/warehouse/stock-adjust-dialog.tsx) — 302 LOC
  - [src/components/warehouse/stock-take-line-row.tsx](src/components/warehouse/stock-take-line-row.tsx) — 145 LOC
  - [src/components/warehouse/stock-take-actions.tsx](src/components/warehouse/stock-take-actions.tsx) — 90 LOC
  - Total: **1047 LOC** of warehouse components
- **Primitive usage:** `<Container size="xl">` ✓ · `<SectionHeader>` legacy · `<KpiCard>` ×4 ✓ · `<WarehouseTabs>` (warehouse-local). **No EmptyState, no PageHeader, no SectionCard.**

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader | 1/5 | Legacy. |
| SectionCard | 1/5 | Items + Stock Movements + Stock Take tabs all bare. |
| FieldGrid | 1/5 | stock-adjust-dialog (302 LOC) uses inline labeled inputs. |
| KpiRow | 3/5 | Inline grid, not wrapped. |
| KpiCard | 5/5 | ✓ |
| Status badges | 2/5 | Hand-rolled "Stok Kritis" / "Habis" badges with bg-amber/bg-rose inline. |
| Empty states | 1/5 | Inline italic gray text. |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.5)

Old: 6.5/10, **3 critical P0s.**

| Old P0 finding | Status | Evidence |
| -------------- | ------ | -------- |
| **Purchase intake unstructured** (no PO, no supplier master, no GR matching) | ❌ Outstanding | grep "purchase_order" / "PO" — only seen as a `direction` option in stock-adjust-dialog. **Feature gap.** |
| **Negative stock allowed silently** | ❓ Verify | Read stock-adjust-dialog.tsx for guard logic. UI shows red "habis" for ≤0 but doesn't distinguish negative. |
| **Weighted-avg cost can drift** (unit_cost optional) | ❌ Outstanding | Verify [src/lib/actions/stock-movements.ts:97](src/lib/actions/stock-movements.ts#L97) — needs UI to force unit_cost on `direction='purchase'`. |
| Equipment stock not tracked (no quantity) | ❌ Outstanding | Equipment module shows location + condition only |
| Reorder automation missing (KPI shows "Stok Kritis" but no action) | ❌ Outstanding | min_stock_alert schema exists, no triggers |
| Settlement consumption not labeled in movements log | ❓ Verify | grep `source='rekap_consumption'` — should map to label |

### D. Module-Specific Anti-Patterns

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-xl` / `rounded-2xl` | 0 | Clean ✓ |
| `transition-all` | 0 | — |
| NativeSelect | 1 | [stock-adjust-dialog.tsx:222](src/components/warehouse/stock-adjust-dialog.tsx#L222) — adjust direction picker |
| Hardcoded "Stok Kritis" / "Habis" badge colors | yes | Inline bg-amber-500/10 / bg-rose-500/10 — should be `<Badge variant>` |
| Hardcoded eyebrow | 0 | — |

### E. Module-Specific Primitive Needs

- **`<StockMovement>` row primitive** — direction badge (in/out/adjust/purchase/consumption) + qty + before → after stock + memo. Currently inlined in warehouse-tables.tsx (423 LOC).
- **`<InventoryQuantity>`** — qty + unit + tone (positive / critical / out-of-stock). Reused across items list + stock take.
- **`<PurchaseLine>`** — supplier + qty + unit_cost + total + GR status. **Required if purchase intake P0 lands in v3.**
- **`<StockTakeRow>`** — already exists as `stock-take-line-row.tsx` (145 LOC). Could be promoted to `_shared/` if other inventory surfaces emerge.
- **`<StockStatusBadge>`** — extend `<Badge>` with critical/out/restocking variants. Today's hand-rolled colors should funnel through here.
- **`<SupplierPicker>`** + **`<POForm>`** — required if v3 includes purchase intake P0.

### F. Recommended Migration Approach

- **Pattern type:** ledger + inventory table + dialog-based actions
- **v3 migration effort:**
  - **Design refactor only**: ~6-8h (PageHeader + SectionCard for 3 tabs + EmptyState + KpiRow adoption + 1 NativeSelect swap + StockStatusBadge centralization)
  - **+ Negative stock guard + unit_cost force on purchase**: ~1 day (UI-level fix; backend already permissive)
  - **+ Purchase intake P0 module**: **5-7 days** (supplier master + PO form + GR matching + movement source label)
- **Migration risk:** **MEDIUM** for design refactor (stock-take is dense); **HIGH** for purchase intake (touches weighted-avg cost math).
- **Pre-requisites:** `<StockMovement>`, `<InventoryQuantity>`, `<StockStatusBadge>` primitives (1-2 days).
- **Suggested order:** Week 3 — after Billing. Treat purchase intake as a post-v3 epic.

---

## 8. Contacts (`/settings/contacts`)

### A. Current State Snapshot

- **Screenshots:** ❌ not captured (gap — `/settings/contacts` both viewports needed)
- **Routes:** `/settings/contacts`, `/settings/contacts/import`
- **LOC:**
  - [src/app/(owner)/settings/contacts/page.tsx](src/app/(owner)/settings/contacts/page.tsx) — 151 LOC
  - [src/app/(owner)/settings/contacts/import/page.tsx](src/app/(owner)/settings/contacts/import/page.tsx) — 45 LOC (likely thin import wizard wrapper)
  - [src/components/contacts/contacts-list-table.tsx](src/components/contacts/contacts-list-table.tsx) — 124 LOC
- **Primitive usage:** `<SectionHeader>` legacy · `<EmptyState>` ✓ · `<ContactsListTable>` (`<ResponsiveTable>`-based) · csv-import wizard.

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader | 1/5 | Legacy. |
| SectionCard | 1/5 | Single-list page, no sub-sections to wrap. |
| KpiRow | 0/5 | No counts surfaced (e.g. total contacts, by-type breakdown). |
| Empty states | 5/5 | `<EmptyState>` ✓ |
| Status badges | n/a | Contacts don't have status. |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.10)

Old: 5.9/10 (Settings umbrella score; contacts called out specifically).

| Old finding | Status | Evidence |
| ----------- | ------ | -------- |
| **No create button** (import-only) | ❌ Outstanding | Read page.tsx — no `<Link href="/settings/contacts/new">` action found. Vendor / client / referral all created via booking-form auto-upsert; manual create UI absent. |
| Search not live (GET form re-submit) | ❓ Verify | Search input behavior needs read |

### D. Module-Specific Anti-Patterns

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-xl` | 0 | Clean |
| `transition-all` | 0 | — |
| NativeSelect | 0 | — |
| Empty state ad-hoc | 0 | Uses `<EmptyState>` ✓ |

### E. Module-Specific Primitive Needs

- **`<ContactCard>` or `<ContactRow>`** — repeats across contacts list + vendor master + crew. Centralize?
- **`<ContactTypePicker>`** — type filter (vendor/client/referrer) currently free-form chip.

Demands are light — module is small.

### F. Recommended Migration Approach

- **Pattern type:** simple list + filter + import
- **v3 migration effort:** **~3-4 hours**
  - PageHeader (30min)
  - Add create button + thin form route (1h)
  - KpiRow with by-type breakdown (45min)
  - Live search debounce (45min)
  - QA (30min)
- **Risk:** **LOW**
- **Pre-requisites:** none.
- **Suggested order:** Week 4 — low priority cleanup.

---

## 9. Audit Log (`/settings/audit-log`)

### A. Current State Snapshot

- **Screenshots:** ❌ not captured (gap — `/settings/audit-log` both viewports needed)
- **Routes:** `/settings/audit-log`. Has `loading.tsx`.
- **LOC:**
  - [src/app/(owner)/settings/audit-log/page.tsx](src/app/(owner)/settings/audit-log/page.tsx) — 174 LOC
  - [src/components/audit-log/audit-filter-bar.tsx](src/components/audit-log/audit-filter-bar.tsx) — 78 LOC
  - [src/components/audit-log/audit-list-table.tsx](src/components/audit-log/audit-list-table.tsx) — 132 LOC
- **Primitive usage:** `<SectionHeader>` legacy · `<EmptyState>` ✓ · `<AuditFilterBar>` (audit-local) · `<ResponsiveTable>`-based list.

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader | 1/5 | Legacy. |
| SectionCard | 1/5 | Single list page; filter bar + table flat. |
| KpiRow | 0/5 | No counts (e.g. by actor, by table). Could surface "Today: N events" / "Last 7d: N" / "By you: N" / "Critical actions: N". |
| Empty states | 5/5 | `<EmptyState>` ✓ |

### C. P0 Gap Status

Not called out specifically in old audit beyond Settings umbrella.

| Finding | Status |
| ------- | ------ |
| Filter bar uses NativeSelect (banned) | ❌ Outstanding — 2× in audit-filter-bar.tsx:42, 54 |
| No row drill-down (view full payload) | ❓ Verify by reading audit-list-table.tsx |
| No date-range filter | ❓ Verify |

### D. Module-Specific Anti-Patterns

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-xl` | 0 | Clean |
| `transition-all` | 0 | — |
| NativeSelect | 2 | [audit-filter-bar.tsx:42, 54](src/components/audit-log/audit-filter-bar.tsx#L42) — actor + table filters |
| Hardcoded eyebrow | 0 | — |

### E. Module-Specific Primitive Needs

- **`<AuditEntryRow>`** — actor + action + table + diff preview + timestamp. Currently inlined.
- **`<DiffViewer>`** — before/after JSON diff display. If `payload` is rendered, would benefit from a structured viewer (collapsible JSON, color-coded changes).
- **`<DateRangeFilter>`** — generalized (also Reports/Finance need).

### F. Recommended Migration Approach

- **Pattern type:** ledger-style read-only log
- **v3 migration effort:** **~3-4 hours**
  - PageHeader (30min)
  - 2 NativeSelect → Combobox in filter bar (45min)
  - KpiRow with 4 audit counts (45min)
  - Row drill-down panel using SectionCard collapsible (1h)
  - QA (30min)
- **Risk:** **LOW**
- **Pre-requisites:** none for refactor; `<DateRangeFilter>` if filter expansion lands.
- **Suggested order:** Week 4 — alongside Contacts.

---

## 10. Settings (`/settings` + 12 sub-routes)

### A. Current State Snapshot

- **Screenshots:** ✅ root [10-settings-root-1280.png](AUDIT_SCREENSHOTS/10-settings-root-1280.png) + [10-settings-root-375.png](AUDIT_SCREENSHOTS/10-settings-root-375.png). Sub-routes captured (desktop only): [packages](AUDIT_SCREENSHOTS/10-settings-packages-1280.png), [addons](AUDIT_SCREENSHOTS/10-settings-addons-1280.png), [backdrops](AUDIT_SCREENSHOTS/10-settings-backdrops-1280.png), [vendors](AUDIT_SCREENSHOTS/10-settings-vendors-1280.png). ❌ Missing sub-routes: bank-accounts, crew, items, notification-rules, sinking-funds, whatsapp-templates.
- **Routes (root + 12 sub-routes; contacts + audit-log audited separately as #8 and #9):**

| Route | LOC | loading.tsx | /new | /edit | Old audit issue |
| ----- | --- | ----------- | ---- | ----- | --------------- |
| `/settings` (root = System Config) | 51 | ✗ | n/a | n/a | **33 keys unsearchable (P0)**, "X key tersimpan" toast doesn't show diff |
| `/settings/addons` | 150 | ✓ | ✓ | ✓ | "Extra Crew" column ambiguous |
| `/settings/backdrops` | 180 | ✓ | ✓ | ✓ | Badge custom tones |
| `/settings/bank-accounts` | 105 | ✓ | ✗ | ✗ | **Read-only (P0)** — no create/edit UI |
| `/settings/crew` | 359 | ✓ | ✗ | ✗ | **Overloaded** — 3 stacked tables (invites + users + investor) + drawer |
| `/settings/items` | 147 | ✓ | ✓ | ✓ | + `/import` + `/mapping` sub-routes — IA scattered |
| `/settings/notification-rules` | 232 | ✓ | ✗ | ✓ | **Read-only toggle**, no edit form for new rules |
| `/settings/packages` | 127 | ✓ | ✓ | ✓ | — |
| `/settings/sinking-funds` | 233 | ✓ | ✓ | ✓ | + `/[id]/movements` — UI split across 3 views (also Finance §C) |
| `/settings/vendors` | 463 | ✓ | ✓ | ✓ | Largest sub-route — commission scheme + master |
| `/settings/whatsapp-templates` | 158 | ✓ | ✓ | ✓ | Variables shown as count only, not listed |
| `/settings/operations/import-projects` | — | ✗ | n/a | n/a | one-off legacy import |
| **Total Settings LOC** | **~2750** | 9/10 sub-routes | — | — | — |

- **Primitive usage snapshot (per sub-route page.tsx):**

| Sub-route | PageHeader | SectionCard | SectionHeader (legacy) | EmptyState | KpiCard | NativeSelect | rounded-xl |
| --------- | ---------- | ----------- | ---------------------- | ---------- | ------- | ------------ | ---------- |
| addons | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| backdrops | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| bank-accounts | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| crew | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| items | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| notification-rules | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| packages | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| sinking-funds | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| vendors | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| whatsapp-templates | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| **Coverage** | **0%** | **0%** | **100%** | 60% | 0% | (forms only) | 0% |

**Zero v1 primitive adoption** in Settings sub-routes. All ten use the legacy `<SectionHeader>`. None have KpiRow / KpiCard tiles. EmptyState is 6/10. Module is the **single biggest v3 migration surface** (2750 LOC, 10 page files, all chrome-legacy).

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader | 1/5 | Zero adoption. All 10 sub-routes use legacy SectionHeader. |
| SectionCard | 1/5 | Zero adoption. Crew page (359 LOC) stacks 3 tables in bare divs — prime SectionCard target. |
| FieldGrid | 1/5 | Every form in `src/components/{addons,backdrops,crew,items,packages,sinking-funds,vendors,notification-rules,whatsapp-templates}/` uses inline `<input className={inputClass}>`. |
| KpiRow | 0/5 | No KPI tiles for entity counts (e.g. "Active vendors: 12, archived: 3"). |
| Status badges | 3/5 | Mixed — some use centralized, others hand-roll. |
| Empty states | 4/5 | 6/10 sub-routes have `<EmptyState>`. Missing on addons, bank-accounts, crew, packages. |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.10)

Old: 5.9/10 — **worst UX in product. 5 P0 issues.**

| Old P0 finding | Status | Effort to close |
| -------------- | ------ | --------------- |
| **System config unsearchable** (33 keys, no search) | ❌ Outstanding | New `<SettingsSearch>` primitive + filter logic ~1-2 days |
| **Bank Accounts read-only** | ❌ Outstanding | Add /new + /edit routes ~1 day |
| **Contacts no create button** | ❌ Outstanding (covered in §8) | ~1 day |
| **Frame Size Mapping incomplete** (UI stats only, no mapping grid) | ❌ Outstanding | Build mapping grid form ~2 days |
| **No pre-apply warning for critical config** changes | ❌ Outstanding | Add ConfirmDialog gating on flagged keys ~1 day |
| Crew page overloaded (3 stacked tables) | ⚠️ Same | Split into SectionCard sections ~half-day |
| Notification Rules read-only | ❌ Outstanding | Build /new route ~1 day |
| Items mapping scattered (list+mapping+import+edit) | ⚠️ Same | IA restructure ~half-day |
| System config sticky footer unclear (no diff) | ⚠️ Same | Add diff view in footer ~half-day |

**Total P0 close-out effort:** ~8-10 days of feature work on top of design refactor.

### D. Module-Specific Anti-Patterns

| Rule | Hits | Where |
| ---- | ---- | ----- |
| `rounded-xl` / `rounded-2xl` | 0 (in pages) | Clean ✓ |
| NativeSelect | 17 callsites | See §0.4 — Settings owns 57% of cleanup queue. Files: addon-form, backdrop-form, crew/invite-form, items/{item-form, rekap-mapping-form}, notification-rules/rule-form, packages/package-form, sinking-funds/{movement-form, fund-form}, whatsapp-templates (verify) |
| Legacy SectionHeader | 10/10 sub-routes | Highest in app |
| Hand-rolled FieldGrid pattern | All forms | Across ~10 form files |

### E. Module-Specific Primitive Needs

- **`<SettingsSearch>`** — global search across 33 system config keys + entity routes. Could be a topbar search. **Required for system config P0.**
- **`<ConfigItem>`** — label + value + edit-in-place + description. Currently rolled inline in `system-config/config-form.tsx`.
- **`<SettingsNav>` / `<TabNav>` (grouped)** — current Settings IA is a flat 12-route sidebar. Restructure to 5-domain groups per old audit recommendation (Products & Services / People / Finance / Communications / System).
- **`<EntityListPage>` composite** — repeated pattern: header + filter + KpiRow + ResponsiveTable + "+ Add" CTA. 8 of the 10 sub-routes follow this exact shape. Could ship as a thin composite + cut total Settings LOC by ~30%.
- **`<DiffPreview>`** — for system config sticky footer "X key changed, click to expand diff".
- **`<ConfirmDialog>` adoption for critical config keys** — already exists; just wire to flagged keys.

### F. Recommended Migration Approach

- **Pattern type:** entity CRUD × 10 + global config + nav restructure
- **v3 migration effort:**
  - **Design refactor only** (PageHeader + SectionCard + FieldGrid + EmptyState + KpiRow per sub-route): ~10 sub-routes × ~2-3h each = **~25-30 hours / 4-5 days**
  - **+ NativeSelect → Combobox sweep**: 17 callsites × ~10min = ~3h
  - **+ P0 feature work (5 items)**: **~8-10 days**
  - **+ IA restructure (5-domain nav)**: ~1-2 days
- **Migration risk:** **MEDIUM** for design refactor (high volume, repetitive); **HIGH** if bundling P0 feature work.
- **Pre-requisites:** `<SettingsSearch>`, `<ConfigItem>`, `<EntityListPage>` composite ~2 days to build.
- **Suggested order:** **Week 3-5**, **per sub-route atomic**:
  - Week 3: addons, backdrops, packages, whatsapp-templates (simple entities, ~2h each = 8h)
  - Week 3: vendors (largest, 463 LOC, ~5h)
  - Week 4: bank-accounts (+P0 create/edit), notification-rules (+P0 new), items (+IA cleanup)
  - Week 4: sinking-funds, crew (+P0 split)
  - Week 5: system config (+P0 search, diff, warning gate)

**Decision lever:** this module alone justifies a v3 timeline expansion. Pure design refactor = +4-5 days; full P0 close-out = +12-15 days.

---

## 11. Crew Portal (`/crew/*`) — mobile-first

### A. Current State Snapshot

- **Screenshots:** ✅ **6 real-device phone captures** (not Chrome DevTools emulation — actual Android, user "Farhan Mauludi"): [11-crew-home-mobile.jpeg](AUDIT_SCREENSHOTS/11-crew-home-mobile.jpeg) · [11-crew-jadwal-mobile.jpeg](AUDIT_SCREENSHOTS/11-crew-jadwal-mobile.jpeg) · [11-crew-alat-mobile.jpeg](AUDIT_SCREENSHOTS/11-crew-alat-mobile.jpeg) · [11-crew-fee-mobile.jpeg](AUDIT_SCREENSHOTS/11-crew-fee-mobile.jpeg) · [11-crew-profile-mobile.jpeg](AUDIT_SCREENSHOTS/11-crew-profile-mobile.jpeg) · [11-crew-rekap-detail-mobile.jpeg](AUDIT_SCREENSHOTS/11-crew-rekap-detail-mobile.jpeg). Reflects actual touch UX. ❌ Desktop fallback not captured (low priority — module is mobile-first).
- **Routes (under `(crew)` group, separate layout):**

| Route | LOC | loading.tsx |
| ----- | --- | ----------- |
| `/crew` (home) | 340 | ✓ |
| `/crew/alat` (assigned equipment) | 179 | ✗ |
| `/crew/fee` (own fee history) | 210 | ✗ |
| `/crew/profile` | 144 | ✓ |
| `/crew/jadwal` (assignments list) | 237 | ✓ |
| `/crew/jadwal/[projectId]` (event detail) | 583 | ✗ |
| `/crew/jadwal/[projectId]/rekap` (submit rekap) | 254 | ✗ |
| `/crew/jadwal/[projectId]/rekap/success` | 178 | ✗ |
| **Total** | **2125** | **3/8** = 38% |

- **Layout:** [src/app/(crew)/layout.tsx](src/app/(crew)/layout.tsx) — uses shared `<TopBar>` (same as owner) + dedicated `<CrewBottomNav>` (mobile-first), `safe-area-inset-bottom` aware. `min-h-dvh` flex column.
- **Primitive usage:** `<StatCard>` ×4 on home page ✓ · `<EmptyState>` ×3 ✓ · `<EventStatusBadge>` ✓ · `<NeedsRekapSection>` (rekap-shared component) · `<Badge variant="outline">` ad-hoc on event detail.

### B. Visual Hierarchy Audit

| Item | Score | Note |
| ---- | ----- | ---- |
| PageHeader | 1/5 | Hand-rolled headers per page. No v1 PageHeader. Crew portal has different needs (no back-link sometimes, more compact). |
| SectionCard | 1/5 | Event detail (583 LOC) stacks event info + equipment + rekap status — all bare divs. |
| FieldGrid | n/a | Rekap form uses inline labels — crew context, mobile-first, label-stack may be preferred over label-LEFT. |
| KpiRow | 3/5 | Home page uses StatCard inline grid; not wrapped in KpiRow. |
| StatCard | 5/5 | ✓ (Home: total events, hours, fee, pending rekap) |
| Status badges | 4/5 | EventStatusBadge ✓ |
| Empty states | 5/5 | `<EmptyState>` ✓ across alat, jadwal, fee |

### C. P0 Gap Status (vs AUDIT_UI_UX.md §3.11)

Old: 8.5/10 mobile portal (excellent post-Prompt 4 polish). No P0.

| Old P1 finding | Status | Evidence |
| -------------- | ------ | -------- |
| Rekap form length (15+ fields, cellular lag) | ⚠️ Same | rekap/page.tsx 254 LOC — long. Multi-step wizard could help. |
| File upload no progress | ❌ Outstanding | Verify `<FileDrop>` / proof-upload — no progress UI surfaced. |
| Real-time data stale after submit | ❌ Outstanding | After rekap submit, /crew still shows "Perlu submit" until refresh. Foundation = §3.10 real-time MVP (deferred). |
| Custom materials lack visual SKU reference | ⚠️ Same | rekap form |
| Equipment damage reporting absent | ❌ Outstanding | `/crew/alat` is read-only |
| Fee outstanding card lacks urgency tier | ⚠️ Same | `/crew/fee` uses default tone |
| loading.tsx coverage on crew portal: 38% (3/8) | ⚠️ Worse than owner | alat, fee, jadwal/[id], jadwal/[id]/rekap, rekap/success all missing |

### D. Module-Specific Anti-Patterns

| Rule | Hits | File:line |
| ---- | ---- | --------- |
| `rounded-2xl` | 1 | [(auth)/crew-portal/page.tsx:40](src/app/(auth)/crew-portal/page.tsx#L40) — the **login-style splash page**, technically "auth" not "crew portal". Acceptable as marketing-like; tracked in lint snapshot. |
| `rounded-xl` | 1 | crew/jadwal/[projectId]/rekap/page.tsx (verify by grep — see snapshot above showing 1 hit there) |
| `transition-all` | 0 | Clean ✓ |
| Hardcoded eyebrow | 0 | — |
| NativeSelect | 0 | — (crew forms use Combobox or no select) |
| loading.tsx missing | 5/8 routes | alat, fee, jadwal/[id], jadwal/[id]/rekap, rekap/success |

### E. Module-Specific Primitive Needs

- **`<MobileSectionCard>` variant or `<SectionCard size="compact">`** — current SectionCard padding (px-5 py-3.5 + py-4) may be heavy on 375px. Add `size="compact"` variant for crew portal (px-3 py-2.5) OR adopt SectionCard with current size and accept the slightly larger touch chrome.
- **`<EventTimeline>` (proposed)** — event detail at `/crew/jadwal/[id]` (583 LOC) shows event info + setup time + duration + crew + equipment. Could compose via a primitive that the operations cluster could also use.
- **`<RekapWizard>` composite** — multi-step rekap submission (mitigates the "15+ fields" P1). Steps: Cetak count → Items used → Crew expenses → Photos → Confirm. Each step a `<SectionCard>`.
- **`<UploadProgressBar>`** — required for "file upload no progress" P1.
- **`<DamageReportForm>`** — required for "equipment damage reporting absent" P1.
- **`<CrewBottomNav>`** — exists, working ✓ — keep.
- **`<TopBar>` shared variant** — current TopBar is shared with owner; should differentiate notification bell behavior (crew can't dismiss owner-only alerts). Owner-vs-crew TopBar split is a cross-cutting decision (see §G).

### F. Recommended Migration Approach

- **Pattern type:** mobile-first PWA-style; hybrid form-heavy + dashboard-style
- **v3 migration effort:**
  - **Design refactor**: ~10-12h (8 routes, each ~1-2h; share SectionCard adoption with rest of cluster)
  - **+ loading.tsx coverage gap close (5 routes)**: ~3h
  - **+ Rekap multi-step wizard refactor**: 2-3 days (big UX change)
  - **+ File upload progress**: ~1 day
  - **+ Equipment damage reporting feature**: ~2-3 days
  - **+ Real-time stale-data fix** (post-submit): foundation = §3.10 MVP — couples to optimistic concurrency
- **Migration risk:** **MEDIUM** — mobile-first means viewport edge cases (iPhone SE notch, Android safe-area) must be tested across all 8 routes.
- **Pre-requisites:** SectionCard `size="compact"` variant decision; `<UploadProgressBar>` primitive (1 day).
- **Suggested order in v3 rollout:** **Week 4-5** — after owner-side modules. Crew is highest-quality module today (8.5); migration is enhancement, not rescue. Polish + feature additions (damage report, upload progress, rekap wizard) make this 5-7 day workstream regardless of design.

**Notable difference vs owner modules:** crew portal already has the best mobile discipline in the app. v3 migration should PRESERVE the existing UX (touch targets ≥44px, max-w-md container, safe-area awareness) and not break it by retrofitting desktop-first primitives. SectionCard adoption is the only risky shift — needs the compact-size variant decision before sweep.

---

## Cross-cutting concerns

### G. Top Bar / Global Layout

**Current state:** [src/components/layouts/topbar.tsx](src/components/layouts/topbar.tsx) — 66 LOC. Shape: Tetra logo (left) + cluster name eyebrow + `<NotificationBell>` + `<UserMenu>` (right). Shared between owner + crew layouts.

- **Notification bell:** currently routes to `/notifications`. Badge count is SSR-only (per AUDIT_UI_UX.md §2.1 + §3.8); no real-time subscription. v3 spec (per user prompt) wants to **move notification surface to topbar** with inbox dropdown.
- **No global search.** All search is per-page (operations list, settings/contacts, etc.). Settings P0 "33 keys unsearchable" + Sub-search across entities both want a topbar-level command palette.
- **No breadcrumb.** Current pages use the back-link pattern in `<PageHeader>` (`backHref + backLabel`) for project-detail-style routes; no global breadcrumb component.
- **No multi-owner presence indicator.** Foundation = DESIGN_SYSTEM §3.10 MVP (optimistic concurrency, no presence avatar). v3 could add a simple `<AvatarStack>` placeholder slot in topbar for Phase 5 wire-up.
- **No global loading bar.** Next.js's `<Link>` doesn't have a default progress indicator; pages just appear (or skeleton, where loading.tsx is present).

**v3 demand:**
1. **Topbar notification inbox dropdown** — `<NotificationBell>` becomes a popover trigger. Inside: filtered list of recent notifications + "See all" link. Composes `<NotificationRow>` from Module #3.
2. **Global command palette** (`⌘K` / `Ctrl+K`) — opens search across system config keys + entity routes + recent events. Required for Settings P0 + multi-route search ergonomics.
3. **Owner presence avatar stack** placeholder — render slot (empty until §3.10 Phase 5 ships).
4. **Progress bar** (NProgress-style) — top thin line during route transitions. Optional polish.

### H. Sidebar

**Current state:** [src/components/layouts/owner-sidebar.tsx](src/components/layouts/owner-sidebar.tsx) — 121 LOC. Shape: fixed 260px wide, hidden `<md` (mobile uses `<OwnerBottomNav>` instead). Two flat sections separated by a divider:

```
─── PRIMARY ────
  Dashboard
  Operations
  Design
  Billing
  Warehouse
  Finance
─── SECONDARY ──
  Reminders
  Notifications
  Reports
  Settings
```

- **Active state:** color-only (no border indicator, no left-stripe). Already disciplined ✓.
- **Mobile:** hamburger absent. `<OwnerBottomNav>` (170 LOC) renders fixed bottom on `<md`. Crew portal uses `<CrewBottomNav>` (77 LOC).
- **Collapsible:** sidebar has no collapse toggle. At 260px fixed, content area at 1280px viewport = 1020px usable — matches Container `xl` cap (1280) minus padding.
- **Multi-tenant owner switcher:** not present; not in scope.

**v3 demand:**
1. **5-domain restructure** (per Settings audit §C): regroup nav into "Operations" / "Finance" / "People" / "Communications" / "System". Reduces cognitive load on Settings entry.
2. **Sidebar width fits the new operations container** — current 260px works at xl=1280px. Verify width at smaller laptop viewports (1024px) — may need collapse on <lg.
3. **Notification + Reminders consolidation** consideration — if topbar bell takes over urgent notifications, sidebar "Notifications" entry could become a deeper "Inbox History" view.

### I. Modal / Sheet Usage

**Inventory** (`grep -l '<ConfirmDialog\\|<AlertDialog\\|<Dialog\\|<Sheet ' src/`):
- **19 files** use modal/dialog primitives.
- **1 file** uses Drawer pattern (`<EditCrewDrawer>` at `src/components/crew/edit-crew-drawer.tsx`).

**Audit observations:**
- **`<ConfirmDialog>` adoption** — primitive exists at `src/components/ui/confirm-dialog.tsx`. Usage scattered; some destructive actions (delete event, settle, etc.) wire it correctly, others fall back to `confirm()` native. **Recommend full sweep during v3 — every destructive action uses `<ConfirmDialog>`**.
- **Bottom sheet on mobile:** no general primitive. `<Sheet>` (Radix Dialog wrapper) exists but isn't optimized as a bottom-sheet on mobile. Crew portal could benefit when surfacing event detail actions.
- **Modal-first thought violations:** stock-adjust-dialog (302 LOC) opens a modal for what could be inline-row-edit. Similar for `<EditCrewDrawer>` — works but loses context. **Decision:** defer modal-vs-inline refactor; not v3 design scope.
- **Modal full-screen on mobile:** no audit done — needs visual verification per `[Screenshot pending]`.

### J. Loading States Coverage

**Snapshot:** **38 / 84 routes** have `loading.tsx` = **45% coverage**.

| Surface | Page count | Loading count | Missing |
| ------- | ---------- | ------------- | ------- |
| (owner) | 71 | 36 | 35 |
| (auth) | 5 | 0 | 5 |
| (crew) | 8 | 2 | 6 |
| **Total** | **84** | **38** | **46** |

**Per-cluster (most-missing):**
- All `/settings/*/new` routes — no loading.tsx (matters less; quick render)
- All `/settings/*/[id]/edit` routes — no loading.tsx (matters more; fetch-then-show)
- Crew portal: alat, fee, jadwal/[id], jadwal/[id]/rekap, rekap/success — 5 missing
- Auth: login, register, onboarding, pending, crew-portal — 5 missing (auth pages typically don't need loading)

**Skeleton quality:**
- Booking-form loading.tsx mirrors SectionCard + FieldGrid structure ✓ (Phase 1.6 work).
- Other modules' loading.tsx use generic shape — risk of CLS mismatch.
- AUDIT_PERFORMANCE.md §E.1 claim was "58/74 missing" — improved to "46/84 missing" (~30% better, mostly from booking + ops sub-routes).

**v3 demand:** add `loading.tsx` per /edit + /new + the 5 crew portal routes. Each ~20-30 LOC skeleton mirroring the rendered shape. Total ~30 files × 30min = ~15h.

### K. Mobile Adaptation

Per-module mobile state (from earlier sections):

| Module | Mobile state | Worst breakage |
| ------ | ------------ | -------------- |
| Dashboard | ✓ | StatCard ambiguous hover on tap |
| Reminders | ⚠️ | Template preview modal no responsive height (old P1) |
| Notifications | ⚠️ | Container `size="md"` differs from cluster |
| Billing | ✓ | KPI value truncation on small screens |
| Finance | ⚠️ | 791 LOC monolith; 3-col grids verify mobile collapse |
| Reports | ⚠️ | 1140 LOC monolith; tabular wide on small screens |
| Warehouse | ⚠️ | Stock-take edit cramped <640px (old P2) |
| Contacts | ✓ | Light page, should be fine |
| Audit Log | ✓ | Read-only list |
| Settings | ❌ | Crew settings table breaks <768px (old P1); no responsive card collapse |
| Crew Portal | ✅ | Mobile-first by design; touch targets ≥44px |

**Cross-cutting verdict:** mobile breakage concentrated on Settings + Finance + Reports. Crew portal is the gold standard. v3 mobile sweep should:
1. Lift Settings crew table to `<ResponsiveTable>`.
2. Verify 3-col grids in Finance + Reports collapse via SectionCard's responsive default.
3. Test 375px on each migrated module post-v3 swap.

### L. Data Fetching Audit

**Snapshot:**
- **0 hits** of `@tanstack/react-query` / `useSWR` / `useQuery` in `src/` — confirmed absent.
- **16 `useEffect`** uses in client components (`src/components/**`). Mostly UI state (combobox popup position, focus management, etc.), not data fetching.
- **38 `revalidatePath` / `revalidateTag`** calls in server actions — standard Next.js pattern.
- **Pages** fetch entirely via Server Components + `Promise.all` (e.g. Dashboard's 15-query batch, Finance's 11-query batch, Reports' 9-query batch).

**Per-module observations:**

| Module | Pattern | Issue |
| ------ | ------- | ----- |
| Dashboard | Server-only, 15-query Promise.all | None |
| Operations list | Server + month filter (URL param) | revalidate on month change works; no client cache |
| Booking form | Server + client state | OK |
| Reminders | Server + client batch send | OK |
| Notifications | Server + revalidatePath on action | Old audit: mark-read cache lag — verify if still |
| Billing | Server + form modal | OK |
| Finance | Server-only, 11-query parallel | OK |
| Reports | Server-only, 9-query parallel | OK |
| Settings | Server + form actions + revalidatePath | OK |
| Crew portal | Server + form-submit + manual refresh | Real-time stale after rekap submit (P1) |

**Search/debounce audit:**
- Contacts search: GET-form re-submit (no debounce) — old P2 still
- Operations list search: similar pattern
- No race-condition reports surfaced beyond above

**Optimistic UI:**
- Reminders batch-client uses optimistic mark-sent ✓
- Most mutations don't show optimistic state — fall back to revalidate + reload

**TanStack Query re-add justification (for v3 scope decision):**
- ❌ Most pages already use Server Components + Promise.all — fast, simple, no client cache lag
- ⚠️ Pain points where TanStack would help: notifications mark-read lag, crew rekap stale after submit, real-time presence (Phase 5)
- ✅ For real-time MVP (§3.10 optimistic concurrency), TanStack provides `useMutation` + `useQuery` + cache invalidation cleanly
- **Recommendation:** **defer TanStack Query re-add to Phase 5 alongside Supabase Realtime channel work.** v3 scope = design refactor; data layer overhaul = separate concern.

---

**End of cross-cutting concerns section.**

---

**End of scaffold (commit 1 of ~15).** Per-module sections will be filled sequentially; the final two commits will produce `AUDIT_PRIMITIVE_NEEDS_V3.md` + `AUDIT_DECISION_INPUT.md`.
