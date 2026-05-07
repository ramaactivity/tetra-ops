# 04 — Design System

**Project:** Tetra Ops
**Direction:** "Refined Operator" — Professional foundation with brand personality at the right moments. As of sesi 5 (2026-05-08), the system is mid-redesign per the master plan at `~/.claude/plans/saya-mau-fokus-polish-eventual-gem.md`. Token foundation (F1) shipped commit `c273b51`; this doc is the as-built record.

> **Last verified against** `src/app/globals.css` at commit `c273b51` (2026-05-08).
> When tokens change in `globals.css`, update this doc in the same PR. Type-safe mirror lives at `src/lib/tokens.ts`.

> **Companion docs:**
> - `docs/04a_MOTION_GUIDELINES.md` — durations, easings, View Transitions API patterns, what NEVER to animate.
> - `docs/12_DECISION_LOG.md` — DR-023 (light mode parked at P5), DR-024 (no brand photography), DR-025 (Claude generates empty-state copy).

---

## 1. Design Philosophy

### 1.1 Three Pillars

**1. Information Density (70% weight)**
Like Linear, Notion, Vercel dashboard. Owner spends hours per day in this app. Show the right information without overwhelming. Hierarchy through typography, not just spacing.

**2. Effortless Mobility (20% weight)**
Like Stripe Dashboard mobile, Robinhood. Crew uses phone in field, often one-handed, often outdoors with bright sun. Bottom nav. Large tap targets. High contrast. No reliance on hover states.

**3. Branded Moments (10% weight)**
Like Apple Music's editorial cover art moments, Linear's marketing site. The dashboard is mostly utilitarian, but moments like login, splash, monthly report PDFs, and invoice PDFs reflect Tetra's brand identity (warm cream, deep red, editorial typography).

### 1.2 Anti-Patterns We Reject

- Gradients on every card (only on hero/empty/login/KPI/PDF cover/FAB — never list cards)
- Drop shadows on everything in dark mode (use surface-level lift instead)
- Glassmorphism on data tables (illegible)
- Cute illustrations on every empty state (slows perception)
- Excessive animation (kills perceived performance)
- Color overload (more than 3 semantic colors per page)
- Decorative borders on cards (use elevation instead)
- Browser-native UI primitives — `<select>`, `window.alert/confirm/prompt`, `<input type="date|time|month">`, `<details>` — replaced with custom Base UI primitives (see §17). 67 violations audited at sesi 4; getting eliminated phase by phase.
- `framer-motion` library (rejected sesi 5; redundant with Next.js 16 View Transitions API + CSS keyframes; ~50KB bloat)
- Stacking same-level surfaces (card-on-card must be L2 + L3 — see §2.3)
- Animating `width`, `height`, `font-size`, `color` (use `transform`, `opacity`, `filter` only — see §11 + 04a)

---

## 2. Color System

### 2.1 Palette: "Tetra Crimson Editorial"

#### Primary — Brand Crimson

```
crimson-50   #FFF1F4   — subtle backgrounds, hover highlights
crimson-100  #FFDDE5   — selected states (light mode)
crimson-200  #FFB8C7   — disabled brand elements
crimson-300  #FF8FA5   — secondary brand text
crimson-400  #F76286   — hover states
crimson-500  #DC2954   — PRIMARY (brand main)
crimson-600  #B91C42   — primary hover
crimson-700  #971535   — pressed state
crimson-800  #7A0F2A   — dark backgrounds
crimson-900  #5C0B20   — darkest
crimson-950  #3D0716   — extreme dark
```

#### Neutrals — Slate (warm-leaning)

```
slate-50    #FAFAF9   — light mode background (NOT pure white, warm off-white)
slate-100   #F4F4F2   — light mode surface
slate-200   #E7E7E5   — light mode border
slate-300   #D4D4D2   — disabled in light
slate-400   #A8A8A6   — muted text in light
slate-500   #737371   — body text in dark contexts
slate-600   #57575A   — body text muted
slate-700   #404044   — primary text in light
slate-800   #2A2A2F   — heading in light, surface in dark
slate-900   #18181D   — surface in dark mode
slate-950   #0A0A0F   — DARK MODE BACKGROUND
```

Rationale: Slight warm tint (vs cold pure-grey) feels more inviting. Matches the warm cream from Tetra brand.

#### Semantic Colors

```
SUCCESS (Emerald)
emerald-50   #ECFDF5
emerald-500  #10B981   — main success
emerald-600  #059669   — success hover
emerald-700  #047857   — pressed

WARNING (Amber)
amber-50     #FFFBEB
amber-500    #F59E0B   — main warning
amber-600    #D97706
amber-700    #B45309

DANGER (Rose)
rose-50      #FFF1F2
rose-500     #F43F5E   — main danger (different from crimson! Used for errors only)
rose-600     #E11D48
rose-700     #BE123C

INFO (Sky)
sky-50       #F0F9FF
sky-500      #0EA5E9   — main info
sky-600      #0284C7
sky-700      #0369A1
```

#### Accent Colors (Sparingly)

```
GOLD (premium touchpoints)
gold-300     #DEB57F   — light gold for backgrounds
gold-500     #D4A574   — main gold (PDF headers, premium badges)
gold-700     #A47A4A   — text on gold backgrounds

SAGE (sinking funds visualization)
sage-300     #A6BBA8
sage-500     #84A98C   — main sage
sage-700     #5A7B62
```

### 2.2 Color Usage Guidelines

**Primary actions:** crimson-500 (filled button)
**Secondary actions:** slate-200 (light) / slate-800 (dark) outlined button
**Destructive actions:** rose-500
**Brand badges:** crimson with gold accent for "premium"
**Status badges:**
- Confirmed/Lunas: emerald
- Pending/DP: amber
- Overdue/Cancelled: rose
- Draft/Info: sky

**Never use:**
- Pure black (`#000`) — too harsh, use slate-950
- Pure white (`#FFF`) — feels sterile, use slate-50
- More than 3 semantic colors on one screen

### 2.3 Surface Hierarchy — 4 Levels

**Old system** (pre-sesi 5) had only 2 dark levels (`slate-950` page + `slate-900` card), producing flat-feeling stacks. **New system** (F1, commit `c273b51`) has 4 levels for proper depth and a no-stacking rule.

**Tailwind utility:** `bg-surface-1` … `bg-surface-4`. Tokens auto-switch with `.dark` class.

| Level | Token | Dark | Light | Usage |
|---|---|---|---|---|
| L0 | `bg-background` | `#0A0A0F` | `#FAFAF9` | True page background. Body element only. |
| L1 | `bg-surface-1` | `#121218` | `#FFFFFF` | App shell, sidebar, sticky topbar |
| L2 | `bg-surface-2` | `#18181D` | `#FCFCFB` | Default card |
| L3 | `bg-surface-3` | `#22222A` | `#F4F4F2` | Popover, dialog, sheet, elevated card, dropdown |
| L4 | `bg-surface-4` | `#2C2C36` | `#E7E7E5` | Selected row, hover-elevated chip |

**Hard rule:** never stack same-level surfaces.
- ✅ Card on page → L2 on L0
- ✅ Card on sidebar → L2 on L1
- ✅ Popover with hover row → L3 + L4 hover row
- ❌ Card-on-card same level → use L2 + L3 instead
- ❌ Popover at L2 (same as default card) → must be L3

**Borders** — three tones tied to `bg-border-{subtle|default|strong}`:

| Token | Dark | Light | Usage |
|---|---|---|---|
| `border-subtle` | `#1F1F26` | `#F0F0EE` | Hairline divisions inside a section |
| `border-default` | `#2A2A2F` | `#E7E7E5` | Card borders, table row borders |
| `border-strong` | `#404044` | `#D4D4D2` | Focus rings, primary dividers |

**Text in dark:**
- Heading: `text-foreground` (`#FAFAF9`)
- Body: `text-foreground` (or `text-muted-foreground` for secondary)
- Muted: `text-muted-foreground` (`#A8A8A6`)

**Text in light:**
- Heading: `text-foreground` (`#18181D`)
- Body: `text-foreground` (or `text-muted-foreground`)
- Muted: `text-muted-foreground` (`#737371`)

**Why dark mode default:** owners often work at night, reduces eye strain across long sessions, premium feel, better OLED battery on phone. Light mode polish is parked at Phase P5 per DR-023.

### 2.4 Branded Gradients — Sunrise + Aurora

Two confident gradient accents, used SPARINGLY. Reject Y2K maximalism (gradients-on-everything) and reject timid even-distribution. The 70/20/10 split (info/mobility/brand) holds; the 10% just goes harder.

| Gradient | Stops | Token / Utility |
|---|---|---|
| **Sunrise** (warm) | crimson-500 → amber-500 → gold-300 | `bg-gradient-sunrise`, `text-gradient-sunrise`, `bg-gradient-sunrise-radial` |
| **Aurora** (cool) | violet-500 → fuchsia-500 → rose-400 | `bg-gradient-aurora`, `text-gradient-aurora`, `bg-gradient-aurora-radial` |
| **Mesh-warm** (cinematic) | conic crimson↔amber↔gold | `bg-gradient-mesh-warm` (use rarely, reserved for splash/empty-state hero) |

**Where to use:**
- ✅ Login / splash hero background
- ✅ Dashboard primary KPI hero (single hero per page)
- ✅ Empty-state primary CTA (FAB-style button)
- ✅ Premium PDF cover band
- ✅ Achievement / completion moments
- ✅ Branded headlines like "Selamat datang kembali" via `text-gradient-sunrise`

**Where NOT to use:**
- ❌ Cards in lists (every event card with a gradient → maximalist chaos)
- ❌ Dashboard backgrounds globally
- ❌ Form fields, inputs, buttons (except the FAB primary on empty state)
- ❌ Tables, table rows, table headers
- ❌ Sidebar, topbar (use L1 surface only)

**Category color mapping** (icon glyph + 1px section header border ONLY — never card backgrounds):

| Category | Color | Why |
|---|---|---|
| Operations | `violet-300` | Active, in-flight |
| Finance | `emerald-300` | Money, growth |
| Warehouse | `sky-300` | Inventory, calm |
| Design | `gold-300` | Creative, premium |
| Reminders | `fuchsia-300` | Attention, alert |
| Reports | `cyan-300` | Analytical, cool |

These rely on Tailwind v4 default palette; not redefined in our `@theme` block.

### 2.5 Glow Shadows — Branded Lift Moments

Three branded glow shadows for primary CTAs, KPI hero tiles, and achievement states. Used over a darker surface to create a halo. Don't combine with `shadow-md/lg` (double-shadow looks muddy).

| Token | Hex (compositor) | Usage |
|---|---|---|
| `shadow-glow-crimson` | crimson @ 0.45/0.25 alpha | Primary CTA, KPI hero default |
| `shadow-glow-aurora` | fuchsia + violet @ 0.45/0.25 | Achievement / report hero |
| `shadow-glow-sunrise` | amber + crimson @ 0.4/0.25 | Premium / paid moments |

**Why no glow on light mode:** glows wash out on `#FAFAF9`. Only used in dark mode. In light mode, primary CTAs lift via `shadow-md` + crimson border instead.

---

## 3. Typography

### 3.1 Type Scale

| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `display-2xl` | 60px / 3.75rem | 1.0 | 700 | Marketing headlines (rare) |
| `display-xl` | 48px / 3rem | 1.0 | 700 | Splash screens |
| `display-lg` | 36px / 2.25rem | 1.1 | 600 | Page headers |
| `heading-1` | 30px / 1.875rem | 1.2 | 600 | Section heroes |
| `heading-2` | 24px / 1.5rem | 1.3 | 600 | Section titles |
| `heading-3` | 20px / 1.25rem | 1.4 | 600 | Card titles, modal headers |
| `heading-4` | 18px / 1.125rem | 1.4 | 600 | Subsections |
| `body-lg` | 18px / 1.125rem | 1.6 | 400 | Important body text |
| `body` | 15px / 0.9375rem | 1.6 | 400 | Default body |
| `body-sm` | 13px / 0.8125rem | 1.5 | 400 | Secondary text |
| `caption` | 12px / 0.75rem | 1.4 | 400 | Captions, labels |
| `caption-sm` | 11px / 0.6875rem | 1.3 | 500 | Micro labels (uppercase) |

### 3.2 Font Families

**`Inter`** — UI body, headings, labels (default)
- Free Google Font
- Variable weights 400, 500, 600, 700
- Excellent screen rendering
- Loaded via `next/font` with `display: swap`

**`Playfair Display`** — Branded moments
- Free Google Font
- Used for: splash screen, login screen, PDF headers, premium reports
- Pairs editorial serif with utilitarian Inter
- NOT used in dashboards or daily-use UI (too elaborate for prolonged reading)

**`JetBrains Mono`** — Tabular numbers
- Free Google Font
- Used for: financial figures in tables, IDs, codes, monospace blocks
- Tabular figures align decimals perfectly
- Loaded only on pages that need it (dynamic import)

### 3.3 Typography Rules

**Headings:**
- Use `font-semibold` (600), not bold (700) for most headings
- Tighter `tracking-tight` (-0.025em) for display sizes
- Sentence case, not Title Case (more modern, less formal)

**Body:**
- 1.6 line-height for readable paragraphs
- Max-width 65ch for prose (improves readability)
- Never use `text-justify` (creates uneven gaps)

**Numbers (financial):**
- Always use tabular figures: `font-feature-settings: 'tnum'`
- Use JetBrains Mono for tables of numbers
- Right-align in tables
- Format: `Rp 1.500.000` (Indonesian locale, dot separator)

**Truncation:**
- Long client names: truncate with ellipsis after 25 chars in lists
- Show full on hover (tooltip)

### 3.4 Fluid Type Scale — Mobile Shrinkage via `clamp()`

Owner phones range from compact (~360 logical px wide) to large iPhone Pro Max. Fixed-px headlines force horizontal scroll on the small end and look anemic on the large end. Solution: `clamp(min, preferred, max)` so each step naturally interpolates with viewport width.

Defined in `src/app/globals.css` as `--text-fluid-*` tokens. Tailwind v4 picks them up as `text-fluid-*` utilities.

| Utility | Mobile (~360px) | Desktop (~1440px) | Use for |
|---|---|---|---|
| `text-fluid-caption` | 11px | 12px | Micro labels, table headers |
| `text-fluid-body` | 13px | 16px | Default body, form values |
| `text-fluid-h3` | 16px | 20px | Card titles, modal headers |
| `text-fluid-h2` | 18px | 24px | Section titles |
| `text-fluid-h1` | 22px | 32px | Page hero — REPLACES old `text-3xl` h1 |
| `text-fluid-display` | 28px | 48px | Login/splash only |

**Pages should adopt fluid utilities by default in the application phases (A1-A11)** — fixed `text-3xl`, `text-2xl` etc still work but the fluid versions are the new convention.

### 3.5 Mobile Shrinkage Rules

**Why this exists:** sesi 5 friend feedback was that phone view felt scroll-heavy and oversized. Owners are Gen Z; mobile must feel like a native app, not a desktop site shrunk.

**Type:**
- Body: `text-fluid-body` (13px → 16px)
- H1: `text-fluid-h1` (22px → 32px). NEVER `text-3xl` (30px fixed) on mobile.
- H2: `text-fluid-h2`. H3: `text-fluid-h3`. Captions: `text-fluid-caption`.

**Spacing (mobile):**
- Cards: `p-3` (12px) — never `p-6` / `p-8`
- Page screens: `px-4 py-3` (16/12) — never `p-8`
- Section gaps: `gap-4` (16px), not `gap-8`

**Layout:**
- Tables collapse to vertical card list at `<md` via `<ResponsiveTable>` (F3 primitive)
- Owner sticky bottom nav (mirrors crew, see §9.2 — added in A1)
- Topbar collapses to 44px sticky bar on mobile (was 56px)
- Container queries (`@container`) on cards adapt to sidebar collapse, not just viewport breakpoint

---

## 4. Spacing System

### 4.1 Scale (4px base)

```
0    0px
0.5  2px
1    4px
1.5  6px
2    8px
2.5  10px
3    12px
4    16px
5    20px
6    24px
8    32px
10   40px
12   48px
16   64px
20   80px
24   96px
```

### 4.2 Layout Rules

**Page padding:**
- Mobile: `px-4 py-3` (16/12) — HARD CAP
- Tablet: `px-6` (24px)
- Desktop: `px-8` (32px)

**Section spacing:**
- Mobile: `mb-4` between sections, `gap-4` for stacks
- Desktop: `mb-8` (32px) or `mb-12` (48px) between major sections, `mb-6` (24px) between subsections

**Card padding:**
- Mobile: `p-3` (12px) — HARD CAP, even for hero cards
- Desktop default: `p-6` (24px)
- Desktop compact (lists): `p-4` (16px)
- Desktop hero: `p-8` (32px)

**Why the mobile cap:** ~360px viewport with `p-6` leaves ~312px of usable width per card. Halving the padding to `p-3` gives ~336px — measurable difference for content-dense screens. Verified with redesign feedback at sesi 5.

**Form field spacing:**
- Between fields: `gap-4` (16px)
- Between sections in form: `gap-8` (32px)
- Label to input: `mb-2` (8px)

**Button sizing:**
- Icon button: `40px × 40px` (mobile), `36px × 36px` (desktop)
- Default button: `h-10 px-4` mobile, `h-9 px-3` desktop
- Large CTA: `h-12 px-6`
- Touch target minimum: 44px (mobile)

---

## 5. Elevation & Shadows

Subtle, only where needed for visual hierarchy. **Tailwind v4 default scale** (`shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`) handles light-mode lift. Dark mode lifts via surface-level steps (§2.3) plus optional **glow shadows** (§2.5) for branded moments.

**Light mode** — use Tailwind defaults:
- `shadow-sm` — default card
- `shadow-md` — hover state, dropdown
- `shadow-lg` — popover, dialog
- `shadow-xl` — fullscreen modal

**Dark mode** — shadows wash out on `#0A0A0F`. Lift via:
1. Move to higher surface level (L2 → L3)
2. Add `border-default` or `border-strong`
3. For branded "wow" moments only: `shadow-glow-crimson` / `shadow-glow-aurora` / `shadow-glow-sunrise`

```css
/* Dark default card */
.card { background: var(--surface-2); border: 1px solid var(--border-default); }

/* Dark elevated card (popover, dialog) */
.popover { background: var(--surface-3); border: 1px solid var(--border-default); }

/* Dark hover row inside popover */
.popover-row[data-hover] { background: var(--surface-4); }

/* Dark primary CTA glow (use sparingly) */
.cta-primary { box-shadow: var(--shadow-glow-crimson); }
```

**Anti-pattern:** stacking `shadow-md` + `shadow-glow-crimson` on the same element. Pick one elevation strategy per element.

---

## 6. Border Radius

Centralized via `--radius: 0.5rem` (8px) in `globals.css`. Tailwind utilities derive from it.

| Utility | Px | Use for |
|---|---|---|
| `rounded-none` | 0 | Decorative dividers |
| `rounded-sm` | ~5px | Small chips, badges (`calc(--radius * 0.6)`) |
| `rounded-md` | ~6px | Buttons, inputs (`calc(--radius * 0.8)`) |
| `rounded-lg` | 8px | **Cards default** (`--radius`) |
| `rounded-xl` | ~11px | Modals, sheets (`calc(--radius * 1.4)`) |
| `rounded-2xl` | ~14px | Hero cards (`calc(--radius * 1.8)`) |
| `rounded-3xl` | ~18px | Premium / FAB (`calc(--radius * 2.2)`) |
| `rounded-full` | — | Avatars, circular buttons |

**Default for most things: `rounded-lg` (8px)** — modern, not too sharp, not too soft.

Mobile shrinkage rule: keep cards on `rounded-lg`. Don't shrink to `rounded-md` on mobile — radius reads thinner on smaller surfaces and the corner-curve disappears.

---

## 7. Icons

### 7.1 Icon Library: Lucide React

- Free, consistent, well-designed
- Tree-shakeable
- Outlined style (matches our aesthetic)

### 7.2 Icon Sizing

```
xs   12px    — inline with caption text
sm   14px    — inline with body text
md   16px    — default in buttons
lg   20px    — primary navigation
xl   24px    — features, hero CTAs
2xl  32px    — empty states, hero
```

### 7.3 Icon + Text Spacing

- Icon left of text: `gap-2` (8px)
- Icon right of text: `gap-2` (8px)
- Icon-only button: padding ensures `40×40` minimum target

---

## 8. Component Specifications

### 8.1 Button

**Variants:**

```
primary       crimson-500 bg, white text
secondary     slate-200 (light) / slate-800 (dark) bg
outline       transparent bg, slate-300 (light) / slate-700 (dark) border
ghost         transparent bg, no border, hover bg-slate-100/800
destructive   rose-500 bg, white text
```

**Sizes:**
```
xs   h-7 px-2 text-xs
sm   h-8 px-3 text-sm
md   h-10 px-4 text-sm     ← default
lg   h-12 px-6 text-base
icon h-10 w-10
```

**States:**
- Hover: 90% opacity OR shifted color (darker by 1 step)
- Active: shifted color (darker by 2 steps)
- Disabled: 50% opacity, cursor not-allowed
- Loading: inline spinner replaces icon, button still has loading text

### 8.2 Input

```
height        40px (h-10)
padding       px-3
border        slate-200 (light) / slate-800 (dark)
border-focus  crimson-500
border-error  rose-500
border-radius 6px
font-size     14px (text-sm)
```

States:
- Focus: ring-2 ring-crimson-500 ring-offset-2
- Error: border-rose-500, error message below
- Disabled: bg-slate-100 (light) / slate-900 (dark), opacity-60

### 8.3 Card

```
background    white (light) / slate-900 (dark)
border        slate-200 (light) / slate-800 (dark)
border-radius 8px (rounded-md)
padding       p-6
shadow        shadow-xs (light only)
```

Variants:
- Default: as above
- Hover-able: hover:shadow-sm hover:border-slate-300/700
- Selected: ring-2 ring-crimson-500
- Outlined: no shadow, just border

### 8.4 Badge

```
height        20px (h-5)
padding       px-2
border-radius 4px
font-size     11px (text-xs)
font-weight   500
```

Variants:
- Solid (filled): used for status badges (Lunas, Unpaid, etc.)
- Soft (tinted bg + dark text): used for category labels
- Outline: used for filters

### 8.5 Modal / Dialog

```
backdrop      black with 60% opacity, blur-sm
container     centered, max-w-2xl
border-radius 12px (rounded-lg)
padding       p-6
shadow        shadow-xl
animation     slide-up + fade (200ms)
```

**Mobile:** full-screen drawer from bottom (slide up to fill)

### 8.6 Toast / Notification

```
position      bottom-right (desktop), bottom-center (mobile)
width         max-w-sm
padding       p-4
border-radius 8px
shadow        shadow-lg
```

Auto-dismiss: 4 seconds default, 6 seconds for errors, persistent for actions requiring user input.

### 8.7 Table

```
header bg     slate-100 (light) / slate-900 (dark)
header text   slate-600 (light) / slate-400 (dark), uppercase, text-xs
row padding   py-3 px-4
row border    border-b slate-200 / slate-800
hover bg      slate-50 / slate-900
```

Mobile: tables collapse to card list (each row becomes a card).

### 8.8 Form Components

**Label:**
- Position: above input
- Style: text-sm, font-medium, slate-700 (light) / slate-300 (dark)
- Required indicator: red asterisk after label

**Helper text:**
- Position: below input
- Style: text-xs, slate-500

**Error text:**
- Position: below input (replaces helper)
- Style: text-xs, rose-500
- Icon: AlertCircle

---

## 9. Layout Patterns

### 9.1 Owner Desktop Layout

```
┌─────────────────────────────────────────────┐
│ Top Bar (h-14, sticky)                      │ ← logo + search + notifications + user menu
├──────────┬──────────────────────────────────┤
│          │                                   │
│ Sidebar  │  Main Content                    │
│ (w-64)   │  (max-w-7xl mx-auto px-8)        │
│          │                                   │
│ Nav      │                                   │
│ items    │                                   │
│          │                                   │
└──────────┴──────────────────────────────────┘
```

### 9.2 Owner Mobile Layout

```
┌─────────────────────────────┐
│ Top Bar (collapsed, h-11)   │ ← 44px sticky on mobile
├─────────────────────────────┤
│                             │
│ Main Content (px-4 py-3)    │ ← p-4 hard cap
│ Single column               │
│                             │
├─────────────────────────────┤
│ Bottom Nav (h-16, sticky)   │ ← REQUIRED for owner mobile (A1 phase)
└─────────────────────────────┘
```

Owner mobile gets a sticky bottom nav mirroring the crew app pattern (5 tabs: Dashboard, Operations, Finance, Reminders, More). Topbar collapses to 44px. Sidebar → hamburger menu → sheet from left (`<Sheet>` primitive, F3).

### 9.3 Crew Mobile Layout

```
┌─────────────────────────────┐
│ Top Bar (logo + bell)       │
├─────────────────────────────┤
│                             │
│ Main Content                │
│ Single column, px-4         │
│                             │
│                             │
├─────────────────────────────┤
│ Bottom Nav (5 tabs, h-16)   │
└─────────────────────────────┘
```

Bottom nav always visible, primary navigation method.

### 9.4 Modal Layout (Mobile)

Full-screen drawer from bottom:
```
┌─────────────────────────────┐
│ Drag handle                 │
├─────────────────────────────┤
│ Modal Title    [×]          │
├─────────────────────────────┤
│                             │
│ Content                     │
│                             │
├─────────────────────────────┤
│ [Cancel]  [Primary Action]  │
└─────────────────────────────┘
```

---

## 10. Responsive Breakpoints

```
sm   640px   — large phones / small tablets
md   768px   — tablets
lg   1024px  — small desktops
xl   1280px  — desktops
2xl  1536px  — large displays
```

**Mobile-first approach:** Default styles for mobile, override with `md:` and up for larger screens.

**Breakpoint usage:**
- `<sm`: phone-only mobile UI
- `sm-md`: tablet adjustments
- `md+`: desktop layout (sidebar visible, table mode)
- `lg+`: more spacious, multi-column layouts

---

## 11. Motion & Animation

This section is the high-level summary. Full details — keyframes, View Transitions API patterns, sample code, what NEVER to animate — are in **`docs/04a_MOTION_GUIDELINES.md`**.

### 11.1 Principles

- **Purposeful:** every animation has a reason (feedback, hierarchy, delight)
- **Fast:** mostly 120-320ms; never >500ms
- **Compositor-only:** animate `transform`, `opacity`, `filter`. **NEVER** `width`, `height`, `font-size`, `color` (force layout/paint, jank)
- **Reduced motion:** respect `prefers-reduced-motion`, disable non-essential animations
- **Zero-JS bloat:** Next.js 16 View Transitions API (page-level) + CSS keyframes / `@starting-style` (component-level) + `tw-animate-css`. Reject `framer-motion` (~50KB, redundant).

### 11.2 Motion Tokens (defined in `globals.css` F1)

```
--duration-fast    120ms      Microinteractions, hover states
--duration-base    200ms      Default transitions, dialogs
--duration-slow    320ms      Page-level transitions, hero reveals

--ease-out-expo    cubic-bezier(0.16, 1, 0.3, 1)    Entrances (default)
--ease-out-quart   cubic-bezier(0.25, 1, 0.5, 1)    Subtle entrances
--ease-spring      cubic-bezier(0.34, 1.56, 0.64, 1) Playful overshoot
```

Tailwind v4 picks these up as `duration-fast`, `duration-base`, `duration-slow`, `ease-out-expo` etc. utilities.

### 11.3 View Transitions API (Page-Level)

Activated via `experimental.viewTransition: true` in `next.config.ts` (F4). Wrap shared elements (event-card → event-detail hero) with matching `view-transition-name` CSS to get cross-fade / morph for free. **2-3× perceived speedup** vs. JS routers on low-end devices.

### 11.4 Where to Animate

**Yes:**
- Modal / sheet open/close (slide-up + fade, `duration-base`, `ease-out-expo`)
- Toast appearance (slide in from edge, `duration-base`)
- Page transitions (View Transitions API, `duration-slow`)
- Button press (`active:scale-[0.97]`, `duration-fast`)
- Skeleton → content swap (fade, `duration-base`)
- KPI number counters (when meaningful — dashboard load only)

**No:**
- Every button hover (overkill, kills compositor budget)
- Color transitions on every element
- Auto-rotating carousels
- Decorative spinning icons
- Bouncing CTA buttons (annoying)
- Animating gradient stops (forces paint)

---

## 12. Branded Touchpoints (10% Brand Layer)

Specific surfaces that get full brand identity. Per **DR-024**, brand photography is rejected — these moments use **gradients + iconography only** (no photo assets).

### 12.1 Login Screen

- Background: `bg-gradient-sunrise-radial` from top-left, fades to L0 surface
- Logo: Tetra Photobooth full color (centered, ~200px wide)
- Headline: Playfair Display "Selamat datang kembali" via `text-gradient-sunrise`
- CTA: solid crimson + `shadow-glow-crimson` — "Masuk dengan Google"
- Mobile: `text-fluid-display` headline, `p-4` content padding

### 12.2 Splash / Onboarding

- Background: `bg-gradient-mesh-warm` (conic mesh) at low opacity (~30%) over L0
- Headlines: Playfair Display
- Body: Inter
- **No photography** (DR-024 — gradient + iconography only)

### 12.3 PDF Documents (Invoice, Quotation, BAST, Reports)

- Header band: solid crimson-500 with gold-500 1px accent line
- Title: Playfair Display 36pt
- Tetra logo: top-right
- Body: Inter 11pt
- Footer: gold accent + contact info
- Watermark: subtle Tetra logo at 5% opacity

PDF generation via `@react-pdf/renderer`. Component base in `src/components/pdf/`.

### 12.4 Empty States

Per **DR-025**, empty-state copy is generated by Claude in Indonesian-Tetra voice (warm, ops-team practical, never cute) during the relevant Application phase.

- **Visual**: `<EmptyState>` primitive (F3) — large Lucide icon + headline + body + primary CTA
- **No illustrations** — earlier plan mentioned Storyset/unDraw illustrations; deferred indefinitely. Icon + gradient + typography is enough.
- **Primary CTA**: filled crimson button + `shadow-glow-crimson` if it's the only action; ghost button if multiple actions on screen.
- **Optional decorative**: subtle `bg-gradient-sunrise-radial` at 5-10% opacity behind the icon, only on hero empty states (e.g. dashboard zero-events).

### 12.5 Email Templates (Future)

If/when email implemented:
- Header band crimson
- Body white with slate text
- CTA button crimson

---

## 13. Accessibility

### 13.1 Standards

WCAG 2.1 AA minimum.

### 13.2 Color Contrast

All text/background pairs verified for contrast ratio:
- Body text: minimum 4.5:1
- Large text: minimum 3:1
- UI components: minimum 3:1 against adjacent colors

Tools: contrast checker run on every new component.

### 13.3 Keyboard Navigation

- All interactive elements reachable via Tab
- Focus indicators visible (ring-2 ring-crimson-500)
- Logical tab order
- Escape closes modals
- Enter submits forms

### 13.4 Screen Reader Support

- Semantic HTML (proper heading hierarchy)
- ARIA labels on icon-only buttons
- Form inputs have associated labels
- Loading states announced
- Errors announced

### 13.5 Mobile Accessibility

- Minimum tap target 44x44px
- Sufficient spacing between interactive elements
- Pinch-zoom NOT disabled (allow user zoom)
- Orientation: works in both portrait and landscape

---

## 14. Tailwind Configuration

We use **Tailwind v4** with the `@theme inline` directive. **There is no `tailwind.config.ts`.** All theme tokens live in `src/app/globals.css` and are picked up automatically.

### 14.1 How tokens become utilities

Tailwind v4 namespace prefixes auto-generate utilities:

| Token prefix | Utility namespace | Example |
|---|---|---|
| `--color-*` | `bg-*`, `text-*`, `border-*` | `--color-surface-2` → `bg-surface-2` |
| `--text-*` | `text-*` (font-size) | `--text-fluid-h1` → `text-fluid-h1` |
| `--font-*` | `font-*` | `--font-display` → `font-display` |
| `--shadow-*` | `shadow-*` | `--shadow-glow-crimson` → `shadow-glow-crimson` |
| `--ease-*` | `ease-*` | `--ease-out-expo` → `ease-out-expo` |
| `--duration-*` | `duration-*` | `--duration-fast` → `duration-fast` |
| `--radius-*` | `rounded-*` | `--radius-lg` → `rounded-lg` |

For tokens NOT in a v4 namespace (gradients, etc), define them as plain CSS vars and expose via `@utility` block. Example from `globals.css`:

```css
@utility bg-gradient-sunrise {
  background-image: var(--gradient-sunrise);
}
```

### 14.2 Theme switching pattern

Semantic tokens use the `var()` indirection so values resolve per-theme:

```css
@theme inline {
  --color-surface-2: var(--surface-2);   /* var → resolves at runtime */
}
:root  { --surface-2: #FCFCFB; }          /* light mode value */
.dark  { --surface-2: #18181D; }          /* dark mode value */
```

This means `bg-surface-2` in JSX automatically switches when `.dark` is on the `<html>`. No conditional className needed.

---

## 15. Design Tokens File (TS Mirror)

Type-safe TS mirror at **`src/lib/tokens.ts`**. The CSS file is the source of truth; this file exposes names so CVA variants and component prop types catch drift at compile time.

```ts
// src/lib/tokens.ts (excerpt)
export const surfaceLevels = ["1", "2", "3", "4"] as const;
export type SurfaceLevel = typeof surfaceLevels[number];

export const durations = ["fast", "base", "slow"] as const;
export const easings = ["out-expo", "out-quart", "spring"] as const;
export const gradients = ["sunrise", "aurora", "sunrise-radial", ...] as const;

export const cssVar = {
  surface: (level: SurfaceLevel) => `var(--surface-${level})`,
  gradient: (g: Gradient) => `var(--gradient-${g})`,
  duration: (d: Duration) => `var(--duration-${d})`,
};
```

Use the TS object when applying tokens via inline `style={{ ... }}` (rare — usually Tailwind utility is enough). Use the type unions for CVA variants:

```ts
const cardVariants = cva("rounded-lg border", {
  variants: {
    surface: {
      "1": "bg-surface-1",
      "2": "bg-surface-2",
      "3": "bg-surface-3",
    } satisfies Record<SurfaceLevel, string>,  // catches drift
  },
});
```

---

## 16. Brand Asset Integration

### 16.1 Logo Files Needed

To be provided by Rama (in `/brand-assets/` folder):

```
brand-assets/
├── logo-full-color.svg          ← primary logo, full Tetra branding
├── logo-full-color.png          ← raster fallback
├── logo-monochrome-dark.svg     ← logo for use on light bg
├── logo-monochrome-light.svg    ← logo for use on dark bg
├── logomark-only.svg            ← just the "T." mark, square
├── favicon.ico                  ← 32×32 favicon
├── apple-touch-icon.png         ← 180×180 PNG
└── pwa-icons/
    ├── icon-192.png
    ├── icon-512.png
    └── icon-maskable-512.png
```

Setup script in `08_IMPLEMENTATION_PLAN.md` will resize and place these correctly.

### 16.2 Logo Placement Rules

- **Sidebar:** logomark-only.svg, 32×32px
- **Login screen:** logo-full-color.svg, 200px wide
- **PDF headers:** logo-full-color.png, top-right, 80px wide
- **PWA install:** pwa-icons/* per spec
- **Email signature:** logo-full-color.png, 120px wide

Minimum spacing around logo: equal to height of "T." mark on all sides.

Don't:
- Don't stretch or skew
- Don't recolor outside approved monochrome variants
- Don't add effects (drop shadow, glow, etc.)
- Don't place on busy backgrounds

---

## 17. Custom Primitive Library

Foundation built on **`@base-ui/react`** (Base UI — the underlying primitive lib that shadcn/ui wraps). We don't add `shadcn` components via the CLI; we copy patterns from `node_modules/shadcn/dist/registry/` when needed and adapt to our tokens.

### 17.1 Existing primitives at `src/components/ui/`

13 primitives shipped pre-sesi 5: `accordion`, `avatar`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `form` (RHF wrapper), `input`, `label`, `radio-group`, `select`, `tabs`, `textarea`. All token-aware.

### 17.2 NEW primitives shipping in Phase F3 (15 files)

To eliminate the 67 browser-native UI violations audited at sesi 4:

| File | Replaces | Phase |
|---|---|---|
| `alert-dialog.tsx` | (new — destructive confirmations) | F3a |
| `confirm-dialog.tsx` | 19× `window.confirm/alert/prompt` | F3a |
| `disclosure.tsx` | 4× `<details>/<summary>` | F3a |
| `tooltip.tsx` | (new) | F3a |
| `sheet.tsx` | (new — mobile bottom sheet for forms/menus) | F3a |
| `skeleton.tsx` | (new — used by all `loading.tsx`) | F3a |
| `empty-state.tsx` | scattered inline empty messages | F3a |
| `native-select.tsx` (or extend `select.tsx`) | 34× raw `<select>` | F3b |
| `file-drop.tsx` | 1× `<input type="file">` (csv-import) + drag-drop | F3b |
| `toast.tsx` | wire **sonner** (already installed, never imported) | F3b |
| `date-picker.tsx` | 4× `<input type="date">` | F3c |
| `time-picker.tsx` | 3× `<input type="time">` | F3c |
| `month-picker.tsx` | 2× `<input type="month">` | F3c |
| `responsive-table.tsx` | `<table>` mobile horizontal-scroll problem | F3c |
| `data-table.tsx` | per-page table+filter+pagination boilerplate | F3c |

Plus barrel export at `src/components/ui/index.ts` and a dev-only showcase route at `src/app/dev/primitives/page.tsx` (gated by `NODE_ENV !== "production"`) rendering every primitive in light + dark + mobile + desktop variants.

### 17.3 Layout primitives at `src/components/layout/` (Phase F4, NEW)

- `<Container size="sm|md|lg|xl">` — adaptive padding wrapper
- `<Stack gap="...">` — vertical flow
- `<Cluster gap="...">` — horizontal flow with wrap
- `<SectionHeader title actions />` — REPLACES every ad-hoc page-top `text-3xl` h1

### 17.4 Domain custom components at `src/components/`

Existing reusable patterns (don't rebuild):
- `<CsvImportWizard>` — 4-step wizard pattern (used by 4 importers)
- `<DataTable>` — sortable / filterable / paginated (in F3c)
- `<KPICard>` — dashboard metric card
- `<EventCard>` — event list/card
- `<MoneyDisplay>` — formatted IDR (`Rp 1.500.000`) with `.tabular` font feature
- `<RoleBadge>` — crew tier indicators

### 17.5 Why Base UI not direct shadcn install

Base UI gives us better mobile-touch behavior and accessibility primitives without a CLI dependency. shadcn-style copy-paste is fine for individual patterns; the `shadcn` package in `node_modules/` provides the design tokens via `@import "shadcn/tailwind.css"` at the top of `globals.css`.

---

## 18. Anti-Patterns 2026 (Quick Reject List)

When reviewing PRs, reject any of these on sight:

| Pattern | Why reject | Use instead |
|---|---|---|
| `<select>` (raw HTML) | Mobile UX is platform-default and clashes with our design | `<Select>` from `ui/select.tsx` |
| `window.alert/confirm/prompt` | Blocks JS thread, no styling, jarring | `<ConfirmDialog>` + `toast.promise()` |
| `<input type="date|time|month">` | Mobile-only OS picker, can't style | `<DatePicker>` / `<TimePicker>` / `<MonthPicker>` (F3c) |
| `<input type="file">` | No drag-drop, no preview | `<FileDrop>` (F3b) |
| `<details>/<summary>` | Limited a11y, no transitions | `<Disclosure>` (F3a) |
| `framer-motion` import | ~50KB redundant with View Transitions API | Next.js 16 View Transitions + CSS keyframes |
| Hard-coded `bg-zinc-*` / `bg-slate-900` | Bypasses theme switching | Semantic tokens: `bg-card`, `bg-surface-2`, `text-foreground` |
| `text-3xl` h1 on mobile | Pre-shrinkage; oversized on phones | `text-fluid-h1` (22px → 32px) |
| `p-6` / `p-8` on mobile cards | Wastes ~80px per card | `p-3` mobile-first, `md:p-6` for desktop |
| `shadow-md` + `shadow-glow-crimson` together | Muddy double-shadow | Pick one elevation strategy |
| Same-level surface stack (card on card same color) | Flat depth | L2 + L3 instead |
| Auto-rotating carousels | User has no control, breaks scroll | Static grid with manual scroll |
| Animating `width`/`height`/`color` | Forces layout/paint, jank on mobile | `transform` / `opacity` / `filter` |
| Brand photography in hero (DR-024) | Adds LCP weight, photo-quality fragility | Gradient + iconography only |

---

## 19. Design Skills + Slash Commands (sesi 5)

Available globally at `~/.claude/skills/` for use during the redesign:

| Command | Skill | Use for |
|---|---|---|
| `/refactoring-ui` | refactoring-ui | Visual hierarchy / spacing / color audit. Grayscale-first thinking. |
| `/impeccable [craft\|shape\|critique\|audit\|polish\|...]` | impeccable | Process-oriented design ops. 23 sub-commands. Run `/impeccable polish <feature>` before shipping. |
| `/frontend-design` | frontend-design | Bold creative direction. Avoid "AI-slop" aesthetics (Inter everywhere, purple-blue gradients). |
| `/ux-heuristics` | ux-heuristics | Nielsen 10 + cognitive walkthrough on a page. |
| `/ios-hig-design` | ios-hig-design | Native-app feel patterns (sheets, safe areas, SF Symbols equivalents) |
| `/top-design` | top-design | Premium / Awwwards-tier moments — login, splash, dashboard hero |
| `/hooked-ux` | hooked-ux | Engagement loops, notification UX, streak/progress systems |
| `/playwright-cli` | playwright-cli | Visual smoke-test flows during application phases |

**Recommended pattern per phase:**

1. `/refactoring-ui` audit before starting
2. Implement
3. `/impeccable polish <area>` before commit
4. `/playwright-cli` smoke-test critical flow on real device emulation

---

**End of Design System**

*Next document: [04a_MOTION_GUIDELINES.md](./04a_MOTION_GUIDELINES.md) — Motion patterns, View Transitions API, microinteraction utilities*
