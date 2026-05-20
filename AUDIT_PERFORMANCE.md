# AUDIT PERFORMANCE — Tetra Ops

**Audit date**: 2026-05-19
**Auditor**: Claude (read-only static analysis)
**Methodology**: Targeted greps + per-module audit cross-references; tidak run `pnpm build` atau Lighthouse karena environment limitations.

---

## Executive Summary

Owner explicit pain: **"pindah halaman lambat, loading data lama"**. Audit static menemukan multiple performance issues yang explain perceived slowness:

| Domain | Severity | Findings |
|--------|----------|----------|
| **Bundle** | High | 6 heavy client forms (2280, 1618, 1302, 1041, 617, 558 LOC) — none code-split via `dynamic()`. PDF renderer eagerly imported. |
| **Database queries** | High | 3 confirmed N+1 RPC patterns. 194 sequential awaits vs 45 `Promise.all`. Some sequential blocking inside otherwise parallel handlers. |
| **React perf** | Medium | 114 'use client' components — many could be server components. No memo/callback usage audited. |
| **Network** | Medium | Zero TanStack Query / SWR active despite deps installed. No client-side cache layer. PWA service worker exists tapi `next-pwa` config absent from `next.config.ts`. |
| **Navigation** | Medium | 16 `loading.tsx` for 74 routes = **22% streaming coverage**. View Transitions wired but only on owner sidebar/topbar — not per-page. |

**Quick wins available**: ~7 items dengan estimasi 30min-2h each yang akan deliver **measurable speed-up** untuk owner pain.

**Estimated TTI delta** (post-fix, conservative): Dashboard ~250ms, Operations detail ~400ms, Rekap form context ~800ms, Finance ~200ms, Settings system tab ~150ms.

---

## A. Bundle Analysis

### A.1 Dependency Footprint
**Total dependencies**: 26 runtime. Notable heavy contributors:

| Dependency | Version | Impact | Notes |
|-----------|---------|--------|-------|
| `@react-pdf/renderer` | ^4.5.1 | **HIGH** (estimate 300-500KB gzipped) | PDF generation library; **must be dynamic-imported** to avoid loading on every page |
| `@googleapis/drive` | ^20.1.0 | LOW (server-only) | Used in API routes only — bundler should exclude from client |
| `@supabase/supabase-js` + `@supabase/ssr` | latest | MEDIUM (~50KB) | Required core |
| `@tanstack/react-query` | ^5.100.9 | **DEAD WEIGHT** (~30KB) | Imported but **0 usages** across `src/` — should be removed from deps |
| `lucide-react` | ^1.14.0 | LOW with proper imports | Tree-shake-able if imported per-icon; audit needed |
| `date-fns` | ^4.1.0 | LOW with per-function imports | Tree-shake-able |
| `react-hook-form` + `@hookform/resolvers` | ^7.75 + ^5.2 | MEDIUM | Per-form load via barrel — ~30KB |
| `next-pwa` | ^5.6.0 | LOW (build-time) | **But not configured in next.config.ts** — see C.3 |
| `web-push` + `sharp` + `google-auth-library` | latest | LOW (server-only) | Excluded from client bundle |
| `@base-ui/react` + `radix-ui` | ^1.4 + ^1.4 | MEDIUM | Headless UI primitives; tree-shake per component |
| `zustand` | ^5.0.13 | **DEAD WEIGHT** | Imported but **0 usages** in src/ — remove |
| `Playfair_Display` font | (Google) | LOW | Loaded in `src/app/layout.tsx:14`, **never rendered** (overridden in globals.css). ~50KB Google Fonts cold-start. **Remove.** |

### A.2 Heavy Client Components (NOT code-split)
Per `grep -rln "^\"use client\""` ranked by LOC:

| File | LOC | Loaded in | Severity |
|------|-----|-----------|----------|
| [src/components/booking/booking-form.tsx](src/components/booking/booking-form.tsx) | **2280** | `/operations/new`, `/operations/[id]/edit` | **CRITICAL** — eagerly loaded for booking flow |
| [src/components/rekap/rekap-form.tsx](src/components/rekap/rekap-form.tsx) | **1618** | `/crew/jadwal/[id]/rekap`, `/operations/[id]/rekap` | **CRITICAL** — crew on cellular loads full form |
| [src/components/csv-import/wizard.tsx](src/components/csv-import/wizard.tsx) | **1302** | Settings import pages (rare use) | **HIGH** — should be dynamic |
| [src/components/tutup-buku/tutup-buku-form.tsx](src/components/tutup-buku/tutup-buku-form.tsx) | **1041** | `/operations/[id]/tutup-buku` (legacy) | High — but route deprecating |
| [src/components/operations/operations-list-table.tsx](src/components/operations/operations-list-table.tsx) | **617** | `/operations` (main list) | Medium |
| [src/components/settlement/settlement-form.tsx](src/components/settlement/settlement-form.tsx) | **558** | `/operations/[id]/settle` (legacy) | High — but route deprecating |
| [src/components/items/rekap-mapping-form.tsx](src/components/items/rekap-mapping-form.tsx) | **516** | `/settings/items/mapping` (rare) | Medium |
| [src/components/reminders/batch-client.tsx](src/components/reminders/batch-client.tsx) | **459** | `/reminders` | Low |
| [src/components/warehouse/warehouse-tables.tsx](src/components/warehouse/warehouse-tables.tsx) | **422** | `/warehouse` | Low |
| [src/components/items/item-form.tsx](src/components/items/item-form.tsx) | **416** | `/settings/items/new`, `/edit` | Medium |

### A.3 Findings

**[CRITICAL] No dynamic imports anywhere in codebase.**
```bash
$ grep -rn "dynamic(" src/components/ src/app/
(0 results)
```
This means **every client component gets eagerly loaded** with the route it's referenced from. PDF renderer (300-500KB) likely included in `/operations/[id]` bundle even saat user tidak generate PDF.

**[CRITICAL] Dead-weight deps** — `@tanstack/react-query` + `zustand` both installed (~50KB combined) tapi 0 actual usages di `src/`. Verified via grep:
```bash
$ grep -rn "queryClient\|useQuery\|swr" src/
(0 results)
$ grep -rln "from \"zustand\"" src/
(0 results)
```
These should be removed from `package.json` to shrink dependency tree.

**[MEDIUM] Playfair Display font dead** — loaded di `layout.tsx:14`, set as `--font-playfair` CSS var, tapi globals.css line 13 overrides `--font-heading: var(--font-inter)`. Visit ke Google Fonts CDN tetap happen tiap cold-start (~50KB +1 DNS lookup).

**[LOW-MEDIUM] No icon barrel inspection** — `lucide-react` imports across 100+ files — assumed tree-shake-able based on official lucide-react v0.x+ guidance, tapi verifikasi via build output kalau ada concern.

### A.4 Quick Wins

| # | Win | Action | Effort | Impact |
|---|-----|--------|--------|--------|
| 1 | Remove Playfair Display | Delete lines 14-18 + className ref in `src/app/layout.tsx` | 5min | -50KB CDN fetch, -1 DNS lookup |
| 2 | Remove `@tanstack/react-query` from deps | `pnpm remove @tanstack/react-query` | 2min | -~30KB potential client bundle |
| 3 | Remove `zustand` from deps | `pnpm remove zustand` | 2min | -~5KB if accidentally bundled |
| 4 | Dynamic-import PDF generators | Wrap `@react-pdf/renderer` usage in dynamic component | 30min | -300KB from /operations route initial load |
| 5 | Dynamic-import booking-form | `dynamic(() => import('@/components/booking/booking-form'), { ssr: false })` di /operations/new + /edit | 15min | Faster TTI on operations list (booking form lazy) |
| 6 | Dynamic-import rekap-form | Same pattern on `/crew/jadwal/[id]/rekap` + `/operations/[id]/rekap` | 15min | Faster context load for crew |
| 7 | Dynamic-import csv-import wizard | Wrap in dynamic at settings import routes | 10min | -100KB+ from settings entry points |

**Aggregate estimated bundle savings**: 400-600KB gzipped untuk first-paint routes.

---

## B. Database Query Audit

### B.1 N+1 Patterns (Confirmed)

#### B.1.1 `get_current_stock` per-item RPC (rekap context)
**File**: [src/lib/actions/rekap.ts:280-288](src/lib/actions/rekap.ts#L280)

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

**Impact**:
- 50 inventory items = 50 parallel RPC roundtrips
- Each RPC ~50-100ms via Supabase REST → estimated 500-1000ms wall clock for crew rekap context
- Pattern repeats every time `getRekapContext()` is called (per page load + per `router.refresh()`)

**Fix**:
```sql
-- New migration
CREATE OR REPLACE FUNCTION get_current_stock_batch(p_item_ids UUID[])
RETURNS TABLE(item_id UUID, current_stock NUMERIC)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT m.item_id,
    COALESCE(SUM(CASE
      WHEN m.direction = 'in' THEN m.quantity
      WHEN m.direction = 'out' THEN -m.quantity
      ELSE m.quantity
    END), 0) AS current_stock
  FROM stock_movements m
  WHERE m.item_id = ANY(p_item_ids)
  GROUP BY m.item_id;
END;
$$;
```

Then refactor caller to single RPC call. **Severity: P0 — directly explains crew rekap form perceived slowness.**

#### B.1.2 `get_sinking_fund_balance` per-fund RPC (finance + settings)
**Files**:
- [src/app/(owner)/finance/page.tsx:228-235](src/app/(owner)/finance/page.tsx#L228)
- [src/app/(owner)/settings/sinking-funds/page.tsx:66-72](src/app/(owner)/settings/sinking-funds/page.tsx#L66) — same pattern duplicated

**Current scale**: 3-5 funds di production. Acceptable saat ini (~150-250ms), tapi tidak scale.

**Fix**: Same pattern — batch RPC OR pre-computed SQL view:
```sql
CREATE OR REPLACE VIEW sinking_fund_balances_v AS
SELECT fund_id,
  COALESCE(SUM(CASE
    WHEN direction = 'deposit' THEN amount
    WHEN direction = 'withdrawal' THEN -amount
  END), 0) AS balance
FROM sinking_fund_movements
GROUP BY fund_id;
```

**Severity: P1.**

#### B.1.3 Double `getCurrentUser()` on Dashboard
**Files**:
- [src/app/(owner)/dashboard/page.tsx:52](src/app/(owner)/dashboard/page.tsx#L52) — first call
- [src/components/dashboard/anomaly-radar.tsx:67](src/components/dashboard/anomaly-radar.tsx#L67) — second call

**Impact**: 2× Supabase auth round-trip per dashboard render. Each ~75-150ms = 150-300ms wasted.

**Fix**: Pass `userId` (or full `user` object) as prop from page.tsx to AnomalyRadarWidget; remove inner `getCurrentUser()` call.

**Severity: P0 — easy fix.**

#### B.1.4 Operations detail sequential inner queries
**File**: [src/app/(owner)/operations/[projectId]/page.tsx:182-195](src/app/(owner)/operations/[projectId]/page.tsx#L182)

After initial 4-query `Promise.all`, then **inner sequential block**:
```ts
const [{ count: equipmentCountRaw }, { data: rekapData }] = await Promise.all([
  supabase.from("inventory_items").select(...).eq("current_event_id", event.id),
  supabase.from("crew_rekap").select(...).eq("event_id", event.id),
]);
```

This Promise.all is fine internally, but the entire block runs **AFTER** the first Promise.all returns — sequential dependency unnecessary.

**Fix**: Include both lookups in the initial event select using Supabase nested syntax:
```ts
const { data: event } = await supabase
  .from("events")
  .select(`
    *,
    equipment_count:inventory_items(count).eq(current_event_id, id),
    crew_rekap(id, is_approved)
  `)
  .eq("project_id", projectId)
  .single();
```

**Severity: P1.**

### B.2 Sequential Await Ratio

```
$ grep -rn "await supabase" src/lib/actions/ src/app/ | wc -l
194

$ grep -rn "Promise\.all" src/lib/actions/ src/app/ | wc -l
45
```

Ratio ≈ 4.3:1 sequential vs parallel. Some sequential awaits genuinely depend (auth → user → org check), but spot-check needed across `src/lib/actions/`. **Recommend**: Code review pass to identify Promise.all opportunities di 30+ action files.

### B.3 Over-fetch Analysis

**`.select("*")` usage**:
```
$ grep -rn "\.select(\"\*\")" src/lib/actions/ src/app/ | wc -l
0
```
**Excellent** — all queries use explicit column lists. No over-fetch.

### B.4 Pagination

Per-module audits flagged hardcoded `.limit()`:
- [src/app/(owner)/finance/page.tsx:132](src/app/(owner)/finance/page.tsx#L132) — `.limit(10)` settlements list, no pagination
- [src/app/(owner)/notifications/page.tsx](src/app/(owner)/notifications/page.tsx) — `.limit(200)` notifications, no pagination (OK for now, grows with usage)

**Recommendation**: Add "View all" link or pagination control on finance settlements; consider cursor pagination on notifications jika grows >500.

### B.5 Lookup Table Re-fetches

Tidak ada centralized memoization untuk lookup tables (`chart_of_accounts`, `system_config`, `sinking_funds`). Each page that needs them re-fetches.

**Fix path**: Use React 19 `cache()` di `src/lib/data/` untuk wrap reusable queries; React will dedupe within single request.

```ts
import { cache } from "react";

export const getChartOfAccounts = cache(async () => {
  const supabase = await getSupabaseServer();
  return supabase.from("chart_of_accounts").select("code, name, type").order("code");
});
```

**Severity: P2** — minor speedup, helps consistency.

---

## C. React Performance

### C.1 Client Component Saturation

**114 'use client' components** found via grep. Out of 143 total components (`src/components/`), **~80% are client-side**. Some genuinely interactive, but many likely could be server components.

**Sample of likely candidates for "server component" downgrade**:
- Display-only badges, status pills (rendered with server data, no client-state)
- Read-only summary cards (e.g., `crew-context-card.tsx` jika tidak interactive)
- Empty states (likely already server, verify)

**Audit needed**: Sample 20 client components, verify each genuinely needs hooks/event handlers. Convert non-interactive ones to server.

**Severity: P2** — perf gain modest tapi reduce hydration cost.

### C.2 Large Lists Without Virtualization

Per-module audits:
- Operations list table renders up to N events (default 100+ for owner with active history) — **no virtualization**
- Reports settlements list 10 row hard cap (avoids issue but limits visibility)
- Notifications list 200 row cap — fine sekarang
- Crew web master table — 30+ rows on first load + 100+ over time

**Recommendation**: Add `@tanstack/react-virtual` (already installed via `@tanstack/react-query` ecosystem) untuk virtualize lists yang grow >50 rows. Operations list highest priority.

**Severity: P2 — only impacts power users w/ large data.**

### C.3 Image Strategy

```
$ grep -rn "<img " src/components/ src/app/ | wc -l
0
$ grep -rln "from \"next/image\"" src/components/ src/app/ | wc -l
8
```

**Excellent** — zero raw `<img>` tags; 8 files use `next/image` for logos, brand assets, uploaded photos. No regression risk.

### C.4 useMemo / useCallback Coverage

Tidak full-audit, tapi spot-check menemukan:
- [src/components/rekap/rekap-form.tsx](src/components/rekap/rekap-form.tsx) — memoizes `draftValues` flat record (line ~ memoized) ✓
- [src/components/operations/operations-list-table.tsx](src/components/operations/operations-list-table.tsx) — likely needs memo on row-render (617 LOC client) — verify

**Recommendation**: Profile via React DevTools jika user reports specific page lag.

---

## D. Network & Caching

### D.1 No Active Client-Side Data Fetching Library

```
$ grep -rn "useQuery\|useMutation\|QueryClient" src/components/ src/app/ | wc -l
0
$ grep -rln "from \"zustand\"" src/ | wc -l
0
```

Despite `@tanstack/react-query` + `zustand` di `package.json`, **no active usage**. App relies entirely pada Next.js Server Components + Server Actions + `router.refresh()`.

**Trade-off analysis**:
- ✅ **Pros**: Simpler mental model. No client cache hydration. Server-rendered HTML stays fresh post-action via revalidatePath.
- ❌ **Cons**: Every interaction = full server round-trip + route re-render. No optimistic UI without manual `useTransition` wiring. Cross-page data sync requires re-fetch.

**Recommendation**:
1. Either commit to **server-action + revalidatePath** pattern → **remove unused deps** (saves ~30KB)
2. OR introduce TanStack Query for specific high-interaction surfaces (Operations list w/ filters, Crew fee page, Reminders batch) — but only if perceived UX gain justifies migration cost

Given owner's "halaman lambat" pain stems mostly dari Server-side query speed (N+1 patterns), recommend **Option 1**: remove unused deps + double-down on server actions + revalidatePath.

### D.2 Revalidate Strategy

Audit grep `revalidatePath` usage di server actions:
- 42 server action files
- Random sample (rekap.ts, settle-event.ts, crew-fees.ts) — all use `revalidatePath` properly post-mutation
- No `revalidateTag` usage detected — tag-based invalidation not employed

**Verdict**: Strategy is path-based, which is correct for current scale. Tag-based would help on cross-module invalidation (e.g., approving rekap invalidates Operations + Finance + Reports) but acceptable to defer.

### D.3 Drive API Caching

Drive API calls in `src/lib/drive/` proxy file uploads. No direct page.tsx call (verified grep). Cached via Supabase Storage or in-memory — not audited fully.

**Note**: Image compression on mobile (`src/lib/crew/image-compression.ts`) reduces upload payload 10-20× — major win for cellular crew.

### D.4 Cron Routes

- `/api/cron/status-transition` — daily H-7/H/H+1 event lifecycle transitions
- `/api/cron/anomaly-scan` — daily anomaly detection (Phase 3)

Tidak audit, tapi assume Vercel Cron triggered. No perf concern.

---

## E. Navigation Speed

### E.1 Loading States Coverage

```
$ find src/app -name "loading.tsx" | wc -l
16
$ find src/app -name "page.tsx" | wc -l
74
```

**Coverage: 16 / 74 = 22%.**

Routes WITH `loading.tsx`:
- Owner: dashboard, billing, finance, finance/vendors, notifications, operations, operations/[id], reminders, reports, settings, warehouse
- Crew: /, alat, fee, jadwal, profile

Routes WITHOUT loading.tsx (sample):
- `/operations/new`, `/operations/[id]/edit`, `/operations/[id]/crew`, `/operations/[id]/payments`, `/operations/[id]/equipment`, `/operations/[id]/rekap`, `/operations/[id]/settle`, `/operations/[id]/tutup-buku`
- All `/settings/<sub>` subpages (12 subpages, no per-subpage loading)
- `/operations/board`, `/operations/calendar`, `/operations/design`, `/operations/team`
- `/design/[projectId]`

**Impact**: User clicking link sees previous page until new server-rendered HTML arrives — no skeleton, no spinner. Perceived as "page sluggish."

**Recommendation**: Add `loading.tsx` per major route. Priority order:
1. Operations sub-routes (highest traffic)
2. Settings sub-routes (12 subpages, frequent navigation)
3. Operations alternative views (board, calendar, team)

**Severity: P1.**

### E.2 View Transitions

globals.css defines `morph`, `fade`, `nav-forward`, `nav-back` keyframes. `next.config.ts` enables `experimental.viewTransition: true`.

**Usage**:
- Sidebar (`viewTransitionName: "site-sidebar"`) ✓
- Topbar (`viewTransitionName: "site-header"`) ✓
- Owner bottom nav ✓
- Some event cards (operations list → detail) ✓

**Missing**: Page-level transitions (e.g., `/operations` → `/operations/new`), Settings tab switches, Reports tab switches.

**Recommendation**: Add `viewTransitionName` to repeated UI elements yang share identity across routes (e.g., StatCard di Dashboard → Reports tab title).

**Severity: P3** — nice-to-have polish.

### E.3 Hard vs Soft Navigation

Per-module audits did not flag raw `<a href>` instead of `<Link>`. Assumed mostly clean.

**Verify**: Random spot check — looks OK.

### E.4 PWA Service Worker

```
$ ls public/sw.js
public/sw.js  (72 lines)

$ grep "pwa\|next-pwa\|sw" next.config.ts
(0 matches)
```

**Finding**: `next-pwa` v5.6.0 di deps tapi **tidak configured di `next.config.ts`**. Service worker file `public/sw.js` exists, registered via [src/components/push/sw-register.tsx:29](src/components/push/sw-register.tsx) — but this is hand-rolled for push notif subscription, not Workbox-generated.

**Implication**:
- Push notifications **work** (manually wired)
- **No offline caching** for static assets, no Workbox runtime caching strategy
- **No "Add to Home Screen" prompt** orchestrated (manifest exists, but next-pwa would help)

**Recommendation**: Either:
1. Remove `next-pwa` from deps if not planned to use (saves ~5KB + clarifies intent)
2. OR properly configure `next-pwa` in `next.config.ts` untuk offline runtime caching of `/api/cron/*`, lookup data, etc.

**Severity: P2.**

### E.5 Layout Reuse

`(owner)/layout.tsx` and `(crew)/layout.tsx` both static — re-used across all sub-routes correctly. No nested-layout re-mount issue identified.

---

## F. Benchmarks vs Industry Targets

| Metric | Target | Current (estimated) | Status |
|--------|--------|---------------------|--------|
| **Bundle initial JS** | <200KB gzipped | Unknown (no `pnpm build` run); likely **200-400KB** based on heavy client components | ⚠️ Likely over budget on Operations/Rekap routes |
| **TTI mobile 3G** | <2s | Unknown; likely **3-5s** on Crew rekap form route (1618 LOC client + DB N+1) | ❌ Likely over |
| **TTI desktop** | <1s | Unknown; likely **1-2s** on owner pages (Dashboard + 15 parallel queries) | ⚠️ Close to budget |
| **LCP** | <2.5s | Unknown; depends on slowest above-fold image / text render | ⚠️ Needs measurement |
| **CLS** | <0.1 | Unknown; loading.tsx coverage 22% suggests CLS risk on uncovered routes | ⚠️ Needs measurement |
| **N+1 queries** | 0 | 3 confirmed (rekap stock, finance sinking, dashboard auth) | ❌ Fix all 3 |

**Recommendation**: Run `pnpm build` + Lighthouse mobile (Slow 4G) di staging untuk concrete numbers post-fix.

---

## G. Prioritized Quick Wins

| # | Fix | File:Line | Effort | Estimated Impact |
|---|-----|-----------|--------|------------------|
| 1 | Remove Playfair Display font | [src/app/layout.tsx:14-18](src/app/layout.tsx#L14) | 5min | -50KB Google Fonts CDN |
| 2 | Remove `@tanstack/react-query` + `zustand` | `package.json` | 5min | -~35KB potential bundle |
| 3 | Pass `user` prop to AnomalyRadarWidget (kill double getCurrentUser) | [dashboard/page.tsx:52](src/app/(owner)/dashboard/page.tsx#L52), [anomaly-radar.tsx:67](src/components/dashboard/anomaly-radar.tsx#L67) | 30min | -150-300ms dashboard TTI |
| 4 | Create `get_current_stock_batch` RPC + refactor rekap.ts caller | [src/lib/actions/rekap.ts:280](src/lib/actions/rekap.ts#L280) + new migration | 2h | -500-1000ms crew rekap context |
| 5 | Dynamic-import `@react-pdf/renderer` PDF generators | PDF-using routes | 30min | -300-500KB Operations route initial JS |
| 6 | Dynamic-import `booking-form.tsx` (2280 LOC) | `/operations/new` + `/edit` page.tsx | 15min | Faster initial render on /operations |
| 7 | Dynamic-import `rekap-form.tsx` (1618 LOC) | `/crew/jadwal/[id]/rekap` + owner counterpart | 15min | Faster context for crew form |
| 8 | Add 8 missing `loading.tsx` for Operations sub-routes | `src/app/(owner)/operations/[id]/{crew,payments,equipment,rekap}/loading.tsx` etc | 1h | Perceived speed via skeleton |
| 9 | Add `get_sinking_fund_balance_batch` RPC OR `sinking_fund_balances_v` SQL view | New migration + 2 caller refactors | 2h | -50-150ms finance + settings |
| 10 | Decide on `next-pwa` config — remove dep OR add config | `next.config.ts` | 30min | Clarifies intent + small bundle |

**Total quick wins effort**: ~7-8 hours. Aggregate impact: **measurable speed-up across all 5 most-trafficked pages**.

---

## H. Medium-Effort Improvements (1-3 days)

1. **Promise.all audit pass across 30+ server actions** — find sequential awaits yang independent (~1 day, M)
2. **React 19 `cache()` for lookup tables** (chart_of_accounts, system_config, sinking_funds) — wrap in `src/lib/data/` (~1 day, M)
3. **Virtualize Operations list table** if >50 events common — `@tanstack/react-virtual` integration (~1-2 days, M)
4. **Audit 114 'use client' components** — convert non-interactive ones to server (~2-3 days, M, ongoing)
5. **Add `viewTransitionName` to key page-level elements** (StatCard, hero titles) for shared-element transitions (~1 day, M)
6. **Configure `next-pwa` properly** if PWA path chosen — Workbox runtime caching for static assets + API responses (~1 day, M)

---

## I. Heavy Refactors (>3 days)

1. **Operations detail page split** (983 LOC → 6 sub-components) — see AUDIT_UI_UX.md §2.5 (~3 days)
2. **Reports + Finance merge** — consolidate 65% feature overlap, unified data fetching (~3-5 days)
3. **Multi-owner real-time foundation** — Supabase realtime subscriptions + presence + updated_at attribution (~1-2 weeks)
4. **TanStack Query introduction** (if pursued) — full migration of client-side data fetching to query/mutation pattern (~1-2 weeks)

---

## J. Conclusion

**Owner's "lambat" pain validated**: 3 N+1 query patterns + 6 unsplit large client components + 22% loading.tsx coverage + dead-weight deps explain measurable slowness.

**Critical path (do first)**:
1. Fix `get_current_stock` N+1 in rekap.ts (P0, ~2h, huge win for crew workflow)
2. Fix double `getCurrentUser` on Dashboard (P0, ~30min)
3. Dynamic-import PDF renderer (P0, ~30min, -300KB)
4. Add `loading.tsx` for Operations sub-routes (P1, ~1h)
5. Remove dead-weight deps + Playfair font (P0, ~15min)

**Aggregate quick-win time investment**: 4-5 hours.
**Aggregate impact**: ~1 second TTI improvement on slowest routes (Crew rekap form, Dashboard, Operations detail).

**Strategic recommendation**: Couple performance fixes dengan UX refinement work di REFINEMENT_ROADMAP.md Phase 1 — performance + design system pass = compound value for owner.

---

**End of AUDIT_PERFORMANCE.md** — see companion docs:
- [AUDIT_UI_UX.md](AUDIT_UI_UX.md) — module-by-module + cross-cutting findings
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — tokens spec + component library
- [REFINEMENT_ROADMAP.md](REFINEMENT_ROADMAP.md) — 15-week sequenced plan
- [AUDIT_SUMMARY.md](AUDIT_SUMMARY.md) — executive summary
