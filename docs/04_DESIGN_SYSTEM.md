# 04 — Design System

**Project:** Tetra Ops
**Direction:** "Refined Operator" — Professional foundation with brand personality at the right moments.

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

- Heavy gradients on every card (looks dated)
- Drop shadows on everything (looks cheap)
- Glassmorphism on data tables (illegible)
- Cute illustrations on every empty state (slows perception)
- Excessive animation (kills perceived performance)
- Color overload (more than 3 semantic colors per page)
- Decorative borders on cards (use elevation instead)

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

### 2.3 Dark Mode (Default)

App defaults to dark mode because:
- Owner often works at night
- Easier on eyes during long sessions
- Premium feel
- Better OLED battery on phone

**Background hierarchy in dark:**
- Page bg: `slate-950`
- Card bg: `slate-900`
- Card elevated: `slate-800`
- Hover surface: `slate-800`
- Active surface: `slate-700`
- Border: `slate-800` (subtle) or `slate-700` (visible)

**Text in dark:**
- Heading: `slate-50`
- Body: `slate-200`
- Muted: `slate-400`
- Disabled: `slate-600`

### 2.4 Light Mode

Toggle available in user menu.

**Background hierarchy in light:**
- Page bg: `slate-50`
- Card bg: white
- Card elevated: white with shadow-sm
- Hover surface: `slate-100`
- Active surface: `slate-200`
- Border: `slate-200`

**Text in light:**
- Heading: `slate-900`
- Body: `slate-700`
- Muted: `slate-500`
- Disabled: `slate-300`

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
- Mobile: `px-4` (16px)
- Tablet: `px-6` (24px)
- Desktop: `px-8` (32px)

**Section spacing:**
- Between major sections: `mb-8` (32px) or `mb-12` (48px)
- Between subsections: `mb-6` (24px)

**Card padding:**
- Default: `p-6` (24px)
- Compact (lists): `p-4` (16px)
- Hero: `p-8` (32px)

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

Subtle, only where needed for visual hierarchy.

```
shadow-xs    0 1px 2px rgba(0,0,0,0.04)        — Subtle card lift
shadow-sm    0 2px 4px rgba(0,0,0,0.05)        — Default cards (light mode)
shadow-md    0 4px 8px rgba(0,0,0,0.08)        — Hover state
shadow-lg    0 10px 20px rgba(0,0,0,0.10)      — Modals, popovers
shadow-xl    0 20px 40px rgba(0,0,0,0.15)      — Major modals
```

**Dark mode:** Shadows less visible on dark bg. Use border + subtle bg-color instead.

```css
/* Dark mode card */
.card-dark {
  background: slate-900;
  border: 1px solid slate-800;
  /* No shadow needed */
}

/* Dark mode elevated */
.card-elevated-dark {
  background: slate-800;
  border: 1px solid slate-700;
}
```

---

## 6. Border Radius

```
rounded-none   0
rounded-sm     4px      — small elements (badges, chips)
rounded        6px      — buttons, inputs (default)
rounded-md     8px      — cards (default)
rounded-lg     12px     — modals, large cards
rounded-xl     16px     — hero cards
rounded-2xl    24px     — special premium cards
rounded-full              — avatars, circular buttons
```

Default for most things: `rounded-md` (8px) — modern, not too sharp, not too soft.

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
│ Top Bar                     │
├─────────────────────────────┤
│                             │
│ Main Content (px-4)         │
│ Single column               │
│                             │
├─────────────────────────────┤
│ Bottom Nav (h-16)           │ ← optional for owner mobile
└─────────────────────────────┘
```

Sidebar replaced with hamburger menu → drawer from left.

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

### 11.1 Principles

- **Purposeful:** Every animation has a reason (feedback, hierarchy, delight)
- **Fast:** 150-300ms most transitions, never >500ms
- **Eased:** `ease-out` for entrances, `ease-in` for exits
- **Reduced motion:** Respect `prefers-reduced-motion`, disable animations

### 11.2 Common Animations

```
fade-in       opacity 0 → 1, 200ms ease-out
slide-up      translateY(8px) opacity 0 → 1, 250ms ease-out
slide-down    inverse, for exits
scale-in      scale 0.95 → 1, opacity 0 → 1, 200ms ease-out
spin          for loading spinners, 800ms linear infinite
pulse         for skeleton, 1.5s ease-in-out infinite
```

### 11.3 Where to Animate

**Yes:**
- Modal open/close (slide up)
- Toast appearance (slide in from edge)
- Page transitions (fade)
- Button press (subtle scale 0.98)
- Skeleton → content swap (fade)
- Number counters (when meaningful, e.g., dashboard load)

**No:**
- Every button hover (overkill)
- Color transitions on every element
- Auto-rotating carousels
- Decorative spinning icons
- Bouncing CTA buttons (annoying)

---

## 12. Branded Touchpoints (10% Brand Layer)

These specific surfaces use full brand identity:

### 12.1 Login Screen

Background: warm gradient (crimson-50 to gold-300)
Logo: Tetra Photobooth full color (large, top-left)
Headline: Playfair Display "Selamat datang kembali"
CTA: solid crimson with white text "Masuk dengan Google"

### 12.2 Splash / Onboarding

Background: crimson-50 light texture (similar to PDF cover)
Headlines: Playfair Display
Body: Inter
Photography: Tetra brand photos (uploaded separately)

### 12.3 PDF Documents (Invoice, Quotation, BAST, Reports)

Header band: crimson-500 with gold-500 accent line
Title: Playfair Display 36pt
Tetra logo: top-right
Body: Inter 11pt
Footer: gold accent + contact info
Watermark: subtle Tetra logo at 5% opacity

### 12.4 Empty States (Premium Moments)

Use editorial illustration style:
- Hand-drawn feel (Storyset, unDraw with custom palette)
- Crimson + Gold color overlay
- Encouraging copy in slight serif

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

## 14. Tailwind Configuration (Practical)

### 14.1 Custom Theme Extension

```ts
// tailwind.config.ts (simplified)
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        crimson: { /* full ramp */ },
        slate: { /* warm-leaning ramp */ },
        gold: { /* accent */ },
        sage: { /* accent */ },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // matches our type scale tokens
      },
      borderRadius: {
        // standard scale
      },
      animation: {
        'slide-up': 'slideUp 250ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
      },
    },
  },
};
```

### 14.2 CSS Variables for Dark Mode

```css
:root {
  --color-bg: theme('colors.slate.50');
  --color-surface: theme('colors.white');
  --color-text: theme('colors.slate.900');
  /* ... */
}

.dark {
  --color-bg: theme('colors.slate.950');
  --color-surface: theme('colors.slate.900');
  --color-text: theme('colors.slate.50');
  /* ... */
}
```

Use via `bg-[var(--color-bg)]` for clean theme switching.

---

## 15. Design Tokens File

Tokens exposed as TypeScript constants for programmatic use:

```ts
// lib/design-tokens.ts
export const tokens = {
  colors: {
    primary: 'hsl(346 76% 51%)',  // crimson-500
    surface: { light: 'hsl(60 9% 98%)', dark: 'hsl(240 11% 5%)' },
    // ...
  },
  spacing: { /* 4px scale */ },
  typography: { /* type scale */ },
  motion: { duration: { fast: '150ms', base: '250ms', slow: '400ms' } },
};
```

Use in inline styles when Tailwind utility insufficient (rare).

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

## 17. Component Library Approach

We use **shadcn/ui** as foundation (copy-paste components, owned in repo).

**Components to install (Phase 1):**
- Button
- Input, Textarea, Select
- Form (with React Hook Form integration)
- Dialog (modal)
- Drawer (mobile bottom sheet)
- Dropdown Menu
- Toast (Sonner)
- Card
- Badge
- Avatar
- Tabs
- Table

**Custom components (built on top):**
- `<DataTable>` — with sorting, filtering, pagination
- `<KPICard>` — dashboard metric card
- `<EventCard>` — event list/card representation
- `<EmptyState>` — branded empty state
- `<PageHeader>` — page title + breadcrumb + action buttons
- `<MobileBottomNav>` — crew mobile nav
- `<RoleBadge>` — for crew tier indicators
- `<MoneyDisplay>` — formatted IDR with proper alignment

All custom components in `components/custom/` folder.

---

**End of Design System**

*Next document: [05_DATABASE_SCHEMA.sql](./05_DATABASE_SCHEMA.sql) — Complete Database Schema*
