# AUDIT UI/UX — Tetra Ops

**Audit date**: 2026-05-19
**Auditor**: Claude (read-only audit, no code modifications)
**Scope**: 11 modules + shared chrome + design tokens
**Baseline**: branch `main` commit `a9928d3`, deploy live di https://tetra-ops.vercel.app
**Methodology**: Parallel Explore agents per module (Phase 1) + cross-cutting analysis (Phase 2)

---

## 0. Executive Summary

Tetra Ops adalah Next.js 16 + Supabase business management app untuk Tetra Photobooth. Setelah audit komprehensif 11 module (Dashboard, Operations, Design Hub, Billing, Warehouse, Finance, Reminders, Notifications, Reports, Settings, Crew web+mobile), temuan utama:

**Postur produk saat ini**:
- **Backend mature**: 42 server actions, 7+ atomic RPC (settle_event, reopen, calc HPP/OpEx, validate stock), 68 chart_of_accounts seeded, double-entry GL functional, RLS robust, 15+ tabel inti
- **Visual foundation strong**: DESIGN.md spec lengkap (Vercel ink monochrome #171717 + Vercel blue link), globals.css enforce 4-step surface ladder, legacy iris/crimson tokens collapsed ke ink, gradient utilities di-no-op
- **UX surface immature**: 11 module functional tapi belum konsisten — radius mix-mix, color violations di 5 file, mega-files 983/1180 LOC, 3 settlement route paralel, multi-owner awareness ZERO across system

**Top findings sistemik**:
1. **Multi-owner real-time awareness absent** — 4 owner monitor bareng tapi tidak ada presence indicator, last-edit timestamp, conflict detection. Operations + Dashboard treat sebagai single-user
2. **Radius chaos** — 403× `rounded-md`, 174× `rounded-xl`, 106× `rounded-lg`, 14× `rounded-2xl`. DESIGN.md spec 2-scale (6px in-app, 8px card). Inconsistency root cause: `Card` primitive sendiri pakai `rounded-xl` + `ring` instead of `rounded-md` + `border`
4. **3 settlement route paralel** — `/operations/[projectId]/rekap` (primary), `/settle` (legacy), `/tutup-buku` (legacy mega-form) — confusion + duplication
5. **Mega-files**: Operations detail 983 LOC, Reports 1180 LOC, Finance 791 LOC. Reports vs Finance 65% feature overlap
6. **Settings IA chaos**: 12 flat tab + 33 unsearchable config keys = "paling overwhelming" (owner direct quote)
7. **4 Finance P0 gap**: no OpEx input form, no journal entry browser, no chart-of-accounts management UI, no bank reconciliation
8. **Warehouse purchase intake tersembunyi** sebagai dropdown option di generic adjust dialog (no PO module, no supplier master)

**Module scorecard (consolidated dari per-module audits)**:

| # | Module | Visual | UX | Functional | Consistency | Overall | Priority |
|---|--------|--------|----|-----------|-------------|---------|----------|
| 1 | Dashboard | 8.5 | 8 | 8.5 | 8 | **8.3** | P2 polish |
| 2 | Operations | 8.5 | 6 | 6 | 7 | **6.9** | **P0 highest** |
| 3 | Design Hub | 7 | 6 | 8 | 7 | **7.0** | P1 |
| 4 | Billing | 8 | 7 | 8 | 7 | **7.5** | P1 |
| 5 | Warehouse | 7.5 | 6 | 5.5 | 7 | **6.5** | **P0** |
| 6 | Finance | 8 | 6.5 | 7 | 7.5 | **7.3** | **P0** |
| 7 | Reminders | 8 | 8 | 9 | 9 | **8.5** | P3 polish |
| 8 | Notifications | 8 | 7 | 6 | 8 | **7.3** | P1 |
| 9 | Reports | 9 | 8 | 6 | 4 | **6.7** | **P0** (merge w/ Finance) |
| 10 | Settings | 8.5 | 4 | 6 | 5 | **5.9** | **P0** |
| 11 | Crew web | 8 | 7 | 8 | 8 | **7.7** | P1 |
| 11b | Crew mobile | 8.5 | 7.5 | 8.5 | 9 | **8.4** | P3 polish |

**Total deliverable doc series**:
- `AUDIT_UI_UX.md` (this doc) — per-module + cross-cutting
- `AUDIT_PERFORMANCE.md` — bundle, queries, React, network
- `DESIGN_SYSTEM.md` — design tokens spec + component library
- `REFINEMENT_ROADMAP.md` — sequenced 15-week plan
- `AUDIT_SUMMARY.md` — 2-3 page executive level

---

## 1. Methodology

### 1.1 Approach
Read-only audit lewat parallel Explore agents (1 agent per module). Setiap agent:
1. Read semua source file di scope module
2. Apply 5-pillar scoring framework (Visual / Information Hierarchy / UX / Functional / Consistency)
3. Identify P0/P1/P2 issues dengan file:line reference
4. Recommend Quick wins (S, <1h), Medium (M, 1-4h), Heavy (L, >4h)

### 1.2 Scope per module
- Files & components scoped via folder boundary (`src/app/(owner)/<module>/*` + `src/components/<module>/*` + relevant `src/lib/actions/*`)
- Cross-cutting analysis dilakukan setelah semua module returned

### 1.3 Limitations
- **No browser testing**: tidak run dev server atau visual QA di real device
- **No production data check**: tidak query Supabase production untuk verify performance claims
- **No Lighthouse run**: bundle/perf analysis static-only (paket.json + grep patterns)

---

## 2. Cross-Cutting Findings (systemic patterns)

### 2.1 [CRITICAL] Multi-Owner Real-Time Awareness Absent

**Pattern**: Project context state 4 owner monitor bareng (command center hybrid multi-view). Tapi audit menemukan ZERO mekanisme:
- ❌ No `owner_id` / `org_id` filter di queries (events fetch all events, not filtered by org)
- ❌ No `updated_at` / `updated_by_user_id` on critical entities (events, crew_assignments, crew_rekap)
- ❌ No Supabase realtime subscriptions di any module — semua server-render only
- ❌ No presence indicator (avatar stack, "X owner online")
- ❌ No "last edited by [Name] at [time]" attribution di event detail

**Impact**:
- Risk konkret: 2 owner buka /operations/new bersamaan → bisa double-book slot yang sama
- Risk konkret: Owner A modify crew assignment, Owner B masih lihat stale data, save → race condition overwrite
- Trust gap: "command center" promise belum delivered — same data ditampilkan 4× isolated

**Files affected** (representative):
- [src/app/(owner)/dashboard/page.tsx:51-192](src/app/(owner)/dashboard/page.tsx#L51) — entire data-fetch tanpa realtime subscription
- [src/app/(owner)/operations/page.tsx:65](src/app/(owner)/operations/page.tsx#L65) — events.select tanpa owner filter
- [src/app/(owner)/operations/[projectId]/page.tsx](src/app/(owner)/operations/[projectId]/page.tsx) — 983 LOC tanpa real-time hooks

**Fix path**:
1. Add `updated_at` + `updated_by_user_id` to events, crew_assignments, crew_rekap (migration)
2. Add Supabase realtime channel subscribe di client wrapper untuk Operations list + detail
3. Display "Disinkronisasi X detik lalu" + presence avatars di topbar
4. Optimistic conflict warning saat detect concurrent edit

**Effort**: Heavy (L, 1-2 weeks)

---

### 2.2 [CRITICAL] Border Radius Chaos

**Pattern**: 4 different radius values mixed across components/pages without semantic logic.

**Measured distribution** (grep across `src/components/`, `src/app/`):
```
 403  rounded-md   (6px — DESIGN.md in-app default — correct)
 174  rounded-xl   (12px — NOT in DESIGN.md as standard)
 106  rounded-lg   (8px — DESIGN.md card spec — correct)
  77  rounded-full (pill — for badges/status — correct)
  14  rounded-2xl  (16px — DESIGN.md spec only for hero card w/ image cap)
```

**Root cause**: [src/components/ui/card.tsx:15](src/components/ui/card.tsx#L15) — `Card` primitive itself uses `rounded-xl` + `ring-1 ring-foreground/10`, not `rounded-md` + hairline border per DESIGN.md spec. Card primitive divergence cascades into 174× `rounded-xl` callers.

**Confirmed instances (from agent reports)**:
- Dashboard event card line 408: `rounded-2xl`
- Dashboard quick-actions container line 464: `rounded-2xl`
- StatCard line 54: `rounded-lg` (border + bg-card) — closer to spec
- EmptyState line 27: `rounded-xl` (border-dashed border-border-default bg-surface-2)

**Impact**: Visual fragmentation — page feels like multiple design eras stitched together; undermines "two-scale discipline" yang jadi core dari Vercel restraint.

**Fix path**:
1. Update `Card` primitive ke `rounded-lg` (8px) + `border border-border-default` (replace ring approach)
2. Audit all `rounded-xl` callers (174 occurrences) — migrate to `rounded-lg` for cards, `rounded-md` for sub-elements
3. Keep `rounded-2xl` only for marketing/hero (currently misused in Dashboard line 408, 464)
4. Add Biome lint rule untuk catch `rounded-2xl` di operational chrome

**Effort**: Medium (M, 1-2 days untuk audit + migration)

---

### 2.3 [MAJOR] Decorative Color Violations

**Pattern**: 5 files hardcode colors di luar semantic palette (success/warning/danger/info) yang violate DESIGN.md "single ink CTA + semantic-only tones" rule.

**Violations** (grep `\(text\|bg\|border\)-\(violet\|teal\|indigo\|fuchsia\|cyan\|lime\|orange\|pink\|purple\)-`):
1. [src/app/(owner)/design/page.tsx:35-53](src/app/(owner)/design/page.tsx#L35) — 4 asset type badges use violet/amber/sky/emerald as **categorization** color (decorative, not semantic state). Violates DESIGN.md §867 "no second brand color".
2. [src/components/event-assets/asset-section.tsx:42-62](src/components/event-assets/asset-section.tsx#L42) — same 4-color tone palette duplicated
3. [src/components/booking/assign-crew-form.tsx](src/components/booking/assign-crew-form.tsx) — non-semantic color usage
4. [src/components/contacts/contacts-list-table.tsx](src/components/contacts/contacts-list-table.tsx) — non-semantic
5. [src/components/operations/operations-list-table.tsx](src/components/operations/operations-list-table.tsx) — non-semantic

**Plus 2 indirect violations**:
- [src/components/event-design/design-card.tsx:120-127](src/components/event-design/design-card.tsx#L120) — approve button hardcoded `bg-emerald-600 hover:bg-emerald-700` bypassing `button-primary` + `decisive-success` variant from button.tsx
- [src/components/pdf/document-base.tsx:15-27](src/components/pdf/document-base.tsx#L15) — `PDF_COLORS.primary = "#be123c"` (legacy rose brand, not ink) — Billing PDFs visually disconnected dari web app

**Stale comment**:
- [src/app/(owner)/dashboard/page.tsx:244](src/app/(owner)/dashboard/page.tsx#L244) — comment says "crimson accent on name" tapi actual code uses `text-primary` (ink). Stale comment from pre-Vercel migration.

**Fix path**:
1. Replace decorative violet/amber/sky badges in Design Hub dengan ink + surface hierarchy (icon tinted by surface, not color)
2. Replace emerald approve button dengan `<Button variant="decisive-success">` from primitive
3. Decide: PDFs ikut ink monochrome atau retain rose (add carve-out comment kalau retain)
4. Update stale Dashboard comment line 244

**Effort**: Small (S, 2-4h total)

---

### 2.4 [MAJOR] Three Parallel Settlement Routes

**Pattern**: 3 route untuk operasi serupa, ambiguous ownership:
- [src/app/(owner)/operations/[projectId]/rekap/page.tsx](src/app/(owner)/operations/[projectId]/rekap/page.tsx) — **PRIMARY** (unified rekap + settlement post-Prompt 3)
- [src/app/(owner)/operations/[projectId]/settle/page.tsx](src/app/(owner)/operations/[projectId]/settle/page.tsx) — LEGACY (308 LOC)
- [src/app/(owner)/operations/[projectId]/tutup-buku/page.tsx](src/app/(owner)/operations/[projectId]/tutup-buku/page.tsx) — LEGACY mega-form (218 LOC)

**Impact**:
- Owner UX: tidak tahu klik yang mana
- Code maintenance: same business logic (settle calculation, journal post) di 2 server action files (`settlements.ts` legacy v4 + `settle-event.ts` unified)
- Bug surface: legacy `settlements.ts` masih punya HPP `bonus` key dropped bug (HANDOVER §8.4)

**Fix path**:
1. Add `redirect("/operations/[projectId]/rekap")` di [/settle/page.tsx](src/app/(owner)/operations/[projectId]/settle/page.tsx) + [/tutup-buku/page.tsx](src/app/(owner)/operations/[projectId]/tutup-buku/page.tsx)
2. Remove dependency on legacy `settlements.ts` server action (deprecate)
3. After 2 weeks observation (no broken links), delete legacy route files
4. Document decision in HANDOVER

**Effort**: Small (S, 1-2h untuk redirect; 1 day untuk full deprecation w/ smoke test)

---

### 2.5 [MAJOR] Mega-Files Need Modularization

**Pattern**: 3 files exceed reasonable LOC budget untuk single responsibility:

| File | LOC | Issue |
|------|-----|-------|
| [src/app/(owner)/operations/[projectId]/page.tsx](src/app/(owner)/operations/[projectId]/page.tsx) | 983 | Event detail cockpit; 6+ sections inline (Readiness, Financial, Crew, Addon, Bonus, Notes) |
| [src/app/(owner)/reports/page.tsx](src/app/(owner)/reports/page.tsx) | 1180 | 3 tabs (PnL, Crew, Owner) + KpiCard defined locally (duplicate of `src/components/operations/kpi-card.tsx`) |
| [src/app/(owner)/finance/page.tsx](src/app/(owner)/finance/page.tsx) | 791 | KPI grid + breakdown + bank + sinking + owner pool + settlements list — overlap 65% w/ Reports |
| [src/components/rekap/rekap-form.tsx](src/components/rekap/rekap-form.tsx) | 442+ | Mobile rekap form (post-Prompt 4); useActionState + 6 collapsible sections + draft hook + image compression wiring |

**Fix path**:
1. Split Operations detail page into sub-components:
   - `<EventReadinessSection>` (existing extracted ✓)
   - `<EventFinancialCard>` (lines 616-681)
   - `<EventCrewCard>` (lines 684-755)
   - `<EventAddonCard>` (lines 757-789)
   - `<EventBonusCard>` (lines 792-831)
   - `<EventNotesCard>` (lines 834-844)
   - Result: detail page becomes ~200 LOC layout wrapper
2. Split Reports page per-tab to `src/app/(owner)/reports/components/{pnl,crew,owner}-section.tsx`
3. Consolidate KpiCard — remove local `function KpiCard()` definition from reports page (lines 1133-1172), import dari `src/components/operations/kpi-card.tsx`
4. **Consider Reports + Finance merge** (see §2.7)

**Effort**: Medium (M, 2-3 days)

---

### 2.6 [MAJOR] N+1 RPC Query Patterns

**Pattern**: 3 confirmed N+1 query patterns + 1 suspect:

#### 2.6.1 Rekap stock fetch (per-item RPC)
[src/lib/actions/rekap.ts:280-288](src/lib/actions/rekap.ts#L280):
```ts
const stockPairs = await Promise.all(
  (items ?? []).map(async (it) => {
    const { data: stock } = await supabase.rpc("get_current_stock", {
      p_item_id: it.id,
    });
    return [it.id, Number(stock ?? 0)];
  }),
);
```
**Impact**: 50 inventory items = 50 parallel RPC. `getRekapContext` slow di owner UI dengan large item master.

**Fix**: Create `get_current_stock_batch(item_ids[]) → JSONB {id, stock}[]` RPC, refactor caller.

#### 2.6.2 Sinking fund balance fetch
[src/app/(owner)/finance/page.tsx:228-235](src/app/(owner)/finance/page.tsx#L228):
```ts
const fundBalances = await Promise.all(
  funds.map(async (f) => {
    const { data } = await supabase.rpc("get_sinking_fund_balance", { p_fund_id: f.id });
    return { id: f.id, balance: (data as number | null) ?? 0 };
  }),
);
```
**Impact**: 3-5 funds saat ini OK (~150-250ms), tapi tidak scale. Same pattern duplicated di [src/app/(owner)/settings/sinking-funds/page.tsx:66-72](src/app/(owner)/settings/sinking-funds/page.tsx#L66).

**Fix**: SQL view `sinking_fund_balances_v` dengan SUM aggregate, OR batch RPC.

#### 2.6.3 Dashboard double getCurrentUser
- [src/app/(owner)/dashboard/page.tsx:52](src/app/(owner)/dashboard/page.tsx#L52) — first `getCurrentUser()`
- [src/components/dashboard/anomaly-radar.tsx:67](src/components/dashboard/anomaly-radar.tsx#L67) — second `getCurrentUser()` inside widget

**Impact**: 2× auth round-trip per dashboard page load (~150-250ms overhead di slow connection).

**Fix**: Pass `user.id` sebagai prop from page.tsx ke AnomalyRadarWidget, remove internal getCurrentUser call.

#### 2.6.4 Operations detail sequential inner queries
[src/app/(owner)/operations/[projectId]/page.tsx:182-195](src/app/(owner)/operations/[projectId]/page.tsx#L182) — 2 inner queries (equipment count + rekap status) wrapped in Promise.all but happens AFTER initial 4-query Promise.all, sequencing problem.

**Fix**: Include both lookups in initial event select using nested Supabase syntax `crew_rekap(id, is_approved).count()`.

**Total perf budget recovered** (estimate, before perf agent runs):
- Dashboard: ~200ms (double getCurrentUser fix)
- Rekap form: ~500-1000ms (batch stock RPC, depends on item count)
- Operations detail: ~150-300ms (merge inner queries)
- Finance: ~100ms (batch sinking RPC)

**Effort**: Medium (M, 1-2 days untuk all 4)

---

### 2.7 [MAJOR] Reports vs Finance 65% Feature Overlap

**Pattern**: Same data fetched + calculated in 2 places.

**Evidence**:
| Aspect | /reports | /finance | Notes |
|--------|---------|---------|-------|
| Query event_settlements per month | ✓ | ✓ | Both load same data |
| Query payments per month | ✓ | ✓ | Both load same data |
| Calculate revenue MTD | ✓ | ✓ | Same formula, different code |
| Calculate net profit margin | ✓ | ✓ | Duplicate logic, divergence risk |
| KpiCard component | local def lines 1133-1172 | imports from operations/kpi-card.tsx | Code duplication + style divergence |
| Settlement breakdown | 5-column | 5-column | Same UX, separate impl |
| Owner pool / earnings | ✓ (Owner tab) | ✓ (super_admin section) | Same data, 2 views |

**Recommendation**: Merge — keep `/finance` as primary, make `/reports` a tab inside `/finance` (or vice versa). See REFINEMENT_ROADMAP.md §3.3 untuk detailed migration plan.

**Effort**: Medium-Heavy (M-L, 3-5 days)

---

### 2.8 [MAJOR] Settings IA Chaos

**Pattern**: 12 flat tabs without grouping, 33 unsearchable config keys, inconsistent CRUD patterns.

**Current IA** (flat 12-tab):
```
System | Packages | Add-ons | Backdrops | Items | Banks | Crew | Contacts | Sinking Funds | WA Templates | Notif Rules | Audit Log
```

**Issues**:
1. **System tab**: 33 config keys across 6 categories (operations, financial, settlement, equipment, communications, security) NO SEARCH
2. **Bank Accounts**: READ-ONLY table, no create/edit UI (P0 gap)
3. **Contacts**: import-only, no individual create button (P0 gap)
4. **Frame Size Mapping**: tabel seeded di production tapi UI form incomplete di [items/mapping/page.tsx](src/app/(owner)/settings/items/mapping/page.tsx) (P0 gap, blocks auto-HPP for new frame sizes)
5. **Notification Rules**: read-only toggle only, no edit form (P1 gap)
6. **Backdrop badge colors**: custom tones (sky-500, amber-500) violate DESIGN.md (see §2.3)
7. **CRUD pattern inconsistency**:
   - Packages, Add-ons, Backdrops, Items, Sinking Funds, WA Templates → `/new` page + `/[id]/edit` page
   - Crew → drawer modal (inline)
   - Bank Accounts, Contacts, Notification Rules → no create UI at all
   - Delete: archive button (packages) vs toggle (backdrops) vs soft-delete (crew)

**Proposed IA restructure (5 grouped domains)**:
```
Settings
├─ Products & Services
│  ├─ Packages
│  ├─ Add-ons
│  ├─ Backdrops
│  ├─ Items (+ Frame Size Mapping + Rekap Mapping + Import)
├─ People
│  ├─ Crew (Users + Invitations + Investor Share — collapse last 2)
│  └─ Contacts
├─ Finance
│  ├─ Bank Accounts (+ create/edit UI)
│  └─ Sinking Funds
├─ Communications
│  ├─ WhatsApp Templates
│  └─ Notification Rules (+ edit form)
└─ System
   ├─ Configuration (33 keys + search)
   └─ Audit Log
```

**Cognitive load reduction**: 12 mental buckets → 5. First-time setup flows obvious (Products → People → Finance → Comms → System).

**Effort**: Medium-Heavy (M-L, 1 week untuk routing restructure + IA + search infrastructure)

---

### 2.9 [MODERATE] Component Duplication & Shared Utility Drift

**Pattern**: Same logic in multiple places without DRY consolidation.

**Confirmed duplicates**:
1. **KpiCard**: shared at `src/components/operations/kpi-card.tsx` (font-size 26px, accent variants); local re-definition at `src/app/(owner)/reports/page.tsx:1133-1172` (font-size 22px, different variants)
2. **Time helpers**: `timeAgo()` in `notifications/page.tsx` + `relativeTime()` in `reminders/page.tsx` — both implement same relative time logic
3. **Date utilities**: `ID_MONTH_NAMES`, `lastDayOfMonth()`, `startOfMonth()` defined in 3 places: `finance/page.tsx`, `finance/vendors/page.tsx`, `reports/page.tsx`
4. **formatRupiah** at `src/lib/format.ts` returns plain string, caller must remember `.tabular` class — no enforcement
5. **Stock computation**: client-side compute via reduce di `warehouse/page.tsx:31-40` AND server-side via RPC `get_current_stock` — 2 sources of truth

**Fix path**: Extract shared utilities to `src/lib/date-utils.ts`, consolidate KpiCard usages, document `formatRupiah` `.tabular` requirement via JSDoc.

**Effort**: Small (S, 2-4h)

---

### 2.10 [MODERATE] Dead Code / Stale Patterns

**Pattern**: Code remnants from previous design iterations still loaded.

**Found**:
1. **Playfair Display font loaded but unused**: [src/app/layout.tsx:14-18](src/app/layout.tsx#L14) loads `Playfair_Display` Google Font, `--font-playfair` CSS variable set di html className, but globals.css line 13 overrides `--font-heading: var(--font-inter)`. Playfair never renders. Wastes Google Fonts CDN cold-start request.
2. **Legacy gradient utilities silently no-op'd**: globals.css lines 296-302 — `bg-gradient-sunrise`, `bg-gradient-aurora`, `text-gradient-sunrise`, etc. — present so legacy callers don't crash. Still referenced in [src/app/dev/primitives/showcase.tsx:109-125](src/app/dev/primitives/showcase.tsx#L109) (dev-only, OK).
3. **Legacy iris/crimson tokens** still defined globals.css lines 32-53 (collapse to ink). Codebase grep returns 0 callers — safe to remove next pass.
4. **`hero-kpi-card.tsx`** still in components/dashboard/ but `StatCard` (cleaner) is preferred. Hero variant likely deprecated, kept for backward compat.

**Fix path**: Remove Playfair import (saves ~50KB Google Fonts request); audit & delete `hero-kpi-card.tsx` after confirming no remaining caller.

**Effort**: Small (S, 30min)

---

### 2.11 [MODERATE] Accessibility Coverage Gaps

**Pattern**: Solid baseline (semantic HTML, lucide icons aria-hidden, button focus states) tapi minor gaps yang block WCAG 2.1 AA.

**Found**:
1. **Heading hierarchy skip** — Dashboard [page.tsx:254-287](src/app/(owner)/dashboard/page.tsx#L254) jumps from h1 ke `<p>` eyebrow ke `<dl>` without h2. Repeats di Operations detail, Finance, Reports sections.
2. **Missing aria-current="page"** on active OperationsViewSwitcher tabs
3. **Focus rings inconsistent** — Reports MonthSwitcher buttons lack visible `focus-visible:ring`
4. **iOS auto-zoom on form input** — DESIGN.md mentions 16px minimum to avoid zoom, tapi crew rekap form inputs use `text-sm` (14px). Will trigger iOS zoom on focus.
5. **Hidden inputs missing aria-label** — [withdrawal-button.tsx:112-116](src/components/finance/withdrawal-button.tsx#L112) hidden inputs no aria
6. **Drag/drop / dropzone keyboard** — file-drop.tsx not audited for keyboard accessibility
7. **Color-only signaling** — some status badges rely solely on color (no icon prefix) — fails color-blind users

**Fix path**: Add `<h2 className="sr-only">` to all major sections; ensure 16px input minimum; add focus-visible utilities to all interactive elements; audit color contrast for amber-700 on white (likely fine).

**Effort**: Small-Medium (S-M, 4-8h)

---

### 2.12 [MINOR] Mobile Responsiveness Gaps on Owner Portal

**Pattern**: Crew portal mobile-first (max-w-md, safe-area, fluid type) — excellent. Owner portal desktop-first with fragile mobile fallbacks.

**Issues**:
1. **Settings Crew table breaks <768px** — columns wrap awkwardly, no responsive card layout
2. **Operations Team Gantt** — 14-column timeline unusable on phone (<400px); horizontal scroll nightmare
3. **Operations list filter bar** — wraps awkwardly on small screens; touch targets cramped
4. **Operations detail card sequence** — collapsible cards not all `defaultOpen={true}`; user must click 6+ times to see core info on mobile

**Fix path**: Implement responsive table pattern (existing `ResponsiveTable` component) consistently; add mobile-specific timeline view for Team page; review default collapsible state on detail page.

**Effort**: Medium (M, 2-3 days)

---

## 3. Per-Module Findings (consolidated)

### 3.1 Module: Dashboard (`/dashboard`)

**Overall**: 8.3/10 — well-engineered, strong adherence to design discipline. **Polish target**.

**Critical Issues (P0)**:
- **Hover translate violates design system** — [page.tsx:408](src/app/(owner)/dashboard/page.tsx#L408): `hover:-translate-y-px` on event card violates DESIGN.md §851 "no translate on hover, color-only state cues". Inconsistent with rest of dashboard (StatCard, StatusGroupCard, PipelineCard use color-only hover).
- **Border radius inconsistency** — 4 different radius values across the page (rounded-2xl/xl/lg/full). See §2.2.

**Major Issues (P1)**:
- **No multi-owner real-time awareness** — see §2.1
- **Heading hierarchy skip** — h1 → p eyebrow → dl tanpa h2, breaks screen reader outline. WCAG 2.4.1 failure.
- **AnomalyRadarWidget double getCurrentUser** — see §2.6.3
- **Event card date badge `rounded-xl`** — line 414, undefined in Tailwind base, may fall back

**Minor Issues (P2)**:
- Stale "crimson accent" comment line 244
- Loading skeleton missing target + anomaly sections (causes CLS)
- StatCard ambiguous interactivity (hover bg-secondary/40 tapi tidak href'd)
- Target progress bar `rounded-full` (should be linear, `rounded-sm` per DESIGN.md)
- Container max-width unverified — 4K monitor risk
- ID_TIME utility renders "—" untuk null (should be "Belum ditentukan")
- Eyebrow font tracking [0.18em] doesn't match `.eyebrow` utility class spec

**Strengths**:
- 15-query Promise.all parallelization (no N+1)
- Strong typography hierarchy w/ fluid clamp() scaling
- Semantic color usage (negative outstanding = rose tier)
- Empty states with instructive copy
- Tabular figures throughout

**Quick wins** (4 items, <1h each): remove translate, fix crimson comment, add eyebrow class util, add sr-only h2 headings.

---

### 3.2 Module: Operations (`/operations`)

**Overall**: 6.9/10 — **highest business impact, lowest readiness**. Top priority.

**Critical Issues (P0)**:
- **Multi-owner awareness ZERO** — see §2.1, but specifically impactful here since Operations = "command center for 4 owner monitor bareng"
- **Detail page 983 LOC monolith** — see §2.5
- **3 settlement routes paralel** — see §2.4

**Major Issues (P1)**:
- **Crew briefing context buried** — ProjectHeroRecap (lines 379-420) tidak surface crew assignments count + roles, backdrop, frame size, design status. Owner must scroll deep to brief crew.
- **Detail page sequential queries** — see §2.6.4
- **List table props explosion** — pre-computed `crewByEventEntries: Array<[string, CrewChip[]]>` passed sebagai prop; component should encapsulate aggregation
- **Edit/Status menu/PDF download buttons scattered** — 4 buttons in header wrap awkwardly on mobile (lines 296-346)
- **Collapsible card defaults inconsistent** — only Kesiapan Event default open; Crew, Financial closed by default (user clicks 6+ times)
- **Search substring-only** — `.ilike("client_name", "%${q}%")` doesn't search venue, package, backdrop
- **No bulk actions** — can't multi-select events for batch status update

**Minor Issues (P2)**:
- "Awaiting Settlement" vs "Settlement belum bisa dibuka" terminology drift
- Archived count not shown as KPI tile
- Calendar week view missing
- Board view drag-drop UI rendered but not wired
- Crew tier not used in fee calc logic
- Edit page no settlement-gate guard

**Strengths**:
- 8-query Promise.all on list (excellent)
- Crew aggregation O(N) not N+1 on list view
- View transition anchors
- Conflict detection in crew assignment page
- Clear filter bar (status + month + crew + search)
- Activity feed audit trail

**Quick wins**: standardize default collapsible open states; expand search to multi-column; deprecate /settle + /tutup-buku (redirect to /rekap).

---

### 3.3 Module: Design Hub (`/design`)

**Overall**: 7.0/10 — functional foundation, needs visual richness + workflow consolidation.

**Critical Issues (P0)**:
- **Color palette violation** — see §2.3. 4-color badge categorization (violet/amber/sky/emerald) violates "no second brand color" rule
- **Emerald approve button bypasses primitive** — [design-card.tsx:120-127](src/components/event-design/design-card.tsx#L120)
- **No URL preview validation** — paste Drive URL, no link health check (dead URLs accepted)

**Major Issues (P1)**:
- **No image thumbnails / gallery** — "visual asset hub" without visual previews
- **Empty states lack actionability** — "Klik Tambah untuk mulai" no inline button CTA, italic ephemeral tone
- **Duplicate workflow vs Operations** — `/operations/[projectId]/page.tsx` punya DesignCard inline (brief approval), `/design/[projectId]` punya asset list — owner toggles between
- **No drag-drop file upload** — URL paste only, no file upload zone

**Minor Issues (P2)**:
- StatCard typography hardcoded inline (should use `.eyebrow` util)
- Asset uploader attribution inconsistent
- Table header eyebrow format varies
- Asset section mutation lacks loading spinner
- Missing revalidatePath after delete
- Some asset actions lack server-side permission re-check

**Strengths**:
- Clean component composition (AssetSection reusable)
- Single icon-color per type (intent good, just wrong palette)
- Indonesian microcopy consistent
- Mobile-responsive table with badge counts

**Quick wins** (1-2h): replace badge palette with ink + muted hierarchy; use button primitive for approve; fix revalidatePath.

---

### 3.4 Module: Billing (`/billing`)

**Overall**: 7.5/10 — solid PDF generation + payment tracking; UX discovery friction.

**Critical Issues (P0)**:
- **No quick PDF action on billing list** — must navigate to event detail per item

**Major Issues (P1)**:
- **PDF brand color disconnect** — PDF_COLORS.primary = `#be123c` (rose) vs web ink #171717. See §2.3.
- **"unpaid" badge uses `outline` variant** — visually dismissed, but fresh invoice is most urgent action. Should be `warning` (amber).
- **Naming "Invoice/Tagihan/Quotation/Penawaran/BAST"** mixed across UI — no central constants file
- **Payment flow split** — `/billing` shows KPIs but cannot log payment; must go to `/operations/[projectId]/payments`

**Minor Issues (P2)**:
- `formatRupiahForPdf()` no comment explaining Helvetica fallback (no tnum)
- ProofUploadButton hint unclear ("Auto-rename: PRJ-id · Tipe · Klien · Tanggal" — what's user action?)
- KPI card value truncation on small screens
- PDF "Tanggal Terbit" uses today's date, not stored issue date (historical invoices misleading)
- DownloadMenu lacks arrow key navigation
- Quotation 30% DP hardcoded (no setting override)

**Strengths**:
- Clean shared data fetcher `src/lib/pdf/event-data.ts` (DRY across 3 PDF routes)
- ResponsiveTable + tabular figures throughout
- Strong WhatsApp integration
- Status badge centralization (PAYMENT_STATUS_LABELS)
- Comprehensive PDF_STYLES base

**Quick wins** (1-2h): centralize billing terms; change unpaid badge variant; clarify hint text; add PdfDownloadMenu to list table.

---

### 3.5 Module: Warehouse (`/warehouse`)

**Overall**: 6.5/10 — 65% complete. Stock opname works ✓, purchase intake hidden.

**Critical Issues (P0)**:
- **Purchase intake unstructured** — no PO module, no supplier master, no PO/GR matching. Purchase = dropdown option in generic adjust dialog
- **Negative stock allowed silently** — manual adjust doesn't validate sufficiency (only settlement does); UI shows red "habis" untuk ≤0 tapi tidak distinguishable "negative" badge
- **Weighted-avg cost can drift** — [stock-movements.ts:97](src/lib/actions/stock-movements.ts#L97) requires `unit_cost !== null` for recalc; field optional in UI — user omits → avg stale

**Major Issues (P1)**:
- **N+1 stock RPC in rekap context** — see §2.6.1
- **Equipment stock not tracked** — equipment shown with location + condition tapi no quantity, no stock_movements
- **Reorder automation missing** — min_stock_alert schema exists, KPI shows "Stok Kritis: X" tapi no actions
- **Settlement consumption invisible** — `source='rekap_consumption'` not labeled in movements log (falls back to raw string)

**Minor Issues (P2)**:
- Stock-take edit form cramped on mobile (<640px)
- Dialog max-w-md not responsive
- Badge tone hardcoded (not centralized)
- Missing ARIA labels
- No reorder suggestion UI
- No data export (CSV/print)

**Strengths**:
- Stock opname (physical count) workflow solid end-to-end
- commit_stock_take RPC correct (variance → movements per row)
- Weighted-avg formula correct (when unit_cost provided)
- Stock movement audit trail complete
- Reject-after-approval reversal works

**Quick wins** (4-6h): add SOURCE_LABELS['rekap_consumption']; force unit_cost on purchase direction; add negative stock badge; centralize badge tone tokens.

---

### 3.6 Module: Finance (`/finance`)

**Overall**: 7.3/10 — strong backend, 4 critical UX gaps.

**Critical Issues (P0)**:
- **No OpEx input UI** — owner can't record sewa kantor, internet, asuransi (non-event expenses)
- **No journal entry browser** — `journal_entries` + `journal_lines` tables populated tapi UI tidak baca; GL blackbox
- **No chart of accounts management UI** — 68 accounts seeded, read-only; no add/edit/deactivate
- **No bank reconciliation** — cannot match bank statements to GL; cash position unverified

**Major Issues (P1)**:
- **N+1 sinking fund RPC** — see §2.6.2
- **Owner pool withdrawal flow terse** — no history visible in same view, no success toast confirmed
- **Sinking fund UI split across 3 views** — list (settings) + movements (settings/[id]) + balance (finance dashboard); cognitive load high
- **Vendor page missing sort/filter** — hardcoded all-time, sort by commission only

**Minor Issues (P2)**:
- Settlement table hard limit 10 rows (no "view all" link)
- Outstanding balance thresholds magic numbers
- Hidden input no aria-label
- Period label duplicated logic across 3 files
- formatRupiah no tabular enforcement

**Strengths**:
- Revenue MTD + LM delta correct
- Settlement P&L accurate
- 11-query Promise.all parallel
- Strong DB foundation (68 CoA, GL, sinking, owner)
- Mobile responsive grid

**Quick wins** (4-8h): add period filter to vendors; remove .limit(10); extract date utils; add aria-labels to hidden inputs.

---

### 3.7 Module: Reminders (`/reminders`)

**Overall**: 8.5/10 — strongest module. Solid bucketing + wa.me batch workflow.

**Critical Issues (P0)**: None.

**Major Issues (P1)**:
- **Delivery unverified** (wa.me limitation — intent logged, not actual send). Risky for financial reminders.
- **Template body mobile overflow** — preview modal no responsive height limit
- **Batch send without confirmation** for >5 items

**Minor Issues (P2)**:
- "Outstanding balance" label ambiguous (English in Indonesian UI)
- No re-send cooldown (spam risk)
- Template dropdown doesn't show last-used badge
- No "select by payment status" quick filter

**Strengths**:
- Clean 4-bucket business logic (h3_pelunasan, h7_dp, h1_konfirmasi, overdue)
- Transparent intent logging via event_reminders_log
- Batch workflow with 800ms wa.me delays (prevents popup throttle)
- Optimistic UI marks sent rows
- Recipient label "→ phone" prevents wrong-number sends
- DESIGN.md compliance excellent (95%+)

**Quick wins** (2-4h): rename "Outstanding" → "Sisa Pembayaran"; add batch confirmation dialog for >5; add responsive height to template preview.

---

### 3.8 Module: Notifications (`/notifications`)

**Overall**: 7.3/10 — functional inbox + push, DB design flaw + cache lag.

**Critical Issues (P0)**: None.

**Major Issues (P1)**:
- **Expired notifications not filtered** — `expires_at` column exists tapi query tidak `WHERE expires_at IS NULL OR expires_at > NOW()`. DB bloat over time.
- **Mark-read cache lag** — clicking mark-read tidak immediate refresh Unread tab; revalidatePath may have stale cache issue
- **Similar notifications not batched** — 10 identical "Low inventory" alerts = 10 separate rows; should group by anomaly_rule_id + hour bucket
- **NotificationBell badge SSR-only** — slow update when rapid notifs arrive; no realtime subscription

**Minor Issues (P2)**:
- No service worker error handling (silent fail if /sw.js missing)
- Push test error messages generic (VAPID issues hard to debug)
- Read/dismiss semantics unclear (no docs)
- Severity badges hard to scan when many notifications
- Action_url "Open" link doesn't show destination
- Read/unread distinction subtle (thin ring)
- Resolved state not visually primary

**Strengths**:
- Excellent severity color coding (alert/warning/info/success)
- Filter by severity + category
- Manual scanner trigger (useful for testing)
- Separate notification-rules + push-subscription settings
- Strong RLS + Zod validation

**Quick wins** (2-4h): add expires_at filter; verify revalidatePath behavior; centralize timeAgo utility (kill relativeTime duplicate).

---

### 3.9 Module: Reports (`/reports`)

**Overall**: 6.7/10 — operational reports work, but missing financial statement maturity.

**Critical Issues (P0)**:
- **Missing financial statements** — no Balance Sheet, no Cash Flow Statement, no proper Income Statement (current P&L is settlement aggregate, not GAAP)
- **65% feature overlap with Finance** — see §2.7
- **No GL integration** — journal_entries populated tapi 0 references in /reports source. Cannot generate accrual-basis reports

**Major Issues (P1)**:
- **1180 LOC monolith** — see §2.5
- **No period comparison** — Finance has prev-month delta, Reports doesn't (inconsistency)
- **No export capability** — no PDF/Excel/CSV anywhere
- **KpiCard defined locally** — duplicate of `src/components/operations/kpi-card.tsx` with diverged styling (font-size 22px vs 26px)
- **Month switcher missing focus ring**

**Minor Issues (P2)**:
- Loading skeleton minimal
- P&L section header lacks event count
- Settled events list no pagination
- Owner section column labels ambiguous (MTD vs lifetime)
- No empty state for zero-revenue month
- Crew tier badge not sortable
- Channel breakdown shows count only (no revenue per channel)

**Strengths**:
- Data integrity (math correct across 3 sections)
- 9-query Promise.all parallel
- Loss event detection (color tier)
- Owner statement super_admin gate
- Crew submission rate color tiers (smart UX)
- Excellent DESIGN.md compliance (95%+)

**Quick wins** (1-2h each): consolidate KpiCard to shared; add focus ring to month nav; extract sections to component files; add prev-month delta.

---

### 3.10 Module: Settings (`/settings`)

**Overall**: 5.9/10 — **worst UX in product**. Solid CRUD per entity, chaotic IA.

**Critical Issues (P0)**:
- **System config unsearchable** — 33 keys across 6 categories flat, no search
- **Bank Accounts read-only** — no create/edit UI (broken management)
- **Contacts no create button** — import-only
- **Frame Size Mapping form incomplete** — backend seeded, UI stats only, no mapping grid
- **No pre-apply warning for critical config** — changing `settlement.require_approved_rekap` mid-event can break in-progress settlements

**Major Issues (P1)**:
- **Crew page overloaded** — 3 stacked tables (invitations + users + investor share) + drawer
- **Notification Rules read-only** — toggle only, no edit form
- **Backdrop badge custom tones** — see §2.3
- **Items mapping sub-feature scattered** — list + mapping + import + edit across 4 routes, no breadcrumb
- **System config sticky footer unclear** — "X key tersimpan" doesn't show which keys changed, no diff, no undo

**Minor Issues (P2)**:
- Add-ons "Extra Crew" column ambiguous
- Contacts search not live (GET form re-submit)
- Filter chips lack counts
- Sinking funds balance client-side compute
- Audit log JSON not expandable
- WA template variables not listed (count only)

**Strengths**:
- Vercel design system well-applied (95%+)
- Tabular numerals throughout
- Semantic badges correct
- Per-category description text helpful
- Audit log pagination working
- Filter + search pattern (contacts, items) good

**Strategic recommendation**: **Restructure to 5-domain IA** (Products & Services / People / Finance / Communications / System). Add global settings search. Add first-time setup wizard.

**Quick wins** (1-2h each): add system_config search; rename "Extra Crew" column; add count badges to filter chips; warn before critical config apply.

---

### 3.11 Module: Crew Web + Mobile (`/crew/*`, `/settings/crew`, `/operations/[projectId]/crew`, `/operations/team`)

**Overall**: 8.1/10 aggregate. Mobile crew portal 8.5 (excellent, post-Prompt 4 polish). Owner crew mgmt 7.5 (functional, mobile fragile).

#### Mobile Crew Portal (8.5/10)

**Strengths** (preserve):
- `max-w-md` container caps, safe-area aware footer, touch targets ≥44px
- Fluid type scaling (iPhone SE → Pixel 7 → Galaxy A all work)
- Image compression on-device (10-20× reduction)
- localStorage draft auto-save (7-day TTL, beforeunload warning)
- Dedicated success page (Prompt 4)
- NeedsRekapSection surfacing on /crew + /crew/jadwal

**Major Issues (P1)**:
- **Rekap form length** — 15+ fields, perceived lag on cellular
- **File upload no progress** — Drive upload feedback silent for 30+ sec on slow connection
- **Real-time data stale** — after submit rekap, /crew still shows "Perlu submit" until manual refresh

**Minor Issues (P2)**:
- Custom materials lack visual SKU reference
- Draft restore banner color too subtle (blue info, not emerald success)
- Equipment damage reporting absent
- Fee outstanding card lacks urgency tier
- Empty states could include count hints

#### Owner Crew Management (7.5/10)

**Major Issues (P1)**:
- **Settings crew table breaks <768px** — no responsive card layout
- **Team Gantt unusable on mobile** — 14-column nightmare
- **Conflict tooltips missing** — red crew in dropdown without "why" explanation
- **Fee calculation opaque** — no breakdown ("Tier: Senior · Base + 10%")
- **Role change requires delete+re-add** — no inline edit

**Minor Issues (P2)**:
- Tier not editable in EditCrewDrawer
- Invitation expiry not shown
- Bulk import success/failure count missing
- No fee history audit trail
- No bulk crew assignment preset

**Strengths**:
- 280-LOC well-structured settings/crew page
- AssignCrewForm includes conflict detection (logic, just UI cue weak)
- Real-time event context shown on assignment page
- WhatsApp click-to-contact integration
- EditCrewDrawer pattern works

**Quick wins** (4-8h): add file upload progress; fix team Gantt mobile (vertical timeline); add conflict tooltips; show fee breakdown.

---

## 4. Top 10 Critical Issues (P0)

Ranked by impact × frequency × business risk:

| # | Issue | Module(s) | Effort | Impact |
|---|-------|-----------|--------|--------|
| 1 | Multi-owner real-time awareness ZERO across system | All operational modules | L (1-2 wk) | **Critical** — promised "command center" undelivered, race condition risk |
| 2 | Settings unsearchable + IA chaos (12 flat tabs, 33 config keys) | Settings | M-L (1 wk) | **Critical** — owner-stated "paling overwhelming" |
| 3 | 3 parallel settlement routes (rekap / settle / tutup-buku) | Operations | S (1d) | **Critical** — settlement is highest-stakes operation |
| 4 | Operations detail 983 LOC + briefing context buried | Operations | M (2-3d) | **Critical** — daily briefing workflow blocked |
| 5 | Finance 4 missing P0 features (OpEx input, journal browser, CoA mgmt, bank recon) | Finance | L (2-3 wk) | **Critical** — owner stated "belum mature" |
| 6 | Reports vs Finance 65% feature overlap | Reports + Finance | M (3-5d) | **Critical** — code maintenance debt + UX fragmentation |
| 7 | Warehouse purchase intake hidden as dropdown option | Warehouse | M-L (1 wk) | **Major** — owner stated "belanja belum jelas" |
| 8 | Border radius chaos (174× rounded-xl mis-used) + Card primitive non-conformant | All modules | M (1-2d) | **Major** — visual fragmentation undermines design discipline |
| 9 | Decorative color violations (5 files violet/amber/sky used as categorization) | Design Hub + others | S (2-4h) | **Major** — design system breach, "no second brand color" rule |
| 10 | N+1 RPC patterns (get_current_stock per-item, sinking_balance per-fund, double getCurrentUser) | Rekap, Finance, Dashboard | M (1-2d) | **Major** — perceived speed of slow pages |

---

## 5. Top 10 Quick Wins (S-effort, <1 day)

Ordered by impact:effort ratio:

| # | Quick Win | File:Line | Effort | Impact |
|---|-----------|-----------|--------|--------|
| 1 | Add `redirect()` from /settle + /tutup-buku → /rekap | operations/[id]/{settle,tutup-buku}/page.tsx | 30min | Resolves user navigation confusion |
| 2 | Remove Playfair Display font (unused) | src/app/layout.tsx:14-18 | 5min | Saves ~50KB Google Fonts cold-start |
| 3 | Add SOURCE_LABELS['rekap_consumption'] = 'Rekap Approval' | warehouse-tables.tsx:63 | 5min | Movements log readable |
| 4 | Add search input to system_config (filter 33 keys client-side) | system-config/config-form.tsx | 30min | Dramatically improves Settings discoverability |
| 5 | Remove `hover:-translate-y-px` from Dashboard event card | dashboard/page.tsx:408 | 5min | Fixes DESIGN.md violation; reduced-motion compliance |
| 6 | Replace decorative violet/amber badges in Design Hub w/ ink+icon | design/page.tsx:35-53, asset-section.tsx | 1h | Eliminates color palette violations |
| 7 | Consolidate KpiCard — remove local def in Reports, import shared | reports/page.tsx:1133-1172 | 15min | Eliminates duplicate code + style divergence |
| 8 | Add aria-current="page" to OperationsViewSwitcher active tab | operations view switcher component | 10min | A11y improvement |
| 9 | Add `expires_at` filter to notifications query | notifications/page.tsx | 15min | Prevents DB bloat |
| 10 | Fix "Outstanding balance" → "Sisa Pembayaran" in Reminders | reminders BatchClient component | 5min | Indonesian UX consistency |

**Total quick wins effort**: ~3-4h. Aggregate impact: visible improvement across 8 modules.

---

## 6. Module Priority Matrix

```
              HIGH USER PAIN
                    ↑
                    │
   Operations  ──── │ ────  Settings (IA)
   (3 settle routes,│        (12 flat tabs,
   detail bloat,    │        unsearchable)
   no multi-owner)  │
                    │
   Warehouse  ────  │  ──── Finance
   (purchase intake │       (4 missing P0:
   hidden)          │       OpEx, journal,
                    │       CoA, recon)
                    │
   Reports ───      │ ─── Crew Mobile
   (65% overlap     │     (P1 polish only)
    w/ Finance)     │
                    │
   Notifications ──│── Design Hub
   (DB bloat,       │   (color violations,
   cache lag)       │   workflow split)
                    │
   Billing ────     │ ─── Reminders
   (PDF brand,      │     (strongest module)
   payment split)   │
                    │
   Dashboard ───────│─── Crew Web
   (polish only)    │    (mobile fragile)
                    │
                    └──────────────────────────────→
                       LOW EFFORT        HIGH EFFORT
```

Priority recommendation for Phase 1 implementation (post-audit):
1. **P0-block (must-fix)**: Operations consolidation, Settings restructure, Finance gaps, multi-owner foundation
2. **P0-quick (high impact, low cost)**: All 10 quick wins above
3. **P1-major (refine existing)**: Warehouse PO, Reports merge, Crew mobile owner-side
4. **P2-polish (preserve momentum)**: Dashboard, Reminders, Notifications, Crew web minor

---

## 7. Strengths to Preserve

Beberapa pattern di codebase yang sudah BENAR dan jangan di-refactor:

1. **Atomic RPC settlement** — `settle_event` 16-step atomic flow, balanced double-entry, verified production
2. **Mobile crew portal post-Prompt 4** — image compression + draft auto-save + success page = solid foundation
3. **NeedsRekapSection** — server component surface on /crew home + /crew/jadwal, auto-hide when empty
4. **Server actions architecture** — 42 well-typed actions, Zod validation, error humanization
5. **DESIGN.md spec quality** — comprehensive, opinionated, lined up with implementation (gradient utilities silenced, iris/crimson collapsed)
6. **shadcn/ui primitives mostly correct** — Button variants, Badge semantics, StatusBadge centralization
7. **View Transitions wiring** — site-header, site-sidebar, site-bottom-nav anchored; morph/fade keyframes ready
8. **PWA scaffolding** — manifest, icons, service worker register, theme color
9. **RLS strict + auth flow** — owner/super_admin/crew/pending_approval roles enforced at DB + app
10. **Verification scripts** — `verify-rekap.ts`, `verify-comprehensive.ts`, `apply-migration.ts` enable rapid iteration

---

## 8. Conclusion

Tetra Ops sudah punya **backend foundation yang kuat** (atomic settlement RPC, double-entry GL, 68 CoA, 7+ RPC, RLS robust). Mobile crew portal sudah polished. Design system spec lengkap dan implementation di globals.css enforce dasar yang benar.

**Yang belum mature** adalah **UX surface layer**:
1. **Multi-owner promise belum delivered** (no realtime, no presence, no attribution)
2. **Settings IA membutuhkan restructure** (12 flat tabs → 5 grouped domains)
3. **Finance gaps blok maturity** (4 P0: OpEx input, journal, CoA, recon)
4. **Operations command-center promise belum sampai** (3 settlement routes, briefing context buried, 983 LOC monolith)
5. **Design system slippage** (radius chaos, color violations, component variance) yang cumulatively undermine perceived polish

**Strategic posture**: Bukan saatnya **build new features**. Saatnya **refine existing** dengan disiplin design system + IA restructure + multi-owner foundation.

**Recommended sequence** (detail di REFINEMENT_ROADMAP.md):
- **Week 1-2**: Foundation pass — design system enforcement (Card primitive, radius migration), 10 quick wins, deprecate legacy routes
- **Week 3-5**: Operations module refactor — split mega-files, multi-owner awareness, consolidate settlement routes
- **Week 6**: Settings restructure (5-domain IA + search)
- **Week 7-8**: Warehouse PO module + reorder workflow
- **Week 9-11**: Finance + Reports merge + missing 4 P0 features
- **Week 12**: Design Hub workflow consolidation
- **Week 13**: Reminders + Notifications polish
- **Week 14**: Crew owner-side mobile responsive fixes
- **Week 15**: Final QA + Dashboard polish

**Investment**: ~3 month focused engineer time for full roadmap. Quick wins alone (8-10h) deliver immediate visible improvement.

---

**End of AUDIT_UI_UX.md** — see companion docs:
- [AUDIT_PERFORMANCE.md](AUDIT_PERFORMANCE.md) — speed bottlenecks
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — design tokens + component library spec
- [REFINEMENT_ROADMAP.md](REFINEMENT_ROADMAP.md) — sequenced 15-week plan
- [AUDIT_SUMMARY.md](AUDIT_SUMMARY.md) — 2-3 page executive level
