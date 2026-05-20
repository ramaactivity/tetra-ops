# DESIGN SYSTEM — Tetra Ops

**Audit date**: 2026-05-19 · **Last updated**: 2026-05-20 (operations consistency pass — see §2.1.1 + §4.7).
**Status**: **Active** — §2.1.1 Operations cluster primitives + §4.7 Form controls rule are shipped + enforced. Other sections remain proposal-level (synthesizes DESIGN.md + globals.css + audit findings).
**Relation to DESIGN.md**: This document **operationalizes** DESIGN.md aspirational tokens into concrete component API + migration guidance. DESIGN.md remains source of truth for aesthetic direction.
**Related docs**: [REPORT_OPERATIONS_CONSISTENCY.md](REPORT_OPERATIONS_CONSISTENCY.md) (per-route rollout plan + commit log), [REPORT_BOOKING_FIX.md](REPORT_BOOKING_FIX.md), [REPORT_BOOKING_REDESIGN.md](REPORT_BOOKING_REDESIGN.md).

---

## 0. Overview

Tetra Ops sudah punya design foundation strong: DESIGN.md spec lengkap, globals.css implement Vercel ink monochrome (#171717), legacy iris/crimson collapsed, gradient utilities silenced. Tapi audit menemukan 12 cross-cutting consistency issues (radius chaos, color violations, component duplication).

Doc ini propose:
1. **Design tokens** — final spec (extends DESIGN.md, removes ambiguity)
2. **Component library** — 30+ component contracts dengan TypeScript signatures
3. **Pattern library** — 10 reusable interaction patterns
4. **Do's and Don'ts** — concrete code examples
5. **Migration plan** — phased path dari current state ke this spec

**Non-goals**: Not a code implementation. All concrete components live di `src/components/`. This doc is the contract.

---

## 1. Design Tokens

### 1.1 Colors

#### Brand (Ink Monochrome)
```css
/* Single CTA color — used for every primary action */
--color-primary: #171717      /* Ink — Vercel near-black */
--color-primary-hover: #262626
--color-primary-pressed: #0a0a0a
--color-primary-foreground: #ffffff
```

#### Link & Info (Vercel Blue)
```css
/* Inline links + neutral information signals — NEVER as CTA fill */
--color-link: #0070f3
--color-link-deep: #0761d1
--color-link-soft: #d3e5ff
```

#### Surface Hierarchy (4-step)
```css
/* Light mode */
--surface-1: #ffffff   /* Card surface */
--surface-2: #ffffff   /* Default card — same as -1 */
--surface-3: #f5f5f5   /* Hover lift / inset region */
--surface-4: #ebebeb   /* Selected / deepest lift */
--background: #fafafa  /* Canvas-soft — page body */

/* Dark mode */
--surface-1: #171717   /* Card surface */
--surface-2: #171717   /* Default card */
--surface-3: #1f1f1f   /* Hover lift */
--surface-4: #2a2a2a   /* Selected */
--background: #0a0a0a  /* Near-black canvas */
```

#### Borders
```css
--border-subtle: #f0f0f0  (light) | #1f1f1f (dark)
--border-default: #ebebeb (light) | #2a2a2a (dark)
--border-strong: #a1a1a1  (light) | #404040 (dark)
```

#### Text
```css
--foreground: #171717        (light) | #ededed (dark)
--muted-foreground: #525252  (light) | #a1a1a1 (dark)
--text-tertiary: #737373     (light) | #737373 (dark) — for hint text
--text-disabled: #a1a1a1     (light) | #525252 (dark)
```

#### Semantic State Colors (Only Used for State, Never Decorative)
```css
--color-success: #10B981       /* Emerald 500 — paid, settled, approved */
--color-success-deep: #047857  /* Emerald 700 — pressed/strong */
--color-success-soft: rgba(16,185,129,0.10)

--color-warning: #f5a623       /* Vercel amber — pending review, low stock */
--color-warning-deep: #ab570a
--color-warning-soft: #ffefcf

--color-danger: #ee0000        /* Vercel red — error, overdue, destructive */
--color-danger-deep: #c50000
--color-danger-soft: #f7d4d6

--color-info: #0070f3          /* Vercel blue — info, neutral status */
--color-info-deep: #0761d1
--color-info-soft: rgba(0,112,243,0.10)
```

#### ❌ FORBIDDEN
- **Gradients**: Zero gradient tokens. Hierarchy carried via surface ladder + hairline + tone.
- **Second brand color**: No iris, crimson, teal, violet, indigo as decorative. Only ink + semantic state colors.
- **Hover transforms**: No `hover:translate-*` or `hover:scale-*`. Color change only.

### 1.2 Typography

#### Font Families
```css
--font-sans: var(--font-inter)              /* Body + headings */
--font-mono: var(--font-jetbrains-mono)     /* Numbers, IDs, eyebrows */
--font-heading: var(--font-inter)           /* Same as sans, larger weight */
/* --font-display: REMOVED — was Playfair, now Inter */
```

**Required CSS feature settings on body**:
```css
font-feature-settings: "ss01", "ss02", "cv11", "calt", "kern", "liga";
letter-spacing: -0.011em;
```

`ss01` + `ss02` enable Inter's geometric alternates (approximating Geist's voice). `cv11` keeps single-story 'a'. Mandatory.

#### Type Scale (Fluid)
```css
--text-fluid-caption:  clamp(0.6875rem, 0.66rem + 0.18vw, 0.75rem)   /* 11-12px */
--text-fluid-body:     clamp(0.8125rem, 0.78rem + 0.22vw, 1rem)      /* 13-16px */
--text-fluid-h3:       clamp(1rem, 0.94rem + 0.4vw, 1.25rem)         /* 16-20px */
--text-fluid-h2:       clamp(1.125rem, 1.04rem + 0.55vw, 1.5rem)     /* 18-24px */
--text-fluid-h1:       clamp(1.375rem, 1.1rem + 1.4vw, 2rem)         /* 22-32px */
--text-fluid-display:  clamp(1.75rem, 1.4rem + 1.8vw, 3rem)          /* 28-48px */
```

**Fixed-size utilities** (use sparingly, prefer fluid):
- `text-[11px]` — micro labels (only when fluid breaks layout)
- `text-[13px]` — button labels in-app
- `text-[16px]` — form input minimum (avoid iOS auto-zoom)

#### Semantic Type Classes
```css
.eyebrow {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.tabular {
  font-variant-numeric: tabular-nums slashed-zero;
  font-feature-settings: "tnum", "ss01", "ss02", "cv11";
}

.display-tight {
  letter-spacing: -0.04em;  /* For hero headlines and dashboard page titles */
}
```

#### Required Usage Rules
1. **All money + quantity values MUST use `.tabular` class** — non-negotiable
2. **All section/table eyebrows MUST use `.eyebrow` class** — no inline `font-mono text-[11px] uppercase tracking-[0.18em]`
3. **Form input font-size ≥ 16px on mobile** — avoid iOS auto-zoom (use `text-fluid-body` not `text-sm`)

### 1.3 Spacing

Base unit: **4px** (Vercel `--geist-space`).

```
--space-xxs:  4px     (0.25rem)
--space-xs:   8px     (0.5rem)
--space-sm:   12px    (0.75rem)
--space-md:   16px    (1rem)       ← default gap
--space-lg:   24px    (1.5rem)     ← section spacing
--space-xl:   32px    (2rem)
--space-2xl:  40px
--space-3xl:  48px
--space-4xl:  64px
--space-5xl:  96px
--space-6xl:  128px
```

**Tailwind equivalents**: `gap-3` (12px), `gap-4` (16px), `gap-6` (24px), `gap-8` (32px). Avoid `gap-5` (20px), `gap-7` (28px) — off-grid.

### 1.4 Radius (Two-Scale System)

```
--radius-sm:   4px    /* Sub-elements, small chips */
--radius-md:   6px    /* IN-APP DEFAULT — buttons, inputs, selects, badges */
--radius-lg:   8px    /* Cards, marketing chrome */
--radius-xl:   12px   /* Large card chrome */
--radius-2xl:  16px   /* Hero cards w/ image cap ONLY */
--radius-pill: 100px  /* Marketing CTAs ONLY — never in-app */
--radius-full: 9999px /* Status pills, circular avatars, icon buttons */
```

**Two-Scale Discipline**:
- In-app (buttons, inputs, badges): `--radius-md` (6px)
- Cards & elevated surfaces: `--radius-lg` (8px)
- That's it. `rounded-xl` and `rounded-2xl` should be rare exceptions, NOT defaults.

**❌ FORBIDDEN**:
- `rounded-2xl` in operational chrome (KPI tiles, action cards)
- `rounded-pill` outside marketing CTAs
- Mixing `rounded-xl` + `rounded-lg` in same component family

### 1.5 Shadows (Stacked, Vercel Pattern)

```css
--shadow-level-1: inset 0 0 0 1px rgb(0 0 0 / 0.08);
--shadow-level-2: 0 1px 1px rgb(0 0 0 / 0.02), 0 2px 2px rgb(0 0 0 / 0.04);
--shadow-level-3: 0 2px 2px rgb(0 0 0 / 0.04), 0 8px 8px -8px rgb(0 0 0 / 0.04);
--shadow-level-4: 0 2px 2px rgb(0 0 0 / 0.04), 0 8px 16px -4px rgb(0 0 0 / 0.04);
--shadow-level-5: 0 1px 1px rgb(0 0 0 / 0.02), 0 8px 16px -4px rgb(0 0 0 / 0.04), 0 24px 32px -8px rgb(0 0 0 / 0.06);
```

**Usage**:
- Level-1 (hairline inset): Default card baseline. No drop shadow.
- Level-2 (subtle drop): Template/list card on hover only
- Level-3 (soft stack): Feature card / popover
- Level-4 (float stack): Modal trigger / KPI hero
- Level-5 (modal): Dialog, dropdown

**❌ FORBIDDEN**:
- Tailwind defaults: `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl` — replace with `shadow-level-*`
- Heavy single drop (e.g., `0 8px 24px rgba(0,0,0,0.2)`)
- Glow tokens: `shadow-glow-*` (kept as no-op aliases for legacy callers; new code must NOT reference)

### 1.6 Motion

```css
--duration-fast: 120ms    /* Hover state changes, micro-interactions */
--duration-base: 200ms    /* Default for transitions */
--duration-slow: 320ms    /* Page transitions, drawer slide */

--ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1)    /* Default */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1)    /* Snappier */
--ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1) /* For springy success */
```

**Rules**:
- All transitions `transition-colors` — NEVER `transition-transform` on hover
- `:active { transform: scale(0.98) }` (press-down) acceptable on touch targets
- View Transitions API for page navigation (already wired via `next.config.ts experimental.viewTransition`)

### 1.7 Focus Ring
```css
:focus-visible {
  outline: solid 2px var(--ring);
  outline-offset: 2px;
}
--ring: #171717  /* Ink, not blue */
```

Consistent across all interactive elements. Don't introduce per-component focus customization.

---

## 2. Component Library

### 2.1 Layout Primitives

#### `<Container>` (shipped: [src/components/layout/container.tsx](src/components/layout/container.tsx))
```tsx
type ContainerProps = {
  size?: "sm" | "md" | "lg" | "xl" | "full";  // max-w-3xl | 5xl | 6xl | 7xl | none
  className?: string;
  children: ReactNode;
};
```
- Defaults to `size="md"` (max-w-5xl).
- **Operations cluster pages MUST use `size="xl"`** (max-w-7xl = 1280px). This includes `/operations`, `/operations/[id]` and every sub-route (`/new`, `/edit`, `/payments`, `/crew`, `/rekap`, `/design`).
- No `wide` (1600px) variant — that was tried during the booking-form layout pass and reverted (`fd4066a`); operations cluster reads more legibly at 1280px.
- Replaces ad-hoc `container mx-auto px-4` patterns.

### 2.1.1 Operations cluster primitives (`src/components/operations/_shared/`)

Anything that ships under `/operations/*` should compose these instead of hand-rolling header/section/field/rail markup. All seven primitives live in `src/components/operations/_shared/`.

#### `<PageHeader>` ([page-header.tsx](src/components/operations/_shared/page-header.tsx))
```tsx
type PageHeaderProps = {
  title: ReactNode;                  // h1 — 28/32px semibold, tight tracking
  backHref?: string;                 // Renders ← link in muted caption color
  backLabel?: string;                // Text after the chevron (e.g. "Operations")
  meta?: ReactNode;                  // Inline meta row directly under title — usually <MetaBadge>
  description?: ReactNode;           // Body-tone paragraph below meta
  actions?: ReactNode;               // Right-aligned button cluster
};
```
- Slots-based on purpose: callers compose what fits (project-detail surfaces channel + category + status; booking edit surfaces project ID; rekap will surface "Belum Submit" status pill).
- Title font sizing + tracking mirror `/operations/[projectId]` exactly.

#### `<SectionCard>` ([section-card.tsx](src/components/operations/_shared/section-card.tsx))
```tsx
// Alias re-export of <CollapsibleCard> from src/components/ui/collapsible-card.tsx
type SectionCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;                  // Pre-rendered element (e.g. <Sparkles className="size-4"/>)
  actions?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
};
```
- All sections of an operations sub-page should be `<SectionCard>` — booking form runs 11 cards in a single column; project-detail uses 5+ across two columns.
- `rounded-lg` + hairline `border-border-default` + hairline divider between header and body. **No `ring`, no heavy shadows.**
- Always collapsible (chevron at the right of the header). Pick `defaultOpen` based on screen intent: `true` for "fill all fields" surfaces (booking form), variable for "review" surfaces.
- Icons must be pre-rendered elements, not Lucide components — `<CollapsibleCard>` is a client component and can't serialize a raw component reference across the RSC boundary.

#### `<MetaBadge>` ([meta-badge.tsx](src/components/operations/_shared/meta-badge.tsx))
```tsx
type MetaBadgeProps = {
  projectId?: string;                // Renders as monospace muted text
  status?: string;                   // Routed to <EventStatusBadge>
  paymentStatus?: string;            // Routed to <PaymentStatusBadge>
  tags?: Array<{ label: string; tone?: "default" | "outline" | "warning" }>;
  extra?: ReactNode;                 // Ad-hoc badges (e.g. "Imported", "Migrated")
};
```
- Lives inside `<PageHeader meta={…}>`. Each segment is optional — render only what's relevant.
- Wraps existing `<EventStatusBadge>` / `<PaymentStatusBadge>` / `<Badge>`. **Do not introduce new badge primitives.**

#### `<FieldGrid>` + `<FieldGrid.Row>` ([field-grid.tsx](src/components/operations/_shared/field-grid.tsx))
```tsx
type FieldGridProps = {
  gap?: "tight" | "default";         // gap-y-3 | gap-y-4
  className?: string;
  children: ReactNode;               // <FieldGrid.Row> instances
};

type FieldGridRowProps = {
  label: ReactNode;
  name?: string;
  htmlFor?: string;
  hint?: string;
  tooltip?: string;                  // Inline ⓘ next to label, base-ui Tooltip popup
  error?: string;
  required?: boolean;
  labelAlign?: "start" | "center";   // "center" default; use "start" for textarea/multi-line values
  children: ReactNode;
};
```
- Desktop (≥md): label cell `col-span-4`, value cell `col-span-8` on a 12-col grid.
- Mobile (<md): stacks (label on top, value below) for legibility.
- **Paired short fields** (Tanggal + Jam, Setup + Selesai, Kota + Provinsi, Nama Pembooking + WA) keep label-on-top inside their `md:grid-cols-2` wrapper — `<FieldGrid.Row>`'s 4/8 split would force a too-narrow value cell. The spec calls this out explicitly: "ATAU full horizontal kalau short field."
- Helper / error message rendering: error wins over hint; tooltip is `<HelpTooltip>` inline at the label.

#### `<KpiRow>` ([kpi-row.tsx](src/components/operations/_shared/kpi-row.tsx))
```tsx
type KpiRowProps = {
  children: ReactNode;               // <KpiCard> children
  className?: string;
};
```
- Just the responsive `<dl>` wrapper: `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`. Pattern source is the `/operations` list page.
- Use with `<KpiCard>` (see §2.2). No new tile design.

#### `<SummaryRail>` ([summary-rail.tsx](src/components/operations/_shared/summary-rail.tsx))
```tsx
type SummaryRailProps = {
  // Event facts (each segment renders only when its data is present)
  eventDate?: string;
  eventTimeRange?: string;
  eventTimeline?: { setup?: string; start?: string; end?: string };
  venueName?: string;
  venueCity?: string;
  clientName?: string;
  picName?: string;
  picContact?: string;
  // Pricing
  basePrice: number;
  addonsTotal: number;
  addonLines?: Array<{ name: string; qty: number; total: number }>;
  backdropContribution: number;
  discount: number;
  grossUp: number;
  grandTotal: number;
  // Optional vendor block
  vendor?: { mode: "commission" | "upfront_cut"; valueType: "percent" | "flat"; value: number; amount: number };
  // Progress nav (<SectionNav> rendered when items.length > 0)
  navItems: NavItem[];
  // Save action
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  width?: "sm" | "md";               // "sm" = 280px (booking), "md" = 320px (payments, rekap)
};
```
- Sticky right rail at desktop ≥lg. Mobile/tablet should keep the page's existing sticky bottom save bar (the rail is `hidden lg:block` at the consumer level).
- `navItems` carries per-section `issueCount` — `<SectionNav>` renders the count as a badge so users can jump to the failing section.
- Submit button uses `form="booking-form"` to submit a form rendered outside the rail.

#### `<Stack>` / `<Inline>` — proposed, not shipped
```tsx
type StackProps = {
  gap?: "xs" | "sm" | "md" | "lg" | "xl";  // 8|12|16|24|32 px
  align?: "start" | "center" | "end" | "stretch";
  className?: string;
  children: ReactNode;
};
// <Inline> mirrors <Stack> but flows horizontally.
```
- **Status:** not built. Inline `flex flex-col gap-X` / `flex items-center gap-X` patterns are still ad-hoc across pages.
- **Why deferred:** the gap tokens already discipline spacing (every page uses `space-y-4` / `gap-3` consistently); promoting to a primitive would mostly be lint-cosmetics. Re-evaluate after the per-route Phase 2 work — if the same `<div className="flex flex-col gap-3">` shape recurs in 20+ places, build then.

### 2.2 Data Display

#### `<StatCard>` (canonical KPI tile — single source of truth)
```tsx
type StatCardProps = {
  label: string;                    // Mono uppercase eyebrow
  value: string | ReactNode;        // Tabular display-md
  hint?: ReactNode;                 // Body-sm
  icon?: LucideIcon;
  tone?: "default" | "positive" | "negative" | "warning";
  delta?: { value: string; tone?: Tone };
  href?: string;                    // If provided, renders as <Link> w/ focus ring
  className?: string;
};
```
- **Replaces**: local `KpiCard` di `reports/page.tsx:1133`, `hero-kpi-card.tsx` legacy
- Always: `rounded-lg`, `border border-border-default`, `bg-card`
- Hover (if `href`): `bg-secondary/40` color-only, no translate

#### `<DataTable>` (centralize search/filter/paginate)
```tsx
type DataTableProps<T> = {
  columns: ResponsiveTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  searchKeys?: string[];           // Client-side filter keys
  searchPlaceholder?: string;
  pageSize?: number;
  toolbar?: ReactNode;             // Right-aligned action area
};
```
- Already exists at `src/components/ui/data-table.tsx`.

**Virtualization — deferred (Gap #6 decision, 2026-05-21).** No `virtualized` prop ships in this pass.

Reasoning, in numbers:
- Today's largest table (`/operations` list) shows 18 events total in user's snapshot. With month-filter default (`?month=2026-05`), most page-loads render 2-5 rows.
- Worst case observed: `?month=all` + `?archived=1` → ~130 cumulative rows. React renders 130 row components in <40ms on a mid-tier laptop — well under the 500ms perceived-lag threshold.
- Projected at 5× growth (~450 rows over a 5-year archive): still <200ms render. No virtualization warranted.
- `@tanstack/react-virtual` would add ~6KB gzipped + complexity (forwarded refs, sticky-header math, intersection observers). Not worth it for current scale.

**Re-evaluate when ANY of:**
1. A single table render >500ms on a mid-tier device (verified with Lighthouse / React Profiler).
2. Total row count across any table crosses 500 (audit log is the most likely candidate).
3. A genuinely list-heavy surface ships (e.g. crew presence stream, real-time event log) where streaming + virtualization compose naturally.

Until then, the existing `<ResponsiveTable>` (paginated, server-filtered) is the standard.

#### `<StatusBadge>`
```tsx
type StatusBadgeProps = {
  status: "draft" | "confirmed" | "upcoming" | "in_progress" | "awaiting_settlement" | "completed" | "cancelled" | "paid" | "unpaid" | "partial" | "overdue" | "approved" | "rejected" | "pending";
  size?: "sm" | "default";
};
```
- Centralizes status → variant + label mapping
- Already exists at `src/components/badges/status-badge.tsx` — verify all callers use this instead of ad-hoc `<Badge variant="warning">`
- **Unpaid** = `warning` (amber) — see AUDIT_UI_UX.md §3.4 P1 fix

#### `<EmptyState>` (canonical empty state)
```tsx
type EmptyStateProps = {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;                              // Primary CTA (Button)
  variant?: "default" | "hero" | "inline";         // shipped — see matrix
  size?: "sm" | "default" | "lg";                  // vertical density
};
```
- Source: [src/components/ui/empty-state.tsx](src/components/ui/empty-state.tsx).
- `rounded-lg` everywhere (no `rounded-xl` overrides).

**Variant × usage matrix:**

| Variant | Chrome | Padding | Min height (default size) | When to use | Example route |
| ------- | ------ | ------- | ------------------------- | ----------- | ------------- |
| `default` | dashed border + `bg-surface-2` | `p-8` | `240px` | List/table that returned zero rows after filter or first-load. The empty surface IS the page region. | `/operations` (filtered to empty), `/operations/[id]/payments` (no payments yet) |
| `hero` | hairline subtle border + `bg-surface-2`, `overflow-hidden` (room for illustration) | `p-12` | `240px` (use `size="lg"` → 320px) | Dashboard first-run / true zero-data hero region. Larger illustration space. | `/` dashboard zero-state |
| `inline` | **no border** (host SectionCard supplies one), no separate surface | `p-6` | `240px` (typically pair with `size="sm"` → 160px) | Sub-region inside a `<SectionCard>` that has no data yet, where wrapping it in a second bordered box would double-chrome. | `/operations/[id]/rekap` Cetak section before crew submits, `/operations/[id]/design` before assets uploaded |

**Size × usage:**

| Size | Min height | Gap | Pairs with | When |
| ---- | ---------- | --- | ---------- | ---- |
| `sm` | `160px` | `gap-2` (+`p-6`) | `variant="inline"` | Dense lists, inline-inside-section empties |
| `default` | `240px` | `gap-3` | `variant="default"` | Most list pages |
| `lg` | `320px` | `gap-4` | `variant="hero"` | Standalone empty page (dashboard hero) |

**Choosing**: prefer `default` first. Drop to `inline` when the empty surface sits inside another bordered container (SectionCard). Reach for `hero` only when the surface is the page's primary hero/zero region.

#### `<InfoRow>` (key-value display)
```tsx
type InfoRowProps = {
  label: ReactNode;          // Body-sm muted
  value: ReactNode;          // Body-sm strong OR tabular if number
  hint?: ReactNode;          // Caption muted
  align?: "horizontal" | "vertical";
};
```
- Replaces ad-hoc `<div className="flex justify-between"><span>...</span><span>...</span></div>`
- Used heavily on Operations detail page (would shrink LOC dramatically)

#### `<MoneyAmount>` (replaces raw `formatRupiah()` usage)
```tsx
type MoneyAmountProps = {
  value: number;             // Number, not string — primitive transforms internally
  tone?: "default" | "positive" | "negative" | "muted";
  size?: "sm" | "default" | "lg" | "display";
  bold?: boolean;
  showSign?: boolean;        // Show + for positive
};
```
- Enforces `.tabular` automatically (eliminates current footgun: caller must remember `.tabular` class)
- Negative auto-coloring (rose) when `tone="negative"` or value < 0 with `tone="auto"`
- Replaces 100+ raw `formatRupiah(x)` callers

#### `<ProgressBar>`
```tsx
type ProgressBarProps = {
  value: number;             // 0-100
  tone?: "default" | "success" | "warning" | "danger";
  size?: "sm" | "default";   // h-1 | h-2
  showLabel?: boolean;
  ariaLabel: string;         // Required
};
```
- Always `rounded-sm` (linear bar feel, NOT pill) — see AUDIT_UI_UX.md Dashboard §3.1 P2
- Replaces inline `<div className="h-2 rounded-full bg-muted"...>` patterns

#### `<Avatar>` + `<AvatarStack>`
```tsx
type AvatarProps = {
  name: string;
  src?: string;
  size?: "sm" | "default" | "lg";
};

type AvatarStackProps = {
  users: { name: string; src?: string }[];
  max?: number;              // Default 3
  size?: "sm" | "default";
};
```
- `<AvatarStack>` for multi-owner presence indicator (foundation for §2.1 from AUDIT_UI_UX.md)

### 2.3 Actions

#### `<Button>` (already exists — keep current API)
```tsx
type ButtonProps = {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "decisive" | "decisive-success" | "decisive-danger" | "link" | "marketing" | "marketing-secondary";
  size?: "default" | "xs" | "sm" | "lg" | "xl" | "hero" | "hero-lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
};
```
- **Rule**: Use `decisive` variant + `lg` size for irreversible financial commits (Tutup Buku, Submit Rekap, Approve)
- **Rule**: Use `decisive-success` for explicit confirmation (replace hardcoded `bg-emerald-600` in `design-card.tsx:123`)

#### `<IconButton>` (convenience over Button size="icon")
```tsx
type IconButtonProps = {
  icon: LucideIcon;
  size?: "xs" | "sm" | "default" | "lg";
  variant?: "default" | "outline" | "ghost";
  ariaLabel: string;          // REQUIRED — enforces a11y
  tooltip?: string;
};
```

#### `<DropdownMenu>` (already exists — keep)
- Use for action menus, sort toggles, view switchers
- Always keyboard navigable (Tab + Arrow keys)

#### `<QuickActions>` (collection of inline action chips)
```tsx
type QuickActionsProps = {
  actions: { icon: LucideIcon; label: string; onClick?: () => void; href?: string; tone?: Tone }[];
};
```
- Used on Operations detail header (replaces 4 scattered buttons)

### 2.4 Forms

All form components MUST:
- Use 16px font-size minimum (avoid iOS auto-zoom).
- Apply `rounded-md` (6px) — never `rounded-lg` or `rounded-xl`.
- Use `--border-default` for hairline, `--ring` (ink) for focus.
- **Render via custom React components — no native browser controls in user-facing surfaces.** See §4.7 for the full rule + audit.

#### `<FormField>` / `<FieldGrid.Row>`
- For operations cluster pages, use `<FieldGrid.Row>` (§2.1.1). It is the de-facto FormField — label + tooltip + value + hint/error in label-LEFT layout.
- For non-operations pages without a layout standard yet, `<FormField>`-style hand-rolling is still tolerated, but new code should reach for `<FieldGrid.Row>` first.

#### Text + numeric input primitives (shipped Gap #5)

Source: [src/components/ui/form-fields.tsx](src/components/ui/form-fields.tsx). All five primitives are thin wrappers around the canonical `INPUT_CLASS` chrome. They don't render labels / hints / errors — compose them inside `<FieldGrid.Row>` (`operations/_shared/field-grid.tsx`) which owns those concerns.

```tsx
// Default text input
<TextField name="venue_name" value={venueName} onChange={…} placeholder="cth. Grand Ballroom Hotel ABC" />

// Number input with tabular numerals
<NumberField name="vendor_decor_markup" min={0} step={1} value={markup} onChange={…} />

// IDR money: "Rp" prefix + tabular + 0 → empty input automatically
<MoneyInput name="base_price" value={basePrice} onValueChange={setBasePrice} placeholder="3000000" />

// Indonesian phone — tel inputMode + autoComplete + tabular numerals
<PhoneInput name="client_wa" value={clientWa} onChange={…} />

// Textarea — non-resize default, 2-row default height
<TextareaField name="crew_notes" rows={2} maxLength={500} defaultValue="" />
```

**API matrix:**

| Primitive | Renders | Extra defaults | Behavior worth knowing |
| --------- | ------- | -------------- | ---------------------- |
| `<TextField>` | `<input type="text">` (overrideable) | `INPUT_CLASS` | Pass-through of all native `<input>` props. |
| `<NumberField>` | `<input type="number">` | `inputMode="numeric"`, `tabular` | Caller still owns `min` / `step` / coercion. |
| `<MoneyInput>` | `<input type="number">` w/ "Rp" prefix span | `inputMode="numeric"`, `min={0}`, `step={1}`, `tabular`, `pl-9` | **Controlled via `value: number` + `onValueChange: (n) => void`** — caller doesn't deal with strings. Empty input → emits `0`. Negative input clamps to `0`. Override prefix via `prefixLabel`. |
| `<PhoneInput>` | `<input type="tel">` | `inputMode="tel"`, `autoComplete="tel"`, placeholder `"081234567890"`, `tabular` | Numeric-only on mobile keyboard. Strict format validation is a server-side concern. |
| `<TextareaField>` | `<textarea>` | `rows={2}`, `resize-none`, `py-2`, height: auto | Override rows for longer copy (4-6 for descriptions). |

**Migration policy:** existing inline `<input className={inputClass}>` callsites stay working. Convert during Phase 2 per-route work or whenever you touch the surrounding markup. New code should reach for these primitives instead of copy-pasting the input class. `INPUT_CLASS` is exported from the same file as the source of truth — keep it there; do not redefine in consumers.

#### Selects — **MUST be searchable**
- Use `<Combobox allowFreeText={false}>` ([src/components/ui/combobox.tsx](src/components/ui/combobox.tsx)).
  - Typing filters the option list.
  - Click + keyboard nav (↑↓ Enter Esc Tab) both work.
  - Chevron toggles the popup; X clears the value.
- `<NativeSelect>` ([src/components/ui/native-select.tsx](src/components/ui/native-select.tsx)) — despite the misleading name — internally renders shadcn `<Select>` (Radix). Acceptable for short, fixed option lists where filtering would be noise (e.g. a 2-option toggle). For booking-form and similar surfaces, **prefer `<Combobox>`** — that's the standard locked in during the operations consistency pass (`067725e`).
- Free-text combobox (`allowFreeText={true}`, default) — for autocomplete inputs where the user can type "anything new" (e.g. vendor name during booking, before the contact exists in master).

#### Date + time pickers

`<DatePicker>` ([src/components/ui/date-picker.tsx](src/components/ui/date-picker.tsx)) — calendar in a base-ui Popover. Read the source for the controlled API.

`<TimePicker>` ([src/components/ui/time-picker.tsx](src/components/ui/time-picker.tsx)) — branded Popover (portaled) with preset chips + 2-col scrollable HH/MM picker + keyboard nav.

```tsx
interface TimePickerProps {
  value?: string;                          // "HH:MM" 24h
  defaultValue?: string;                   // uncontrolled init
  onValueChange?: (value: string) => void;
  presets?: readonly string[];             // default ["08:00", "10:00", "13:00", "19:00"]
  placeholder?: string;                    // default "Pilih waktu"
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}
```

Behavior contract (current ship state):
- **Trigger:** branded `<Button variant="outline">` showing `Clock icon · HH:MM` + chevron. Empty state shows placeholder in muted color.
- **Popup:** 280px-wide Popover portaled to `<body>` via `PopoverPrimitive.Portal` (escapes SectionCard overflow-hidden). Surface: `bg-surface-3`, `rounded-lg`, `shadow-level-3`, hairline ring.
- **Preset row:** small pill chips. `presets` prop controls list; default is the most common Tetra event start slots. Active chip highlighted with `bg-primary/10`.
- **2-col scroll picker:**
  - Left column: **Hours** 00-23, 24 items.
  - Right column: **Minutes** 00-55 in 5-minute steps (12 items). `step` is hardcoded to 5 — see Decisions Log.
  - Active value scrolls into view on open via `requestAnimationFrame` + `scrollTop` math.
  - Active item painted with `bg-primary` / `text-primary-foreground`.
  - Picking an hour advances active column to minutes; picking a minute commits + closes the popup.
- **Keyboard:**
  - `↑` / `↓` move active value within the focused column.
  - `→` or `Tab` from hours focuses minutes; `←` from minutes focuses hours.
  - `Enter` advances hours → minutes; on minutes, commits + closes.
  - `Esc` closes the popup.
- **Clear:** "Bersihkan" button at the bottom-right of the popup when a value is set; calls `onValueChange("")`.
- **Form integration:** like DatePicker — purely controlled. Parent owns the hidden `<input type="hidden" name="...">` for FormData submission. Booking-form's 3 callsites all follow this pattern (Tanggal+Jam pair, Setup, Selesai).

**No native `<input type="date">` or `<input type="time">` anywhere in user-facing code.**

#### Textareas
- Standard `<textarea>` with the project `inputClass` + `resize-none`. 2-row default for short notes (e.g. crew_notes), 4-row for longer descriptions.

#### File upload
- `<FileDrop>` ([src/components/ui/file-drop.tsx](src/components/ui/file-drop.tsx)) wraps native `<input type="file">` — the only allowed exception to the "no native controls" rule, because the file picker is browser-locked. Always use `<FileDrop>` (or the rekap-specific upload wrappers) instead of bare `<input type="file">`.
- Whitespace-pre-line by default (preserve crew notes formatting)

#### `<FileUpload>`, `<PhotoUpload>`
- `<PhotoUpload>` includes image compression via `src/lib/crew/image-compression.ts`
- Progress indicator REQUIRED (per AUDIT_PERFORMANCE.md §G item 7 future work)
- Drag-drop zone with keyboard fallback

#### Domain-specific Pickers
- `<CrewPicker>` — filter by role/tier, show conflict badge
- `<PackagePicker>` — group by category, show frame_size
- `<AddonPicker>` — show price, requires_extra_crew flag
- `<ClientPicker>` — autocomplete from contacts table, recent first
- `<AccountPicker>` — chart_of_accounts filter by type

### 2.5 Feedback

#### `<Toast>` (already exists — sonner)
- Default duration 4s
- Success: green check icon, emerald tint
- Error: red x icon, rose tint
- Action button optional ("Undo", "View")

#### `<Modal>` / `<Dialog>` (already exists)
- Max-w-md default, max-w-lg for complex forms, max-w-2xl for tables
- ESC to close, focus trap, click-outside-to-close

#### `<Drawer>` / `<Sheet>` (already exists)
- Side drawer for edit forms (e.g., EditCrewDrawer)
- Bottom sheet for mobile-first editing
- Backdrop blur

#### `<Tooltip>` (already exists)
- Hover delay 500ms
- Used for icon-only buttons, status badges, info indicators

#### `<ConfirmDialog>` (already exists)
- Used for destructive actions (delete, cancel event, reverse payment)
- Title + description + 2 buttons (Cancel + Confirm w/ destructive variant)

#### `<AlertBanner>` (NEW — propose)
```tsx
type AlertBannerProps = {
  variant: "info" | "warning" | "danger" | "success";
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  dismissible?: boolean;
};
```
- Used for top-of-page banners (e.g., "Settle Reopened" banner, "Event archived" notice)
- Replaces inline div+icon+text patterns in NeedsRekapSection, SettledBanner, etc.

### 2.6 Navigation

#### `<TabBar>` / `<TabLink>`
- Used in Operations view switcher (List/Calendar/Board/Design/Team)
- Used in Reports tabs (PnL/Crew/Owner)
- ALWAYS include `aria-current="page"` on active tab

#### `<Breadcrumb>`
- Use on nested settings routes (Items → Mapping)
- Use on event detail sub-routes (Operations → [Event] → Rekap)

#### `<BackButton>`
- Icon + "Back to {context}" label
- Uses `router.back()` or explicit `href`

---

## 3. Pattern Library

Reusable interaction patterns across modules. Each pattern has canonical implementation; new features should reuse, not re-invent.

### 3.1 List + Detail Pattern
- List view: DataTable with searchKeys + filter chips + primary CTA top-right
- Click row → navigate to `/[resource]/[id]` detail page
- Detail page: PageHeader + SectionCard sections
- Edit: Drawer (for simple) or `/edit` page (for complex)

**Used by**: Operations, Settings (most subpages), Crew, Contacts

### 3.2 Form Submission Pattern
- React Hook Form OR useActionState (server actions)
- Optimistic UI via `useTransition` for action buttons
- Toast on success ("X created" / "X updated")
- Error: inline below field + Toast (don't suppress)
- Disable form during pending
- For destructive submit: ConfirmDialog wrapper

**Used by**: Booking form, Rekap form, Crew assignment, every settings CRUD

### 3.3 Bulk Action Pattern
- Selection: row checkbox + select-all checkbox + "Selected (X)" indicator
- Action bar appears when selection > 0 (sticky bottom or top)
- Confirmation REQUIRED for bulk operations > 5 rows
- Show progress for long-running bulk (toast + count: "3 of 10 done")

**Should be used by**: Operations (bulk status change), Reminders (already does this), Notifications (bulk read)
**Currently NOT used by**: Operations list (P1 missing feature)

### 3.4 Empty State Pattern
- Always provide:
  - Icon (lucide)
  - Title (action-oriented: "Belum ada event terjadwal")
  - Description (context: "Tambah event baru untuk mulai mengatur tim")
  - Primary CTA button (when actionable)
- Use `<EmptyState>` component — don't roll your own

**Anti-pattern**: Italic gray text "Belum ada data" without CTA (current /design/[id] empty state)

### 3.5 Loading State Pattern
- Server component: render `loading.tsx` skeleton (Next.js streaming)
- Client component during transition: skeleton matches final layout (avoid CLS)
- Use `<Skeleton>` primitive (h-auto, w-full, rounded-md)
- DON'T use spinners for full-page loads; reserve for inline actions

**Currently missing**: 58 of 74 routes have no `loading.tsx` — see AUDIT_PERFORMANCE.md §E.1

### 3.6 Error State Pattern
- Server: `error.tsx` with retry button + error message (sanitized for production)
- Client: AlertBanner variant="danger" inline OR Toast for transient errors
- Always provide recovery action ("Coba lagi", "Hubungi admin")

### 3.7 Search + Filter Pattern
- Search: top-left, `<Input>` with magnifier icon, debounced 300ms
- Filter chips: row of toggleable chips (status, category, role)
- Active filter count badge near "Filter" if collapsed
- "Clear all" link to reset filters
- Preserve filter state in URL params

### 3.8 Multi-step Flow Pattern
- Use `<Stepper>` indicator (1/3, 2/3, 3/3)
- Per-step validation before allowing "Next"
- "Back" button preserves entered data
- Final step: review screen + "Confirm" button
- Submit at final step only (not per-step) for atomicity

**Used by**: Booking form (could be improved), CSV Import wizard

### 3.9 Mobile Adaptation Pattern
- Tables: collapse to card stack on `<sm` breakpoint via `<ResponsiveTable>`
- Forms: vertical stacking, full-width inputs, sticky bottom CTA
- Bottom nav for primary navigation, hamburger absent
- Safe-area aware (`pb-safe`, `pt-safe`)

**Currently inconsistent**: Owner Settings Crew table breaks on mobile (P1 from §3.10)

### 3.10 Real-time Update Pattern (Gap #8 decision — MVP path)

Business context: 4 owners potentially edit the same event concurrently. The real risk is **silent overwrite** (Owner A edits event, Owner B opens the same record 30 sec earlier + saves their edit → A's changes are gone with no warning), not "the page doesn't auto-refresh". Decision flips accordingly: ship safety first, real-time UI later.

#### MVP (Phase 2 — ships alongside per-route work)

**Optimistic concurrency check on every mutation.** This is server-side and invisible until conflict, so it carries zero perf cost in the happy path.

1. Add `updated_at TIMESTAMPTZ DEFAULT now()` column (Supabase already has it on most tables — verify per-table) with a row-level trigger to bump on UPDATE.
2. Every form fetch reads the row's current `updated_at` and includes it in the form as a hidden input.
3. Every Server Action mutation does: `UPDATE … WHERE id = $1 AND updated_at = $2 RETURNING id`. If the result returns zero rows, the record was modified since fetch.
4. On conflict, server returns a structured error → form surfaces a banner: *"Booking ini di-edit barengan oleh [name] [X menit lalu]. Refresh untuk lihat perubahan terbaru, lalu coba lagi."* Caller can choose Discard (refresh) or Force-overwrite (re-submit explicitly).
5. **No subscription**, no presence, no live UI updates. Just the conflict guard.

**Last-edited footer (optional, ship if cheap)** — render a tiny `Diubah {timeago} oleh {name}` line at the bottom of detail pages. Passive read of `updated_at` + `updated_by` (need to add the latter; small migration). Zero race risk.

#### Full real-time (Phase 5 — deferred, business hasn't asked for it)

The list of features that requires a Supabase Realtime channel subscription stays parked:
- Presence indicator (avatar stack in topbar)
- "[Name] also editing" warning banner
- INSERT/UPDATE/DELETE → invalidate React cache OR optimistic merge in list views

Trigger to bring forward: actual user complaint of "I lost my edit" that the optimistic-concurrency conflict guard didn't catch, OR the business adding a second crew tier that needs live coordination during events.

**Currently NOT used anywhere** — the MVP guard is the prerequisite for any of this. See §9 Decisions Log + foundation for §2.1 from AUDIT_UI_UX.md.

### 3.11 Operations cluster reference-page polish (Phase 3 — Gap #7 spec)

Both `/operations` and `/operations/[projectId]` serve as the visual reference for the rest of the cluster — but user flagged that they need light enhancement of their own. Specced here so Phase 3 work is concrete, not "polish vibes".

#### 3.11a `/operations` list — status pill density

**Current state:** `<OperationsListTable>` shows event status + payment status as separate cells using `<EventStatusDot>` (dot + label, 14px line-height). On 1280px viewport this consumes ~180px combined, but the labels collapse onto one line so vertical density is fine — what's NOT dense is **column count**: 6 columns (Project / Waktu & Tempat / Detail Paket / Crew / Status / Outstanding-Rp).

**Definition of "lebih dense":** consolidate the two status cells (event + payment) into a single right-most column with a stacked layout:

```
┌──────────────────┐
│ ● In Progress    │  ← event status dot, 13px / medium / line-height tight
│ ● Lunas          │  ← payment status dot, 12px / regular / muted-when-success
│ Rp 1.500.000     │  ← outstanding amount, tabular, 12px / when > 0; otherwise hidden
└──────────────────┘
```

Concrete change: drop the dedicated "Outstanding" column; render it as the third line inside the consolidated status cell when `> 0`. Saves one column-width (~120px) and surfaces the payment-due signal closer to the status it's about. No new badge variants — reuse `<EventStatusDot size="sm">` + `<PaymentStatusDot size="sm">`. If "sm" doesn't exist on those dot components yet, that's the prereq (extend status-badge.tsx with `size?: "default" | "sm"` taking line-height + dot-size down one notch).

**Effort:** 1-2 hours. **Risk:** low — table data unchanged, only render shape.

#### 3.11b `/operations/[projectId]` — PageHeader vs ProjectHeroRecap alignment

**Current state:** project-detail page has two stacked surfaces at the top:
1. **Inline header block** ([page.tsx:245-320](src/app/(owner)/operations/[projectId]/page.tsx#L245)) — back link, h1, meta badges (status + channel + category + Imported/Migrated), right-aligned action cluster (StatusMenu / Send WA / PDF / Edit / Hapus).
2. **`<ProjectHeroRecap>`** ([project-hero-recap.tsx](src/components/operations/project-hero-recap.tsx)) — 3-col data card (Event Info / Crew incharge / Financial) with its own header strip carrying quick-action links (Payments / Crew / Equipment / Rekap) + optional Settle CTA footer.

These two surfaces overlap conceptually: both carry "what is this event" metadata. The header repeats info that ProjectHeroRecap shows in more detail.

**Alignment plan:**

1. **Migrate the inline header block to use `<PageHeader>` + `<MetaBadge>`.** Replace the hand-rolled 75-line JSX in page.tsx:245-320 with:
   ```tsx
   <PageHeader
     title={event.client_name}
     backHref="/operations"
     backLabel="Operations"
     meta={
       <MetaBadge
         projectId={event.project_id}
         status={event.status}
         tags={[
           { label: CHANNEL_TYPE_LABELS[event.channel], tone: "outline" },
           categoryLabel ? { label: categoryLabel } : null,
           isMigratedLegacy ? { label: "Migrated", tone: "warning" } : null,
           isImportedLive ? { label: "Imported", tone: "outline" } : null,
         ].filter(Boolean)}
       />
     }
     actions={<HeaderActions … />}  // existing StatusMenu / Send WA / PDF / Edit / Hapus cluster
   />
   ```
2. **Trim `<ProjectHeroRecap>` of duplicated metadata.** The "Event Info" column currently lists date / time / venue / package / backdrop / category — but `<MetaBadge>` already surfaces category in the header. Drop category from the recap card. Keep the rest (those are richer than the header badges).
3. **Move quick-action links** (Payments / Crew / Equipment / Rekap) **from the recap card's header strip to `<PageHeader actions>`.** Keep the Settle CTA inside the recap footer — it's contextual to the financial column.

**Outcome:** the header becomes the single source of "who/where/when" meta. The recap card becomes pure data (the 3-column grid).

**Effort:** half-day. **Risk:** low — pure presentation refactor, no business logic.

#### Phase 3 scope summary

These two polish items are tracked in [REPORT_OPERATIONS_CONSISTENCY.md](REPORT_OPERATIONS_CONSISTENCY.md) Phase 3 (deferred). Move them up only when Phase 2 (per-route) is done — the new SectionCard / FieldGrid / SummaryRail primitives are validated across rekap / payments / crew / design first, then we touch the reference pages last so any primitive-API drift discovered during Phase 2 is already smoothed out.

---

## 4. Do's & Don'ts

### 4.1 Typography

✅ **DO**:
```tsx
<span className="eyebrow">Total Revenue</span>
<p className="tabular text-lg">Rp 12.450.000</p>
<h1 className="text-fluid-h1 display-tight font-semibold">Dashboard</h1>
```

❌ **DON'T**:
```tsx
{/* Hardcoded eyebrow styling */}
<span className="font-mono text-[11px] uppercase tracking-[0.18em]">...</span>

{/* Money without tabular */}
<p>Rp 12.450.000</p>

{/* Fixed display size on heading */}
<h1 className="text-[36px] font-bold">Dashboard</h1>
```

### 4.2 Cards

✅ **DO**:
```tsx
<div className="rounded-lg border border-border-default bg-card p-5">
  ...
</div>
```

❌ **DON'T**:
```tsx
{/* Wrong radius */}
<div className="rounded-xl ring-1 ring-foreground/10 ...">

{/* rounded-2xl in operational chrome */}
<div className="rounded-2xl ...">

{/* Shadow that's not from --shadow-level-* */}
<div className="shadow-lg ...">
```

### 4.3 Colors

✅ **DO**:
```tsx
{/* Semantic state — emerald for paid */}
<Badge variant="success">Paid</Badge>

{/* Ink primary CTA */}
<Button variant="default">Submit</Button>

{/* Link blue for inline links only */}
<a className="text-link hover:underline">View detail</a>
```

❌ **DON'T**:
```tsx
{/* Decorative violet/teal/indigo */}
<div className="bg-violet-500/10 text-violet-700">Design Assets</div>

{/* Hardcoded emerald button bypassing primitive */}
<button className="bg-emerald-600 hover:bg-emerald-700">Approve</button>
// USE: <Button variant="decisive-success">Approve</Button>

{/* Blue as CTA fill */}
<button className="bg-link text-white">Submit</button>
// USE: <Button variant="default">Submit</Button>
```

### 4.4 Hover States

✅ **DO**:
```tsx
<Link className="hover:bg-secondary transition-colors">...</Link>
<button className="active:scale-[0.98] transition-transform">...</button>
```

❌ **DON'T**:
```tsx
{/* Translate on hover */}
<div className="hover:-translate-y-px hover:shadow-md">...</div>

{/* Scale on hover (only on active/tap) */}
<button className="hover:scale-105">...</button>
```

### 4.5 Forms

✅ **DO**:
```tsx
<FormField name="amount" label="Jumlah" required>
  <MoneyInput name="amount" />
</FormField>
```

❌ **DON'T**:
```tsx
{/* Manual label + input + error */}
<label>
  Amount
  <input type="number" name="amount" />
  {error && <p className="text-red-500">{error}</p>}
</label>

{/* Money input without tabular */}
<input type="text" placeholder="Rp 0" />
```

### 4.6 Loading States

✅ **DO**:
```tsx
// loading.tsx beside page.tsx — mirror the rendered layout
export default function Loading() {
  return (
    <Container size="xl" className="space-y-5">
      {/* PageHeader skeleton */}
      <Skeleton className="h-8 w-48" />
      {/* SectionCard chrome + FieldGrid rows mirror */}
      <div className="rounded-lg border border-border-default bg-card">
        <div className="px-5 py-3.5"><Skeleton className="h-3 w-40" /></div>
        <div className="space-y-4 border-t border-border-subtle px-5 py-4">
          <div className="grid gap-2 md:grid-cols-12 md:gap-4">
            <Skeleton className="h-4 w-24 md:col-span-4 md:mt-2" />
            <Skeleton className="h-10 md:col-span-8" />
          </div>
        </div>
      </div>
    </Container>
  );
}
```

❌ **DON'T**:
```tsx
{/* No loading.tsx — page just appears */}

{/* Inline spinner for full-page load */}
{isLoading && <Spinner />}

{/* Generic skeleton that doesn't match the page's layout — causes width/shape snap when content resolves */}
<Skeleton className="h-96 w-full" />
```

### 4.7 Form Controls — No native browser controls + no NativeSelect in user-facing code (locked in `d020272` / `067725e` / Gap #1 polish)

**Rule.** User-facing form controls render via custom React components only. Native browser controls (`<select>`, `<input type="time|date|color">`) and the in-codebase `<NativeSelect>` shadcn wrapper are banned from user-facing surfaces.

✅ **DO**:
```tsx
{/* Searchable dropdown — every value-from-list pick goes here */}
<Combobox
  value={kategori}
  onValueChange={setKategori}
  options={[{value:"wedding", label:"Wedding"}, …]}
  allowFreeText={false}
  placeholder="— pilih kategori —"
/>

{/* Custom time picker */}
<TimePicker value={start} onValueChange={setStart} />

{/* Custom calendar */}
<DatePicker value={date} onValueChange={setDate} />

{/* Binary toggle — segmented button (already used heavily in booking-form
    for service-type / discount-type / commission-mode pickers) */}
<div className="inline-flex rounded-md border border-border-default p-0.5">
  <button role="radio" aria-checked={mode === "commission"} … />
  <button role="radio" aria-checked={mode === "upfront_cut"} … />
</div>

{/* Checkbox-styled card (already used in booking-form for "PIC sama dengan pembooking"
    style toggles). Real <Switch> + <RadioGroup> primitives are pending —
    see Decisions Log 2026-05-21. */}
<label className="flex items-center gap-2 rounded-md border border-border-default px-3 py-2">
  <input type="checkbox" checked={enabled} onChange={…} className="h-4 w-4" />
  <span>Label</span>
</label>
```

❌ **DON'T** — banned in user-facing code:
```tsx
{/* Native select — non-searchable, inconsistent styling, no chevron control */}
<select value={kategori} onChange={(e) => setKategori(e.target.value)}>
  <option value="wedding">Wedding</option>
</select>

{/* Native time / date — picker UI varies wildly per browser + OS */}
<input type="time" value={start} onChange={…} />
<input type="date" value={date} onChange={…} />

{/* NativeSelect — BANNED for user-facing dropdowns regardless of option count.
    Use <Combobox allowFreeText={false}> for every dropdown. */}
<NativeSelect options={packageList} value={x} onValueChange={setX} />
```

**Why native is banned:** browser-default chrome (system font, weird sizing on mobile Safari, no consistent focus ring, no typing-to-filter, no portal — clips inside collapsible cards). They don't share keyboard nav or focus behavior with the rest of our components, so users hitting Tab through a form get a jarring shift in interaction style.

**Why NativeSelect is banned:** even though it internally wraps shadcn `<Select>` (Radix), its rendered shape lacks typing-to-filter — which we standardized on with the booking-form Combobox sweep (`067725e`). One-shape selects = predictable keyboard + a11y across every operations sub-page. The `NativeSelect` file remains as the canonical wrapper around shadcn Select, used by `<Combobox>`'s build chain and potentially future primitives — but it must not appear in a JSX tree under `src/app/`.

**Status of `<Switch>` / `<RadioGroup>`:** not shipped as primitives yet. For binary state, use the segmented-button pattern (see booking-form §commission mode); for "checkbox + label card", use the inline pattern shown above. Promoting both to first-class primitives is a follow-up tracked in §9 (2026-05-21).

**Sole exception** — file picker (`<input type="file">`) is hardware-locked behind a browser API. Always wrap with `<FileDrop>` (or the rekap-specific upload buttons).

**Audit-once command** (run before opening a PR that adds form controls):
```bash
# Native + NativeSelect usage outside the primitive itself + showcase route
grep -rn 'type="time"\|type="date"\|type="color"\|<select\b\|<NativeSelect\b' src --include="*.tsx" \
  | grep -v 'src/components/ui/native-select.tsx' \
  | grep -v 'src/app/dev/primitives/'
```
Expected: zero matches outside `<FileDrop>` / file-upload wrappers + the NativeSelect primitive itself + the dev showcase route.

> Migration status (2026-05-21): 6 non-booking callsites still import `<NativeSelect>` — `event-equipment/check-out-form.tsx`, `event-equipment/incident-form.tsx`, `backdrops/backdrop-form.tsx`, `addons/addon-form.tsx`, `notification-rules/rule-form.tsx`. These get swept during Phase 2 per-route work; new PRs must use `<Combobox>` directly.

### 4.8 Popups (dropdowns, calendars, menus) — must portal out of clipping ancestors (locked in `3b3c079`)

Background: `<SectionCard>` / `<CollapsibleCard>` use `overflow-hidden` so the slide-open animation clips the panel during transition. Any popup that opens *inside* such a card and positions itself via `position: absolute` will get visually clipped when it extends past the card edge. This bit us with `<Combobox>` — the dropdown only showed 1.5 options before being cut by the SectionCard border.

✅ **DO** — every popup-style primitive must render through a portal so it escapes ancestor `overflow-hidden`:
```tsx
{/* base-ui primitives — already portal-aware */}
<PopoverPrimitive.Portal>
  <PopoverPrimitive.Positioner>
    <PopoverPrimitive.Popup>…</PopoverPrimitive.Popup>
  </PopoverPrimitive.Positioner>
</PopoverPrimitive.Portal>

{/* hand-rolled popup — use React.createPortal + getBoundingClientRect tracking */}
{open && popupRect && createPortal(
  <div style={{ position: "fixed", top: popupRect.top, left: popupRect.left, width: popupRect.width }}>
    …
  </div>,
  document.body,
)}
```

❌ **DON'T**:
```tsx
{/* Absolute popup inside the same DOM subtree as its trigger.
    Works in isolation, breaks the moment an ancestor has overflow-hidden
    (which every SectionCard does). */}
<div className="relative">
  <input … />
  {open && (
    <div className="absolute top-full z-50 …">{options}</div>
  )}
</div>
```

Where the rule applies — every primitive that opens a floating panel:

| Primitive | How it portals | Source |
| --------- | -------------- | ------ |
| `<DatePicker>` | base-ui `PopoverPrimitive.Portal` | [date-picker.tsx](src/components/ui/date-picker.tsx) |
| `<TimePicker>` | base-ui `PopoverPrimitive.Portal` | [time-picker.tsx](src/components/ui/time-picker.tsx) |
| `<MonthPicker>` | base-ui `PopoverPrimitive.Portal` | [month-picker.tsx](src/components/ui/month-picker.tsx) |
| `<Combobox>` | `react-dom.createPortal` + viewport-relative positioning (with auto-flip above/below) | [combobox.tsx](src/components/ui/combobox.tsx) |
| `<Tooltip>` | base-ui `TooltipPrimitive.Portal` | [tooltip.tsx](src/components/ui/tooltip.tsx) |
| `<DropdownMenu>` / `<Select>` / `<Dialog>` / `<Sheet>` / `<AlertDialog>` | base-ui Portal (Radix-equivalent) | corresponding files in `src/components/ui/` |

Audit-once command:
```bash
# Any hand-rolled popup using absolute-below-trigger positioning (potential clipping bug):
grep -rn 'absolute.*top-full' src --include="*.tsx" | grep -v node_modules
```
Expected: zero matches. If you add a new floating panel, route it through a Portal — either base-ui or `react-dom.createPortal`.

---

## 5. Migration Plan

### Phase 1 — Token Enforcement (Week 1)

**Goal**: Make design system non-negotiable through tooling.

1. **Update `Card` primitive** at [src/components/ui/card.tsx:15](src/components/ui/card.tsx#L15):
   - Change `rounded-xl ring-1 ring-foreground/10` → `rounded-lg border border-border-default`
   - This change cascades to ~50+ Card callers automatically
2. **Update `EmptyState` primitive** at `src/components/ui/empty-state.tsx:27`:
   - Change `rounded-xl` → `rounded-lg`
3. **Remove Playfair Display** from `src/app/layout.tsx:14-18` + `--font-display` from globals.css
4. **Remove dead-weight deps**: `pnpm remove @tanstack/react-query zustand`
5. **Add Biome lint rules** (or custom script) to flag:
   - `rounded-2xl` outside `/marketing/` paths
   - `shadow-lg`, `shadow-xl`, `shadow-2xl` (require `shadow-level-*`)
   - `bg-violet-*`, `bg-teal-*`, `bg-indigo-*`, etc. (decorative colors)
   - Hardcoded `text-[11px] uppercase font-mono` (require `.eyebrow` class)

**Effort**: 1-2 days. **Impact**: kills 60-80% of inconsistency overnight.

### Phase 2 — Component Consolidation (Week 1-2)

**Goal**: Remove duplicate / divergent components.

1. **Consolidate KpiCard**:
   - Remove local definition di [src/app/(owner)/reports/page.tsx:1133-1172](src/app/(owner)/reports/page.tsx#L1133)
   - Update Reports page to import from `src/components/operations/kpi-card.tsx` (rename to `StatCard` for clarity? — optional)
2. **Add `<MoneyAmount>` primitive**, migrate `formatRupiah()` callers gradually:
   - High-traffic first: Operations detail, Finance dashboard, Reports
3. **Add `<InfoRow>` primitive**, migrate Operations detail page row patterns
4. **Add `<AlertBanner>` primitive**, migrate NeedsRekapSection, SettledBanner, settlement reopened banner
5. **Add `<AvatarStack>` + `<Avatar>` primitives** (foundation for multi-owner presence)

**Effort**: 2-3 days. **Impact**: Operations detail page shrinks ~30% LOC; Reports/Finance get visual parity.

### Phase 3 — Pattern Library Enforcement (Week 2-3)

**Goal**: Standardize patterns across modules.

1. **Standardize empty states** — audit all 11 modules, replace ad-hoc with `<EmptyState>` component
2. **Add `loading.tsx`** for 58 missing routes (priority: Operations subroutes, Settings subroutes)
3. **Standardize tab navigation** — Reports, Operations view switcher use same `<TabBar>` component
4. **Standardize confirmation pattern** — destructive actions all use `<ConfirmDialog>`
5. **Audit `<Button>` variant usage** — ensure decisive variants used for financial commits

**Effort**: 3-4 days. **Impact**: Polish + accessibility lift across all routes.

### Phase 4 — Color Violations Fix (Week 3)

**Goal**: Remove all decorative color usage.

1. **Design Hub** — replace 4-color asset type badges (violet/amber/sky/emerald) with ink+icon hierarchy. [design/page.tsx:35-53](src/app/(owner)/design/page.tsx#L35)
2. **Operations List Table** — audit decorative colors, migrate to semantic
3. **Booking form Assign Crew** — same
4. **Contacts list table** — same
5. **Billing PDF** — decide: `PDF_COLORS.primary = "#171717"` (ink) OR retain rose with documented carve-out
6. **Settings Backdrop badges** — replace custom tones (sky-500, amber-500) with semantic variants

**Effort**: 1-2 days. **Impact**: Visual coherence, removes design rule violations.

### Phase 5 — Real-Time Foundation (Week 4-5)

**Goal**: Multi-owner awareness.

1. Add `updated_at` + `updated_by_user_id` to events, crew_assignments, crew_rekap (migration)
2. Build `<PresenceIndicator>` (AvatarStack in topbar)
3. Build `<RealtimeSync>` client wrapper that subscribes to Supabase realtime channels
4. Add "Last edited by [Name] X min ago" footer to Operations detail page
5. Add conflict warning banner when concurrent edit detected

**Effort**: 1-2 weeks. **Impact**: Delivers "command center" promise.

### Phase 6 — Migration Cleanup (Ongoing)

1. **Deprecate legacy routes**: /operations/[id]/settle, /tutup-buku — add redirects, mark deletion date
2. **Migrate `formatRupiah()` callers** to `<MoneyAmount>` (gradual)
3. **Migrate inline eyebrow styling** to `.eyebrow` class (gradual)
4. **Audit 114 'use client' components** — convert non-interactive ones to server (gradual)

**Effort**: Ongoing, parallel to feature work. **Impact**: Code health, reduce client bundle.

---

## 6. Tooling Recommendations

### 6.1 Linting
Add Biome custom rules OR ESLint plugin:
- `no-tailwind-rounded-2xl-in-app` — flag `rounded-2xl` outside `/marketing/`
- `no-tailwind-default-shadow` — flag `shadow-{sm,md,lg,xl,2xl}` outside test files
- `no-decorative-color` — flag `bg-{violet,teal,indigo,fuchsia,cyan,lime,orange,pink,purple}-*`
- `require-tabular-on-money` — flag `Rp \d` in JSX without `.tabular` class on container
- `no-translate-on-hover` — flag `hover:-translate-*` and `hover:translate-*`
- `no-inline-eyebrow` — flag inline `font-mono text-[11px] uppercase` pattern

### 6.2 Storybook
Not currently set up. **Recommendation**: Add Storybook untuk:
- Component variant explorer (Button × 11 variants × 11 sizes = 121 combinations)
- Pattern library examples (List+Detail, Form Submission, Bulk Action visual states)
- A11y addon for contrast/focus/keyboard checks

**Effort**: 2-3 days initial setup, then incremental as components added. **Recommend post-Phase 3.**

### 6.3 Visual Regression Testing
Not currently set up. **Recommendation**: Chromatic or Percy untuk visual diff CI gate.
- Captures rendering of every component variant
- Catches accidental regressions during refactor

**Effort**: 1-2 days setup. **Optional but valuable post-Phase 1.**

---

## 7. Component Inventory Summary

**Current state** (per `src/components/ui/index.ts`):
- ✅ Layout: card, separator
- ✅ Display: avatar, badge, data-table, responsive-table, stat-card, empty-state, skeleton, money-amount
- ✅ Actions: button, dropdown-menu
- ✅ Forms: form, input, label, select, native-select, combobox, date-picker, time-picker, month-picker, file-drop
- ✅ Feedback: dialog, alert-dialog, confirm-dialog, sheet, toaster, tooltip
- ✅ Navigation: tabs
- ⚠️ Other: collapsible-card, disclosure, table (raw HTML wrapper)

**Proposed additions**:
- `<PageContainer>` (layout)
- `<PageHeader>` (layout)
- `<SectionCard>` (display)
- `<InfoRow>` (display)
- `<ProgressBar>` (display)
- `<AvatarStack>` (display, real-time)
- `<AlertBanner>` (feedback)
- `<TabBar>` + `<TabLink>` (navigation)
- `<Breadcrumb>` (navigation)
- `<BackButton>` (navigation)
- `<IconButton>` (action)
- `<QuickActions>` (action)
- `<FormField>` (form)
- `<TextField>`, `<NumberField>`, `<MoneyInput>`, `<TextareaField>` (form)
- `<CrewPicker>`, `<PackagePicker>`, `<AddonPicker>`, `<ClientPicker>`, `<AccountPicker>` (domain forms)
- `<PhotoUpload>` (form, mobile-aware)
- `<PresenceIndicator>` (real-time)
- `<RealtimeSync>` (real-time wrapper)

**Net additions**: ~22 new primitives. Most are wrappers around existing patterns currently inline.

---

## 8. Conclusion

Tetra Ops design foundation **already strong**: DESIGN.md aspirational + globals.css enforced + Vercel ink discipline + 32 UI primitives existing. The audit's 12 cross-cutting issues stem from **3 root causes**:

1. **Card primitive non-conformant** → cascades into 174× `rounded-xl` misuse
2. **No lint guards** → decorative colors slip in undetected (5 violation files)
3. **No central pattern library** → empty states, eyebrows, money formatting inconsistently rolled-by-hand

Fixing all 3 root causes (Phase 1-2 above, ~3-5 days) eliminates 80% of inconsistency. Remaining work is feature-specific (real-time foundation, missing primitives, pattern enforcement).

**No need for design system overhaul.** Foundation is correct. Need: **enforcement + a few new primitives + cleanup pass.**

---

## 9. Decisions Log

Running history of design-system rule changes. Each entry: date · gap# · decision · rationale · commit refs.

### 2026-05-21

- **Gap #1 · Native browser controls + `<NativeSelect>` user-facing usage — banned total.** Previously §4.7 tolerated `<NativeSelect>` for "short fixed lists" — that's gone. Every user-facing dropdown uses `<Combobox allowFreeText={false}>`. Rationale: one-shape selects = predictable keyboard nav + a11y across every operations sub-page; ambiguity in the rule was already producing inconsistent choices in non-booking forms. The `<NativeSelect>` file itself stays — it remains the canonical shadcn `<Select>` wrapper, used internally by Combobox's build chain and as a primitive building block. What's banned is its appearance in `src/app/**` JSX trees. See §4.7 + audit-grep updated.
- **Gap #1 · `<Switch>` + `<RadioGroup>` as primitives — deferred.** User asked for these as the canonical binary-toggle pair. They don't exist in the codebase yet. Decision: don't ship them this pass; the segmented-button pattern (used in booking-form for commission mode / discount type) + the checkbox-styled label card (used in booking-form for "PIC sama dengan pembooking") cover today's surfaces. Promoting these to first-class primitives is tracked as a follow-up — schedule alongside Phase 2 per-route work when a real consumer needs the third pattern.
- **Gap #2 · `<Stack>` / `<Inline>` — deduplicated in §2.1, stays proposed-not-shipped.** Two near-identical blocks were sitting side-by-side in §2.1. Collapsed to one entry. Decision to keep deferred (not build now): the gap tokens already discipline spacing across pages — promoting to a primitive would mostly be lint-cosmetics. Re-evaluate after Phase 2 per-route work; build if the same `flex flex-col gap-3` shape recurs in 20+ unique places.
- **Gap #3 · `<TimePicker>` API + behavior contract — locked in §2.4.** Specced the shipped surface area exactly: props, popup shape, preset row, 2-col scroll picker, keyboard map, clear button, form integration pattern. **`step` prop deferred.** User asked for a configurable step (`5 | 10 | 15 | 30`); shipped version is hardcoded to 5-minute steps via the `MINUTES` constant. Per the "don't change shipped primitives" constraint, the prop is not being added in this pass. Rationale: today's only consumers (3 callsites in booking-form) all use 5-minute granularity, so the rigidity isn't costing anyone. When a future surface needs different granularity (e.g. crew schedule pages with 30-min slots), promote `MINUTES` to a derived array based on a new `step` prop.
- **Gap #4 · `<EmptyState>` — added `inline` variant + spec matrix in §2.2.** Previously the primitive shipped with `default` + `hero` variants and no guidance on when to use which. Added a third variant `inline` (no outer border, `p-6`) for empties that sit INSIDE a `<SectionCard>` body so we don't double up on bordered chrome. Spec table now maps variant × usage × example route (`default` = list/table empties, `hero` = dashboard zero-state, `inline` = sub-region inside another card) plus size × pairing guidance. Defaults unchanged — `variant="default"` + `size="default"` still picks the original shipped shape.
- **Gap #5 · Form-input primitives shipped — `<TextField>`, `<NumberField>`, `<MoneyInput>`, `<PhoneInput>`, `<TextareaField>`.** Thin wrappers around the canonical `INPUT_CLASS` chrome, exported from `src/components/ui/form-fields.tsx`. No layout (label/error/hint live in `<FieldGrid.Row>`). Decision: build minimal primitives now + spec the API matrix, migrate existing 76+ inline `<input className={inputClass}>` callsites gradually during Phase 2 per-route work. `MoneyInput` is the most opinionated of the five — controlled via `value: number` + `onValueChange: (n) => void`, empty input emits `0`, negative clamps to `0`. The exported `INPUT_CLASS` becomes the single source of truth for the input chrome — Combobox/NativeSelect/TimePicker triggers already coordinate on the same h-10/rounded-md/border-default/ring tokens, so visual parity holds.
- **Gap #6 · DataTable virtualization — deferred.** No `virtualized` prop ships. Backed by current numbers: largest table render is ~18 rows (user snapshot), worst case is ~130 rows (filter=all + archived), projected 5× growth still under 500 rows. React renders 130 row components in <40ms on mid-tier hardware — well under the 500ms perceived-lag threshold. `@tanstack/react-virtual` would add ~6KB + sticky-header / intersection-observer complexity for no real win. Re-evaluate triggers documented in §2.2: any single render >500ms, total row count >500, or a list-heavy surface (real-time event log) where streaming + virtualization compose naturally.
- **Gap #7 · Reference page polish — concrete spec in §3.11.** Both `/operations` list + `/operations/[projectId]` are Phase 1 references but need their own light polish (per user feedback). Specced two concrete items: (a) ops-list status column "lebih dense" = consolidate event status + payment status + outstanding amount into a single stacked cell (saves one column-width, surfaces payment-due signal next to its own status); (b) project-detail header migration = replace the inline 75-line JSX with `<PageHeader>` + `<MetaBadge>` and trim duplicate category metadata from `<ProjectHeroRecap>`. Both items deferred to Phase 3 — execute AFTER per-route Phase 2 work (rekap/payments/crew/design) so any primitive-API drift is settled first.
- **Gap #8 · Real-time pattern — MVP is optimistic concurrency, full real-time deferred.** User flagged 4-owner concurrent monitoring; the actual risk is *silent overwrite*, not lack of live UI. Decision: ship safety first. MVP (Phase 2): every mutation does `UPDATE … WHERE id = $1 AND updated_at = $2`; mismatch returns a structured conflict error → form banner "edited by [name] [X min ago], refresh + retry". Server-side only; zero perf cost in happy path; no subscription. Optional Phase 2 add-on: passive `updated_at / updated_by` footer on detail pages. Full real-time (Supabase Realtime channel, presence avatar stack, optimistic merge) parked at Phase 5 — bring forward only when an actual user complaint shows the conflict guard isn't enough. Pattern documented in §3.10.

---

**End of DESIGN_SYSTEM.md** — see companion docs:
- [AUDIT_UI_UX.md](AUDIT_UI_UX.md) — module audits + cross-cutting findings
- [AUDIT_PERFORMANCE.md](AUDIT_PERFORMANCE.md) — speed bottlenecks
- [REFINEMENT_ROADMAP.md](REFINEMENT_ROADMAP.md) — 15-week sequenced plan
- [AUDIT_SUMMARY.md](AUDIT_SUMMARY.md) — executive summary
- [DESIGN.md](DESIGN.md) — aspirational design direction (existing)
