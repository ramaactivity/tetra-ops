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

*Pending — next commit.*

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
