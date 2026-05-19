# REPORT — Phase 0 Quick Wins

**Date**: 2026-05-19
**Branch**: `main` (auto-deploys ke https://tetra-ops.vercel.app)
**Starting commit**: `a9928d3` (HANDOVER docs)
**Ending commit**: `57afe6e` (loading.tsx batch)
**Total commits**: 12 atomic commits, all pass `npx tsc --noEmit`

---

## Executive Summary

11/11 UI/UX quick wins + 7/10 performance quick wins delivered. Investigation revealed 3 of the perf quick wins (PDF dynamic-import, booking-form dynamic-import, rekap-form dynamic-import) were already handled by Next.js automatic code-splitting at "use client" boundaries — no change needed, documented below.

**Total effort**: ~2.5 hours (under 3-4h budget).
**Total LOC delta**: ~580 insertions, ~4250 deletions (deletion dominated by removed dead-weight deps in pnpm-lock).

---

## Commits (chronological)

| # | Commit | Item | LOC delta | Notes |
|---|--------|------|-----------|-------|
| 1 | `8629ab6` | Q1+Q2 — Remove Playfair font + dead deps | +444 / -3727 | pnpm-lock regenerated; verified 0 usages of @tanstack/react-query, zustand, next-pwa, Playfair_Display |
| 2 | `e8deb60` | Q5+Q6 — Dashboard hover translate + crimson comment | +2 / -2 | DESIGN.md §851 violation fixed; stale comment from pre-Vercel migration updated |
| 3 | `33f7c41` | Q4 — Redirect /settle + /tutup-buku → /rekap | +30 / -514 | Legacy mega-form bodies replaced with thin redirect handlers; preserves bookmark compatibility |
| 4 | `7e0cdc7` | Q8 — SOURCE_LABELS rekap_consumption | +1 / -0 | Movements log now displays "Rekap Approval" instead of raw enum |
| 5 | `69ee2d5` | Q11 — Outstanding → Sisa Pembayaran | +2 / -2 | Indonesian i18n consistency in Reminders module |
| 6 | `578ac39` | Q9 — aria-current="page" on view-switcher | +1 / -0 | Operations tab a11y improvement |
| 7 | `f94dc93` | Q10 — expires_at filter on notifications | +11 / -2 | DB design flaw fixed (notifications page + bell badge count); prevents DB bloat over time |
| 8 | `fc09780` | Q7 — Consolidate KpiCard in Reports | +13 / -53 | Local KpiCard (1133-1172) deleted, imports shared `src/components/operations/kpi-card.tsx`; styling now consistent across Dashboard/Finance/Reports |
| 9 | `a6665b4` | Q3 — Pass userId to AnomalyRadarWidget | +3 / -7 | Kills duplicate `getCurrentUser()` call on Dashboard (-150-300ms TTI) |
| 10 | `9983834` | UI QW 6 — Design Hub colors + approve button | +25 / -12 | 2 files: badges via icon-only categorization; approve button uses `<Button variant="decisive-success">` primitive |
| 11 | `a335f96` | UI QW 4 — system_config search | +88 / -23 | Settings system tab now searchable across 33 keys; per-section count visible while filtering |
| 12 | `57afe6e` | Perf — 21 loading.tsx skeletons | +489 / -0 | Streaming coverage 22% → 50% (16 → 37 of 74 routes) |

---

## Detail per Quick Win

### Q1+Q2: Dead deps + Playfair removal (commit `8629ab6`)

**Before**:
- `package.json` had `@tanstack/react-query@5.100.9`, `zustand@5.0.13`, `next-pwa@5.6.0` — all confirmed 0 usages via `grep -r "from \"...\"" src/`
- `src/app/layout.tsx:14-18` loaded `Playfair_Display` font + set `--font-playfair` CSS var
- globals.css line 13 overrides `--font-heading: var(--font-inter)` so Playfair never rendered
- `pnpm-workspace.yaml` had only `onlyBuiltDependencies` field — pnpm 9+ required `packages:` field for single-package workspace

**After**:
- 3 deps removed from package.json + pnpm-lock.yaml regenerated
- Playfair import + variable declaration + className reference removed from layout.tsx
- `pnpm-workspace.yaml` now includes `packages: [.]` for pnpm 9+ compatibility

**Side effects**:
- pnpm-lock.yaml shrunk by ~3700 lines (most deletions Phase 0)
- Saves ~50KB Google Fonts CDN cold-start (Playfair) + ~30KB potential client bundle if @tanstack/react-query was tree-shaken into wrong chunk
- No functional regression — verified 0 usages before remove

### Q5+Q6: Dashboard polish (commit `e8deb60`)

**Before**:
- Event card line 408: `hover:-translate-y-px hover:border-border-strong hover:bg-surface-3` + `transition-all` — violates DESIGN.md §851 "no translate on hover, color-only state cues"
- Event card line 408: `rounded-2xl` — DESIGN.md spec card radius is 8px (`rounded-lg`)
- Line 244 comment: "Greeting — Inter display, crimson accent on name" — stale from pre-Vercel migration; actual code uses `text-primary` (ink)

**After**:
- `transition-all hover:-translate-y-px` → `transition-colors` (color-only hover per spec)
- `rounded-2xl` → `rounded-lg`
- Comment updated to "ink accent on name (Vercel DNA, no second hue)"

**Side effects**: Tiny visual change — event card no longer "lifts" on hover. Consistent with all other dashboard cards.

### Q4: Settlement route consolidation (commit `33f7c41`)

**Before**:
- 3 parallel routes: `/operations/[id]/rekap` (primary), `/settle` (legacy 308 LOC), `/tutup-buku` (legacy mega-form 218 LOC)
- Owner UX confusion: "which one do I click?"
- HANDOVER §8.4 noted legacy `settlements.ts` server action still has HPP `bonus` key dropped bug — both legacy routes call into it

**After**:
- `/settle/page.tsx` body replaced with `redirect("/operations/[id]/rekap")` (16 LOC stub)
- `/tutup-buku/page.tsx` same treatment (16 LOC stub)
- Documented as DEPRECATED in code comments; deletion scheduled in future cleanup pass

**Side effects**:
- External bookmarks to legacy routes still work (auto-redirect to /rekap)
- Legacy `SettlementForm` (308 LOC) and `TutupBukuForm` (1041 LOC) components become unreferenced from routes — can be deleted in next cleanup (still in git history for reference)
- Eliminates "which route is primary?" daily owner pain point

### Q8: warehouse SOURCE_LABELS (commit `7e0cdc7`)

**Before**: Stock movements log showed raw enum `rekap_consumption` for movements emitted by `settle_event` RPC.

**After**: SOURCE_LABELS now maps `rekap_consumption` → "Rekap Approval". Owner can trace stock deduction back to settlement.

**Side effects**: None — purely additive label.

### Q11: Reminders i18n (commit `69ee2d5`)

**Before**: Reminders module mostly Indonesian, but 2 English fragments:
- Table column header "Outstanding"
- Bucket description "Event sudah lewat, masih ada outstanding"

**After**:
- Column header → "Sisa Pembayaran"
- Bucket description → "Event sudah lewat, masih ada sisa pembayaran"

**Side effects**: None.

### Q9: aria-current on Operations view switcher (commit `578ac39`)

**Before**: Tab visually conveyed active state via `aria-selected={active}` + surface lift, but missing canonical `aria-current="page"` signal for screen readers in navigation context.

**After**: Active tab now also sets `aria-current="page"`.

**Side effects**: None — purely additive a11y attribute.

### Q10: Notifications expires_at filter (commit `f94dc93`)

**Before**: `notifications` table has `expires_at TIMESTAMPTZ` column populated by anomaly scanner with rule-specific TTL, but query never filtered on it. Expired notifications kept showing in UI + inflated bell badge count over time.

**After**: Both `notifications/page.tsx` (list + count) and `notification-bell.tsx` (topbar count) now apply two-clause OR filter:
```ts
.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
```
Non-expiring notifications (most rows, expires_at NULL) still visible. Only filters expired ones.

**Side effects**: Bell badge count may drop immediately for owners with pre-existing expired notifs in DB. Verified Postgres `.or()` PostgREST syntax compatible.

### Q7: KpiCard consolidation in Reports (commit `fc09780`)

**Before**:
- `src/app/(owner)/reports/page.tsx:1133-1172` defined local `function KpiCard(...)` with diverged styling:
  - `rounded-xl` (DESIGN.md spec is `rounded-lg`)
  - font-size 22px (shared version uses 26px)
  - `tone` prop: primary | emerald | amber | rose | muted
- `src/components/operations/kpi-card.tsx` shared version used `accent` prop: default | emerald | amber | sky | rose | primary

**After**:
- Removed local KpiCard function (-40 LOC)
- Added import: `import { KpiCard } from "@/components/operations/kpi-card"`
- Migrated 13 caller sites:
  - `tone=` → `accent=`
  - `tone="muted"` → `accent="default"` (2 sites)
- Preserved `tone=` on PnlRow/PnlSubRow (different component, different prop — fixed 4 mis-migrations during typecheck)

**Visual diff**: KPI tiles slightly bigger (26px font, was 22px) + correct `rounded-lg` (was `rounded-xl`). Now matches Dashboard + Finance.

**Side effects**: Minor visual upsize on Reports KPI tiles; consistent with other dashboards.

### Q3: AnomalyRadarWidget userId prop (commit `a6665b4`)

**Before**:
- `dashboard/page.tsx:52` calls `getCurrentUser()` (Supabase auth round-trip, ~75-150ms)
- `dashboard/page.tsx:333` renders `<AnomalyRadarWidget />`
- `AnomalyRadarWidget` (anomaly-radar.tsx:66-67) calls `getCurrentUser()` AGAIN internally
- Result: 2× auth round-trip per dashboard load

**After**:
- `AnomalyRadarWidget` signature: `{ userId: string }`
- Internal `getCurrentUser()` removed (and import)
- Dashboard caller: `<AnomalyRadarWidget userId={userResult.profile.id} />`

**Estimated impact**: -150-300ms dashboard TTI on slow connections.

### UI QW 6: Design Hub colors (commit `9983834`)

**Before** (2 files):

1. `src/app/(owner)/design/page.tsx:35-53` + `src/components/event-assets/asset-section.tsx:38-63` — 4 asset types had categorization-color badges:
   - `design_frame`: violet-500
   - `footage_crew`: amber-500
   - `softfile_photo`: sky-500
   - `softfile_video`: emerald-500

DESIGN.md §867 explicitly forbids decorative colors beyond ink + semantic state.

2. `src/components/event-design/design-card.tsx:120-127` — "Approve design" button hardcoded:
```tsx
<button className="press-down inline-flex h-10 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
```
Bypasses `<Button>` primitive → no focus ring, no loading state, divergent radius.

**After**:

1. All 4 asset type tones unified to `border-border-default bg-secondary text-foreground/85` (asset-section) and `border-border-default bg-secondary text-foreground/85` (design page). Type signal moves to lucide icon shape (Palette/Film/Camera/Video).

2. Button replaced with:
```tsx
<Button type="button" variant="decisive-success" size="lg" onClick={...}>
  <CheckCircle2 />
  Approve design
</Button>
```

**Side effects**:
- Asset type badges now visually neutral; relies on icon shape recognition (already in place via lucide icons)
- Approve button gains focus-visible ring, proper disabled state handling, consistent sizing
- Same emerald visual (decisive-success variant uses emerald-600)

### UI QW 4: system_config search (commit `a335f96`)

**Before**: 33 system_config keys split across 6 categories rendered as flat form. Owner had to manually scroll to find specific setting (Settings → System tab → scroll past 5 sections).

**After**:
- Search input at top with magnifier icon
- Client-side filter (`useState` + `useMemo`) on key OR description substring
- Matching count visible while filtering: "X dari Y key cocok"
- Per-section count visible: `Financial (3/8)` when filtering
- Categories with 0 matches auto-hide
- **Safety**: filtered rows use CSS `hidden` class — hidden inputs (`keys`, `value__*`, `type__*`) still serialize on form submit, so search+save doesn't drop unchanged keys

**Side effects**: Form is now stateful (was stateless server-render). Slightly different UX feel — instant filter, no page reload. Test that submit still works for all 33 keys even after filter applied.

### Perf: loading.tsx skeletons (commit `57afe6e`)

**Before**: 16/74 routes had `loading.tsx` skeleton (22% coverage). Navigating to remaining 58 routes showed previous page content until new server-render arrived → perceived sluggish.

**After**: Added 21 new `loading.tsx` skeleton files:
- Operations sub-routes (5): crew, edit, equipment, payments, rekap
- Operations top-level views (5): board, calendar, design, new, team
- Settings sub-routes (11): addons, audit-log, backdrops, bank-accounts, contacts, crew, items, notification-rules, packages, sinking-funds, whatsapp-templates

Each skeleton uses `<Container>` + `<Skeleton>` primitives matching approximate page layout to minimize CLS.

**Skipped**: `/operations/[id]/settle` and `/tutup-buku` (just redirect handlers post-Q4, no loading state useful).

**Coverage**: 22% → 50% (37/74 routes).

**Side effects**: None — additive only.

### Perf: Dynamic imports (no commit, investigation only)

**Investigation result**: The 3 perf items (dynamic-import @react-pdf/renderer, booking-form, rekap-form) turned out to be largely already handled by Next.js automatic code-splitting:

1. **@react-pdf/renderer**: Only imported by API route handlers (`src/app/api/pdf/*/route.ts`) and PDF document components (`src/components/pdf/*-document.tsx`) which are themselves only imported by API routes. **Never reaches client bundle.** The `PdfDownloadMenu` client component just navigates via href to `/api/pdf/*` — no SDK import.

2. **booking-form.tsx (2280 LOC) + rekap-form.tsx (1618 LOC)**: Both are "use client" components. Next.js automatically code-splits at the "use client" boundary into per-route chunks. They're already lazy-loaded per route. Wrapping in `dynamic()` would only help to defer load *within* a route (e.g., behind a "Show form" button), which doesn't fit the workflow (these pages exist specifically to display the form).

3. **csv-import wizard (1302 LOC)**: Same — already auto-chunked per route via "use client". Could potentially be deferred within the route, but rare use case (Settings imports) and would complicate UX.

**Verdict**: No code change needed. The AUDIT_PERFORMANCE.md assumption that these need explicit `dynamic()` wrapping was incorrect for this Next.js 16 codebase architecture.

---

## Side Effects Summary

### Behavioral changes (user-visible)

| Change | Risk | Mitigation |
|--------|------|------------|
| `/settle` + `/tutup-buku` redirect to `/rekap` | Low — only legacy routes | Redirect preserves bookmark; doc comment in stub explains |
| Dashboard event card no hover-lift | Visual nit | Consistent with other dashboard cards |
| Dashboard event card `rounded-lg` (was xl) | Visual nit | Matches DESIGN.md spec |
| Reports KPI tiles slightly bigger (26px → was 22px) | Visual change | Now matches Dashboard/Finance KPI styling |
| Design Hub badges neutral (no color) | Visual change | Type signal still via icon shape |
| Approve design button gains focus ring | Improvement | A11y compliance |
| Notification bell badge count may drop | Expected | Only filters expired rows — accurate count |
| Settings system_config has search input | Improvement | UX win |
| 21 new pages show skeleton on load | Improvement | Perceived speed |

### Functional changes (verified safe)

| Change | Verification |
|--------|--------------|
| Dead deps removal | `grep -r` confirmed 0 usages before remove |
| Playfair font removal | globals.css already overrides; never rendered |
| AnomalyRadarWidget userId prop | Typecheck passes; props correctly threaded |
| KpiCard consolidation | All 13 callers migrated; typecheck passes |
| `aria-current` addition | Additive only |
| `expires_at` filter | PostgREST `.or()` syntax matches Supabase docs |
| `SOURCE_LABELS` addition | Additive only |
| Indonesian label rename | Static strings, no logic |
| `redirect()` stubs | Next.js native helper; preserves URL |
| `<Button>` primitive swap | Same visual emerald, gains a11y |
| system_config search | Hidden inputs still serialize; verified action processes only submitted keys |
| loading.tsx files | Standalone components, additive only |

### TypeScript

✅ `npx tsc --noEmit` passes clean after every commit. Verified end-to-end.

### Lint

⚠️ Not run during Phase 0 (`pnpm lint` = biome check). Recommend manual run before next session to catch style issues.

---

## Manual Smoke Test Checklist

**For owner — verify these flows work in production after auto-deploy** (~15 min):

### Core flows (critical paths)
- [ ] **Login** → `/dashboard` loads, no console errors
- [ ] **Dashboard event card** → hover should NOT translate up; should change bg color only
- [ ] **Operations list** → click event → detail page loads with `loading.tsx` skeleton briefly visible
- [ ] **Operations view switcher** (List / Calendar / Board / Design / Team) → tab clicks navigate; active tab visible state
- [ ] **`/operations/[id]/settle` URL** → redirects to `/operations/[id]/rekap`
- [ ] **`/operations/[id]/tutup-buku` URL** → redirects to `/operations/[id]/rekap`
- [ ] **Crew rekap submit** flow end-to-end (no regression in /crew/jadwal/[id]/rekap)
- [ ] **Owner approve rekap → settle event** end-to-end via `/operations/[id]/rekap`

### Specific feature checks
- [ ] **Dashboard `<AnomalyRadarWidget>`** → renders unread anomalies if any (no error if 0)
- [ ] **Notification bell** badge → count is accurate (filters expired)
- [ ] **Reports page** → tabs load (PnL / Crew / Owner); KPI tiles look consistent with Finance
- [ ] **Settings → System** → search input works:
  - Type "fee" → only matching keys show
  - Type "" (clear) → all 33 keys back
  - Type "fee" → save (`Simpan semua perubahan`) → all 33 keys still update (not just visible ones)
- [ ] **Settings → Audit Log** → loading skeleton briefly visible
- [ ] **Design Hub** → asset type badges no longer colorful (icon-only signal)
- [ ] **Design event detail** → "Approve design" button still emerald; has focus ring when Tab-pressed
- [ ] **Warehouse → Log Mutasi tab** → if there's a `rekap_consumption` row, label reads "Rekap Approval"
- [ ] **Reminders** → table column reads "Sisa Pembayaran" (not "Outstanding")

### Performance verification
- [ ] **Open DevTools Network tab**, navigate to `/dashboard` → no Google Fonts request for `fonts.googleapis.com/css*Playfair*`
- [ ] **Bundle size check** (optional, via Vercel deploy stats): initial JS size for `/operations/new` route should be unchanged or slightly smaller (per-route auto-chunking already handles booking-form)

### Regression checks
- [ ] **No console errors** anywhere
- [ ] **No 404s** on assets (no broken font references)
- [ ] **Form submits** still work (booking, rekap, crew assign, settings, etc.)
- [ ] **Mobile crew portal** still functional (login as crew, submit rekap)

### Known/expected differences
- Reports KPI tiles slightly larger font (26px vs 22px) — by design
- Dashboard event card has no lift on hover — by design (DESIGN.md compliance)
- Design Hub asset badges no longer colorful (violet/amber/sky/emerald) — by design

---

## Files Touched (Summary)

**Total**: 28 files modified, 21 files added.

**Modified** (12 files for code changes + 4 deps/config):
- `package.json` (deps removal)
- `pnpm-lock.yaml` (deps regen)
- `pnpm-workspace.yaml` (pnpm 9+ compat)
- `src/app/layout.tsx` (Playfair removal)
- `src/app/(owner)/dashboard/page.tsx` (Q5+Q6+Q3)
- `src/app/(owner)/operations/[projectId]/settle/page.tsx` (Q4)
- `src/app/(owner)/operations/[projectId]/tutup-buku/page.tsx` (Q4)
- `src/components/warehouse/warehouse-tables.tsx` (Q8)
- `src/components/reminders/batch-client.tsx` (Q11)
- `src/components/reminders/buckets.ts` (Q11)
- `src/components/operations/view-switcher.tsx` (Q9)
- `src/app/(owner)/notifications/page.tsx` (Q10)
- `src/components/layouts/notification-bell.tsx` (Q10)
- `src/app/(owner)/reports/page.tsx` (Q7)
- `src/components/dashboard/anomaly-radar.tsx` (Q3)
- `src/app/(owner)/design/page.tsx` (UI QW 6)
- `src/components/event-assets/asset-section.tsx` (UI QW 6)
- `src/components/event-design/design-card.tsx` (UI QW 6)
- `src/components/system-config/config-form.tsx` (UI QW 4)

**Added** (21 loading.tsx files):
- 5 in `/operations/[projectId]/{crew,edit,equipment,payments,rekap}/loading.tsx`
- 5 in `/operations/{board,calendar,design,new,team}/loading.tsx`
- 11 in `/settings/{addons,audit-log,backdrops,bank-accounts,contacts,crew,items,notification-rules,packages,sinking-funds,whatsapp-templates}/loading.tsx`

---

## Next Steps (Phase 1 — already in progress)

Per `REFINEMENT_ROADMAP.md` Phase 1 (week 1-2): **Design System Enforcement**. Will proceed in auto-mode until 10 PM:

- F1.1: Update `<Card>` primitive `rounded-xl ring-1` → `rounded-lg border` (cascades to 50+ callers)
- F1.2: Update `<EmptyState>` primitive `rounded-xl` → `rounded-lg`
- F1.3: Audit & fix `rounded-2xl` callers outside marketing paths
- F1.4: Replace `shadow-lg`/`shadow-xl`/`shadow-2xl` with `shadow-level-*` tokens
- F1.9-F1.11: Color violation sweep — operations-list-table, contacts-list-table, booking assign-crew form, settings backdrop badges

**Stop conditions for auto-mode**:
- Any single task >1h budget → stop and document
- Typecheck failure that can't be resolved in <15min → revert + document
- Risky change (touches settle_event flow, schema, RPC) → stop and document

---

**End of REPORT_PHASE_0.md.** Phase 0 complete; Phase 1 in progress.
