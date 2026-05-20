# Per-Module Re-Audit — Tetra Ops (Pre-V3 Design System Migration)

**Audit date:** 2026-05-21
**Auditor:** Claude (code-level analysis; no browser tools available in this environment)
**Baseline comparison:** [AUDIT_UI_UX.md](AUDIT_UI_UX.md) (2026-05-19), [AUDIT_PERFORMANCE.md](AUDIT_PERFORMANCE.md), [AUDIT_SUMMARY.md](AUDIT_SUMMARY.md)
**Scope:** 10 modules + crew portal + cross-cutting concerns. **Operations + Booking excluded** — state is documented in [REPORT_OPERATIONS_CONSISTENCY.md](REPORT_OPERATIONS_CONSISTENCY.md).

> ⚠️ **Screenshot deliverable note:** the spec required Vercel-preview screenshots at 1280px + 375px per module. This environment has no browser tooling, so every module section carries a `[Screenshot pending — user provide]` slot in `AUDIT_SCREENSHOTS/`. The objective metrics the spec also asked for (LOC, primitive tally, anti-pattern violations by file:line, route tree) are GREP-able and are filled in fully.

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

- **Screenshots:** `[Screenshot pending — user provide AUDIT_SCREENSHOTS/01-dashboard-1280.png + 01-dashboard-375.png]`
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

*Pending.*

---

## 3. Notifications (`/notifications`)

*Pending.*

---

## 4. Billing (`/billing`)

*Pending.*

---

## 5. Finance (`/finance` + `/finance/vendors`)

*Pending.*

---

## 6. Reports (`/reports`)

*Pending.*

---

## 7. Warehouse (`/warehouse` + `/warehouse/stock-take`)

*Pending.*

---

## 8. Contacts (`/settings/contacts`)

*Pending.*

---

## 9. Audit Log (`/settings/audit-log`)

*Pending.*

---

## 10. Settings (`/settings` + 12 sub-routes)

*Pending.*

---

## 11. Crew Portal (`/crew/*`)

*Pending.*

---

## Cross-cutting concerns

### G. Top Bar / Global Layout

*Pending.*

### H. Sidebar

*Pending.*

### I. Modal / Sheet Usage

*Pending.*

### J. Loading States Coverage

*Pending.*

### K. Mobile Adaptation

*Pending.*

### L. Data Fetching Audit

*Pending.*

---

**End of scaffold (commit 1 of ~15).** Per-module sections will be filled sequentially; the final two commits will produce `AUDIT_PRIMITIVE_NEEDS_V3.md` + `AUDIT_DECISION_INPUT.md`.
