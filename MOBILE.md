# Tetra — Mobile Native Design System

> **Authoritative mobile spec.** This document governs every phone-sized screen in Tetra
> (owner app < `md` and the entire crew app). It is a **ground-up rebuild**, not a polish pass:
> the old mobile rules squeezed desktop chrome onto phones and both owner and crew complained.
> Here we keep only what already matched native references and replace the rest.
>
> **Relationship to `DESIGN.md`.** `DESIGN.md` owns the brand DNA (emerald CTA, zero gradient,
> Inter, surface ladder, tabular figures) — that is shared and untouched. `MOBILE.md` owns
> everything *mobile-specific*: density, touch sizing, screen anatomy, navigation, gestures.
> **When the two disagree on a mobile screen, `MOBILE.md` wins.** Desktop (`md+`) keeps the
> Vercel 32px chrome from `DESIGN.md`.
>
> _Catatan: tujuan dokumen ini supaya tampilan mobile terasa seperti native app — estetik,
> smooth, seamless, proporsional, nyaman, modern — bukan layout desktop yang dipampatkan._

---

## 0. Engine — what powers this

- **Stack**: Next.js 16, React 19, **Tailwind v4** (tokens live in [`src/app/globals.css`](src/app/globals.css) via `@theme`), `lucide-react` icons, `cn()` from [`src/lib/utils.ts`](src/lib/utils.ts).
- **Mobile primitives** already exist — build with them, don't hand-roll:
  [`src/components/ui/mobile.tsx`](src/components/ui/mobile.tsx) → `AppScreen`, `AppHeader`, `Section`, `Surface`, `ListGroup`, `ListRow`, `StatTile`, `CrewAvatar`, `AvatarGroup`.
- **Type ramp** is enforced as one-class styles in `globals.css` (`.type-*`). Never write `text-[11px]` / ad-hoc `text-xs` again.
- **Safe-area + tap utilities** are baked in: `pt-safe`, `pb-safe`, `app-gutter`, `top-app-header`, `.tap`, `.press`, `h-safe-bottom-nav`.

---

## 1. Philosophy — "Native, not squished"

Three golden rules. Every screen is judged against them first, pixels second.

1. **Thumb-first.** The phone is held one-handed (≈49% of users). Primary navigation and the main action live at the **bottom**, in the easy-reach arc. The top is for identity/title and low-frequency controls.
2. **One dominant action per screen.** Exactly one emerald CTA. Everything else is quieter (secondary/ghost). If two things look equally important, the user freezes (Hick's Law).
3. **Content-first, chrome-minimal.** Maximise content; minimise frames, borders, and toolbars. Familiar patterns (Jakob's Law) over clever ones — the UI should "get out of the way."

> **UX before UI.** Flow and clarity are decided before decoration. A beautiful screen cannot
> rescue a confusing one. Microcopy and empty/error states are part of the design, not an afterthought.

**✅ Do** — design the bottom of the screen first (nav + primary action), then fill content upward.
**❌ Don't** — put the primary action in the top-right header where the thumb can't reach it.

---

## 2. Layout & grid foundation

| Concern | Value | Token / class |
| --- | --- | --- |
| Screen column | center, **max 480px** (`30rem`) | `<AppScreen>` / `.app-screen` |
| Horizontal gutter | fluid **16 → 24px** | `.app-gutter` `clamp(1rem, 0.7rem + 1.5vw, 1.5rem)` |
| Mental grid | 4-col, **gutter 16** | spacing scale below |
| Spacing scale | 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 | Tailwind `1/2/3/4/6/8/10/12` |
| Top safe zone | status bar **danger zone ≥ 44px** — never place content there | `pt-safe` |
| Bottom safe zone | home-indicator inset | `pb-safe`, `h-safe-bottom-nav` |
| Edge-to-edge | enabled app-wide | `viewport-fit: cover` + zoom-lock in [`layout.tsx`](src/app/layout.tsx) |

Everything sits inside the 480px column so a 360px Android and a 430px iPhone Pro Max breathe the same. Full-bleed media may break the gutter, but text never touches the screen edge.

**✅ Do** — wrap screens in `<AppScreen>`; let `app-gutter` own horizontal padding.
**❌ Don't** — hard-code `px-4`/`max-w-*` per screen, or let anything live under the status bar.

---

## 3. Thumb zones & reachability (Fitts + mobile usability)

```
┌───────────────┐
│ HARD  (title, │  ← top: identity, screen title, rare actions (close ✕)
│  status, info)│
│               │
│  OK           │  ← mid: scrollable content
│               │
│ EASY  (nav +  │  ← bottom: tab bar + primary CTA — the thumb's home
│  primary CTA) │
└───────────────┘
```

- **Bottom = primary.** Tab bar and the main CTA live here, full-width and large (Fitts: big + near = fast).
- **Back** sits top-left as a **44px** tap target (visual arrow ~20px inside). Provided by `AppHeader backHref`.
- **Destructive actions** are kept *away* from the resting thumb and never share a row with the primary — confirm via `useConfirm()` (no native dialogs).

**✅ Do** — place "Save / Submit / Book" as a bottom full-width emerald button.
**❌ Don't** — make the user reach to the top-right to advance a task, then scroll back down.

---

## 4. Typography (mobile scale)

One ramp, all `clamp()`-fluid, bundled size+weight+line-height+tracking. Use the class, not raw px.

| Role | Class | Size (px) | Weight | Use |
| --- | --- | --- | --- | --- |
| Screen title | `.type-display` | 28 → 34 | 600 | Large-title header (`AppHeader`) |
| Sub-title | `.type-title` | 22 → 26 | 600 | Hero/section lead |
| Section header | `.type-heading` | 17 → 19 | 600 | `Section` titles, card titles |
| Body | `.type-body` | 15 → 16 | 400 | Reading text |
| Body strong | `.type-body-strong` | 15 → 16 | 550 | List-row titles, emphasis |
| Secondary | `.type-secondary` | 14 → 15 | 400 | Subtitles, captions (muted) |
| Label | `.type-label` | 13 | 500 | Form labels, dense meta |
| Caption | `.type-caption` | 12 | 450 | Footnotes (muted) |
| Eyebrow | `.eyebrow` | 11 mono ALL-CAPS | 500 | KPI/section eyebrows |
| Number | `.type-num` / `.type-num-lg` / `.type-num-xl` | 24→30 / 32→44 | 600 | Money & quantities |

- **Tabular figures are mandatory** for money/quantities: `.tabular` / `.type-num*` (tnum + slashed-zero). Columns must align.
- **Input text ≥ 16px on mobile** — below 16px iOS auto-zooms on focus. This is a hard rule (see §7 Forms).

**✅ Do** — `.type-num-lg` for the headline stat, `.eyebrow` above it.
**❌ Don't** — invent `text-[10px]` labels or use proportional figures in a money column.

---

## 5. Color & visual weight (60-30-10)

Hierarchy comes from the surface ladder + hairlines, **never gradients** (forbidden).

| Share | Role | Tokens (light → dark) |
| --- | --- | --- |
| **60% — neutral base** | canvas + cards | bg `#fafafa→#0a0a0a` · card `#ffffff→#171717` · inset `#f5f5f5→#1f1f1f` |
| **30% — ink structure** | text, icons, dividers, selection | fg `#171717→#ededed` · body `#525252→#a1a1a1` · hairline `#ebebeb→#2a2a2a` |
| **10% — accent** | action + status | **emerald** `#059669→#10b981` |

**Accent discipline — the rule that keeps emerald rare:**
- **Emerald = the single _action_ color.** Primary CTA, submit, FAB, the one button that commits. Fill-only — never body text or large fills.
- **Ink/`primary` tint = _state_, not action.** Active nav tab, selected row, focus ring use the ink `primary` token (`bg-primary/10`, `text-primary`) — *not* emerald. This is why the crew tab bar's active pill is ink, not green.
- **Semantic colors are for status only**, never decoration: success emerald `#10b981`, warning amber `#f5a623`, danger red `#ee0000`, info/link blue `#0070f3`. No red/orange as brand accent.

**✅ Do** — one emerald button per screen; active tab in ink tint; status dots in semantic hues.
**❌ Don't** — paint multiple emerald buttons, green section headers, or any gradient.

---

## 6. Spacing, radius & elevation

### Spacing as a language ("friendship" scale)
Distance encodes relationship — pick by meaning, not by eye.

| Gap | Meaning | Example |
| --- | --- | --- |
| **4 / 8px** | tightly bound | label ↔ its value; icon ↔ its text |
| **12px** | same group | rows inside a card; chips in a row |
| **16px** | between groups | card ↔ card; field ↔ field |
| **24px** | between sections | stat block ↔ list; header ↔ content |
| **32px+** | major breaks | distinct page regions |

### Radius — softer on mobile, and nested correctly
- **Mobile surfaces are softer than desktop.** Cards, list groups, sheets use **~20px** (`rounded-[1.25rem]`, the `Surface`/`ListGroup`/`StatTile` default) — more generous than desktop's 8px card, for an iOS feel.
- **Controls** (buttons, inputs, chips) use **6px** (`rounded-md`); **pills/avatars/FAB** use `rounded-full`.
- **Nested radius rule:** `outer = inner + padding`. A 20px card with 16px padding → inner elements ~6px radius. Concentric corners, never equal-radius nesting.

### Elevation — soft, tinted, layered (never a hard black drop)
| Level | Token | Use |
| --- | --- | --- |
| 1 | `--shadow-level-1` (inset hairline) | resting card on canvas |
| 2 | `--shadow-level-2` | **default mobile card / list group** |
| 3–4 | `--shadow-level-3/4` | raised / floating elements |
| 5 | `--shadow-level-5` | sheets, modals, dropdowns |

**✅ Do** — separate sections with 24px and a hairline; cards at `shadow-level-2`.
**❌ Don't** — use one heavy `0 10px 30px rgba(0,0,0,.4)` drop, or equal radius on nested boxes.

---

## 7. Core components — the mobile contract

For each: anatomy → size → Tetra component. **Touch targets are the headline change** — desktop's 32px chrome does **not** ship to mobile.

### Mobile control scale (the REPLACE for 32px)
| Control | Mobile size | How |
| --- | --- | --- |
| Primary CTA | **48px** full-width (44px min) | `<Button size="hero-lg">` / `xl`, `w-full` |
| Secondary button | **44px** | `<Button size="lg">` |
| List row | **≥ 56px** | `<ListRow>` (`min-h-[3.4rem]`) |
| Icon button | **44×44 tap area** (icon ~22–24px) | `size-11` wrapper, `.tap` |
| Input / select | **44px**, font **16px** | see Forms |
| Bottom-nav cell | **≥ 56px** | bottom nav |

> Desktop (`md+`) keeps `h-8` (32px). These targets apply at `< md` only.

### Bottom navigation / tab bar
The backbone. [`crew-bottom-nav.tsx`](src/components/layouts/crew-bottom-nav.tsx) (4 tabs, always on) · [`owner-bottom-nav.tsx`](src/components/layouts/owner-bottom-nav.tsx) (4 + "More" sheet, `md:hidden`).
- Frosted `bg-card/80 backdrop-blur-2xl`, `border-t`, `pb-safe`, centered to the 30rem column.
- Icon ~**22–24px**, label **11px**; **3–5 tabs max** (chunk the rest into "More" — Miller's Law).
- Active = ink `primary` tint pill + `text-primary`; inactive = `text-muted-foreground`. Tap → `useHaptics("select")`.

### Top app bar + large title
[`TopBar`](src/components/layouts/topbar.tsx): sticky, **44px** mobile / 56px desktop, `pt-safe`, frosted.
[`AppHeader`](src/components/ui/mobile.tsx): compact 48px bar under TopBar (`top-app-header`) with the big `.type-display` title below that **collapses on scroll** (`lt-*`, pure CSS). Back arrow = 44px target. This is the native pattern — use it on every owner detail + crew screen.

### Cards, sections & list rows
- `Section` (title + optional "Lihat semua") groups content; **24px** between sections.
- `Surface` = soft card (20px radius, `shadow-level-2`); `tone="soft"` for inset.
- `ListGroup` + `ListRow` = grouped inset list (iOS Settings pattern). Row: leading icon/avatar · title (`type-body-strong`) · subtitle (`type-secondary`) · trailing value/badge · chevron if `href`.
- **Proximity:** related fields share a card; unrelated ones get their own. Space tells the user what belongs together.

### Buttons & CTA
- Variants from [`button.tsx`](src/components/ui/button.tsx): `default` = **emerald** (the CTA), `secondary`/`outline`/`ghost` = quiet, `destructive` = red. One emerald per screen.
- Primary CTA on mobile: **full-width, bottom, 48px, solid emerald** — high contrast, never a pale tint.
- **Label = verb + object**, explicit: "Cancel Subscription", not "Cancel"; "Simpan Rekap", not "OK".

### Forms & inputs
- **Height 44px, font 16px** (anti iOS-zoom). Reuse `MoneyInput` / `PhoneInput` / field wrappers in [`form-fields.tsx`](src/components/ui/form-fields.tsx).
- **Inline validation per field**, shown under the input as the user leaves it — not one generic "check all inputs" after submit.
- **Short option sets → segmented chips** (e.g. `3 hari / 15 / 30`), not a hidden `›` row or a long dropdown (Hick's Law). Long pickers use the existing `Combobox` / `NativeSelect`.
- One field per row on mobile; label above input. Group with cards (Proximity).

### Sheets, modals & confirms
- Use `Sheet` / `BottomSheet` for mobile modals — slide up from bottom, `shadow-level-5`, drag-to-dismiss, actions pinned at the bottom, fit within one screen.
- Confirmations via `useConfirm()` + toast — **never** `window.confirm/alert` (see `ConfirmProvider`).

### Tables → card stacks (mandatory)
- **A raw table never ships to mobile.** Use [`ResponsiveTable`](src/components/ui/responsive-table.tsx): real `<table>` at `md+`, **card list at `< md`** (each row → a card of label/value pairs).
- `overflow-x-auto` on a wide desktop table is **banned** as a mobile strategy — horizontal scrolling of data is the #1 "squished desktop" tell.

**✅ Do** — 48px full-width emerald CTA at the bottom; tables collapse to cards; chips for 2–4 options.
**❌ Don't** — 32px buttons, 13px inputs, side-scrolling tables, or two primary buttons.

---

## 8. Motion & micro-interaction

Native feel = restraint + the right easing, not flashy animation.

- **Easing**: `--ease-out-expo` (default), `--ease-spring-snappy` (press release). **Durations**: `fast 120ms` / `base 220ms` / `slow 360ms` / `spring 560ms`.
- **Press feedback**: `.press` (scale 0.96 on `:active`) / `.press-sm`; `.tap` kills the 300ms delay + grey flash. Every interactive element gets one.
- **Haptics**: `useHaptics()` ([`src/lib/use-haptics`](src/lib/use-haptics.ts)) on nav + commit actions.
- **Page transitions**: View Transitions classes (`nav-forward` / `nav-back` / `fade`) — TopBar & bottom nav are pinned (don't morph).
- **Hover/press = color only** — no translate/scale/shadow on hover (Vercel restraint). Scroll reveals via `.reveal` / `@starting-style`.
- **Micro-delight, sparingly**: a success state can celebrate (a check, a subtle confetti on first setup) — but never block or slow the task. Respects `prefers-reduced-motion`.

**✅ Do** — `.press` on buttons/rows; spring easing on release; haptic on tab change.
**❌ Don't** — lift/translate cards on hover, or animate things that delay the user.

---

## 9. UX writing / microcopy

The words are UI. Keep them human, short, and actionable.

| Don't | Do |
| --- | --- |
| "You must login before you can write a comment" | "Login to add comment" |
| "12/08/2026, 12:00" | "Besok, 12:00" (contextual time) |
| "System error (code #2234): authentication error" | "Gagal masuk: password salah" |
| Button "Cancel" (cancel what?) | "Batalkan Langganan" |
| "Please verify all inputs and try again" | per-field: "Email tidak valid" |

- Errors: plain language + what to do next. No raw codes/jargon to the user.
- Titles & buttons: concrete and direct. Match the user's words, not the system's.
- Empty states: say what goes here + one action (use `EmptyState`).

---

## 10. Mobile audit — what we're replacing

Concrete debt this system fixes (drives §11):

- **Owner data tables squished onto phones** — `overflow-x` tables on `/operations` (list), `/design`, `/warehouse`, `/finance`. → must move to `ResponsiveTable` card stacks.
- **32px touch targets** (`h-8` default) used on mobile primary actions — below the 44px native minimum. → mobile control scale (§7).
- **13px inputs** trigger iOS auto-zoom on focus. → 16px on mobile.
- **Two design languages** — crew app is native (`mobile.tsx`), owner app is desktop-first squeezed down. → one mobile vocabulary for both.
- **Ad-hoc density/chrome** — hand-rolled `text-[Npx]` and desktop padding on phones. → enforced `.type-*` ramp + `app-gutter`.

---

## 11. Refactor roadmap (BIG — phased, after this doc is approved)

Execute top-down; each item: _problem → target pattern → reuse_.

| Phase | Scope | Target pattern | Reuse |
| --- | --- | --- | --- |
| **A. Foundation** | Mobile control scale + input sizing | 44/48 targets, 16px inputs, audit `.type-*` usage | `button.tsx`, `form-fields.tsx`, `globals.css` |
| **B. Navigation** | Bottom nav + app bar unify owner/crew | one tab-bar + `AppHeader` large-title everywhere | `*-bottom-nav.tsx`, `AppHeader`, `TopBar` |
| **C. `/operations`** | List table squished | `ResponsiveTable` → card stack; filter as sheet | `ResponsiveTable`, `Sheet`, `mobile.tsx` |
| **D. `/design` + `/warehouse`** | Multi-table tabs overflow | card lists + segmented tabs | `ResponsiveTable`, `ListGroup` |
| **E. Forms & detail** | `/operations/[projectId]`, create/edit flows | vertical stack, inline validation, bottom CTA | `form-fields.tsx`, `Sheet`, `useConfirm` |
| **F. `/finance` + `/dashboard`** | Dense KPIs/reports | `StatTile` grid, tabular figures, card breakdowns | `StatTile`, `.type-num*` |

Crew screens are the reference standard — bring owner mobile up to them, don't regress them.

---

## 12. "Native vs slop" review checklist

Run before merging any mobile screen.

- [ ] Wrapped in `<AppScreen>`; padding via `app-gutter` (no per-screen `px-*`).
- [ ] Nothing under the status bar; bottom respects `pb-safe`.
- [ ] **One** emerald CTA, full-width at the bottom, **≥ 44px** (48 ideal).
- [ ] All tap targets ≥ 44px; inputs 16px font.
- [ ] No raw/side-scrolling table — `ResponsiveTable` card stack on mobile.
- [ ] Type uses `.type-*` ramp; money uses `.tabular`/`.type-num*`.
- [ ] Sections 24px apart; related items grouped (Proximity); ≤ 5 nav tabs (chunked).
- [ ] Soft mobile radius (~20px) on surfaces; nested radius = inner + padding.
- [ ] `shadow-level-2` cards / `level-5` sheets — no heavy black drop; **no gradients**.
- [ ] `.press` + haptics on interactive elements; hover = color only.
- [ ] Microcopy concise, errors human + actionable, button labels = verb + object.
- [ ] Active state in ink tint; emerald reserved for the action only.

---

_This is the mobile source of truth. Update it here first; code follows the doc, not the reverse._
