---
version: alpha
name: Tetra-Ops-design-analysis
description: "An internal operations system for a photobooth business in Indonesia — synthesized from Linear's dark-canvas surface discipline, Stripe's financial-data DNA, and Vercel's developer-platform clarity. The system anchors on **Iris #5E6AD2** (Linear lavender-blue) as the single chromatic accent. **Zero gradients anywhere** — clean and seamless, per the rule 'jangan ada gradient sama sekali'. **Type is ALL Inter**, with Linear's OpenType feature stack (`cv11` single-story `a`, `ss03` alt `g`, `cv01` slashed zero) applied globally. Display tier runs Inter at weights 500–700 with aggressive negative tracking (−3.2px at 80px, −1.92px at 48px). Tabular-figure variants for any cell containing money or quantities (Stripe DNA). JetBrains Mono carries project IDs, SKUs, timestamps. Cards live on a four-step surface ladder with 1px hairline borders. Hover state changes background color only — no translate, no shadow shift (Linear/Vercel restraint). Pill-shaped CTAs are reserved for decisive financial actions (Simpan & Tutup Buku, Submit Rekap, Approve); compact 8px radii carry the everyday UI."

colors:
  # === Brand — Iris (Linear lavender-blue) ===
  # Fresh, clean, refreshing. NO red/orange anywhere in the brand identity.
  primary: "#5E6AD2"
  primary-hover: "#7782DD"
  primary-pressed: "#4F58B8"
  primary-soft: "#EEF0FC"
  primary-soft-hover: "#DDE0F8"
  primary-deep: "#232852"
  on-primary: "#FCFCFD"

  # === Accent — Teal (refreshing secondary) ===
  # Used sparingly for differentiation: chips, secondary highlights.
  accent-teal: "#0D9488"
  accent-teal-hover: "#14B8A6"
  accent-teal-soft: "#F0FDFA"
  accent-teal-deep: "#0F766E"

  # === NO GRADIENTS ===
  # Per user direction "jangan ada gradient sama sekali. clean dan seamless aja"
  # the system has zero gradient tokens. Hierarchy is carried entirely by
  # solid surface colors, hairline borders, and tone. Decorative orbs,
  # text-fill gradients, and atmospheric mesh backgrounds are forbidden.

  # === Dark Mode Surfaces (DEFAULT — Linear-style near-black, brighter ladder) ===
  # Each step distinctly lifted so cards visibly sit above the canvas.
  dark-canvas: "#08090D"
  dark-surface-1: "#11141B"
  dark-surface-2: "#17191F"      # default card — clearly above bg
  dark-surface-3: "#1F2330"      # hover lift / popover
  dark-surface-4: "#2A2E38"      # deepest lift / selected row
  dark-hairline-subtle: "#1C1F27"
  dark-hairline: "#2A2E38"
  dark-hairline-strong: "#3D4350"
  dark-ink: "#F5F7FA"
  dark-ink-muted: "#CFD4DF"
  dark-ink-subtle: "#9CA5B5"
  dark-ink-tertiary: "#687386"

  # === Light Mode Surfaces (Stripe Dashboard pattern) ===
  # Off-white canvas with PURE WHITE cards. The contrast comes from the
  # canvas being slightly cooler — same trick Stripe uses. Hairlines stay
  # visible to delineate card edges.
  light-canvas: "#F6F8FB"        # cool off-white canvas
  light-surface-1: "#FFFFFF"     # card / popover surface
  light-surface-2: "#FFFFFF"     # default card — stands out vs canvas
  light-surface-3: "#F1F4F9"     # hover lift (back toward canvas tone)
  light-surface-4: "#E2E6EE"     # selected / deepest lift
  light-hairline-subtle: "#EBEEF3"
  light-hairline: "#E2E6EE"      # default card border
  light-hairline-strong: "#CBD2DD"
  light-ink: "#14171F"
  light-ink-muted: "#38404F"
  light-ink-subtle: "#5B6478"
  light-ink-tertiary: "#98A1B3"

  # === Semantic ===
  # State communication only — never brand accent. Use sparingly.
  success: "#10B981"      # emerald
  success-soft: "#ECFDF5"
  success-deep: "#047857"
  warning: "#F59E0B"      # amber
  warning-soft: "#FFFBEB"
  warning-deep: "#B45309"
  danger: "#EF4444"       # red — for danger state ONLY (errors, losses, rejected)
  danger-soft: "#FEF2F2"
  danger-deep: "#B91C1C"
  info: "#06B6D4"         # cyan — neutral info / hint
  info-soft: "#ECFEFF"
  info-deep: "#0E7490"

  # === Accent — mint + sky (cool, fresh) ===
  # Used sparingly for owner-pool / sinking fund chips.
  mint: "#10B981"
  mint-soft: "#D1FAE5"
  sky: "#0EA5E9"
  sky-soft: "#E0F2FE"

typography:
  # === Display (Inter at hero scale — Vercel/Linear DNA, NO serif) ===
  display-xl:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 80px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: -3.2px
  display-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -2.56px
  display-md:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: -1.92px

  # === Headline (Inter — operational chrome) ===
  headline-xl:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.96px
  headline-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.72px
  headline-md:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.4px
  headline-sm:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.16px

  # === Body (Inter — daily reading) ===
  body-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-strong:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0

  # === Tabular (Stripe DNA — money & quantities) ===
  tabular-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.44px
    fontFeature: "'tnum', 'cv11'"
  tabular:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
    fontFeature: "'tnum', 'cv11'"
  tabular-sm:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0
    fontFeature: "'tnum', 'cv11'"

  # === Caption / Eyebrow / Label ===
  caption:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  eyebrow:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 1.5px
    textTransform: uppercase
  label-strong:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: -0.1px

  # === Button labels (Inter at medium weight) ===
  button-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.15px
  button:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  button-sm:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0

  # === Mono (Vercel/Linear DNA — code, IDs, technical labels) ===
  mono:
    fontFamily: "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  mono-sm:
    fontFamily: "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  mono-strong:
    fontFamily: "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  pill: 9999px
  full: 9999px

spacing:
  # Base unit: 4px (Linear scale)
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  3xl: 64px
  section: 96px
  hero: 128px

elevation:
  flat: "none"
  hairline: "0 0 0 1px {colors.dark-hairline}"
  card: "0 0 0 1px {colors.dark-hairline}, 0 1px 2px rgba(0,0,0,0.04)"
  popover: "0 0 0 1px {colors.dark-hairline}, 0 8px 24px rgba(0,0,0,0.18)"
  glow-crimson: "0 0 0 1px rgba(220,41,84,0.40), 0 8px 32px rgba(220,41,84,0.20)"
  focus-ring: "0 0 0 2px rgba(220,41,84,0.40)"

components:
  # === Buttons ===
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    minHeight: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  button-primary-decisive:
    # Pill variant for major financial actions (Tutup Buku, Submit Rekap, Approve)
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    minHeight: "44px"
    elevation: "{elevation.glow-crimson}"
  button-secondary:
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    borderColor: "{colors.dark-hairline}"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink-muted}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ghost-icon:
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink-muted}"
    rounded: "{rounded.md}"
    padding: "8px"
    minHeight: "32px"

  # === Inputs ===
  text-input:
    backgroundColor: "{colors.dark-surface-1}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    borderColor: "{colors.dark-hairline}"
    minHeight: "40px"
  text-input-focused:
    backgroundColor: "{colors.dark-surface-1}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    elevation: "{elevation.focus-ring}"
  money-input:
    # Currency-prefixed input — "Rp" sits as inline label, value uses tabular
    backgroundColor: "{colors.dark-surface-1}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.tabular}"
    rounded: "{rounded.md}"
    padding: "10px 12px 10px 36px"
    minHeight: "40px"
  select:
    backgroundColor: "{colors.dark-surface-1}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 36px 10px 12px"
    minHeight: "40px"
  chip-radio:
    # Used for transport_method (online/rental/none), frame_size, status pickers
    backgroundColor: "{colors.dark-surface-3}"
    textColor: "{colors.dark-ink-muted}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    borderColor: "{colors.dark-hairline}"
  chip-radio-active:
    backgroundColor: "rgba(220,41,84,0.10)"
    textColor: "{colors.dark-ink}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    borderColor: "{colors.primary}"

  # === Cards & Surfaces ===
  card:
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    borderColor: "{colors.dark-hairline}"
  card-lifted:
    backgroundColor: "{colors.dark-surface-3}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    borderColor: "{colors.dark-hairline}"
  card-hero:
    # Used for /tutup-buku hero, dashboard top card, rekap context card
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
    borderColor: "{colors.dark-hairline}"
  card-form-section:
    # Mega-form sections (Tutup Buku, Rekap) — each labelled section
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
    borderColor: "{colors.dark-hairline}"

  # === Financial / Data Components (Stripe DNA) ===
  stat-card:
    # KPI cards on dashboard / reports — money + label + delta
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.tabular-lg}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    borderColor: "{colors.dark-hairline}"
  pnl-row:
    # Each line of the P&L breakdown (Revenue, HPP, OpEx, Net Profit)
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink}"
    typography: "{typography.tabular}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm} 0"
  pnl-row-strong:
    # Subtotal / grand total rows
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink}"
    typography: "{typography.tabular-lg}"
    rounded: "{rounded.none}"
    padding: "{spacing.md} 0"
    borderColor: "{colors.dark-hairline}"
  money-amount:
    # Inline money rendering — always tabular figures
    typography: "{typography.tabular}"
    textColor: "{colors.dark-ink}"
  money-amount-negative:
    typography: "{typography.tabular}"
    textColor: "{colors.danger}"
  money-amount-positive:
    typography: "{typography.tabular}"
    textColor: "{colors.success}"
  data-table-header:
    backgroundColor: "{colors.dark-surface-3}"
    textColor: "{colors.dark-ink-muted}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm} {spacing.md}"
    borderColor: "{colors.dark-hairline}"
  data-table-row:
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm} {spacing.md}"
    borderColor: "{colors.dark-hairline-subtle}"

  # === Status & Badges (Vercel DNA — clear semantic) ===
  badge-default:
    backgroundColor: "{colors.dark-surface-3}"
    textColor: "{colors.dark-ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-success:
    backgroundColor: "rgba(16,185,129,0.12)"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-warning:
    backgroundColor: "rgba(245,158,11,0.12)"
    textColor: "{colors.warning}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-danger:
    backgroundColor: "rgba(244,63,94,0.12)"
    textColor: "{colors.danger}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-info:
    backgroundColor: "rgba(14,165,233,0.12)"
    textColor: "{colors.info}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  hpp-chip:
    # Per-input cost chip in rekap form: "Rp 50.000"
    backgroundColor: "rgba(220,41,84,0.10)"
    textColor: "{colors.primary-hover}"
    typography: "{typography.tabular-sm}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  stock-chip-ok:
    backgroundColor: "rgba(16,185,129,0.10)"
    textColor: "{colors.success}"
    typography: "{typography.tabular-sm}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  stock-chip-low:
    backgroundColor: "rgba(245,158,11,0.12)"
    textColor: "{colors.warning}"
    typography: "{typography.tabular-sm}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  stock-chip-critical:
    backgroundColor: "rgba(244,63,94,0.12)"
    textColor: "{colors.danger}"
    typography: "{typography.tabular-sm}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"

  # === Navigation ===
  top-nav:
    backgroundColor: "{colors.dark-canvas}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body-sm}"
    height: "56px"
    padding: "0 {spacing.lg}"
    borderColor: "{colors.dark-hairline-subtle}"
  bottom-tab-bar:
    # Mobile crew PWA: fixed bottom nav with safe-area inset
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-ink-muted}"
    typography: "{typography.caption}"
    height: "64px"
    borderColor: "{colors.dark-hairline}"
  side-rail:
    # Optional owner-side rail on /operations, /reports
    backgroundColor: "{colors.dark-canvas}"
    textColor: "{colors.dark-ink-muted}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md}"
    width: "224px"

  # === Sticky bars (rekap submit, tutup-buku footer) ===
  sticky-action-bar:
    # Mobile: fixed inset-x-0 bottom-0 z-30; Desktop: sticky inside form column
    backgroundColor: "rgba(24,24,29,0.95)"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md} {spacing.lg}"
    borderColor: "{colors.dark-hairline}"
    elevation: "{elevation.popover}"

  # === Proof / Upload tiles ===
  upload-button:
    backgroundColor: "{colors.dark-surface-3}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
    borderColor: "{colors.dark-hairline}"
    borderStyle: "dashed"
  upload-tile-success:
    backgroundColor: "rgba(16,185,129,0.06)"
    textColor: "{colors.success-deep}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
    borderColor: "rgba(16,185,129,0.30)"

  # === Hero (landing only — Inter, no gradient, no serif) ===
  hero-canvas:
    # Plain canvas — no atmospheric orbs, no sunrise. Hierarchy is the
    # headline itself, the negative tracking, and the surface ladder.
    backgroundColor: "{colors.dark-canvas}"
  hero-headline:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 72px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -2.16px
    textColor: "{colors.dark-ink}"
  hero-headline-accent:
    # The single highlighted word rendered in solid Iris primary —
    # the only chromatic accent in the brand. No gradient text fill.
    textColor: "{colors.primary}"
---

## Overview

Tetra Ops is an internal operations system for a photobooth business — owners run booking → settlement → reporting from desktop; crew submit rekap + see schedule from mobile PWA. The design system is **dark-mode native** (Linear DNA — operator daily-driver feel), with **light-mode** preserved for landing and crew portal entry points where a warmer first impression matters.

The system anchors on three DNA borrowings:

1. **Linear's surface discipline** — a four-step ladder (canvas → surface-1 → surface-4) carries hierarchy via lift, not shadow. Cards use 1px hairline borders. Atmospheric gradients are forbidden in operational chrome.
2. **Stripe's financial data DNA** — tabular figures (`tnum`) are mandatory anywhere money or quantities appear. P&L breakdowns lean on a hierarchy of `tabular`, `tabular-lg`, and `body-strong`. The pill-shaped primary CTA is reserved for decisive financial actions (Simpan & Tutup Buku, Submit Rekap, Approve).
3. **Vercel's clarity** — clear semantic palette (success / warning / danger / info), mono caption for technical labels (project IDs, SKUs, timestamps), and clean black-and-white rhythm on light-mode landing.

Tetra Crimson (`{colors.primary}` #DC2954) is the single chromatic accent — used on primary CTAs, focus rings, brand mark, and links. The Sunrise gradient (`{colors.gradient-sunrise}` crimson → amber → gold) is **decorative only**: hero word fills, empty-state orbs, success moments. It never appears as a button background, card fill, or section divider.

Display type is **Inter at 600 weight with aggressive negative tracking** — Linear/Vercel discipline. No Playfair, no serif, no second family on hero. **JetBrains Mono** carries project IDs (`PRJ-XXX`), SKUs (`ITM-BOX-4R`), Drive URLs, timestamps, and dense numeric breakdowns.

**Key Characteristics:**
- **Dark-canvas native** — `{colors.dark-canvas}` #0A0A0F is the default operator surface; light-mode for landing + crew portal.
- **Single chromatic accent** — Tetra Crimson only. No second hue.
- **Sunrise gradient** is scarce: hero word fill, decorative orbs, occasional success moments.
- **Tabular figures everywhere** money/quantity appears — settlements, P&L footer, rekap totals, stat cards.
- **Pill CTAs** ONLY on decisive financial actions; 8px-radius buttons elsewhere.
- **Hairline borders** carry card separation; drop shadows reserved for popovers/glows on primary CTAs.
- **Mono for technical text** — project IDs, SKUs, timestamps, hashes.
- **Mobile-first PWA crew surface** — bottom tab bar with safe-area, sticky action bars with explicit disabled states.
- **No atmospheric gradients in chrome** — gradients only on hero/empty/success.

## Colors

### Brand
- **Tetra Crimson** (`{colors.primary}` #DC2954): single chromatic accent — primary CTAs, focus rings, brand mark, link emphasis.
- **Crimson Hover** (`{colors.primary-hover}` #F76286): hover state of primary buttons.
- **Crimson Pressed** (`{colors.primary-pressed}` #B91C42): pressed/active state.
- **Crimson Soft** (`{colors.primary-soft}` #FFDDE5): pale fill for soft tag backgrounds (rekap status chips on light mode).

### Decorative Gradients
- **Sunrise** (`{colors.gradient-sunrise}`): crimson → amber → gold, 135deg linear. Used for: hero word fill, button glow shadow, success/celebration moments. **Never** a card fill or section background at full opacity.
- **Sunrise Radial** (`{colors.gradient-sunrise-radial}`): same hues as a radial orb. Placed at low opacity (~12–20%) behind hero headlines and empty states.
- **Aurora Radial** (`{colors.gradient-aurora-radial}`): sage → sky cool counterpoint, low opacity. Used for secondary hero accents and "calm" empty states (e.g., "Belum ada event" on operations list).

### Dark Surfaces (DEFAULT)
Four-step lift ladder, plus three hairline tiers:

| Token | Hex | Use |
|---|---|---|
| `{colors.dark-canvas}` | `#0A0A0F` | Page background — anchor of the system |
| `{colors.dark-surface-1}` | `#121218` | Inline inputs, popover, nested surfaces |
| `{colors.dark-surface-2}` | `#18181D` | **Default card surface** — most cards, sticky bars |
| `{colors.dark-surface-3}` | `#22222A` | Lifted cards, table headers, hovered states |
| `{colors.dark-surface-4}` | `#2C2C36` | Highest lift — rarely used (modals, focused tabs) |
| `{colors.dark-hairline-subtle}` | `#1F1F26` | Inner row dividers in dense tables |
| `{colors.dark-hairline}` | `#2A2A2F` | Default card border, input border |
| `{colors.dark-hairline-strong}` | `#404044` | Emphasized border, focused input outline |

### Dark Ink
- **Ink** (`{colors.dark-ink}` #FAFAF9): default body/headline color
- **Ink Muted** (`{colors.dark-ink-muted}` #D4D4D2): secondary text, captions
- **Ink Subtle** (`{colors.dark-ink-subtle}` #A8A8A6): meta, labels, tertiary
- **Ink Tertiary** (`{colors.dark-ink-tertiary}` #737371): disabled, footnotes

### Light Surfaces (LANDING + CREW PORTAL ONLY)
Same four-step ladder for the warmer entry surfaces:

| Token | Hex | Use |
|---|---|---|
| `{colors.light-canvas}` | `#FAFAF9` | Landing page background |
| `{colors.light-surface-1}` | `#FFFFFF` | Default card surface on light mode |
| `{colors.light-surface-2}` | `#FCFCFB` | Subtle row alternation |
| `{colors.light-surface-3}` | `#F4F4F2` | Lifted cards on light, footer band |
| `{colors.light-surface-4}` | `#E7E7E5` | Highest lift (rare) |

### Semantic
Reserved for state communication — never decorative:

- **Success** `#10B981` — approved rekap, paid settlement, positive net profit, OK stock
- **Warning** `#F59E0B` — low stock, awaiting review, margin <25% but >0
- **Danger** `#F43F5E` — critical stock, loss event, rekap rejected, payment failed
- **Info** `#0EA5E9` — informational hint, neutral notice

### Accent (rare, contextual)
- **Gold** `#D4A574` — owner-pool, sinking fund "maintenance" chips, premium tier hints
- **Sage** `#84A98C` — owner-pool "crew reserve" chips, calm state indicators

## Typography

### Font Stack
- **Everything is Inter.** No serif anywhere — Vercel/Linear don't ship serif on operational chrome, neither does Tetra. Inter (400/500/600/700) carries display, headlines, body, and tabular figures. Fallback: system-ui, -apple-system, Segoe UI.
- **Mono**: JetBrains Mono (400/600). Used for project IDs (`PRJ-XXX`), SKUs (`ITM-BOX-4R`), Drive URLs, timestamps, hashes. Fallback: Geist Mono, ui-monospace, SFMono-Regular, Menlo.

### OpenType feature stack (Linear DNA)

Applied globally on `body` via `font-feature-settings`:

```css
font-feature-settings: "cv11", "ss03", "cv01", "calt", "kern", "liga";
```

| Feature | Effect | Why |
|---|---|---|
| `cv11` | Single-story `a` | Linear's signature — geometric over humanist, reads as "modern product app" |
| `ss03` | Alt `g` without descender curve | Cleaner at small sizes, more confident at display sizes |
| `cv01` | Slashed zero | Distinguishes `0` from `O` in money columns + project IDs |
| `calt` | Contextual alternates | Keeps Inter's smart letter pairs alive |
| `kern` | Kerning | Manual letter-pair tightening |
| `liga` | Standard ligatures | `fi`, `fl`, etc. |

The `.tabular` utility additionally stacks `tnum` (tabular-figure spacing) on top — so any money/qty column inherits both tabular spacing *and* the Linear slashed-zero / single-story `a` discipline.

### Hierarchy

| Token | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| `{typography.display-xl}` | 80px | 600 | -3.2px | Landing hero (Inter) |
| `{typography.display-lg}` | 64px | 600 | -2.56px | Landing sub-hero (Inter) |
| `{typography.display-md}` | 48px | 600 | -1.92px | Section opener (Inter, rare) |
| `{typography.headline-xl}` | 32px | 600 | -0.96px | Page title (Inter) |
| `{typography.headline-lg}` | 24px | 600 | -0.72px | Section header (Inter) |
| `{typography.headline-md}` | 20px | 600 | -0.4px | Card title (Inter) |
| `{typography.headline-sm}` | 16px | 600 | -0.16px | Sub-section, list item (Inter) |
| `{typography.body-lg}` | 16px | 400 | 0 | Lead body (Inter) |
| `{typography.body}` | 14px | 400 | 0 | **Default body** (Inter) |
| `{typography.body-strong}` | 14px | 500 | 0 | Emphasis body (Inter) |
| `{typography.body-sm}` | 13px | 400 | 0 | Meta, dense lists (Inter) |
| `{typography.tabular-lg}` | 22px | 600 | -0.44px | **Big money** (stat cards, totals) |
| `{typography.tabular}` | 14px | 500 | 0 | **Default money/qty** (table cells, P&L lines) |
| `{typography.tabular-sm}` | 12px | 500 | 0 | Dense money (HPP chips, stock chips) |
| `{typography.caption}` | 12px | 400 | 0 | Helper text, image caption |
| `{typography.eyebrow}` | 11px | 600 | +1.5px UPPER | Section eyebrow, table header |
| `{typography.label-strong}` | 13px | 500 | -0.1px | Form labels |
| `{typography.button-lg}` | 15px | 600 | -0.15px | Decisive financial CTAs |
| `{typography.button}` | 14px | 500 | 0 | Default button |
| `{typography.button-sm}` | 12px | 500 | 0 | Compact button (chip radio, ghost icon) |
| `{typography.mono}` | 13px | 400 | 0 | Project ID, SKU, URL, hash |
| `{typography.mono-sm}` | 11px | 400 | 0 | Inline mono in tight rows |
| `{typography.mono-strong}` | 13px | 600 | 0 | Emphasized mono (highlighted ID) |

### Principles

- **Tabular figures are mandatory** for: money (`Rp 1.250.000`), quantities (`cetak_total: 250`), percentages (`Margin 28.5%`), and any numeric column where vertical alignment matters. Enable via `font-feature-settings: 'tnum', 'cv11'`.
- **Inter is the only family.** No Playfair, no serif fallback. Display roles use Inter at 600 weight with aggressive negative tracking (-3.2px at 80px, -1.92px at 48px).
- **Negative tracking scales with size**: -2.16px at 72px (display) tapers to 0 at body.
- **Eyebrow uses positive tracking** (+1.5px) and UPPERCASE — taxonomy contrast against the negative-tracked display.
- **Mono only in technical contexts** — project IDs, SKUs, Drive URLs, timestamps, batch IDs. Never as body text.
- **Indonesian language**: Inter renders Indonesian diacritics cleanly (none required for Bahasa Indonesia, but accented loanwords like "café" render correctly).

## Spacing

Base unit: **4px**. Scale matches Linear:

| Token | Value | Common use |
|---|---|---|
| `{spacing.xxs}` | 4px | Inline icon gap, chip inner pad |
| `{spacing.xs}` | 8px | Compact gap, button vertical pad |
| `{spacing.sm}` | 12px | Form-field gap, input padding |
| `{spacing.md}` | 16px | Card content gap, default row gap |
| `{spacing.lg}` | 24px | Card interior padding, section content gap |
| `{spacing.xl}` | 32px | Mega-form section padding, large card |
| `{spacing.xxl}` | 48px | Vertical section gap |
| `{spacing.3xl}` | 64px | Page top padding, hero vertical pad |
| `{spacing.section}` | 96px | Major section break |
| `{spacing.hero}` | 128px | Hero vertical pad (landing) |

### Container & Grid

- **Max content width**: 1280px (`max-w-6xl`) for landing + operations dashboard
- **Mega-form width**: 768px (`max-w-3xl`) for tutup-buku, rekap form — single-column focus
- **Mobile crew PWA**: 480px (`max-w-md`) — single-column with safe-area bottom inset

## Elevation & Depth

Tetra is **shadow-restrained** (Linear DNA). Hierarchy is carried by surface lift + hairline, not drop shadows.

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No border, no shadow | Default body type, footer, ghost buttons |
| 1 (hairline) | 1px `{colors.dark-hairline}` border | Default cards, form inputs |
| 2 (lift) | `{colors.dark-surface-3}` background + hairline | Lifted cards, hovered states, table headers |
| 3 (popover) | Hairline + `0 8px 24px rgba(0,0,0,0.18)` shadow | Dropdowns, modals, tooltips |
| 4 (glow) | `0 0 0 1px primary/40, 0 8px 32px primary/20` | Decisive CTAs (Tutup Buku, Submit Rekap) — Tetra's brand moment |
| 5 (focus) | 2px `{colors.primary}` ring at 40% opacity | Focused input, focused button |

The **glow shadow** on decisive CTAs is the brand's signature press-down moment — the sunrise gradient implied via shadow color, never as button fill itself.

## Shapes

### Border Radius

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Status badges, dense chips |
| `{rounded.sm}` | 6px | Inline tags, small buttons |
| `{rounded.md}` | 8px | **All buttons, inputs (default)** |
| `{rounded.lg}` | 12px | **Cards (default)** |
| `{rounded.xl}` | 16px | Hero cards, mega-form sections, screenshot panels |
| `{rounded.xxl}` | 24px | Rare — oversized hero containers |
| `{rounded.pill}` | 9999px | **Decisive financial CTAs only**, status pills, chip radios |

### When to pill

Use `{rounded.pill}` ONLY for:
1. **Decisive financial CTAs** — "Simpan & Tutup Buku", "Submit Rekap", "Approve Rekap", "Konfirmasi Pembayaran". These deserve the pill because the action is irreversible and bookkeeping-critical.
2. **Status pills** (badges) — short read-only state indicators ("Approved", "Awaiting review", "Disetujui").
3. **Chip-radio selectors** — frame size picker, transport method, payment type.

Everything else uses `{rounded.md}` (8px) — compact, operational, efficient.

## Components

### Buttons

**`button-primary`** — default crimson CTA. Compact, used everywhere routine.
- `{colors.primary}` bg, `{colors.on-primary}` text, `{typography.button}`, `{rounded.md}`, 10px 16px padding.

**`button-primary-decisive`** — pill variant for financial actions.
- Same crimson bg, `{typography.button-lg}` (larger), `{rounded.pill}`, 12px 24px padding, `{elevation.glow-crimson}` shadow.
- Use exclusively for: Submit Rekap, Simpan & Tutup Buku, Approve, Konfirmasi Settlement.

**`button-secondary`** — surface-2 bg with hairline.
- `{colors.dark-surface-2}` bg, `{colors.dark-ink}` text, hairline border, `{rounded.md}`.

**`button-tertiary`** — text-only with subtle hover.
- Transparent bg, `{colors.dark-ink-muted}` text, no border.

**`button-danger`** — `{colors.danger}` bg for destructive (delete project, void payment, reject rekap).

**`button-ghost-icon`** — square 32px tap target with icon-only, transparent bg.

### Inputs

**`text-input`** — default text field on `{colors.dark-surface-1}` bg with hairline.

**`money-input`** — currency-prefixed variant. "Rp" label sits inside left padding (36px); value uses `{typography.tabular}`. Used for all financial inputs in rekap, tutup-buku, settlement.

**`select`** — same shell as text-input with chevron icon right.

**`chip-radio` + `chip-radio-active`** — segmented chip selector for enums (transport_method, frame_size, status). Active uses 10% crimson tint + crimson border.

### Cards

**`card`** — default surface-2 with hairline. Most operational content.

**`card-hero`** — surface-2 with `{rounded.xl}` 16px corners and 32px padding. Used for hero context (tutup-buku top, dashboard summary).

**`card-form-section`** — same as card-hero, used for each labelled section in mega-forms (Konsumsi, Biaya Lapangan, Fee Crew, Komisi, Diskon & Bagi Hasil).

### Financial / Data

**`stat-card`** — KPI rendering. Tabular-lg value + caption label + optional delta chip.

**`pnl-row`** — single line of the P&L breakdown. Label left, tabular money right. Negative values use `{colors.danger}`.

**`pnl-row-strong`** — subtotal/total rows (Gross Margin, Net Profit). Larger tabular, top hairline border.

**`money-amount` / `money-amount-negative` / `money-amount-positive`** — inline money rendering with semantic tone.

**`data-table-header`** — eyebrow type on `{colors.dark-surface-3}` bg. Mono for ID columns.

**`data-table-row`** — body-sm with hairline-subtle row dividers. Hover lifts to surface-3.

### Status & Badges

Five semantic variants (default, success, warning, danger, info) all using pill radius + 12% tinted bg + saturated text. Compact 2px 8px padding for inline placement next to titles.

**`hpp-chip`** — per-input cost indicator in rekap form: "Rp 50.000". Crimson tint background.

**`stock-chip-ok` / `stock-chip-low` / `stock-chip-critical`** — three-tier stock indicator showing "stok_before → stok_after" pattern with semantic tone.

### Navigation

**`top-nav`** — 56px sticky bar (Linear height). Tetra wordmark left, nav links center, primary CTA right.

**`bottom-tab-bar`** — mobile crew PWA. 64px tall with safe-area-inset-bottom. Active tab uses crimson icon + label, inactive uses ink-muted.

**`side-rail`** — optional 224px rail on `/operations`, `/reports`. Body-sm links with active state pill (left-aligned).

### Operations list (Vercel deployments DNA)

The `/operations` list table renders each event as a single `<Link>` element styled as a CSS-grid row. Pattern locked in by `<OperationsListTable />`:

- **Whole row is the click target.** No nested chevron buttons, no row-onClick handlers — native `<a>` semantics mean middle-click opens in a new tab, the keyboard tab order works without `tabIndex`, and Cmd+click works as expected.
- **Fixed grid columns** via `grid-template-columns: minmax(15rem,1.5fr) minmax(8.5rem,0.9fr) minmax(13rem,1.3fr) minmax(8rem,0.9fr) minmax(7.5rem,auto)`. Header row + data rows share the same grid track so columns align without any `<table>` markup.
- **Single hover state** — `hover:bg-surface-3/60`. No translate, no shadow, no border color shift. Linear/Vercel restraint.
- **Generous row padding** — `px-5 py-4`. Cramped tables read as "data dump"; breathing room reads as "designed product."
- **Status column right-aligned**, event + payment status stacked compactly. No standalone chevron.
- **Crew cell** uses subtle status dots (emerald = lead, sky = asisten) instead of inline-uppercase "L:" / "A:" prefixes. The dots act as semantic role indicators without screaming.
- **Mobile** collapses to `<Link>` cards (same `<a>` semantics), single column, with project header + status badges top-right and a 2-up grid for Jadwal + Crew.

This pattern generalizes to any dense ops table where each row maps to a detail page — settlement list, project list, payments list, audit log.

### Sticky bars

**`sticky-action-bar`** — mobile rekap submit bar. Fixed `inset-x-0 bottom-0 z-30` with `surface-2/95 backdrop-blur-md`. On desktop becomes inline `sticky` element. Shows estimasi HPP left + button-primary-decisive right.

When disabled: button label switches to actionable instruction ("Upload bukti dulu"), left chip switches to a `text-rose-300` warning instead of HPP. **No silent grey states** — always tell the user why a button is disabled.

### Upload

**`upload-button`** — dashed-border surface-3 tile inviting upload. Uses upload-cloud icon + label.

**`upload-tile-success`** — emerald-tinted row showing filename in mono + external-link + remove icons.

### Hero (landing only)

**`hero-canvas`** — dark canvas with sunrise + aurora radial orbs at 12% / 8% opacity respectively. Cards float on top.

**`hero-headline`** — Inter 72–80px, weight 600, -3.2px tracking. The brand word ("photobooth", "Tetra Ops") gets `hero-headline-accent` treatment: solid Iris primary fill. No gradient, no background-clip.

## Patterns & Workflows

### Mega-form structure (Tutup Buku, Rekap)

Vertical scrolling form with labelled sections, each rendered as `card-form-section`:

1. **Hero context** — `card-hero` showing client + package + status badge
2. **Section 1: Konsumsi** — cetak input + auto-derive cards (Mediaset, Sleeve) + add-on counts
3. **Section 1b: Biaya Lapangan** — read-only display of crew-submitted expense + override toggle
4. **Section 2: HPP** — grid of `money-input` fields, each with `hpp-chip` showing computed cost
5. **Section 3: Fee Crew & Sewa** — adjustable per-role with baseline indicator
6. **Section 4: Komisi & Platform**
7. **Section 5: Diskon & Bagi Hasil**
8. **Sticky P&L footer** — layered breakdown (Revenue → Diskon → HPP → Gross Margin → OpEx → Net Profit) with `tabular` typography. Submit CTA = `button-primary-decisive` pill.

### P&L footer hierarchy

```
Revenue Gross         Rp 5.000.000      ← tabular-lg, ink
− Diskon Klien        (Rp 50.000)       ← tabular, ink-muted
= Revenue Net         Rp 4.950.000      ← tabular-lg, ink, top hairline
− HPP (consumable)    (Rp 800.000)      ← tabular, ink-muted
= Gross Margin        Rp 4.150.000      ← tabular-lg
− Fee Crew            (Rp 1.500.000)
− Field Expense       (Rp 285.000)
− Sewa & Lainnya      (Rp 75.000)
− Komisi & Platform   (Rp 500.000)
= Net Profit          Rp 1.790.000      ← tabular-lg with semantic tone (success if >0)
Margin                36.2%             ← tabular, ink-muted
```

Use `tabular-lg` for subtotals; `tabular` for line items; `tabular-sm` for the margin caption.

### Mobile crew rekap flow

- Header: RekapHeroCard with paket + status badge
- Cetak input → auto-derive cards (Mediaset, Sleeve) showing computed qty + cost chip
- Flashdisk/Pouch grid (2-up)
- Add-on grid (Photomagnet, Keychain)
- **Transportasi** section: `chip-radio` row (Online / Sewa / Tidak ada) → conditional money inputs + proof uploaders
- **Konsumsi & Lain-lain** section: money input + repeatable list with note + amount + delete button
- **Bukti** section: multi-file uploader
- **Sticky action bar** at bottom: HPP estimate + Submit pill

### Empty states

Use aurora radial orb (low opacity 8%) behind a centered icon + caption. Tone: calm, gentle. Examples:
- "Belum ada event di-assign"
- "Belum ada payment di-record"
- "Belum ada item di custom inventory"

### Toast notifications

Use `success` / `warning` / `danger` semantic tints. 12% tinted background, saturated icon + text. Bottom-right placement on desktop, bottom-center on mobile (above bottom-tab-bar).

## Do's and Don'ts

### Do

- Default to **dark canvas** for operational surfaces — that's where owners spend 90% of their time.
- **Cards must visibly lift off the canvas.** Light mode: off-white canvas + pure white cards (Stripe Dashboard pattern). Dark mode: near-black canvas + brighter surface ladder. NEVER set card background equal to page background — that flattens the visual hierarchy.
- **Use solid colors only.** Hierarchy is carried by surface ladder + hairline borders + tone. Period.
- Use **tabular figures** for ALL money and quantity values, period.
- Use **Inter at all sizes** with negative tracking that scales: −3.2px at 80px, −1.92px at 48px, 0 at body. Match Linear/Vercel discipline.
- Reserve **Iris (`{colors.primary}` #5E6AD2)** as the single chromatic accent. Used for: brand mark, link emphasis, primary CTA fill, focus ring.
- Use **pill radius** ONLY for decisive financial CTAs and read-only status pills.
- Use **mono** for project IDs (`PRJ-XXX`), SKUs (`ITM-BOX-4R`), Drive URLs, timestamps, hashes.
- Show **disabled states with explanation** — if a button is grey, the label MUST say why ("Upload bukti dulu", "Approve rekap dulu").
- Use **hairline borders** for card separation; reserve drop shadows for popovers + decisive CTA glow.
- Render **negative money** with `{colors.danger}`, **positive money** with `{colors.success}` — color carries financial sentiment.
- **Indonesian language first** — UI copy in Bahasa Indonesia; English only for technical jargon (e.g., "HPP", "OpEx" stay English).

### Don't

- **Don't use serif fonts anywhere.** Tetra is all Inter. Vercel/Linear/Stripe don't ship serif on operational chrome — neither does Tetra.
- **Don't use gradients of any kind.** No `linear-gradient`, no `radial-gradient`, no `bg-gradient-to-*` Tailwind utilities, no `background-clip: text` with gradient fill, no atmospheric mesh orbs, no glow shadows using gradient color stops. **Clean and seamless only.** User direction: "jangan ada gradient sama sekali. clean dan seamless aja."
- **Don't paint stat cards / KPI tiles with color fills** (slate-900 → indigo-950 etc.). KPIs render as plain `surface-2` with hairline border, big tabular value, eyebrow caption. That's the Linear/Vercel signature.
- **Don't use red/orange as brand accents.** Iris (indigo-lavender) is the only brand color. Red/amber are reserved for danger/warning *states* only — never as decorative accents on hero, cards, headlines.
- Don't introduce a second chromatic accent — no orange, no blue, no green as a "brand color". Semantic tints are the only secondary chroma.
- Don't pill-round operational buttons (filter, edit, cancel) — pill is reserved for financial commits.
- Don't use atmospheric gradients in operational chrome (dashboard, tables, forms). Only hero / empty states.
- Don't omit `tnum` on money columns — vertical alignment breaks without it.
- Don't ship grey-disabled buttons without text explanation.
- Don't use `#000000` true black — `{colors.dark-canvas}` #0A0A0F has the slight slate tint that defines Tetra.

## Responsive Behavior

### Breakpoints

| Name | Width | Key changes |
|---|---|---|
| Desktop-XL | 1440px+ | Side-rail visible, 3-up card grids |
| Desktop | 1280px | Default desktop layout |
| Tablet | 1024px | Side-rail collapses to icons; 3-up → 2-up cards |
| Mobile-Lg | 768px | Single-column mega-forms; top-nav links → hamburger |
| Mobile | 480px | Crew PWA primary; sticky action bar takes full width; bottom-tab-bar appears |

### Touch targets

- CTAs hold ≥40px tap height; decisive financial CTAs ≥44px.
- Chip-radios ≥36px desktop, ≥44px mobile.
- Money inputs ≥40px tap height.
- Bottom-tab-bar items ≥44px tap with safe-area-inset padding.

### Mobile-specific patterns

- **Bottom tab bar** for crew PWA — fixed `bottom-0` with `pb-safe`
- **Sticky action bars** for forms — full-width fixed when keyboard absent, slides under keyboard when present
- **Single-column mega-forms** below 768px — sections stack vertically, fewer 2-up grids
- **HPP estimate visible at all times** in rekap mobile — sticky-action-bar shows estimate even when scrolling

## Iteration Guide

1. Reference any component by its `components:` token name before re-implementing.
2. New section in a mega-form? Pick `card-form-section` and add a numbered title.
3. New money field? Use `money-input` + `{typography.tabular}` + `tnum`.
4. New status indicator? Pick from semantic badge variants — don't invent a sixth.
5. New decisive action (financial commit)? Use `button-primary-decisive` pill with glow shadow.
6. Run `tsc --noEmit` after structural changes.
7. For dark/light theming, prefer CSS variables (Tetra uses `--surface-*` tokens in `globals.css`) over per-component overrides.

## Known Gaps & Future Considerations

- **Light-mode is documented but second-tier**. Most operational pages don't have explicit light-mode styling yet — they inherit but haven't been QA'd. Audit before going public.
- **Chart palette is not specified** — when adding charts (analytics dashboard, settlement trends), use crimson as the primary series, sage/gold/info-blue as secondary series. Avoid loud rainbow palettes.
- **Bahasa Indonesia diacritics** are rare; if expanding to other locales, verify Inter renders the script (Arabic, Mandarin would require fallback fonts).
- **Print styles** for settlement receipts not yet defined. When adding, use light-mode canvas + Inter for the receipt brand mark, JetBrains Mono for amounts. No serif.
- **No animation tokens here** — view-transition + press-down + lift-on-hover exist in `globals.css` separately. Document in a follow-up if motion becomes critical to identity.

---

**Sources synthesized:**
- Linear (linear.app) — dark canvas, surface ladder, hairline discipline, dense ops layout
- Stripe (stripe.com) — tabular figures for money, pill CTA for financial actions, restrained chromatic logic
- Vercel (vercel.com) — semantic palette clarity, mono for technical labels, clean typographic hierarchy

**Tetra-specific decisions:**
- Crimson + Sunrise preserved from existing brand investment
- Inter everywhere; Playfair retired alongside the gradient pivot
- Indonesian-language operational chrome
- Mobile-first PWA crew surface co-existing with desktop-first owner ops
