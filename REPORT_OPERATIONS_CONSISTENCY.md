# Operations Cluster — Visual Hierarchy Consistency Plan

**Tanggal:** 2026-05-20
**Status:** **Phase 0 + Phase 1 shipped.** Phase 2 (per-route) + Phase 3 (reference polish) pending.
**Branch:** `main` (atomic commits per phase step)
**Scope:** semua sub-page di `/operations/*` harus pakai pattern yang sama

---

## 0. Shipped log (2026-05-20)

| Phase | Commit | Topic |
| ----- | ------ | ----- |
| Pre-Phase 0 | `d020272` | TimePicker revert: native input[type=time] → custom Popover w/ 2-col scroll + preset chips + keyboard nav |
| 0.1 | `681baea` | SectionCard primitive (alias of CollapsibleCard) |
| 0.2 | `8a47dc4` | PageHeader primitive |
| 0.3 | `1efe32a` | MetaBadge primitive |
| 0.4 | `1511270` | FieldGrid primitive (label-LEFT 4-col / value-RIGHT 8-col) |
| 0.5 | `ba1959c` | KpiRow primitive (4-col wrapper for KpiCard) |
| 0.6 | `38a143c` | SummaryRail (rename + move + width preset 280/320) |
| 1.1 | `fd4066a` | Container `wide`→`xl` (drop `wide` variant) + rail 280 |
| 1.2 | `35f51a3` | PageHeader at /operations/new + /operations/[projectId]/edit |
| 1.3 | `d61a0f9` | Section helper → SectionCard wrap (11 callsites, eyebrow preserved as title) |
| 1.4a | `cea1eac` | FieldGrid migration — Cluster A (Sumber + Vendor) |
| 1.4b | `00ad0d3` | FieldGrid migration — Cluster B (Event Details) |
| 1.4c | `24263ce` | FieldGrid migration — Cluster C (Service Package) |
| 1.4d | `442f15b` | FieldGrid migration — Cluster D (Contact + Pricing) |
| 1.5 | `b60602c` | SummaryPanel import → SummaryRail + per-cluster issueCount aggregate |
| 1.6 | `2cbee87` | loading.tsx mirrors SectionCard + FieldGrid skeletons |
| 1.7 | `4d97674` | Cleanup: cluster-card.tsx dead code removed |
| Addendum | `067725e` | All booking-form selects → searchable Combobox (8 callsites, `allowFreeText={false}`) |

**Build status post-push:** `npx tsc --noEmit` + `npx next build` clean. Live on Vercel.

### Cross-cutting rules locked in along the way

- **No native browser controls in user-facing surfaces.** Audited inventory:
  - `<input type="time">` — was the only offender, reverted in `d020272`.
  - `<NativeSelect>` — misleading name; internally uses shadcn `<Select>` (Radix). Acceptable, but per the searchable-dropdown rule below we further swapped all booking-form callsites to `<Combobox>`.
  - `<DatePicker>` — already custom Popover-based calendar.
  - `<input type="file">` — kept (file picker can't be replaced without a native browser API; wrapped behind `<FileDrop>` / upload buttons).
- **All dropdowns must be searchable.** `<Combobox allowFreeText={false}>` is the canonical replacement for `<NativeSelect>` when typing-to-filter is desirable (every booking-form dropdown). When the option list is fixed and short *and* there's no benefit to filtering (e.g. a true binary toggle), `<NativeSelect>` is still acceptable.
- **Container size for the Operations cluster is `xl`** (max-w-7xl = 1280px). The temporary `wide` variant (max-w-[1600px]) was reverted; do not reintroduce.
- **SummaryRail width:** `"sm"` (280px) for the booking form, `"md"` (320px) for content-richer rails (payments, rekap) when Phase 2 lands.

---

## 1. Reference pages (jangan diubah strukturnya)

| Route | Peran | Apa yang dijadikan pattern |
| ----- | ----- | -------------------------- |
| [/operations](src/app/(owner)/operations/page.tsx) | List view full-width, KPI row + filter bar + dense table | KpiRow (4-col), FilterBar inline 40px, info-dense rows |
| [/operations/[projectId]](src/app/(owner)/operations/[projectId]/page.tsx) | Project detail collapsible | PageHeader + meta inline + `<CollapsibleCard>` body w/ label-left content-right |

Catatan: kedua page ini jadi reference visual, **tapi user flag mereka juga masih perlu enhancement/polish ringan** (di luar scope booking refactor — taruh di Phase 3 sebagai light-touch sweep).

---

## 2. Operations cluster primitives (`src/components/operations/_shared/`)

Shipped state. All primitives live in `src/components/operations/_shared/` and are the canonical entry point for any operations sub-page.

| Primitive | File | Status | Notes |
| --------- | ---- | ------ | ----- |
| `SectionCard` | [section-card.tsx](src/components/operations/_shared/section-card.tsx) | ✅ shipped (`681baea`) | Re-export of `<CollapsibleCard>`. Project-detail keeps its direct `<CollapsibleCard>` imports; new operations sub-pages should use `SectionCard` instead. |
| `PageHeader` | [page-header.tsx](src/components/operations/_shared/page-header.tsx) | ✅ shipped (`8a47dc4`) | Slots: `title`, `backHref`/`backLabel`, `meta` (ReactNode), `description`, `actions`. |
| `MetaBadge` | [meta-badge.tsx](src/components/operations/_shared/meta-badge.tsx) | ✅ shipped (`1efe32a`) | Composes monospace ID + `<EventStatusBadge>` + `<PaymentStatusBadge>` + tag chips + `extra` slot. Wraps existing badges; no new badge primitives. |
| `FieldGrid` + `FieldGrid.Row` | [field-grid.tsx](src/components/operations/_shared/field-grid.tsx) | ✅ shipped (`1511270`) | Outer = row stack (`gap-y-4` default). Row = `md:grid-cols-12` with label `col-span-4` and value `col-span-8`. Tooltip ⓘ inline next to label. Stacks (label on top) at `<md`. |
| `KpiRow` | [kpi-row.tsx](src/components/operations/_shared/kpi-row.tsx) | ✅ shipped (`ba1959c`) | `<dl>` wrapper, `gap-3` `sm:grid-cols-2` `lg:grid-cols-4`. Compose with `<KpiCard>` children. |
| `SummaryRail` | [summary-rail.tsx](src/components/operations/_shared/summary-rail.tsx) | ✅ shipped (`38a143c`) | Width preset `"sm"` (280px) / `"md"` (320px). Surfaces event timeline, klien, pricing (with optional addon line breakdown), vendor block, `<SectionNav>` (consumes `issueCount` per item from caller), save + cancel actions. |
| `FilterBar` | _not extracted_ | ⏳ deferred to Phase 2/3 | 3 ad-hoc variants live in [operations/filter-bar.tsx](src/components/operations/filter-bar.tsx), [billing/billing-filter-bar.tsx](src/components/billing/billing-filter-bar.tsx), [audit-log/audit-filter-bar.tsx](src/components/audit-log/audit-filter-bar.tsx). Consolidate when Phase 2 (rekap, payments) needs them. |

---

## 3. Re-alignment ke booking form — final state (post-`067725e`)

| Subject | Final state |
| ------- | ----------- |
| Eyebrow `01 · SUMBER BOOKING` | ✅ KEEP — rendered as `SectionCard` title (styled markup). |
| Time picker | ✅ Custom `<TimePicker>` (Popover + 2-col scroll + preset chips + keyboard nav). Native `input[type=time]` reverted. |
| Helper text → tooltip ⓘ | ✅ KEEP — `<HelpTooltip>` next to label. |
| Add-on rows | ✅ KEEP — auto-fill grid (`xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]`), no label truncate. |
| SummaryPanel mini-timeline + addon breakdown | ✅ KEEP — now exported as `<SummaryRail>` with `width="sm"` (280px). |
| Container | ✅ `size="xl"` (1280px) across operations cluster. `wide` variant removed. |
| Form grid | ✅ `lg:grid-cols-[minmax(0,1fr)_280px]`. No `xl:` breakpoint variant. |
| `<Field>` layout | ✅ Dual-mode via `layoutMode` prop. Solo fields use `"grid"` (label-LEFT, routed through `<FieldGrid.Row>`). Paired wrappers (`md:grid-cols-2`) keep `"stacked"` (label-on-top) per the spec's "ATAU full horizontal kalau short field" rule. |
| `<Section>` wrapper | ✅ Renders via `<SectionCard>` (collapsible). Eyebrow as title, description as subtitle. `defaultOpen` because booking is fill-all surface. |
| All `<NativeSelect>` in booking-form | ✅ Replaced with `<Combobox allowFreeText={false}>` — typing filters the list, click + keyboard nav both work. |
| ClusterCard direction | ❌ Dropped. `src/components/booking/_shared/cluster-card.tsx` removed (`4d97674`). The cluster anchor `<div id="cluster-source">` etc. remain — they're SectionNav scroll targets. |

---

## 4. Phase-by-phase plan

### Phase 0 — Extract shared primitives (1 commit per primitive)

Lokasi: `src/components/operations/_shared/`

| # | Commit topic | Notes |
| --- | ------------ | ----- |
| 0.1 | `_shared/section-card.tsx` | ✅ shipped (`681baea`) |
| 0.2 | `_shared/page-header.tsx` | ✅ shipped (`8a47dc4`) |
| 0.3 | `_shared/meta-badge.tsx` | ✅ shipped (`1efe32a`) |
| 0.4 | `_shared/field-grid.tsx` | ✅ shipped (`1511270`) |
| 0.5 | `_shared/kpi-row.tsx` | ✅ shipped (`ba1959c`) |
| 0.6 | `_shared/summary-rail.tsx` | ✅ shipped (`38a143c`) — back-compat shim at `booking/_shared/summary-panel.tsx` removed in Phase 1.5 (`b60602c`) |
| 0.7 | `_shared/filter-bar.tsx` | ⏳ deferred to Phase 2/3 |

**Phase 0 verification per commit:**
- `npx tsc --noEmit` lulus
- `npx next build` lulus
- Storybook/dev showcase route (`/dev/primitives/showcase.tsx`) di-update untuk render preview primitive baru

---

### Phase 1 — Apply primitives ke booking form (atomic per concern)

Target: `/operations/new` dan `/operations/[projectId]/edit` jadi konsisten visual dgn project-detail.

| # | Commit | Topic | Result |
| --- | ------ | ----- | ------ |
| 1.1 | `fd4066a` | Container `wide` → `xl` + rail 280 | `wide` variant deleted from container.tsx; booking pages on `Container size="xl"`; grid template `lg:grid-cols-[minmax(0,1fr)_280px]` (no xl variant). |
| 1.2 | `35f51a3` | `<PageHeader>` at /new + /edit | Ad-hoc `<Link>← + <h1>` replaced. Edit page surfaces project ID via `<MetaBadge>`. |
| 1.3 | `d61a0f9` | `<Section>` → `<SectionCard>` | All 11 booking sections wrapped. Eyebrow preserved as title (custom ReactNode). `defaultOpen` true everywhere (form is fill-all). |
| 1.4a | `cea1eac` | FieldGrid — Cluster A (Sumber + Vendor) | Solo fields flipped to `layoutMode="grid"`. Paired wrappers stay stacked. |
| 1.4b | `00ad0d3` | FieldGrid — Cluster B (Event Details) | §3 Tipe Acara, §7 Lokasi solo fields flipped. |
| 1.4c | `24263ce` | FieldGrid — Cluster C (Service Package) | §6 Customization solo fields flipped. §5 paired, §9-§10 use inline cards. |
| 1.4d | `442f15b` | FieldGrid — Cluster D (Contact + Pricing) | §11 Financial solo fields flipped. §8 + Discount paired stay stacked. |
| 1.5 | `b60602c` | `SummaryPanel` → `SummaryRail` + issueCount | Import path swap; `width="sm"`. navItems memo now emits per-cluster `issueCount` (sum of stateErrors keys), consumed by `<SectionNav>`'s existing badge slot. |
| 1.6 | `2cbee87` | `loading.tsx` mirrors new structure | SectionCard chrome (header row + chevron + hairline divider) + FieldGrid skeleton rows (label col-span-4 / value col-span-8) + rail 280px. |
| 1.7 | `4d97674` | Cleanup | `cluster-card.tsx` deleted. `ClusterStatus` type inlined into `section-nav.tsx`. Cluster anchor `<div id="cluster-*">` kept — they're SectionNav scroll targets. |
| Addendum | `067725e` | All booking-form `<NativeSelect>` → `<Combobox allowFreeText={false}>` | 8 callsites: Sales Channel, Kategori Event, Service Type, Frame Size, Package picker, Backdrop, Bonus picker, Tipe Diskon. Typing now filters the list; click + keyboard nav both preserved. |

**Phase 1 verification status:**
- ✅ TypeScript strict lulus per commit (`npx tsc --noEmit`)
- ✅ `npx next build` lulus pasca Phase 1.7 + Combobox addendum
- 🔄 Manual smoke per viewport (1280/1440/1920) — Vercel preview live di `tetra-ops.vercel.app/operations/new`. User-verified Combobox typing works; outstanding smoke items:
  - Confirm form col fills available width @1280 (target ~912px after sidebar + padding + rail)
  - Confirm SectionCard chevron collapse on each of 11 sections
  - Confirm `issueCount` badge appears in rail nav when server returns validation errors
  - Confirm TimePicker popover opens with preset chips + keyboard nav

---

### Phase 2 — Apply ke route lain di /operations/[id]/*

**Belum dikerjain. Per-route atomic batch — terpisah dari booking.**

| # | Route | Issue terbesar | Primitive yang dipakai |
| --- | ----- | -------------- | ---------------------- |
| 2.1 | [/operations/[id]/rekap](src/app/(owner)/operations/[projectId]/rekap/page.tsx) | "REKAP CREW · BELUM SUBMIT" badge konyol, dual banner kuning+biru noise, Cetak/Mediaset/Sleeve stacked | PageHeader (status pill "Belum Submit"), merge banner jadi 1 amber, SectionCard wrap Cetak (3-col grid Total+Mediaset+Sleeve dalam) + Item Terpakai + Pengeluaran Crew + Bukti, SummaryRail w/ profit preview + Settle button + stock warning |
| 2.2 | [/operations/[id]/payments](src/app/(owner)/operations/[projectId]/payments) | Belum di-audit detail | PageHeader, SectionCard untuk Payment History + Outstanding, SummaryRail (grand + paid + outstanding + send invoice) |
| 2.3 | [/operations/[id]/crew](src/app/(owner)/operations/[projectId]/crew) | Belum di-audit detail | PageHeader, SectionCard untuk Assigned Crew + Available Crew, SummaryRail (assignment progress + total fee) |
| 2.4 | [/operations/[id]/design](src/app/(owner)/operations/[projectId]/design) | Belum di-audit detail | PageHeader, SectionCard untuk Drive Folder + Asset Tracking, SummaryRail (coverage % + drive link + last update) |

**Catatan:** Phase 2 hanya bisa mulai setelah Phase 0 selesai (primitives ada di `_shared/`). Booking form (Phase 1) jadi proving ground untuk primitives — kalau ada masalah ergonomic FieldGrid/SectionCard, fix di Phase 1 dulu sebelum dorong ke route lain.

---

### Phase 3 — Reference page light-touch polish (deferred)

User flag: project-detail + operations-list pun masih perlu enhancement walau jadi reference.

Belum di-scope detail. Kandidat yang teridentifikasi dari screenshots:
- `/operations` — KPI row sudah OK; filter bar tinggi 40px udah konsisten; status pill column bisa lebih dense
- `/operations/[id]` — CollapsibleCard pattern sudah OK; opportunity di hero recap (top card) untuk align dengan PageHeader pattern (sekarang hybrid)

Plan terpisah, prioritas paling akhir.

---

## 5. Dependency graph (commit order)

```
0.1 SectionCard (alias) ──┐
0.2 PageHeader ───────────┤
0.3 MetaBadge ────────────┤
0.4 FieldGrid ────────────┼─► 1.1 width/grid ─► 1.2 PageHeader ─► 1.3 SectionCard ─► 1.4 FieldGrid ─► 1.5 SummaryRail ─► 1.6 loading.tsx ─► 1.7 cleanup
0.5 KpiRow ───────────────┤                                                                                                                         │
0.6 SummaryRail ──────────┘                                                                                                                         │
                                                                                                                                                    ▼
                                                                                                                                              Phase 2 (per route)
```

- 0.1-0.6 bisa landed paralel (no inter-dep).
- 1.1 harus dulu (foundation width fix).
- 1.2-1.5 sequential (saling tergantung di booking-form structure).
- 1.6 boleh paralel dengan 1.5.
- 1.7 last (dead-code cleanup).

---

## 6. Constraints (taken dari spec)

- ❌ Tidak ubah business logic (pricing calc, vendor commission, journal entries)
- ❌ Tidak ubah server actions (`createBooking`, `updateBooking`, settle, payment)
- ❌ Tidak duplicate components — ALL primitives di `_shared/`
- ✅ TypeScript strict, atomic commits per route/concern
- ✅ Viewport target verify: **1280 / 1440 / 1920** (full-width termanfaatkan, no whitespace >200px)
- ✅ Mobile (768): SummaryRail collapse jadi bottom sheet/hidden; SectionCard tetap kebaca

---

## 7. Verification matrix per route (Phase 1 booking saja)

| Check | 1280 | 1440 | 1920 | 1024 | 768 |
| ----- | ---- | ---- | ---- | ---- | --- |
| Sidebar 240px terlihat utuh | ✓ | ✓ | ✓ | ✓ | n/a (hidden) |
| Form col ≥560px | ✓ (~720px) | ✓ (~880px) | ✓ (~1360px) | ✓ (≥560px) | n/a (1-col) |
| SummaryRail 280px filled, no whitespace >200px | TBD | TBD | TBD | TBD | hidden |
| FieldGrid label-left layout | ✓ | ✓ | ✓ | ✓ | stacked |
| SectionCard collapsible chevron functional | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add-on auto-fill grid 2-col aktif | ✗ (xl only) | ✓ | ✓ | ✗ | ✗ |
| Tooltip ⓘ tidak ke-clip | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 8. Deliverable per phase

| Phase | Artifact | Status |
| ----- | -------- | ------ |
| 0 | `src/components/operations/_shared/` — 6-7 file | TODO |
| 1 | Booking-form + loading.tsx revised | TODO |
| 1 | REPORT_BOOKING_CONSISTENCY.md (sub-report) atau update REPORT_BOOKING_FIX.md dengan addendum | TODO |
| 2 | Per-route patches + REPORT_OPERATIONS_CONSISTENCY.md updated dengan before/after | TODO |
| 3 | Reference page polish (light) | Deferred |

---

## 9. Risk register

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| FieldGrid label-LEFT layout terlalu padat di field name panjang ("Nama Klien (final, akan tampil di event)") | Medium | Label cell `truncate` + tooltip-on-overflow; atau line-clamp-2 |
| SectionCard collapsed default → user ga sadar field belum diisi | Medium | Default open untuk cluster A-B (sumber + event); SummaryRail nav badge tunjukin error count per section |
| Container size revisi `wide`→`xl` keliatan kayak regression (form jadi lebih sempit dari yang baru di-deploy) | Low | Justify di commit message: konsistensi dgn project-detail reference. Vercel preview untuk cross-check sebelum merge. |
| Phase 0 primitive design diverge dari project-detail callsite → migrate jadi mahal | Medium | Phase 0.1 (SectionCard) alias-only — proof callsite migration smooth dulu sebelum bikin primitive baru. |
| Server action contract berubah accidentally | Low | Phase 1 cuma sentuh komponen presentasi + Container width. Server action import path tidak di-touch. |

---

**End of REPORT_OPERATIONS_CONSISTENCY.md** — superseding the cluster-extraction direction in [REPORT_BOOKING_REDESIGN.md](REPORT_BOOKING_REDESIGN.md) untuk segmen Phase 2 ke atas. Phase 1 (shipped commits 6afd5fd..6a5b299) masih valid sebagai foundation layer — yang berubah adalah arah refactor berikutnya: dari ClusterCard menjadi SectionCard + shared primitives.
