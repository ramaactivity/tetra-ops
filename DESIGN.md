---
version: beta
name: Tetra-Ops-design-analysis
description: "An internal operations system for a photobooth business in Indonesia — built on Vercel's developer-platform DNA. The brand operates with a single chromatic accent: **Ink #171717** for every primary CTA. Surfaces follow Vercel's four-step ladder — pure white #FFFFFF cards on near-white #FAFAFA canvas-soft page background, deeper #F5F5F5 for inset regions, hairline #EBEBEB for borders. Type is Inter at weights 400/500/600 with `ss01`+`ss02` enabled to render the geometric alternates that approximate Vercel's custom Geist face; JetBrains Mono carries technical labels (caption-mono uppercase eyebrows, project IDs, timestamps). Tabular figures (`tnum`+slashed-zero) are mandatory anywhere money or quantities appear (Stripe DNA). Buttons follow Vercel's two-scale system: 6px-radius compact chrome (h-8 in-app default) for every operational button, 100px-radius pill ONLY for marketing/landing CTAs. Stacked shadows (multiple small offsets + inset hairline) replace single heavy drops. Hover state changes background color only — no translate, no shadow shift."

colors:
  # === Brand — Ink (Vercel #171717 near-black primary) ===
  # ONE CTA color across the whole product. No iris, no crimson, no
  # second hue. Every primary button is this ink.
  primary: "#171717"
  primary-hover: "#262626"
  primary-pressed: "#0a0a0a"
  primary-soft: "#f5f5f5"
  on-primary: "#ffffff"

  # === Link / Info — Vercel blue ===
  # Reserved for inline links + neutral informational signals. Never used
  # as a CTA fill.
  link: "#0070f3"
  link-deep: "#0761d1"
  link-soft: "#d3e5ff"

  # === NO GRADIENTS ===
  # Per user direction "jangan ada gradient sama sekali. clean dan seamless aja".
  # Zero gradient tokens. Hierarchy carried entirely by surface ladder,
  # hairline borders, and tone.

  # === Light Surfaces (DEFAULT — Vercel canvas-soft + canvas pattern) ===
  # Off-white #FAFAFA canvas with PURE WHITE #FFFFFF cards. The contrast
  # comes from the canvas being slightly cooler — same Stripe/Vercel
  # trick. Hairlines stay visible to delineate card edges.
  light-canvas: "#fafafa"          # canvas-soft — page body
  light-canvas-2: "#f5f5f5"        # canvas-soft-2 — inset region / hover
  light-surface-1: "#ffffff"       # card surface
  light-surface-2: "#ffffff"       # default card — stands out vs canvas
  light-surface-3: "#f5f5f5"       # hover lift / table header
  light-surface-4: "#ebebeb"       # selected / deepest lift
  light-hairline-subtle: "#f0f0f0"
  light-hairline: "#ebebeb"        # default card border
  light-hairline-strong: "#a1a1a1"
  light-ink: "#171717"
  light-ink-body: "#525252"        # body tone — secondary text
  light-ink-muted: "#737373"
  light-ink-tertiary: "#a1a1a1"

  # === Dark Mode Surfaces (Vercel dashboard inversion) ===
  # Near-black canvas #0A0A0A, slightly lifted cards #171717, hairline #2A2A2A.
  dark-canvas: "#0a0a0a"
  dark-surface-1: "#171717"        # card surface
  dark-surface-2: "#171717"        # default card
  dark-surface-3: "#1f1f1f"        # hover lift / table header
  dark-surface-4: "#2a2a2a"        # selected / deepest lift
  dark-hairline-subtle: "#1f1f1f"
  dark-hairline: "#2a2a2a"
  dark-hairline-strong: "#404040"
  dark-ink: "#ededed"
  dark-ink-body: "#a1a1a1"
  dark-ink-muted: "#737373"
  dark-ink-tertiary: "#525252"

  # === Semantic — state-only, never decorative ===
  # Vercel error red, warning amber, link/info blue, success emerald.
  success: "#10B981"
  success-soft: "rgba(16,185,129,0.10)"
  success-deep: "#047857"
  warning: "#f5a623"               # Vercel amber
  warning-soft: "#ffefcf"
  warning-deep: "#ab570a"
  danger: "#ee0000"                # Vercel red
  danger-soft: "#f7d4d6"
  danger-deep: "#c50000"
  info: "#0070f3"                  # Vercel link blue
  info-soft: "rgba(0,112,243,0.10)"
  info-deep: "#0761d1"

typography:
  # === Display (Inter at hero scale, mimicking Geist's geometric voice) ===
  display-xl:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -2.4px
  display-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -1.28px
  display-md:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.96px
  display-sm:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.6px

  # === Body (Inter — daily reading) ===
  body-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0
  body-md-strong:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: -0.28px
  body-sm-strong:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.28px

  # === Tabular (Stripe DNA — money & quantities, with Vercel slashed zero) ===
  tabular-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.4px
    fontFeature: "'tnum', 'ss01', 'cv11'"
  tabular:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.1px
    fontFeature: "'tnum', 'ss01', 'cv11'"
  tabular-sm:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0
    fontFeature: "'tnum', 'ss01', 'cv11'"

  # === Caption / Eyebrow ===
  caption:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0
  # Vercel "caption-mono" — Section eyebrows and small technical labels.
  # ALWAYS uses the mono family + uppercase + +tracking. Provides the
  # "I'm a technical label" voice.
  eyebrow:
    fontFamily: "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.7px
    textTransform: uppercase

  # === Button labels (Inter at medium weight, never bold) ===
  button-md:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0
  button-lg:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  button-hero:
    # Marketing pill — landing page only
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0

  # === Mono — code, IDs, technical labels ===
  mono:
    fontFamily: "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0
  mono-sm:
    fontFamily: "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 14px
    letterSpacing: 0

rounded:
  # Vercel two-scale radius system. In-app default = 6px. Cards = 8px.
  # 100px PILL reserved ONLY for marketing/landing CTAs.
  none: 0px
  xs: 4px
  sm: 6px       # IN-APP DEFAULT — buttons, inputs, dropdowns, badges
  md: 8px       # cards, marketing chrome
  lg: 12px      # large card chrome
  xl: 16px      # hero card with image cap
  pill: 100px   # MARKETING CTA ONLY — never in-app
  full: 9999px  # icon-button circular containers, status pills

spacing:
  # Base unit: 4px (Vercel --geist-space)
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 96px
  6xl: 128px
  section: 192px

elevation:
  # Vercel stacked-shadow ladder. Multiple small offsets + inset hairline.
  # NEVER a single heavy drop shadow.
  flat: "none"
  hairline: "inset 0 0 0 1px rgba(0,0,0,0.08)"
  level-2: "0 1px 1px rgba(0,0,0,0.02), 0 2px 2px rgba(0,0,0,0.04)"
  level-3: "0 2px 2px rgba(0,0,0,0.04), 0 8px 8px -8px rgba(0,0,0,0.04)"
  level-4: "0 2px 2px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.04)"
  level-5: "0 1px 1px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04), 0 24px 32px -8px rgba(0,0,0,0.06)"
  focus-ring: "0 0 0 2px rgba(23,23,23,0.40)"

components:
  # === Buttons — Vercel two-scale system ===
  button-primary:
    # The single ink-fill CTA. Used everywhere a primary action exists.
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"        # 6px — IN-APP scale
    padding: "0px 12px"
    height: "32px"
  button-secondary:
    # White card surface with hairline border. Pairs with button-primary.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "0px 12px"
    height: "32px"
    borderColor: "{colors.light-hairline}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.light-ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "0px 12px"
    height: "32px"
  button-decisive:
    # Financial commit actions (Tutup Buku, Submit Rekap, Approve). Same
    # ink fill as button-primary but lg size for bigger tap target.
    # NO PILL, NO GLOW — Vercel discipline.
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.sm}"
    padding: "0px 16px"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "0px 12px"
    height: "32px"
  button-marketing-pill:
    # MARKETING / LANDING ONLY — 100px pill. Never appears in-app.
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-hero}"
    rounded: "{rounded.pill}"
    padding: "0px 24px"
    height: "44px"

  # === Inputs ===
  text-input:
    # Vercel form-input — 32px tall (--geist-form-small-height), 6px radius.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0px 12px"
    height: "32px"
    borderColor: "{colors.light-hairline}"
  text-input-lg:
    # Larger variant for hero CTAs — 40px tall.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "0px 12px"
    height: "40px"
    borderColor: "{colors.light-hairline}"
  money-input:
    # Currency-prefixed variant — "Rp" sits as inline label, value uses tabular.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.tabular}"
    rounded: "{rounded.sm}"
    padding: "0px 12px 0px 36px"
    height: "32px"
  select:
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0px 32px 0px 12px"
    height: "32px"

  # === Cards & Surfaces ===
  card:
    # Default card — pure white on canvas-soft bg, hairline border.
    # Level-1 hairline elevation (no drop shadow).
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"        # 8px — marketing-radius
    padding: "24px"
    borderColor: "{colors.light-hairline}"
  card-soft:
    # Canvas-soft inset card — used for nested groupings.
    backgroundColor: "{colors.light-canvas-2}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "24px"
  card-elevated:
    # Level-4 float-stack shadow for pricing cards / callout panels.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.md}"
    padding: "32px"
    elevation: "{elevation.level-4}"
  card-dark-band:
    # Polarity-flipped section band (showcase-band-dark).
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.none}"      # full-bleed
    padding: "96px 24px"

  # === Financial / Data Components ===
  stat-card:
    # KPI tile — Vercel marketing-card chrome. Pure white card with
    # mono eyebrow label + tabular display-md value + body-sm hint.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.tabular-lg}"
    rounded: "{rounded.md}"
    padding: "20px"
    borderColor: "{colors.light-hairline}"
  data-table-header:
    # Vercel ex-data-table-cell header — canvas-soft fill, caption-mono
    # uppercase eyebrow.
    backgroundColor: "{colors.light-canvas-2}"
    textColor: "{colors.light-ink-body}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.none}"
    padding: "10px 20px"
    borderColor: "{colors.light-hairline}"
  data-table-row:
    # Vercel ex-data-table-cell body — body-sm with hairline-subtle dividers.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: "16px 20px"
    borderColor: "{colors.light-hairline-subtle}"
  money-amount:
    typography: "{typography.tabular}"
    textColor: "{colors.light-ink}"
  money-amount-negative:
    typography: "{typography.tabular}"
    textColor: "{colors.danger}"
  money-amount-positive:
    typography: "{typography.tabular}"
    textColor: "{colors.success}"
  pnl-row:
    backgroundColor: "transparent"
    textColor: "{colors.light-ink}"
    typography: "{typography.tabular}"
    rounded: "{rounded.none}"
    padding: "12px 0"
  pnl-row-strong:
    backgroundColor: "transparent"
    textColor: "{colors.light-ink}"
    typography: "{typography.tabular-lg}"
    rounded: "{rounded.none}"
    padding: "16px 0"
    borderColor: "{colors.light-hairline}"

  # === Status & Badges (Vercel badge-secondary lineage) ===
  badge-default:
    # Subtle canvas-soft fill with body-tone text. The "quiet" status pill.
    backgroundColor: "{colors.light-canvas-2}"
    textColor: "{colors.light-ink-body}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0px 8px"
    height: "20px"
  badge-success:
    backgroundColor: "rgba(16,185,129,0.10)"
    textColor: "{colors.success-deep}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0px 8px"
    height: "20px"
  badge-warning:
    backgroundColor: "rgba(245,166,35,0.12)"
    textColor: "{colors.warning-deep}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0px 8px"
    height: "20px"
  badge-danger:
    backgroundColor: "rgba(238,0,0,0.10)"
    textColor: "{colors.danger-deep}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0px 8px"
    height: "20px"
  badge-info:
    backgroundColor: "rgba(0,112,243,0.10)"
    textColor: "{colors.info}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0px 8px"
    height: "20px"

  # === Navigation ===
  top-nav:
    # Vercel nav-bar — 56px tall, canvas (pure white) with hairline.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-sm}"
    height: "56px"
    padding: "0 24px"
    borderColor: "{colors.light-hairline}"
  side-rail:
    # Vercel sidebar pattern — 224px wide, white card surface, hairline.
    # Active row uses secondary (canvas-soft-2) fill, no left-border accent.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink-body}"
    typography: "{typography.body-sm}"
    padding: "8px"
    width: "224px"
  side-rail-row:
    backgroundColor: "transparent"
    textColor: "{colors.light-ink-body}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  side-rail-row-active:
    backgroundColor: "{colors.light-canvas-2}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  view-switcher:
    # Vercel tab-ghost — segmented control. Outer shell on canvas-soft,
    # active tab paints to pure white with level-2 shadow lift.
    backgroundColor: "{colors.light-canvas-2}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "2px"
    height: "32px"
    borderColor: "{colors.light-hairline}"
  bottom-tab-bar:
    # Mobile crew PWA: fixed bottom nav with safe-area inset.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink-body}"
    typography: "{typography.caption}"
    height: "64px"
    borderColor: "{colors.light-hairline}"

  # === Sticky bars ===
  sticky-action-bar:
    backgroundColor: "rgba(255,255,255,0.95)"
    textColor: "{colors.light-ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
    borderColor: "{colors.light-hairline}"
    elevation: "{elevation.level-5}"

  # === Hero (landing only — Vercel hero-band) ===
  hero-band:
    # White canvas, ink text, display-xl headline. NO mesh gradient
    # (Tetra zero-gradient direction). Hierarchy carried by negative
    # tracking + spacing.
    backgroundColor: "{colors.light-surface-1}"
    textColor: "{colors.light-ink}"
    typography: "{typography.display-xl}"
    padding: "64px 24px"
  hero-headline:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -2.4px
    textColor: "{colors.light-ink}"
---


## Overview

Tetra Ops runs on **Vercel's developer-platform DNA**: a stark ink-on-near-white system where every primary CTA is the same #171717 ink, every operational button shares the same 32px height and 6px radius, every card is pure white on a cool off-white canvas, and gradients are forbidden. The brand earns its calm by being relentlessly disciplined about scale and consistency.

Three DNA borrowings carry the look:

1. **Vercel's clarity** — single ink-color CTA, canvas-soft #FAFAFA page bg, pure white #FFFFFF cards, hairline #EBEBEB borders, caption-mono eyebrows above every section. Two button scales: 6px in-app, 100px pill marketing.
2. **Stripe's financial-data DNA** — tabular figures (`tnum` + slashed zero) mandatory anywhere money or quantities appear. P&L breakdowns lean on `tabular-lg` / `tabular` / `tabular-sm` hierarchy. Negative money in red `#ee0000`, positive in emerald `#10b981`.
3. **Linear's surface restraint** — hover changes color only, never translate or shadow. Cards lift via the canvas-soft / pure-white contrast, not via drop shadow.

**Key Characteristics:**

- **Single primary color** — Ink `#171717`. Every primary CTA, every focus ring, every active sidebar accent.
- **No gradients of any kind.** No `linear-gradient`, no `radial-gradient`, no text-fill gradients, no atmospheric orbs. Per user direction: "jangan ada gradient sama sekali. clean dan seamless aja."
- **Vercel two-scale button system** — 6px radius for in-app (everywhere), 100px pill ONLY for landing/marketing.
- **Inter with `ss01`+`ss02` features enabled** — those OpenType axes activate Inter's geometric alternates, the closest open-source approximation of Vercel's Geist font.
- **Caption-mono eyebrows** — every section, table header, and KPI label uses 11px JetBrains Mono uppercase with +letter-spacing. The mono is the voice of "this is a technical label."
- **Tabular figures everywhere money or quantity appears** — Inter's `tnum` + slashed-zero, never default proportional numbers.
- **Stacked shadow elevation** — multiple small offsets + inset hairline, never a single heavy drop. Reserved for popovers + modals; everyday cards just use hairline + canvas contrast.
- **Hover = color only.** No translate, no shadow shift, no scale. Vercel/Linear restraint.

## Colors

### Brand
- **Ink** (`{colors.primary}` `#171717`): the single CTA color. Every primary button fills with this ink. Every focus ring uses this ink. No second hue.
- **Ink Hover** (`#262626`), **Ink Pressed** (`#0a0a0a`): hover / active states of `button-primary`.
- **On-Ink** (`#ffffff`): every text label on ink-filled surfaces.

### Link / Info (Vercel blue)
- **Link** (`{colors.link}` `#0070f3`): inline body-text links and the `info` semantic. Never used as a button fill.
- **Link Deep** (`#0761d1`): visited / pressed state.
- **Link Soft** (`#d3e5ff`): pastel fill for "what's new" pill banners.

### Light Surfaces (DEFAULT — Vercel canvas-soft + canvas pattern)
Four-step ladder, plus three hairline tiers:

| Token | Hex | Use |
|---|---|---|
| `{colors.light-canvas}` | `#fafafa` | Canvas-soft — **page body**, the off-white anchor |
| `{colors.light-canvas-2}` | `#f5f5f5` | Canvas-soft-2 — inset region, table header bg, view-switcher shell, hover fill |
| `{colors.light-surface-1}` | `#ffffff` | Card surface (pure white) |
| `{colors.light-surface-2}` | `#ffffff` | **Default card** — stands out vs canvas-soft bg |
| `{colors.light-surface-3}` | `#f5f5f5` | Hover lift |
| `{colors.light-surface-4}` | `#ebebeb` | Selected / deepest lift |
| `{colors.light-hairline-subtle}` | `#f0f0f0` | Row dividers in dense tables |
| `{colors.light-hairline}` | `#ebebeb` | **Default card border, input border** |
| `{colors.light-hairline-strong}` | `#a1a1a1` | Emphasized border / deemphasised text |

### Light Ink
- **Ink** (`{colors.light-ink}` `#171717`): all headlines + primary body
- **Body** (`{colors.light-ink-body}` `#525252`): secondary text — captions, body paragraphs, table cell body
- **Muted** (`{colors.light-ink-muted}` `#737373`): tertiary labels, placeholders
- **Tertiary** (`{colors.light-ink-tertiary}` `#a1a1a1`): disabled, fine print

### Dark Surfaces
Mirrored ladder for `.dark` class — near-black canvas with slightly-lifted card surfaces. Per Vercel's dashboard inversion pattern. Operational chrome inherits automatically.

### Semantic
Reserved for state communication — never decoration:

- **Success** `#10B981` — approved rekap, paid settlement, positive net profit
- **Warning** `#f5a623` (Vercel amber) — pending review, low stock, partial payment
- **Danger** `#ee0000` (Vercel red) — rejected rekap, payment failed, loss event
- **Info** `#0070f3` (Vercel link blue) — informational hint, neutral notice

## Typography

### Font Stack
- **Sans (all UI)**: Inter with `ss01`+`ss02` features enabled — those OpenType axes activate Inter's geometric alternates, the closest open-source approximation of Vercel's custom Geist Sans face. Weights 400/500/600. Never 700+.
- **Mono**: JetBrains Mono — substitute for Vercel's Geist Mono. Used for project IDs, SKUs, timestamps, and the caption-mono eyebrow that marks technical labels.

### OpenType feature stack

Applied globally on `body`:

```css
font-feature-settings: "ss01", "ss02", "cv11", "calt", "kern", "liga";
letter-spacing: -0.011em;
```

| Feature | Effect | Why |
|---|---|---|
| `ss01` | Geometric alternates (1) | Vercel doc explicitly recommends this — closest visual match to Geist |
| `ss02` | Geometric alternates (2) | Pairs with ss01 to complete the geometric voice |
| `cv11` | Single-story `a` | Modern product-app feel — Linear/Vercel signature |
| `calt` | Contextual alternates | Smart letter-pair adjustments |
| `kern` | Kerning | Manual letter-pair tightening |
| `liga` | Standard ligatures | `fi`, `fl`, etc. |

The `.tabular` utility layers `tnum` + `slashed-zero` on top — so any money/qty column lines up cleanly with distinguishable zero glyphs.

### Hierarchy

| Token | Size | Weight | Line Height | Tracking | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 48px | 600 | 48px | -2.4px | Hero headline (landing) |
| `{typography.display-lg}` | 32px | 600 | 40px | -1.28px | Section headlines |
| `{typography.display-md}` | 24px | 600 | 32px | -0.96px | Page titles, big KPI values |
| `{typography.display-sm}` | 20px | 600 | 28px | -0.6px | Subsection / card titles |
| `{typography.body-lg}` | 18px | 400 | 28px | 0 | Lead paragraphs under section headlines |
| `{typography.body-md}` | 16px | 400 | 24px | 0 | **Default body paragraph** |
| `{typography.body-md-strong}` | 16px | 500 | 24px | 0 | Bolded inline body |
| `{typography.body-sm}` | 14px | 400 | 20px | -0.28px | **Table cells, nav links, secondary body** |
| `{typography.body-sm-strong}` | 14px | 500 | 20px | -0.28px | Nav CTA labels, table-row emphasis |
| `{typography.tabular-lg}` | 24px | 600 | 1.2 | -0.4px | **Big money** (stat cards, totals) |
| `{typography.tabular}` | 14px | 500 | 20px | -0.1px | **Default money/qty** |
| `{typography.tabular-sm}` | 12px | 500 | 16px | 0 | Dense money (HPP chips, stock chips) |
| `{typography.caption}` | 12px | 400 | 16px | 0 | Helper text, badge labels |
| `{typography.eyebrow}` | 11px | 500 | 14px | +0.7px UPPER | **Section eyebrow, table header — MONO** |
| `{typography.button-md}` | 13px | 500 | 1 | 0 | In-app button label |
| `{typography.button-lg}` | 14px | 500 | 1.2 | 0 | Larger button / decisive CTA |

### Principles

- **Negative tracking is part of the voice.** Display sizes use aggressive `-2.4` to `-0.6px` tracking. Body type runs `-0.011em` globally for a tighter feel. Reverting to default tracking breaks the brand.
- **Sentence-case headlines, period-terminated** ("Build and deploy on the AI Cloud.") — that punctuation is part of Vercel's voice.
- **Mono for the technical layer only.** Eyebrows, table headers, project IDs, SKUs, timestamps. Body paragraphs NEVER set in mono.
- **Weight 600 is the display ceiling.** The geometric sans never appears at 700/800. The brand reads as a calmer system because of this.
- **`.tabular` utility is mandatory** on money + quantity columns. Combines `tnum` + slashed-zero for column alignment.

## Spacing

Base unit: **4px** (Vercel `--geist-space`). Scale:

| Token | Value | Use |
|---|---|---|
| `{spacing.xxs}` | 4px | Inline icon gap, chip inner pad |
| `{spacing.xs}` | 8px | Compact gap, button vertical pad |
| `{spacing.sm}` | 12px | Form-field gap, input horizontal pad |
| `{spacing.md}` | 16px | Card content gap, default row gap |
| `{spacing.lg}` | 24px | **Card interior padding**, section content gap |
| `{spacing.xl}` | 32px | Mega-form section padding, large card |
| `{spacing.2xl}` | 40px | Card with image cap |
| `{spacing.3xl}` | 48px | Vertical section gap |
| `{spacing.4xl}` | 64px | Page top padding |
| `{spacing.5xl}` | 96px | Major section break |
| `{spacing.section}` | 192px | Hero band vertical pad (landing) |

### Container & Grid

- **Max content width**: 1400px (Vercel `--ds-page-width`). Most operational pages.
- **Mega-form width**: 768px (`max-w-3xl`) for tutup-buku, rekap form — single-column focus.
- **Mobile crew PWA**: 480px (`max-w-md`) — single-column with safe-area bottom inset.

## Elevation & Depth

Tetra uses **stacked shadows** — multiple small offsets + inset hairline. Never a single heavy drop. The signature is the inset 1px ring + multi-stop drop combo.

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow, no border | Body type, footer, ghost buttons |
| 1 (hairline) | 1px `#ebebeb` border | **Default cards**, form inputs |
| 2 (subtle drop) | Hairline + `0 1px 1px /02 + 0 2px 2px /04` | Template-grid cards, view-switcher active tab |
| 3 (soft stack) | Hairline + `0 2px 2px /04 + 0 8px 8px -8px /04` | Feature cards |
| 4 (float) | Hairline + `0 2px 2px /04 + 0 8px 16px -4px /04` | Pricing cards, callouts |
| 5 (modal) | Hairline + `0 1px 1px /02 + 0 8px 16px -4px /04 + 0 24px 32px -8px /06` | **Dropdowns, modals, popovers** |

### Decorative Depth Cues

- **Polarity-flipped dark bands** — switching a section from `light-surface-1` to `primary` (deep ink) is the brand's chief depth cue between bands.
- **No translate-on-hover.** Hover state changes background color only. Card never shifts on the page.

## Shapes

### Border Radius — Two-Scale System

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Tightest pill (deprecated; prefer sm) |
| `{rounded.sm}` | **6px** | **IN-APP DEFAULT — buttons, inputs, dropdowns, badges, sidebar rows** |
| `{rounded.md}` | **8px** | **Cards, marketing chrome** |
| `{rounded.lg}` | 12px | Large card chrome (pricing cards) |
| `{rounded.xl}` | 16px | Hero card with image cap |
| `{rounded.pill}` | **100px** | **MARKETING CTA ONLY** — never appears in operational chrome |
| `{rounded.full}` | 9999px | Icon-button circular containers, badge status pills |

### The two-scale rule

Vercel ships two distinct radius scales:
- **In-app** (`--geist-radius` 6px) — every button, input, dropdown, badge, sidebar row uses this. Tetra inherits.
- **Marketing** (`--geist-marketing-radius` 8px for cards, `100px` pill for hero CTAs) — only the landing page sees this scale.

**Never mix.** Don't put the 100px marketing pill into the operations dashboard. Don't put the 6px in-app button into the landing hero. Pick a scale by surface, stay there.

## Components

### Buttons

**`button-primary`** — the single ink-fill CTA.
- Background `{colors.primary}`, text `{colors.on-primary}`, label `{typography.button-md}` (13px / 500), 32px tall, 6px radius. Used everywhere a primary action exists — Save, Submit, Confirm, New booking, Add item.

**`button-secondary` / outline** — white card surface with hairline border.
- Background `{colors.light-surface-1}`, text `{colors.light-ink}`, hairline border, same height + radius as primary. Pairs with primary for secondary actions.

**`button-ghost`** — transparent fill, hover paints to canvas-soft-2.
- Used for tertiary actions, icon-only buttons in nav.

**`button-decisive`** — same ink fill but `lg` size (40px tall, button-lg type).
- Reserved for irreversible financial commits: Tutup Buku, Submit Rekap, Approve, Konfirmasi Settlement. NO PILL, NO GLOW — that was the iris-era; Vercel discipline doesn't carry an "extra-loud" CTA variant.

**`button-destructive`** — Vercel error red fill.
- Used sparingly: Delete project, Void payment, Reject rekap.

**`button-marketing-pill`** — 100px pill, 44px tall.
- LANDING / MARKETING ONLY. Renders on the hero band's CTA row. Never appears in operational chrome.

### Inputs

**`text-input`** — Vercel form-input chrome. 32px tall (`--geist-form-small-height`), 6px radius, white card surface with hairline.

**`text-input-lg`** — 40px-tall variant for hero forms / login.

**`money-input`** — currency-prefixed variant. "Rp" label inline-left (36px pad-left), value uses `{typography.tabular}`.

**`select`** — same shell as text-input with chevron icon right.

### Filter bars (the row above every table)

> **Patokan = halaman Operations (Event).** Every list page (Operations, Billing,
> Asset & Design, Warehouse + sub-tables, Akuntansi, Arsip Nota, Kontak, Vendor,
> Wastage, …) shares ONE filter-bar spec. Don't hand-roll a search input — drift
> here is what made the pages look inconsistent.

**`<FilterSearchInput>`** (`@/components/ui/filter-search-input`) — the single
canonical search field. Controlled (`value` + `onValueChange`) or uncontrolled
form (`name` + `defaultValue`); `className` sizes the wrapper (e.g. `flex-1
sm:max-w-xs`, `w-full`). Never inline a `<input type="search">` for a filter —
import this instead.

The locked spec (every control on the row snaps to it):
- **Height** — `h-8` (32px). Same as Button/Select/MonthPicker default. NEVER `h-9`/`h-10` on filter chrome.
- **Radius** — `rounded-md` (6px). Segmented-control *tracks* are `rounded-md` with `rounded` (4px) inner buttons.
- **Surface** — `bg-card` + `border-border-default`. NOT `bg-surface-2`, NOT `bg-background`.
- **Type** — search/select = `text-[13px]`; pill chips = `text-[12.5px]`; segmented inner = `text-[12px]`. NEVER `text-fluid-body`/`text-fluid-caption` on a filter control (they scale to 16px/clamp and break the row's rhythm).
- **Focus** — `focus-visible:ring-2 ring-ring ring-offset-2`. NOT `focus:border-primary`/`focus:border-foreground` with `ring-1`.
- **Row wrapper** — `flex flex-wrap items-center gap-2`.

**Spacing (identical on every page):**
- Stat/KPI cards → filter bar = **24px** (`space-y-6` at the `<Container>` level — the `<dl>` grid and the filter block are siblings).
- Filter bar → table = **12px** — wrap the filter bar + table together in `<div className="space-y-3">`. (Don't let the table inherit the 24px gap.)

**Chips & segmented tracks** also snap to `h-8`. Separate-pill chips:
`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12.5px]
font-medium`. Segmented track: `inline-flex h-8 items-center gap-0.5 rounded-md
border p-0.5` with `h-7` inner buttons. **Action pills** on the row (e.g.
"Belanja Kritis") follow the same chip spec — `h-8 rounded-md px-3 text-[12.5px]`
— even when tinted (amber/etc). No `h-9` pills.

**Toolbar dropdowns use `<NativeSelect>`, never `<Combobox>`.** A sort or
source/category filter in a filter row is a `<NativeSelect>` (h-8, rounded-md,
bg-card — same chrome as the row). For a **sort**, wrap it like Operations: a
`relative` box + an absolutely-positioned `ArrowDownUp` icon
(`left-2.5 size-3.5`) + `triggerClassName="w-full pl-7"`.
`<Combobox>` is **h-9/h-11 + `rounded-xl`** by design (its `size="sm"`/`default`)
— that's intentional for *searchable form fields inside dialogs/forms*, and it
breaks the filter-row rhythm. Keep Combobox out of toolbars.

### Cards

**`card`** — default surface-1 white with hairline border. 8px radius. 24px padding. Most operational content.

**`card-soft`** — canvas-soft-2 inset variant for nested groupings.

**`card-elevated`** — level-4 stacked shadow. Pricing tier cards, callout panels.

**`card-dark-band`** — polarity-flipped section, primary (ink) fill, full-bleed.

### Financial / Data

**`stat-card`** — KPI tile. White card chrome with mono eyebrow label + tabular display-md value (24px / 600 / -0.96px tracking) + body-sm hint.

**`data-table-header`** — Vercel `ex-data-table-cell` header. Canvas-soft-2 fill, mono eyebrow label, 10/20px padding, hairline bottom border.

**`data-table-row`** — Vercel `ex-data-table-cell` body. White card surface, body-sm (14px), hairline-subtle dividers between rows. Whole row is a single `<Link>` (Vercel deployments pattern) — native middle-click → new tab works.

**`pnl-row` / `pnl-row-strong`** — money line items in the P&L footer. Strong rows use `tabular-lg` for subtotals.

**`money-amount` / `-negative` / `-positive`** — inline money rendering with semantic tone.

### Status & Badges

Five semantic variants:
- **default** — canvas-soft-2 fill, body tone. Quiet status indicators.
- **success** — emerald 10% tint + emerald-700 text.
- **warning** — amber 12% tint + amber-700 text.
- **danger** — red 10% tint + red-600 text.
- **info** — link-blue 10% tint + link-blue text.

All pill-shaped (rounded-full), 20px tall, 8px horizontal padding, 11px caption typography.

### Navigation

**`top-nav`** — 56px sticky bar, white card surface, hairline bottom. Logo left + eyebrow ("OPERATIONS") + notif bell + user menu right.

**`side-rail`** — 224px wide left rail. White card surface, hairline right border. Each row: 13px body-sm-strong, 6px radius, hover paints to canvas-soft-2. Active row uses canvas-soft-2 fill (no left-edge accent bar — Vercel pattern).

**`view-switcher`** — segmented control. Outer shell 32px tall on canvas-soft-2 (inset), inner active tab paints to pure white with level-2 shadow lift. Inactive tabs sit as body-tone ghost.

**`bottom-tab-bar`** — mobile crew PWA. 64px tall with safe-area-inset-bottom. Active tab uses ink color, inactive uses muted.

### Sticky bars

**`sticky-action-bar`** — sticky bottom rekap submit bar. White card with 95% backdrop blur + hairline + level-5 shadow. Shows estimasi HPP left + button-primary right (in-app 6px radius, NOT pill).

When disabled: label switches to actionable instruction ("Upload bukti dulu"). Never silent grey states.

## Patterns & Workflows

### Operations list (Vercel deployments DNA)

The `/operations` list table is the canonical example of `ex-data-table-cell`. Pattern:

- **Header row** — canvas-soft-2 background, caption-mono eyebrow labels.
- **Each event row** is a single `<Link>` styled as a CSS-grid row. Whole row is the click target — middle-click opens new tab, keyboard tab order works, Cmd+click works.
- **Fixed grid columns**: `minmax(15rem,1.5fr) minmax(8.5rem,0.9fr) minmax(13rem,1.3fr) minmax(8rem,0.9fr) minmax(7.5rem,auto)`. Header + rows share the same track.
- **Single hover state** — `bg-secondary/60` (canvas-soft-2 at 60% alpha). No translate, no shadow shift.
- **Generous row padding** — `px-5 py-4` (20px / 16px). Cramped tables read as "data dump"; breathing room reads as "designed product."
- **Status column right-aligned**, event + payment status stacked compactly. No chevron — the whole row IS the link.
- **Crew cell** uses subtle role dots (emerald = lead, link-blue = asisten) instead of bold "L:/A:" prefixes.

This pattern generalizes to any dense ops table where each row maps to a detail page.

### Mega-form structure (Tutup Buku, Rekap)

Vertical scrolling form with labelled sections, each rendered as `card`:

1. **Hero context** — `card` showing client + package + status badge
2. **Section: Konsumsi** — cetak input + auto-derive cards (Mediaset, Sleeve) + add-on counts
3. **Section: Biaya Lapangan** — read-only display of crew-submitted expense + override toggle
4. **Section: HPP** — grid of `money-input` fields with cost chips
5. **Section: Fee Crew & Sewa** — adjustable per-role with baseline indicator
6. **Section: Komisi & Platform**
7. **Section: Diskon & Bagi Hasil**
8. **Sticky P&L footer** — layered tabular breakdown. Submit CTA = `button-decisive` (40px tall ink fill, 6px radius, NO pill).

### P&L footer hierarchy

```
Revenue Gross         Rp 5.000.000      ← tabular-lg, ink
− Diskon Klien        (Rp 50.000)       ← tabular, body
= Revenue Net         Rp 4.950.000      ← tabular-lg, top hairline
− HPP (consumable)    (Rp 800.000)
= Gross Margin        Rp 4.150.000      ← tabular-lg
− Fee Crew            (Rp 1.500.000)
− Field Expense       (Rp 285.000)
− Sewa & Lainnya      (Rp 75.000)
− Komisi & Platform   (Rp 500.000)
= Net Profit          Rp 1.790.000      ← tabular-lg, semantic tone
Margin                36.2%             ← tabular-sm, muted
```

### Empty states

Use a centered icon + caption on canvas-soft surface. Generous padding (3xl 48px). Tone: calm, instructive. Examples:
- "Belum ada event di-assign"
- "Belum ada item di custom inventory"

### Toast notifications

Use semantic tints (success / warning / danger). 10-12% tinted bg + saturated text. Bottom-right desktop, bottom-center mobile (above bottom-tab-bar).

## Do's and Don'ts

### Do

- **Default to white cards on canvas-soft bg.** Vercel/Stripe pattern — the cool off-white canvas is what makes white cards stand out.
- **Use INK #171717 as the single CTA color.** Every primary button is this ink. Period.
- **Use 6px radius for everything in-app.** Buttons, inputs, dropdowns, badges (when not pill-shaped), sidebar rows. Marketing pill 100px is reserved for the landing CTA only.
- **Use tabular figures for ALL money + quantity values.** Always `.tabular` utility — `tnum` + slashed-zero.
- **Use Inter with `ss01`+`ss02` features.** Globally on body. That's what makes Inter look like Geist.
- **Use mono (`.eyebrow`) for technical labels** — section eyebrows, table headers, KPI captions, project IDs (`PRJ-XXX`), SKUs.
- **Use stacked shadows.** Multiple small offsets + inset hairline ring. Never a single 8-px-blur generic drop.
- **Use sentence-case + negative-tracking** on every headline. Punctuation (.) at the end of hero headlines is part of the voice.
- **Show disabled states with explanation** — if a button is grey, the label must say why ("Upload bukti dulu", "Approve rekap dulu").
- **Render negative money in `{colors.danger}` (#ee0000), positive in `{colors.success}` (#10b981).** Color carries financial sentiment.

### Don't

- **Don't use gradients anywhere.** No `linear-gradient`, no `radial-gradient`, no `bg-gradient-to-*`, no `background-clip: text` with gradient fill, no atmospheric mesh orbs, no glow shadows using gradient color stops. **Zero gradients.** User direction: "jangan ada gradient sama sekali. clean dan seamless aja."
- **Don't introduce a second brand color.** Ink is the only chromatic primary. Link blue is for inline links only — never a button fill. Semantic tints (red/amber/emerald) are state-only.
- **Don't use serif fonts.** Inter everywhere. No Playfair, no Times New Roman.
- **Don't promote Inter to weight 700+.** Vercel's display ceiling is 600. Going heavier breaks the calmer voice.
- **Don't pill-round operational buttons.** 6px radius for everything in-app. 100px pill is marketing-only.
- **Don't use translate-on-hover.** Hover changes color only — `hover:bg-secondary/60` or similar. No `translateY(-2px)`, no `scale(1.02)`.
- **Don't render the data table without canvas-soft header bg.** That's what makes the header read as "table chrome." A header with the same bg as the row is a missed Vercel signature.
- **Don't drop a single heavy drop-shadow on cards.** Stack small offsets with inset hairline ring instead.
- **Don't omit `.tabular` on money columns.** Vertical alignment breaks without `tnum`.
- **Don't ship grey-disabled buttons without text explanation.**

## Responsive Behavior

### Breakpoints

| Name | Width | Key changes |
|---|---|---|
| Desktop | 1280px+ | Side-rail visible, 3-up to 4-up card grids |
| Tablet | 1024px | 4-up → 2-up cards, side-rail still visible |
| Mobile-Lg | 768px | Single-column mega-forms; top-nav links → hamburger; data table → mobile card list |
| Mobile | 480px | Crew PWA primary; sticky action bar full-width; bottom-tab-bar appears |

### Touch targets

- All in-app buttons: 32px height (h-8). Lg variant 40px for decisive financial CTAs.
- Marketing pill: 44px height for hero CTA. WCAG AAA.
- Mobile bottom-tab-bar items: 44×44px tap with safe-area-inset padding.

## Iteration Guide

1. **Single button color** — every primary CTA uses ink. Don't reach for iris/crimson/teal.
2. **6px radius default** — buttons, inputs, dropdowns. 8px for cards. 100px pill only for landing CTA.
3. **Caption-mono for every eyebrow** — use `.eyebrow` utility for section labels, table headers, KPI captions.
4. **Tabular for every money / quantity column** — `.tabular` utility (already wired).
5. **Stacked shadow for elevation** — use `--shadow-level-2` to `-5` CSS vars; never invent ad-hoc drop shadows.
6. **Run `npx tsc --noEmit`** after structural changes.

## Craft: Beyond Default (Anti-Slop)

Vercel-fidelity keeps us *correct*. It does not, by itself, keep us *good*. A
screen can obey every token above and still read as "AI made that" — flat,
boring, generic. The patterns below are the difference between a layout that
merely passes and one that feels designed. They override the reflex toward the
safest possible arrangement.

### Bans (the generic-slop tells)

- **No flat "two-big-number" metric box.** A bordered rectangle holding `Label /
  Rp1.500.000` twice is the SaaS hero-metric cliché. Numbers in isolation say
  nothing. Show the *relationship*: a payment progress bar (settled vs in-flight
  vs remaining), a before→after delta, a % of whole. The figure earns its size
  by carrying context, not by being big.
- **No empty placeholder box.** A bordered rectangle with a centered grey icon
  and "nothing here yet" is dead space pretending to be content. Empty and
  upload states are *designed*: an icon in a soft circular chip, a one-line
  purpose, and the action that fills it. Upload/drop targets use a **dashed**
  border (`border-dashed border-border-strong/50`) so the affordance reads as
  "drop here," then flip to a solid hairline once filled.
- **No dead input.** A money/quantity field with no scaffolding makes the user
  do math the UI already knows. Offer quick-fill **chips** (½, full, common
  increments) and reflect the consequence **live** as they type (remaining
  updates, the progress bar's in-flight segment grows). Input without feedback
  is a form from 2010.
- **No undifferentiated stack.** Label-on-top, input-below, repeated N times with
  identical weight is a wireframe, not a design. Give the *primary* field
  emphasis (weight, the hero slot), group the secondary ones, and let rhythm
  vary. If every row looks equally important, none is.
- **No icon-grid filler.** Same-size cards each with icon + heading + sentence,
  tiled. If the content isn't genuinely parallel, don't grid it.

### Do instead

- **Show consequence, not just capture.** Every meaningful input should visibly
  change something else on screen (a total, a remainder, a progress segment).
  Wire `transition-[width]` / color with `ease-out-expo` so the change is felt,
  not just shown. Motion is reserved for *state that changed*, never decoration.
- **Stacked / split progress** beats a lone number for anything part-of-whole:
  ink for the settled portion, emerald for the in-flight/new portion, muted
  track for what remains.
- **State color carries meaning.** Emerald only when a number improves toward
  done (remaining after payment, paid-up). Never decoratively.
- **Eyebrow + tabular discipline still applies inside these richer components** —
  `.eyebrow` for the section label, `.tabular` on every figure.

### Radius exception for overlays

In-app chrome stays on the 6px/8px two-scale rule. The **one** sanctioned break:
overlay surfaces (modals, sheets, popovers) and the cards *inside* them may use
the softer **12–16px** (`rounded-xl` / `rounded-2xl`) scale. A focused task
surface floating above the page reads as more contemporary and less utilitarian
with a rounder corner. This is intentional, not drift — keep it to overlays.

## Known Gaps & Future Considerations

- **Geist not installed** — using Inter as the open-source substitute with `ss01`+`ss02` features. If `geist` ever lands as a dependency, swap `--font-sans` → `var(--font-geist-sans)`.
- **Chart palette not specified** — when adding charts, primary series uses ink #171717, secondary series uses semantic colors (emerald / amber / link-blue). Avoid loud rainbow palettes.
- **Print styles** for settlement receipts not yet defined. When adding, use light-mode canvas + Inter for the receipt brand mark, JetBrains Mono for amounts.
- **No animation tokens here** — view-transition + press-down exist in `globals.css`. Lift-on-hover has been demoted to color-only.

---

**Sources synthesized:**
- Vercel (vercel.com) — single-CTA discipline, canvas-soft + canvas surface pattern, two-scale buttons, caption-mono eyebrows, ex-data-table-cell chrome
- Stripe (stripe.com) — tabular figures for money, semantic color for financial sentiment
- Linear (linear.app) — surface restraint, no-translate hover, dense ops layout

**Tetra-specific decisions:**
- Indonesian-language operational chrome
- Mobile-first PWA crew surface co-existing with desktop-first owner ops
- ZERO gradients (user directive)
- Inter substituting Geist (with ss01+ss02 features)
