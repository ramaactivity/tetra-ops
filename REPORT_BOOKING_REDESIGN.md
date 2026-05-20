# REPORT — Booking Form Redesign

**Tanggal**: 2026-05-20
**Status**: Phase 0 design + planning
**Branch**: `main`
**Files in scope**: `src/components/booking/booking-form.tsx` (2575 LOC), `src/app/(owner)/operations/{new,[projectId]/edit}/page.tsx`

---

## 1. Current State Audit

### Structure
Single file, 2575 LOC, 11 numbered sections rendered linearly:

| # | Title | LOC range (~) | Notes |
|---|-------|---------------|-------|
| 1 | Sumber Booking | 879-902 | Channel radio (Direct/Vendor/Relasi) |
| 2 | Direferensikan oleh Vendor / Relasi | 907-1336 | Conditional (when channel = vendor/relasi). Contains vendor combobox, PIC, contact, **commission scheme** (mode + value + live preview) |
| 3 | Tipe Acara | 1337-1427 | Event category + sub-fields (wedding=groom/bride, etc) + auto-derived client name |
| 4 | Jadwal | 1428-1524 | Date + time picker (start) → auto-fill setup (-1h) + end (+duration) |
| 5 | Service & Paket | 1525-1609 | Service type + frame size + package picker (combobox) |
| 6 | Customization | 1610-1718 | Backdrop picker + flashdisk include checkbox + vendor decor markup |
| 7 | Lokasi Event | 1719-1872 | Venue name + address + city + province + Google Maps link |
| 8 | Kontak | 1873-2044 | Booker name + client name (auto-derived editable) + client WA + email + PIC name + PIC WA |
| 9 | Add-ons | 2045-2125 | Flat list per addon, qty input, 5 sub-categories (Voucher/Print/Time/Experience/Costume) rendered identik |
| 10 | Bonus | 2126-2258 | Item gratis untuk klien dari addon list + notes |
| 11 | Financial | 2259-2377 | Base price (auto-fill from package) + discount + gross-up PPh + discount type |
| — | Sticky Footer | 2378-2413 | Grand total inline + Cancel + Save button |

### Observations

**Strengths to preserve**:
- Sticky bottom with grand total + breakdown
- Conditional rendering (vendor section appears only when channel=vendor)
- Auto-fill logic (package → base_price + end_time; category → client_name; backdrop → vendor_decor_markup behavior)
- Validation feedback via `state.errors`
- Save popup overlay (kind: saving/success/error) — keep
- TimePicker / DatePicker primitives from `@/components/ui/*` — keep
- Vendor commission live preview card (just shipped) — keep, polish

**Weaknesses to fix**:
- Layout single-column wastes horizontal space ≥1024px
- Eye travel jauh banget — section 11 di bawah, summary di bottom, jumlah scroll banyak
- Helper text 2-3 baris setiap field → noisy
- Add-ons flat — 5 kategori rendered identik (no grouping)
- Time picker dual number input (existing TimePicker primitive is OK, but layout cramped)
- Grand Total footer minimal — tidak ada breakdown per-line item visible
- No section completion indicator → user gak tau apa yang belum diisi sampai submit
- 11 numbered sections terlalu banyak → tidak ada chunking visual

### Critical constraints (per task)
- ❌ JANGAN ubah business logic (pricing calc, vendor commission, journal entries)
- ❌ JANGAN ubah server actions (`createBooking`, `updateBooking`)
- ❌ JANGAN multi-step wizard
- ❌ JANGAN modal/drawer
- ❌ JANGAN tabs replace sections
- ✅ Reuse design system primitives (Button, Badge, Combobox, DatePicker, TimePicker)
- ✅ Two-column desktop, sticky right panel
- ✅ Single col mobile (existing)
- ✅ Section jump nav
- ✅ Atomic commits per cluster

---

## 2. Target Design

### 2.1 Cluster Mapping (11 → 4 clusters)

| Cluster | Title | Contains | Replaces sections |
|---------|-------|----------|-------------------|
| A | **Source & Vendor** | Channel + (conditional Vendor/Relasi referrer + commission scheme) | §1 + §2 |
| B | **Event Details** | Event category + client name + schedule (date + setup + start + end) + venue location | §3 + §4 + §7 |
| C | **Service Package** | Service type + frame size + package + customization (backdrop + flashdisk) + add-ons + bonus | §5 + §6 + §9 + §10 |
| D | **Contact & Pricing** | Booker + client contacts + PIC + financial (base + discount + gross-up) + catatan crew | §8 + §11 |

### 2.2 Layout

**Desktop (≥1024px)**: 2-column grid
```
┌──────────────────────────────────────────────────────────┐
│ Page Header (Edit: Rika & Hendra · PRJ-...)             │
├──────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┬─────────────────────┐  │
│ │ Cluster A: Source & Vendor   │ EVENT               │  │
│ │ [section card]               │ 24 Mei · 11:00-14:00│  │
│ │                              │ Grand Savero · Bogor│  │
│ ├──────────────────────────────┤                     │  │
│ │ Cluster B: Event Details     │ KLIEN               │  │
│ │ [section card]               │ Rika & Hendra       │  │
│ │                              │ PIC: Nisa           │  │
│ ├──────────────────────────────┤                     │  │
│ │ Cluster C: Service Package   │ PRICING             │  │
│ │ [section card]               │ Base    Rp 2.000.000│  │
│ │                              │ Discount −Rp 500.000│  │
│ │                              │ Add-ons    Rp 0     │  │
│ ├──────────────────────────────┤ ─────────────────── │  │
│ │ Cluster D: Contact & Pricing │ Grand    Rp 1.500K  │  │
│ │ [section card]               │                     │  │
│ │                              │ VENDOR              │  │
│ │                              │ Tetra terima Rp 1.5M│  │
│ │                              │                     │  │
│ │                              │ ✓ Source            │  │
│ │                              │ ✓ Event             │  │
│ │                              │ ✓ Service           │  │
│ │                              │ ! Contact (1 issue) │  │
│ │                              │                     │  │
│ │                              │ [Save changes]      │  │
│ │                              │ [Cancel]            │  │
│ └──────────────────────────────┴─────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Grid: `grid-cols-[minmax(0,1fr)_minmax(280px,360px)]` on lg, `gap-6`. Summary panel `sticky top-4` inside its column, full height.

**Mobile (<768px)**: single column + existing sticky footer. Summary panel di-collapse → existing sticky bottom bar pattern (preserve).

**Tablet (768-1024)**: single column, sticky bottom (same as mobile but with slightly more breathing room).

### 2.3 Section Card (replaces inline Section component)

Each cluster wrapped in a card:

```tsx
<ClusterCard id="source-vendor" title="Source & Vendor" icon={...}>
  {/* fields */}
</ClusterCard>
```

Visual: `rounded-lg border border-border-default bg-card p-6 space-y-5`. Heading uses `text-fluid-h2` semibold tracking-tight, description optional smaller muted line below. Anchor target via `id` for jump nav.

### 2.4 Section Jump Nav (NEW)

Sticky inside summary panel (top), or floating left rail on desktop. Each entry shows:
- Icon + label
- Completion state: `✓` (filled OK) / `!` (has error) / `·` (empty/incomplete)
- Click → scroll to section

Implementation: 4 entries. Completion derived from state (e.g., A: channel set; B: category + date + venue; C: service_type + package + ≥0 addons; D: client_wa + base_price).

```tsx
<SectionNav>
  <NavItem href="#source-vendor" status="ok" label="Source & Vendor" />
  <NavItem href="#event-details" status="ok" label="Event Details" />
  <NavItem href="#service-package" status="empty" label="Service Package" />
  <NavItem href="#contact-pricing" status="error" label="Contact & Pricing" errors={2} />
</SectionNav>
```

### 2.5 Summary Panel (Sticky Right, NEW)

```
EVENT
24 Mei 2026 · 11:00–14:00
Grand Savero · Bogor

KLIEN
Rika & Hendra
PIC: Nisa (08...)

PRICING
Base price          Rp 2.000.000
Discount            – Rp 500.000
Gross-up PPh         + Rp 0
Add-ons              + Rp 0
─────────────────────────────────
Grand Total         Rp 1.500.000

VENDOR CUT
Potongan: − Rp 500.000
Tetra terima: Rp 1.500.000

PROGRESS
✓ Source & Vendor
✓ Event Details
✓ Service Package
· Contact & Pricing

[ Save changes ]    primary
[ Cancel ]          ghost
```

Logic:
- Render only if respective sections have data (e.g., "EVENT" block hidden if no date set)
- "VENDOR CUT" block only shown if channel=vendor; adapts to mode (commission % shows "Komisi 10% = Rp X" / commission flat shows "Komisi Rp X" / upfront_cut shows "Potongan: − Rp X / Tetra terima Rp Y")
- "PROGRESS" derived from same state logic as SectionNav
- Save button disabled while pending; "Save changes" text from `submitLabel` prop

### 2.6 Component polish (cross-cluster)

**Radio cards** (channel, commission mode, value type, discount type):
- Standardize on existing pattern from vendor form (ModeOption-like)
- Selected: `border-primary bg-primary/5`, radio dot top-left
- Hover: `hover:border-border-strong hover:bg-secondary/40`
- Title + description in same component

**Time inputs**: existing TimePicker primitive sudah fine — visual layout: date (full width) + time picker trio (setup/start/end) in 3-col grid on md+, stacked on mobile.

**Add-ons**: group by category. Each category collapsible (default closed except categories with selected items). Per addon: checkbox + name + price + qty stepper (only when checked).

**Helper text**: keep critical inline; default behavior tidak diubah (sudah subtle dengan `text-fluid-caption text-muted-foreground`). Akan polish per field — banyak yang bisa di-shorten atau dihilangkan kalau redundant.

### 2.7 File Plan

```
src/components/booking/
├── booking-form.tsx           ← shell + state owner (~600 LOC, was 2575)
├── _shared/
│   ├── form-primitives.tsx    ← Field, ClusterCard, RadioCard, CheckboxCard helpers
│   ├── section-nav.tsx        ← jump nav + status indicators
│   └── summary-panel.tsx      ← sticky right panel
├── sections/
│   ├── source-vendor.tsx      ← Cluster A
│   ├── event-details.tsx      ← Cluster B
│   ├── service-package.tsx    ← Cluster C
│   └── contact-pricing.tsx    ← Cluster D
└── (existing other files: assign-crew-form.tsx, etc — untouched)
```

State management: BookingForm root retains ALL useState (state ownership single source). Sections receive props from root + setter callbacks. This avoids:
- Context overhead (~30 state hooks would be unwieldy)
- Premature abstraction
- Server action prop drilling

Sections are pure presentation + event handlers; root owns logic.

### 2.8 Component Contracts (TypeScript signatures)

```tsx
// _shared/form-primitives.tsx
interface ClusterCardProps {
  id: string;            // anchor target
  title: string;
  description?: string;
  icon?: LucideIcon;
  status?: "ok" | "error" | "empty";
  children: React.ReactNode;
}

interface RadioCardProps {
  name: string;          // radio group name (form submit)
  value: string;
  label: string;
  description?: string;
  checked: boolean;
  onSelect: () => void;
}

interface CheckboxCardProps {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  priceLabel?: string;   // right-aligned, e.g. "Rp 250.000"
}

// _shared/section-nav.tsx
type SectionStatus = "ok" | "error" | "empty";

interface NavItem {
  id: string;
  label: string;
  status: SectionStatus;
  issueCount?: number;
}

// _shared/summary-panel.tsx
interface SummaryProps {
  eventDate?: string;
  eventTime?: string;
  venue?: { name: string; city: string };
  clientName?: string;
  picName?: string;
  picContact?: string;
  basePrice: number;
  addonsTotal: number;
  discount: number;
  grossUp: number;
  grandTotal: number;
  vendor?: { mode: string; valueType: string; value: number };
  navItems: NavItem[];
  pending: boolean;
  submitLabel: string;
  onSubmit: () => void;
}
```

### 2.9 Validation Strategy

Sections show inline errors as before (via `err()` helper). New: sectionNav aggregates `Boolean(err("vendor_name"))` etc untuk show `!` indicator.

Section completion logic (lazy, computed per render):
```tsx
const sectionStatus = useMemo(() => ({
  "source-vendor":
    !channel ? "empty" :
    channel === "vendor" && !vendorName ? "empty" :
    "ok",
  "event-details":
    !eventCategory ? "empty" :
    !eventDate || !startTime ? "empty" :
    !venueName ? "empty" :
    "ok",
  // ...
}), [channel, vendorName, eventCategory, eventDate, ...]);
```

Server-side errors override → status="error".

### 2.10 Anti-patterns Avoided

- ❌ No multi-step wizard
- ❌ No modal/drawer
- ❌ No tabs replacing sections
- ❌ No custom radio replace shadcn — using existing primitives styled per design system
- ❌ No purple gradient / generic AI aesthetic
- ❌ No business logic refactor — calculation paths untouched
- ❌ No server action change

---

## 3. Implementation Plan

### Atomic commits (5-6 expected)

| # | Title | Files |
|---|-------|-------|
| 1 | Form primitives extracted to `_shared/` | new `_shared/form-primitives.tsx`, booking-form.tsx imports |
| 2 | Cluster A: Source & Vendor extracted | new `sections/source-vendor.tsx`, booking-form.tsx replaces inline |
| 3 | Cluster B: Event Details extracted | new `sections/event-details.tsx`, ... |
| 4 | Cluster C: Service Package extracted | new `sections/service-package.tsx`, ... |
| 5 | Cluster D: Contact & Pricing extracted | new `sections/contact-pricing.tsx`, ... |
| 6 | Layout shell: grid + summary panel + section nav | `_shared/summary-panel.tsx`, `_shared/section-nav.tsx`, booking-form.tsx shell |

Each commit:
- typecheck `npx tsc --noEmit`
- `npx next build` smoke check (ensure no "use server" leak / Server Components issue)
- atomic, can roll back individually

### Risk register

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| State coupling breaks when split into sections | Medium | Keep all `useState` in root; pass props down |
| Validation `err()` breaks across boundaries | Medium | Pass `err`, `get`, `stateValues` as props |
| TimePicker / DatePicker / Combobox state drift | Low | Pure controlled components, no internal sync |
| Server action `useActionState` lost | Low | Stay in root; sections receive snapshot props |
| Sticky panel breaks on mobile | Medium | CSS media query, mobile keeps existing footer |
| Grand total recalc lag | Low | useMemo already in place |
| Edit (existing event) defaults break | Medium | Test edit page after each commit |

### Smoke test checklist (per commit + final)

- [ ] New booking — Direct channel
- [ ] New booking — Vendor channel (commission + percent)
- [ ] New booking — Vendor channel (commission + flat)
- [ ] New booking — Vendor channel (upfront_cut)
- [ ] New booking — Relasi channel
- [ ] Edit existing event — vendor data ter-load
- [ ] Edit existing event — commission mode ter-load + tampil benar
- [ ] Calculation: base_price + addons - discount + gross_up = grand_total
- [ ] Mobile viewport 375px — single col, sticky footer works
- [ ] Tablet 768px — single col
- [ ] Desktop 1280px — 2-col, summary panel sticky right
- [ ] Section nav jump scroll works
- [ ] Section status indicators reflect state
- [ ] Save changes pushes to server, redirects correctly
- [ ] Validation errors displayed inline + aggregated in nav
- [ ] No TypeScript errors
- [ ] `next build` passes

---

## 4. Implementation Log

### Session 1 — 2026-05-20 — Layout shell + summary panel (visible UX win)

Strategy shift: rather than full cluster extraction up-front (high risk
on 2575 LOC), land the **layout shell + summary panel** first to ship
visible UX value. Cluster extraction follows in subsequent sessions
with lower risk per step.

#### Commit 1 — `6afd5fd` — Scaffold primitives
- New `src/components/booking/_shared/cluster-card.tsx` — container
  primitive (anchor id + optional status badge), ready for use when
  cluster extraction lands
- New `src/components/booking/_shared/section-nav.tsx` — vertical
  jump nav with status icons (ok ✓ / error ! / empty ·) +
  optional issue count
- New `src/components/booking/_shared/summary-panel.tsx` — sticky
  right rail with Event / Klien / Pricing / Vendor blocks +
  embedded SectionNav + save action
- Pure additive — no impact on existing form. Files: 3 new.

#### Commit 2 — `9e34a54` — Wire layout shell into booking-form.tsx
- booking-form.tsx wraps form in `grid lg:grid-cols-[1fr_320px]`
- SummaryPanel rendered as second column on `≥lg` only
- form gains `id="booking-form"` so external submit button can target
- Existing sticky bottom bar gains `lg:hidden` (mobile/tablet keep
  current pattern)
- 4 scroll anchors added (`#cluster-source` before §1,
  `#cluster-event` before §3, `#cluster-service` before §5,
  `#cluster-contact` before §8)
- Derived state computed via useMemo:
  - `eventDateLabel`: "24 Mei 2026" Indonesian locale
  - `eventTimeRange`: "11:00–14:00"
  - `vendorCommissionAmount`: mirrors server-side compute (commission
    percent/flat + upfront_cut all 3 cases)
  - `navItems`: 4 cluster statuses derived from state + server errors
- `handleCancel` callback for SummaryPanel
- Zero business logic touched; pure presentation restructure

### Pending sessions

- Cluster extraction proper — move sections into typed cluster
  components (sections/source-vendor.tsx etc.)
- Wrap existing sections in ClusterCard visual containers (one
  cluster per commit, atomic)
- Radio card polish — channel selector + discount type using same
  pattern as vendor mode picker (already polished)
- Add-ons grouped by category (collapsible accordions, default
  closed unless items selected)
- Helper text trim — many "Default 10%. Override kalau ada nego."
  → hover-icon tooltip pattern
- Time picker visual upgrade — single time input with 15-min
  increment shortcuts (existing TimePicker primitive may already
  support; verify)
- Mobile sticky summary collapsible (current sticky footer OK as
  fallback)

---

## 5. Before / After Comparison

### Session 1 (Layout shell)

#### LOC delta
| File | Before | After | Delta |
|------|--------|-------|-------|
| booking-form.tsx | 2575 | 2735 | +160 (derived state + summary panel wiring) |
| _shared/cluster-card.tsx | 0 | 99 | new |
| _shared/section-nav.tsx | 0 | 78 | new |
| _shared/summary-panel.tsx | 0 | 240 | new |
| REPORT_BOOKING_REDESIGN.md | 0 | this doc | new |

booking-form.tsx will SHRINK in subsequent commits as sections extract
out. Expected target: ~600 LOC root + ~200-400 LOC per section file.

#### Visible UX delta
- Desktop ≥lg: 2-column layout, sticky right summary with live
  pricing breakdown + section nav + save action
- Tablet & mobile: unchanged (existing sticky bottom save bar)
- Click "Source & Vendor" / "Event Details" / etc in summary nav →
  smooth scroll to section
- Summary updates live as user fills fields (date, venue, base price,
  add-ons, discount, vendor commission, etc.)
- Vendor block in summary shows commission preview based on mode:
  - commission % / flat: "Komisi vendor (10%) Rp X"
  - upfront_cut: "− Rp X" + "Tetra terima Rp Y"

#### Side effects
- form id="booking-form" added — external submit button (in
  SummaryPanel) can submit it via `form="..."` HTML attribute
- Existing sticky bottom bar still works on tablet/mobile; hidden
  on ≥lg
- No functional regression — typecheck + build clean per commit
- No new dependencies, no new icons (uses existing lucide-react)
- Vercel auto-deploy: each commit individually deployable

#### Files NOT touched (preserved)
- `src/lib/actions/bookings.ts` — server action unchanged
- `src/components/ui/*` — primitives unchanged
- `src/app/(owner)/operations/{new,[projectId]/edit}/page.tsx` —
  unchanged (no prop shape shift)
- Existing `Section` + `Field` helpers at bottom of booking-form.tsx —
  preserved; cluster card visual upgrade is opt-in for future commits

### Smoke test (Session 1 — manual)

To run after Vercel auto-deploy completes:

- [ ] **Desktop ≥1024px**: `/operations/PRJ-...-/edit` shows summary panel
      on right; saving via summary's "Save changes" submits form
- [ ] **Tablet 768-1023px**: single column form; sticky bottom save
      bar visible (summary panel hidden)
- [ ] **Mobile <768px**: single column form; sticky bottom save bar
- [ ] **Section nav**: click "Sumber & Vendor" → page scrolls to §1
- [ ] **Section nav**: click "Event Details" → scrolls to §3
- [ ] **Section nav**: click "Service Package" → scrolls to §5
- [ ] **Section nav**: click "Contact & Pricing" → scrolls to §8
- [ ] **Live summary**:
  - Set event date → summary "Event" block shows formatted date
  - Set venue → summary shows venue name + city
  - Set client name → summary shows
  - Pick package → summary shows base price → grand total updates
  - Edit discount → summary updates breakdown
  - Switch channel to Vendor + pick existing vendor → summary
    "Vendor" block appears with commission info
- [ ] **Section status icons**: empty fields show `·`; required-error
      after submit shows `!` with count
- [ ] **Both save buttons functional**: summary panel "Save changes"
      AND mobile sticky "Save changes" both submit form correctly
- [ ] **Existing flows preserved**:
  - New booking direct channel → submit OK
  - New booking vendor commission % → submit OK
  - New booking vendor commission flat → submit OK
  - New booking vendor upfront_cut → submit OK
  - Edit existing event → values load, submit updates
  - Calculation correctness: base + addons - discount + gross-up
    matches summary panel + form footer + DB

### Continuation plan

Next session should focus on:
1. **Cluster A extraction** — move sections 1+2 (Source & Vendor)
   into `sections/source-vendor.tsx` wrapped in ClusterCard. Pass
   state via props. Atomic commit.
2. **Cluster B extraction** — sections 3+4 (Event + Schedule).
   Defer §7 (Lokasi) decision: either reorder it earlier (into B) or
   create separate "Location" cluster.
3. Continue clusters C and D similarly.
4. After all clusters extracted: polish individual radio/checkbox
   cards using shared primitives.
5. Last: add-ons accordion grouping by category.

---

**End of REPORT_BOOKING_REDESIGN.md** — updated 2026-05-20 (Session 1
shipped commits `6afd5fd` + `9e34a54`).
