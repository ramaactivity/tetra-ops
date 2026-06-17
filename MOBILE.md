# Tetra — Mobile Native Design System (v2)

> **Authoritative mobile spec.** Governs every phone-sized screen in Tetra (owner app `< md`
> and the entire crew app). A **ground-up rebuild** driven by native references — not the old
> squeezed-desktop chrome that owner & crew complained about.
>
> **Relationship to `DESIGN.md`.** **Fonts and colors are shared and identical across mobile and
> desktop** — defined once in `DESIGN.md` / [`globals.css`](src/app/globals.css) (Manrope + Inter;
> the UpGradely palette: pastel ambient gradient, ink-black CTA, lime/orange/blue/red accents) and
> used by both. `MOBILE.md` does **not** fork the brand. It owns only the mobile *form factor*:
> density, touch sizing, screen anatomy, elevation, navigation, gestures — and wins on those.
>
> _Tujuan: mobile terasa seperti native app — adem, estetik, smooth, seamless, proporsional,
> nyaman, modern. Hindari AI slop: setiap keputusan disengaja, pakai token & komponen yang ada._

---

## Direction v2 — locked decisions

The mobile language is the **"Operations" reference** (calm, operational, information-dense but
breathable), reconciled to Tetra's brand. **Type and color are shared with desktop — one brand,
consistent everywhere.** Only the form-factor rows below are mobile-specific.

| Axis | Decision | Scope |
| --- | --- | --- |
| **Type** | **Manrope** (titles + numbers) + **Inter** (body/labels/UI). Manrope's lining figures are tuned for stat & money dashboards. | **Shared mobile + desktop** |
| **Color** | **UpGradely DNA.** Pastel **ambient gradient** frames the screen; cream/white cards float on it. **Ink black = the action color.** Accents are functional: lime = success, orange = warning/in-progress, sky blue = info/to-do, red = danger. See DESIGN.md §2. | **Shared mobile + desktop** |
| **Elevation** | **Soft ambient shadow** on the pastel canvas (cards lift gently, `rounded-2xl`). | Mobile form factor |
| **Primary action** | **FAB (ink black)** for the screen's create action + **bottom nav with a solid ink active pill** (white icon). | Mobile form factor |
| **Tables** | **Reflow to Record Cards** (the operational pattern). Financial statements stay tabular inside a scroll container. | Mobile form factor |

> Sources for the type decision: [Inter font pairings 2026 — Made Good Designs](https://madegooddesigns.com/inter-font-pairing/), [Best Google Font Pairings 2025 — Matt Medley](https://medley.ltd/blog/best-google-font-pairings-for-ui-design-in-2025/). Manrope+Inter is a validated fintech/dashboard pairing; Plus Jakarta Sans + Inter is the warmer alternative if we ever revisit.

---

## 0. Engine — what powers this

- **Stack**: Next.js 16, React 19, **Tailwind v4** (tokens in [`src/app/globals.css`](src/app/globals.css) via `@theme`), `lucide-react` icons, `cn()` from [`src/lib/utils.ts`](src/lib/utils.ts).
- **Fonts** load via `next/font` in [`layout.tsx`](src/app/layout.tsx) → `--font-manrope`, `--font-inter`, `--font-jetbrains-mono`.
- **Mobile primitives** to build with (don't hand-roll): [`src/components/ui/mobile.tsx`](src/components/ui/mobile.tsx) → `AppScreen`, `AppHeader`, `Section`, `Surface`, `ListGroup`, `ListRow`, `StatTile`, `CrewAvatar`, `AvatarGroup`. **v2 adds**: `RecordCard`, `StatScroller`, `FilterChips`, `Fab` (see §7).
- **Type ramp** is enforced as one-class styles in `globals.css` (`.type-*`). Never write `text-[11px]` / ad-hoc `text-xs`.
- **Safe-area + tap utilities** baked in: `pt-safe`, `pb-safe`, `app-gutter`, `top-app-header`, `.tap`, `.press`, `h-safe-bottom-nav`, `.hide-scrollbar`.

---

## 1. Philosophy — "Native, not squished"

Three golden rules. Judge every screen against them first, pixels second.

1. **Thumb-first.** Phone is one-handed (~49%). Primary nav + the create action live at the **bottom** (FAB + tab bar). Top = identity/title + rare controls.
2. **One dominant action per screen.** Exactly one ink action (the FAB, or one bottom CTA). Everything else is quiet (Hick's Law).
3. **Content-first, chrome-minimal.** Maximise content, minimise frames. Familiar patterns over clever ones (Jakob's Law).

> **UX before UI.** Flow & clarity before decoration. Microcopy and empty/error states are part of the design.

**✅ Do** — design the bottom first (nav + FAB), fill content upward.
**❌ Don't** — bury the primary action in the top-right where the thumb can't reach.

---

## 2. Layout & grid foundation

| Concern | Value | Token / class |
| --- | --- | --- |
| Screen column | center, **max 480px** (`30rem`) | `<AppScreen>` / `.app-screen` |
| Horizontal gutter | fluid **16 → 24px** | `.app-gutter` |
| Section rhythm | **24px** between sections, 16px between cards | spacing scale |
| Canvas | soft cool **off-white** (cards lift off it) | `bg-background` (v2 calm tone) |
| Top safe zone | status bar **≥ 44px danger zone** | `pt-safe` |
| Bottom safe zone | home-indicator inset; clear the nav + FAB | `pb-safe`, `h-safe-bottom-nav` |
| Edge-to-edge | app-wide | `viewport-fit: cover` in [`layout.tsx`](src/app/layout.tsx) |

Everything sits in the 480px column. Horizontal scrollers (stat cards, filter chips) **bleed to the edge** with `-mx-[gutter]` + `app-gutter` padding so they hint "more" without breaking the margin.

**✅ Do** — wrap screens in `<AppScreen>`; let `app-gutter` own padding; bleed scrollers to the edge.
**❌ Don't** — hard-code `px-4`/`max-w-*` per screen, or let content sit under the status bar.

---

## 3. Thumb zones & reachability (Fitts + mobile usability)

```
┌───────────────┐
│ HARD  (title, │  ← top: identity, screen title, rare actions
│  status)      │
│  OK           │  ← mid: scrollable content
│               │
│ EASY  (nav +  │  ← bottom: tab bar + FAB — the thumb's home
│  FAB)         │
└───────────────┘
```

- **Bottom = primary.** Tab bar + FAB live here (Fitts: big + near = fast).
- **Back** = top-left, **44px** tap target. From `AppHeader backHref`.
- **Destructive** actions stay away from the resting thumb and never sit beside the primary — confirm via `useConfirm()` (no native dialogs).

---

## 4. Typography — dual font (Manrope + Inter)

Hierarchy by **weight + family**, not by many sizes. Use the `.type-*` class, never raw px.
**These fonts are app-wide — identical on mobile and desktop** (defined in `globals.css`).

| Role | Class | Family | Size (px) | Weight |
| --- | --- | --- | --- | --- |
| Display / stat number | `.type-display` / `.type-num-*` | **Manrope** | 28→34 / 24→48 | 700 |
| Screen / section title | `.type-title` / `.type-heading` | **Manrope** | 17→26 | 600/700 |
| Card title (record) | `.type-heading` | **Manrope** | 18→20 | 600 |
| Body | `.type-body` | Inter | 15→16 | 400 |
| Body strong | `.type-body-strong` | Inter | 15→16 | 550 |
| Secondary (muted) | `.type-secondary` | Inter | 14→15 | 400 |
| Label | `.type-label` | Inter | 13 | 500 |
| Caption (muted) | `.type-caption` | Inter | 12 | 450 |
| Eyebrow / category | `.eyebrow` | **Inter** (sans) | 11 ALL-CAPS | 600 |
| Money / quantity | `.type-num` | Manrope tabular | — | 600 |

- **Manrope carries the "voice"** (titles, the big stat numbers) — calm, modern, slightly rounded. **Inter carries the detail** (body, labels, dense metadata) for razor legibility.
- **Tabular figures mandatory** on money/quantities (`.tabular` / `.type-num*`): tnum + slashed-zero so columns align and `0 ≠ O`.
- **Input text ≥ 16px on mobile** (anti iOS auto-zoom) — hard rule (§7 Forms).

**✅ Do** — Manrope 700 for the `135` stat, Inter for "Semua event tercatat".
**❌ Don't** — set body copy in Manrope, or invent `text-[10px]` labels.

---

## 5. Color & visual weight — UpGradely DNA

The **pastel ambient gradient** frames the screen (painted on `<html>`, see DESIGN.md §1);
cream/white cards float on it with **soft shadow**. **This palette is app-wide — mobile and
desktop share the exact same tokens** (re-valued in `globals.css @theme`).

**Ink black is the one action color.** Accents are functional, never decorative.

| Layer | Role | Token / class (light) |
| --- | --- | --- |
| **Canvas** | ambient gradient + base | `--gradient-ambient` on `<html>` · base `#f7f6f3` |
| **Card** | floating surfaces | `--card #fefefe`, `rounded-2xl`, soft shadow |
| **Ink structure** | text, icons, dividers | fg `#1a1a17` · muted `#6d6c66` · hairline `#e9e8e2` |
| **Ink — action** | primary button · FAB · active nav pill · active tab | `--primary #18181b` (white label) |
| **Lime — success** | paid · done · positive · success dot | `emerald-*` (bg `emerald-200`, text `emerald-900`) |
| **Orange — warning** | in-progress · pending · menunggu settle | `amber-*` (bg `amber-100`, text `amber-800`) |
| **Sky blue — info** | to-do · info · neutral status | `sky-*`/`teal-*` (bg `sky-100`, text `sky-700`) |
| **Red — danger** | cancelled · overdue · negative money | `rose-*` / `--destructive #d12e36` |

**Discipline — stay fresh, not noisy:**
- **Ink is the one action hue** — primary button, FAB, active nav pill, active tab. No second CTA color.
- **Accents mean something** — lime = good, orange = pending, blue = info, red = danger. Don't decorate with them.
- **The gradient is the frame only** — never inside a card; cards stay opaque so dense data is legible.
- Category/type chips stay **neutral** (ink/slate dot); color is for action + status.
- **Status pills** = clearly-colored fill + dark readable text (`<Badge variant="success|warning|info|danger">`).

**✅ Do** — ink = the action; lime/orange/blue/red = status meaning; gradient frames, cards float.
**❌ Don't** — two CTAs, gradient text or in-card gradients, colored category chips, green "primary" buttons.

---

## 6. Spacing, radius & elevation

### Spacing as a language ("friendship" scale)
| Gap | Meaning | Example |
| --- | --- | --- |
| **4 / 8px** | tightly bound | label ↔ value; icon ↔ text |
| **12px** | same group | rows in a card; chips in a row |
| **16px** | between groups | card ↔ card; field ↔ field |
| **24px** | between sections | stat scroller ↔ list; header ↔ content |
| **32px+** | major breaks | distinct regions |

### Radius — soft, nested correctly
- **Cards / sheets / stat cards / record cards**: **16–20px** (`rounded-2xl`). **FAB**: 16px (`rounded-2xl`). **Chips / buttons / inputs**: pill (`rounded-full`) or 12px. **Avatars / dots**: `rounded-full`.
- **Nested radius rule:** `outer = inner + padding`. A 20px card with 16px padding → inner ~6–8px. Concentric corners, never equal-radius nesting.

### Elevation — soft ambient shadow scale (v2)
Linear / Notion / Figma feel: **layered, low-opacity, cool gray-tinted** — white cards lifting
gently off the canvas, **never a hard black drop**. A real ramp (`shadow-soft-xs → -xl`, ≈ Figma
100 → 500), namespaced so it never collides with Tailwind's default `shadow-*`.

| Token (class) | Use |
| --- | --- |
| `shadow-soft-xs` | hairline lift, chips, hover hint |
| `shadow-soft-sm` | inputs, small controls |
| `shadow-soft` (md) | **default: record / stat / surface cards** |
| `shadow-soft-lg` | sheets, popovers, raised |
| `shadow-soft-xl` | modals / max elevation |
| `shadow-fab` | the FAB only (ink-tinted) |

**✅ Do** — white card + `shadow-soft` on the canvas; one step up on press/active if needed; 24px between sections.
**❌ Don't** — heavy `rgba(0,0,0,.4)` drops, equal radius on nested boxes, or shadow on flat list rows.

---

## 7. Core components — the mobile contract

**Touch targets are non-negotiable**: desktop's 32px chrome does **not** ship to mobile.

### Mobile control scale
| Control | Mobile size | How |
| --- | --- | --- |
| FAB | **56×56** | `<Fab>` — ink black, `rounded-2xl`, bottom-right above nav |
| Primary button | **48px** full-width | `<Button size="hero-lg" className="w-full">` |
| Secondary button | **44px** | `<Button size="lg">` |
| Record / list row | **≥ 56px** | `<RecordCard>` / `<ListRow>` |
| Icon button | **44×44** tap area | `size-11` wrapper, `.tap` |
| Input / select | **44px**, font **16px** | Forms below |
| Filter chip | **40px** | `<FilterChips>` |
| Bottom-nav cell | **≥ 56px** | bottom nav |

> Desktop (`md+`) keeps `h-8` (32px). These apply at `< md`.

### Bottom navigation / tab bar
[`crew-bottom-nav.tsx`](src/components/layouts/crew-bottom-nav.tsx) · [`owner-bottom-nav.tsx`](src/components/layouts/owner-bottom-nav.tsx).
- Frosted `bg-card/80 backdrop-blur-2xl`, `border-t`, `pb-safe`, centered to the 30rem column.
- Icon **22–24px**, label **11px**; **3–5 tabs** (rest → "More", Miller's Law).
- **Active = solid ink pill** (`bg-primary` + white icon, `text-primary-foreground`) + label in `text-foreground`; inactive = `text-muted-foreground`. Tap → `useHaptics("select")`.

### FAB (Floating Action Button)
- The screen's single create action ("Booking baru", "Tambah alat"). **56×56**, ink fill, `rounded-2xl`, ink-tinted soft shadow, `+` icon ~28px.
- Fixed **bottom-right**, sits **above** the bottom nav (`bottom: calc(nav + 16px)`), respects `pb-safe`. `.press` (`active:scale-95`) + haptic.
- One FAB per screen, only when there's a clear primary create action. If the screen has no create action, no FAB.

### Top app bar + large title
[`TopBar`](src/components/layouts/topbar.tsx): sticky, **44px** mobile / 56px desktop, `pt-safe`, frosted. Title may use the section accent.
[`AppHeader`](src/components/ui/mobile.tsx): compact bar + big Manrope `.type-display` title below that **collapses on scroll** (`lt-*`, pure CSS). Back arrow = 44px.

### Record Card — the table→mobile answer ⭐
**A data table never ships raw to mobile.** Each row becomes a **Record Card** (`<RecordCard>`). Anatomy (from the Operations reference):

```
┌─▏────────────────────────────────────────┐   ▏ = 4px status strip (left, status hue)
│ ▏ ● Wedding              [Menunggu Settle]│   header: category chip (neutral dot) ……… status chip (tinted)
│ ▏ Luthfi & Rosya                  ✓ Lunas │   title (Manrope 18–20) ……………………… secondary status
│ ▏ ─────────────────────────────────────── │   hairline
│ ▏ 🕐 24 Jun 2026 · 08:00–15:00            │   metadata rows: icon (muted 18px) + value (Inter 14)
│ ▏ 📍 Grand Ballroom Hotel Mulia           │   — single column on phone; 2-col only if values are short
│ ▏ 📦 Premium Wedding Package              │
│ ▏ ─────────────────────────────────────── │   hairline
│ ▏ CREW  (B)(A)(+3)                      → │   footer: avatar group + chevron (whole card → detail)
└──────────────────────────────────────────┘
```

Rules:
- White card, `rounded-2xl`, `shadow-soft`, optional **4px left status strip** colored by primary status.
- **Header**: category/type as a **neutral** chip (dot + UPPERCASE label, `.eyebrow`); title in Manrope; status chip(s) top-right (tinted, §5).
- **Body**: labeled metadata, **icon + value** rows. Default **one column** on phone; use 2 columns only for short paired values (the reference's "Waktu & Tempat / Detail Paket"). Truncate long venue/package with `truncate`.
- **Footer** (optional): `AvatarGroup` (crew) left + chevron right; whole card is one tap target (`.press`, `href` to detail).
- Money/quantities use `.tabular`. Owner-only financials still hidden from crew (`getRekapContext`).
- Use `<ResponsiveTable>` to switch: real `<table>` at `md+`, `RecordCard` stack at `< md`.

### Stat scroller
Horizontal-scroll row of **stat cards** (`<StatScroller>` + `StatTile`). Each: `min-w-[160px]`, white, `rounded-2xl`, `shadow-soft`; `.eyebrow` label, Manrope big number (`.type-num-lg/xl`), optional hint or **progress bar** (target %). Bleed `-mx-[gutter]` + `.hide-scrollbar`.

### Filter chips
Horizontal-scroll pills (`<FilterChips>`), **40px**, `rounded-full`. Active = solid ink ; inactive = white + hairline. Bleed to edge. Opens a `Sheet`/`Combobox` for multi-option filters (Hick's Law).

### Buttons & CTA
- [`button.tsx`](src/components/ui/button.tsx): `default` = **ink black** (the action), `secondary`/`outline`/`ghost` = quiet, `destructive` = rose. One ink action per screen.
- Mobile primary: **full-width, 48px, solid ink**, bottom of sheet/form. **Label = verb + object** ("Simpan Rekap", not "OK").

### Forms & inputs
- **44px height, 16px font** (anti iOS-zoom) — already enforced in `INPUT_CLASS` ([`form-fields.tsx`](src/components/ui/form-fields.tsx)). Reuse `MoneyInput` / `PhoneInput`.
- **Inline per-field validation** as the user leaves the field — not a generic post-submit error.
- **Short option sets → segmented chips** (`3 hari / 15 / 30`), not a hidden `›` row or long dropdown.
- One field per row; label above input; group with cards (Proximity).

### Sheets, modals & confirms
- `Sheet` / `BottomSheet`: slide up, `--shadow-soft-lg`, drag-to-dismiss, actions pinned at the bottom, fit one screen.
- Confirm via `useConfirm()` + toast — **never** `window.confirm/alert`.

**✅ Do** — table → `RecordCard` stack; stat scroller; FAB for create; 48px ink CTA in sheets.
**❌ Don't** — raw/side-scrolling data tables, 32px buttons, 13px inputs, two primary actions.

---

## 8. Motion & micro-interaction

- **Easing**: `--ease-out-expo` (default), `--ease-spring-snappy` (press release). **Durations**: `120 / 220 / 360 / 560ms`.
- **Press**: `.press` (scale 0.96–0.98 on `:active`) on every interactive element; `.tap` kills the 300ms delay + grey flash. Cards get `active:scale-[0.98]`.
- **Haptics**: `useHaptics()` ([`src/lib/use-haptics`](src/lib/use-haptics.ts)) on nav + commit.
- **Page transitions**: View Transitions (`nav-forward` / `nav-back` / `fade`); TopBar + bottom nav pinned.
- **Hover/press = color/scale only**, no layout shift. Scroll reveals via `.reveal` / `@starting-style`.
- **Micro-delight, sparingly**: success can celebrate (check, subtle confetti once) — never block the task. Respect `prefers-reduced-motion`.

---

## 9. UX writing / microcopy

| Don't | Do |
| --- | --- |
| "You must login before you can write a comment" | "Login to add comment" |
| "12/08/2026, 12:00" | "Besok, 12:00" (contextual time) |
| "System error (code #2234)…" | "Gagal masuk: password salah" |
| Button "Cancel" | "Batalkan Langganan" |
| "Please verify all inputs" | per-field: "Email tidak valid" |

Errors: plain language + next step, no raw codes. Empty states: what goes here + one action (`EmptyState`).

---

## 10. Mobile audit — what we're replacing

- **Owner data tables squished** (`overflow-x` / bare `<table>`) on `/operations`, `/design`, `/warehouse`, `/finance` → **Record Card** stacks (list data) or scroll-contained tables (financial statements only).
- **32px touch targets** on mobile primary actions → control scale (§7).
- **13px inputs** → 16px (done in `INPUT_CLASS` + per-form, Phase A ✅).
- **Two design languages** — crew native vs owner desktop-squeezed → one v2 mobile language for both.
- **Flat, hairline-only chrome** felt un-native → soft shadow + cool canvas + Manrope voice + FAB.

---

## 11. Refactor roadmap (phased)

Execute top-down; each: _problem → target → reuse_.

| Phase | Scope | Target | Reuse / add |
| --- | --- | --- | --- |
| **A. Foundation** ✅ | Input zoom + control scale | 16px inputs done; 44/48 targets | `form-fields.tsx`, `button.tsx` |
| **B. Tokens & fonts** | Manrope, calm canvas, soft-shadow, Manrope `.type-*` | v2 token layer | `layout.tsx`, `globals.css` |
| **C. Primitives** | `RecordCard`, `StatScroller`, `FilterChips`, `Fab` | new mobile vocab | `mobile.tsx`, `ResponsiveTable` |
| **D. Operations pilot** | `/operations` list → v2 screen | RecordCard stack + stat scroller + FAB + active-pill nav | C + `mobile.tsx` |
| **E. Roll out** | `/design`, `/warehouse`, dashboards | RecordCard / scroll-contained tables | C, D patterns |
| **F. Forms & detail** | create/edit + `[projectId]` | stacked, inline validation, bottom CTA | `form-fields.tsx`, `Sheet` |

> Financial statements (P&L, neraca, jurnal, buku besar) stay **tabular inside a scroll container** — do NOT force them into cards.

---

## 12. "Native vs slop" review checklist

- [ ] Wrapped in `<AppScreen>`; padding via `app-gutter`; scrollers bleed to the edge.
- [ ] Nothing under the status bar; bottom clears nav + FAB (`pb-safe`).
- [ ] Titles + numbers in **Manrope**; body/labels in **Inter**; money is `.tabular`.
- [ ] **One** ink action (FAB or one CTA, ≥ 44px); active nav = ink pill.
- [ ] Ink is the only action color; accents (lime/orange/blue/red) carry status meaning only; ambient gradient frames, cards stay opaque.
- [ ] All tap targets ≥ 44px; inputs 16px font.
- [ ] Data table → `RecordCard` stack (or scroll-contained for financial statements) — no bare/side-scrolling table.
- [ ] Cards `rounded-2xl` + `shadow-soft` on the cool canvas; nested radius = inner + padding.
- [ ] Sections 24px apart; related items grouped (Proximity); ≤ 5 nav tabs.
- [ ] `.press` + haptics on interactive elements; transitions respect reduced-motion.
- [ ] Microcopy concise; errors human + actionable; button labels = verb + object.

---

_This is the mobile source of truth. Update it here first; code follows the doc, not the reverse._
