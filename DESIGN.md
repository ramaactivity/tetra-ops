---
version: 1.0
name: Tetra-Ops-design-system
dna: UpGradely
description: >
  Design system for Tetra Ops — the internal operating system for Tetra
  Photobooth (Indonesia). The visual DNA is "UpGradely": fresh, soft, and
  confident. A pastel ambient gradient frames every screen; crisp near-white
  cards float on top with soft shadows and generous rounding. The single
  primary action color is INK BLACK (buttons, active nav, active tabs). Color
  accents are functional, not decorative: LIME = success/positive, ORANGE =
  warning/in-progress, SKY BLUE = info/to-do, RED = danger. Type is Inter
  (body/UI) + Manrope (display/numbers); tabular figures are mandatory on money
  and quantities. This replaces the previous Vercel-stark direction (backup at
  git tag `design-vercel-dna`).
mobile_companion: >
  MOBILE.md is the authoritative spec for phone-sized screens (owner < md and
  the whole crew app). Fonts and colors are shared and identical across mobile
  and desktop (defined here and in src/app/globals.css); MOBILE.md owns only the
  mobile form factor (density, touch targets, screen anatomy, navigation).
source_of_truth: src/app/globals.css (Tailwind v4 @theme inline + :root tokens)
---

# Tetra Ops — Design System (UpGradely DNA)

> **One sentence:** A fresh, light, gradient-framed operations app where ink-black
> is the only action color and every other color means something (lime = good,
> orange = pending, blue = info, red = danger). Numbers stay loud; chrome recedes.

Everything below is implemented as tokens in
[`src/app/globals.css`](src/app/globals.css). Change a token there and it
propagates app-wide. Prefer the existing primitives in
[`src/components/ui/`](src/components/ui/) over inline class soup.

---

## 1. The ambient gradient (signature)

A soft, low-chroma pastel wash is painted on `<html>` as a fixed layer
(`--gradient-ambient`): **blue** top-left → **peach** top-right → **green**
bottom-right → **warm-yellow** bottom-left, over a warm near-white base
(`#f7f6f3`). Layout bodies are transparent so it shows through on every page.

Rules:
- The gradient is the **frame only**. Content sits on **opaque** cards (`bg-card`)
  so dense data stays legible. Never paint a gradient *inside* a card.
- Never use gradient **text** (`background-clip: text`) — emphasis comes from
  weight/size/color.
- It is one fixed layer, not per-section orbs. Don't add competing gradients.

---

## 2. Color

OKLCH-minded, gently tinted neutrals — never pure `#000` / `#fff`. Tailwind class
names are kept (`emerald-*`, `amber-*`, `sky-*`, `rose-*`) but **re-valued in
`@theme`**, so existing callers shift to the new palette automatically.

### Roles

| Role | Token / class | Light value | Use |
|---|---|---|---|
| **Primary / CTA (ink black)** | `--primary` / `bg-primary` | `#18181b` | every primary button, active sidebar/bottom-nav pill, active tab, FAB |
| On-primary | `--primary-foreground` | `#fafafa` | label on ink |
| Foreground (text) | `--foreground` | `#1a1a17` | body + headings |
| Muted text | `--muted-foreground` | `#6d6c66` | secondary copy, captions |
| Canvas base | `--background` | `#f7f6f3` | solid base under frosted chrome (gradient on `<html>`) |
| Card | `--card` / `bg-card` | `#fefefe` | floating surfaces |
| Inset / hover | `--secondary` / `--muted` | `#f0efea` | hover fills, inset regions |
| Hairline | `--border` / `--border-default` | `#e9e8e2` | soft borders |
| Border subtle / strong | `--border-subtle` / `--border-strong` | `#f1f0eb` / `#b9b8b1` | card edges / dividers |
| Focus ring | `--ring` | `#18181b` | ink focus ring |

### Semantic accents (functional only)

| Meaning | Class family | Key shades (light) | Notes |
|---|---|---|---|
| **Success / positive / paid / done** | `emerald-*` (LIME) | bg `emerald-200 #cdf2a0`, text `emerald-900 #2e4d16`, dot `emerald-500 #74c02f` | the "good" green |
| **Warning / in-progress / pending** | `amber-*` (ORANGE) | bg `amber-100 #ffe2d4`, text `amber-800 #97350f`, dot `amber-500 #fb6d39` | UpGradely orange |
| **Info / to-do / neutral status** | `sky-*` & `teal-*` (BLUE) | bg `sky-100 #d8ebff`, text `sky-700 #195e9e` | both families resolve to the same friendly blue |
| **Danger / cancelled / negative money** | `rose-*` (RED) | `--destructive #d12e36`, bg `rose-100`, text `rose-700` | kept distinct; money minus, overdue, batal |

WhatsApp/Android brand greens (`#25D366`, `#128C4B`, `#3ddc84`) are intentional
exceptions — leave them.

---

## 3. Typography

| Role | Class | Family | Notes |
|---|---|---|---|
| Display / page hero | `.type-display` | Manrope | big, tight tracking |
| Title / heading | `.type-title` / `.type-heading` | Manrope | section + card titles |
| Body | `.type-body` / `.type-body-strong` | Inter | 15→16px |
| Secondary / caption | `.type-secondary` / `.type-caption` | Inter | muted |
| Big numbers (KPI/money) | `.type-num-lg` / `.type-num-xl` | Manrope, tabular | dashboard stats |
| Eyebrow | `.eyebrow` | **Inter** (sans), uppercase, 11px/600, +tracking | softened from the old mono |
| Money / quantity | `.tabular` / `.type-num` | tabular-nums + slashed-zero | **mandatory** anywhere money/qty appears |

- Inter is the workhorse; Manrope carries the "voice" (titles + the loud numbers).
- **Helvetica Neue was rejected** (not a free webfont); Inter is the committed face.

---

## 4. Shape & elevation

- **Radius**: `--radius` = **12px** (in-app default). Cards = `rounded-2xl`.
  Buttons, chips, pills, badges, icon buttons = **`rounded-full`** (pill). Scale:
  `radius-sm 8 / md 12 / lg 16 / xl 24 / 2xl 32` (derived from `--radius`).
- **Elevation**: soft, low-opacity, cool-tinted stack — cards lift gently off the
  gradient. Use the `--shadow-level-*` ladder (1 = chip, 2 = default card,
  3 = raised, 4 = popover, 5 = modal). Never a hard hairline-inset or heavy black
  drop. `--shadow-fab` is the ink-tinted FAB lift.
- Hover = color change only (no translate/scale on cards); `.press`/`.press-sm`
  give the tactile mobile scale-down.

---

## 5. Components (use these primitives)

- **Button** [`button.tsx`](src/components/ui/button.tsx): pill. `default`/`decisive`/
  `marketing` = ink black; `outline`/`secondary`/`ghost` = quiet; `destructive` = red;
  `link` = blue. In-app height `h-8` (32px) default; mobile primary uses `lg`/`hero-lg`.
- **Card** [`card.tsx`](src/components/ui/card.tsx): `rounded-2xl`, `border-border-subtle`,
  `bg-card`, soft shadow, roomy padding. Never nest cards.
- **Badge** [`badge.tsx`](src/components/ui/badge.tsx): pill status. `success` (lime),
  `warning` (orange), `info` (blue), `danger`/`destructive` (red) — clearly-colored
  fill + dark readable text.
- **StatCard / KpiCard** [`stat-card.tsx`](src/components/ui/stat-card.tsx) /
  [`kpi-card.tsx`](src/components/operations/kpi-card.tsx): `rounded-2xl`, big tabular
  number, optional accent tint + progress bar. The dashboard's loudest element.
- **Tabs** [`tabs.tsx`](src/components/ui/tabs.tsx): segmented pill, **active = ink black
  pill** with white label.
- **Sidebar** [`owner-sidebar.tsx`](src/components/layouts/owner-sidebar.tsx): floating
  white panel; **active item = ink black pill**, white icon+label.
- **Bottom nav** (mobile): active tab = solid ink pill behind the icon (white icon),
  label in foreground.
- **Tables** [`responsive-table.tsx`](src/components/ui/responsive-table.tsx): soft
  header, hairline rows; reflow to record cards `< md`. **Financial statements stay
  tabular** in a scroll container (don't force them into cards). Money columns use
  `.tabular`; negatives in red.
- **Text inputs** [`form-fields.tsx`](src/components/ui/form-fields.tsx): `TextField`/
  `NumberField`/`MoneyInput`/`PhoneInput` for single-line.
- **Multi-line text** [`rich-textarea.tsx`](src/components/ui/rich-textarea.tsx):
  **`RichTextarea` is the ONE multi-line control** — framed composer, focus-within
  ring, autosize, live char counter, optional WhatsApp-markup toolbar
  (`*bold*`/`_italic_`/`~strike~`/```mono```/list/emoji). Enable `toolbar` for
  message-composition fields (WA templates/replies, broadcasts); pass
  `toolbar={false}` for plain notes/lists. Drop-in for forms (keeps
  `name`/`defaultValue`/`value`; output stays plain text — **never** an HTML editor,
  because WhatsApp bodies must be plain text). **Never** hand-roll a bare `<textarea>`.

---

## 6. Do / Don't

**Do**
- Let the ambient gradient frame the page; float opaque cards on it.
- Use ink black for the one primary action per context.
- Use lime/orange/blue/red only for their meaning (success/pending/info/danger).
- Keep money tabular and right-aligned; show negatives in red.
- Reach for an existing primitive; add a variant to it, don't inline a one-off.

**Don't**
- Gradient text, or gradients inside cards.
- A second action color competing with ink (no green/orange "primary" buttons).
- Decorative colored side-stripes on cards/rows (use full borders / tints / icons).
- Nested cards, or same-radius nesting (outer radius = inner + padding).
- Pure `#000`/`#fff`; drop `.tabular` on money; squish data tables on mobile.
- Hand-roll `bg-emerald-600 text-white` CTAs — that's a green button now; use `bg-primary`.
- Ship a bare `<textarea>` (the "2010 blog" look). Use `RichTextarea` everywhere —
  any remaining raw textarea is a bug to migrate.

---

## 7. Responsive & theme

- Breakpoints: standard Tailwind. Desktop = sidebar + content; `< md` = bottom nav,
  record-card reflow, FAB. See MOBILE.md for the full mobile contract (480px column,
  44/48px touch targets, 16px inputs, safe-area).
- **Light mode is the committed theme.** The app defaults to light (cookie check in
  [`layout.tsx`](src/app/layout.tsx)). **Dark mode is a later phase** — its `.dark`
  tokens in globals.css are still legacy and not yet on the UpGradely DNA; do not rely
  on dark looking finished.

---

## 8. Backup / revert

The previous Vercel design is preserved: git tag `design-vercel-dna`, branch
`backup/design-vercel-dna`, and a file snapshot + revert recipes in
[`design-backups/vercel-dna/`](design-backups/vercel-dna/). Redesign work lives on
branch `redesign/upgradely-dna`.
