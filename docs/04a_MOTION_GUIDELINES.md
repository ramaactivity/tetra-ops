# 04a — Motion Guidelines

**Companion to** [04_DESIGN_SYSTEM.md](./04_DESIGN_SYSTEM.md).
**Last verified against** `src/app/globals.css` at commit `c273b51` (2026-05-08, F1 token revamp shipped).

This doc defines how Tetra Ops animates: tokens to use, patterns to follow, and what NEVER to animate. Read this before adding any transition or animation in code.

> **Top-level constraint:** zero JavaScript animation libraries. We use Next.js 16 View Transitions API + CSS keyframes + `tw-animate-css` (already installed). We REJECT `framer-motion` (~50KB redundant). See §6.

---

## 1. Motion Tokens

Defined in `src/app/globals.css` `@theme inline` block. Tailwind v4 picks them up as utility classes automatically.

### 1.1 Durations

| Token | Value | Tailwind utility | When |
|---|---|---|---|
| `--duration-fast` | `120ms` | `duration-fast` | Microinteractions: hover, press, focus ring scale, icon swap |
| `--duration-base` | `200ms` | `duration-base` | Default transitions: dialogs, dropdowns, toasts, fade in/out |
| `--duration-slow` | `320ms` | `duration-slow` | Page-level transitions, hero reveals, View Transitions defaults |

**Rule:** never exceed `400ms` outside View Transitions. `500ms+` feels broken — users start to wonder if something failed.

### 1.2 Easings

| Token | Curve | Tailwind utility | When |
|---|---|---|---|
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | `ease-out-expo` | **Default for entrances** — 90% of cases |
| `--ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | `ease-out-quart` | Subtle entrances: hover lifts, focus expands |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `ease-spring` | Playful overshoot — toasts, success checkmarks, FAB pop |

**Rule:** never use `ease-in` for an entrance. Things should arrive _decelerating_, not accelerating into the user's view.

For exits: use `ease-in` (e.g., `ease-in` default Tailwind utility) so things accelerate out.

### 1.3 Tailwind v4 transition syntax

```tsx
<button className="transition-transform duration-fast ease-out-expo active:scale-[0.97]">
  Press me
</button>

<div className="transition-opacity duration-base ease-out-expo data-[state=open]:opacity-100 data-[state=closed]:opacity-0">
  Dialog
</div>
```

---

## 2. Principles

### 2.1 Compositor-only properties

**Animate ONLY** `transform`, `opacity`, `filter`. These run on the GPU compositor thread without forcing layout or paint.

**NEVER animate** `width`, `height`, `top`/`left`/`right`/`bottom`, `padding`, `margin`, `font-size`, `color`, `background-color`, `border-color`. These force layout or paint passes — janky on mobile, especially mid-range Android.

**Common mistakes and the right fix:**

| Wrong | Right | Why |
|---|---|---|
| `animate width: 0 → 100%` | `transform: scaleX(0) → scaleX(1)` + `transform-origin: left` | scaleX is compositor-only |
| `animate height: 0 → auto` | wrap in container, animate `transform: translateY(-100%) → 0` + clip-path | `auto` requires layout |
| `animate background-color` | overlay element with `bg-*` and animate its `opacity` | color animation forces paint |
| `animate font-size` | wrap in `<span>` and animate `transform: scale()` | font-size triggers reflow of entire text run |
| `animate top/left for slide-in` | `transform: translateY(20px) → translateY(0)` | translate is compositor-only |
| `animate border on hover` | use box-shadow or outline (paint-only on bordered side) | border changes layout |

### 2.2 Purposeful, not decorative

Every animation must answer: **what does this communicate?**

- ✅ Modal slides up → "this just appeared, here's where it came from"
- ✅ Button presses → "I registered your tap"
- ✅ Skeleton fades to content → "loading is done"
- ❌ Card lifts on every hover → noise, kills compositor budget
- ❌ Icon rotates infinitely "for fun" → distracting in a long ops session
- ❌ Page-load stagger of 30 cards → makes app feel slow

### 2.3 Reduce motion respect

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This block belongs in `globals.css` `@layer base`. View Transitions also need a guard — see §3.

---

## 3. View Transitions API (Page-Level, F4)

Next.js 16 ships native View Transitions support. Activated with one config line:

```ts
// next.config.ts
export default {
  experimental: { viewTransition: true },
};
```

### 3.1 What it does

The browser snapshots the old DOM, swaps to new DOM, and **automatically morphs** any pair of elements with matching `view-transition-name`. No JS animation library needed. 2-3× perceived speedup vs JS routers on low-end devices.

### 3.2 Pattern: shared event-card → event-detail hero

```tsx
// In list page — apply name based on dynamic id so each card is unique
<Link href={`/operations/${event.id}`}>
  <article style={{ viewTransitionName: `event-${event.id}` }}>
    <h3>{event.client}</h3>
    <p>{event.date}</p>
  </article>
</Link>

// In detail page — hero element with the same name
<div style={{ viewTransitionName: `event-${id}` }}>
  <h1>{event.client}</h1>
  <p>{event.date}</p>
</div>
```

The browser cross-fades and morphs the matching elements during navigation. Other elements get the default page-level fade.

### 3.3 Customizing the transition

```css
/* In globals.css */
::view-transition-old(root) { animation: fade-out var(--duration-slow) var(--ease-out-expo); }
::view-transition-new(root) { animation: fade-in var(--duration-slow) var(--ease-out-expo); }

/* Specific element transition */
::view-transition-group(*) {
  animation-duration: var(--duration-slow);
  animation-timing-function: var(--ease-out-expo);
}
```

### 3.4 Reduced-motion guard

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

### 3.5 Browser support

- Chrome / Edge: full support since v126
- Safari 18+ (iOS 18 too): full support
- Older iOS Safari: gracefully no-ops to instant swap. Use `@supports (view-transition-name: none) { ... }` for fallback styling if needed.

---

## 4. Component-Level Patterns

### 4.1 Fade-in on mount (`@starting-style`)

For an element appearing without unmount/remount cycle, modern CSS gives us `@starting-style`:

```css
@layer utilities {
  .fade-in-on-mount {
    opacity: 1;
    transition: opacity var(--duration-base) var(--ease-out-expo);
    @starting-style { opacity: 0; }
  }
}
```

```tsx
<div className="fade-in-on-mount">Just appeared</div>
```

No JS state needed. Browser handles the entrance. Falls back to no animation on Safari < 17.5.

### 4.2 Press-down (button feedback)

```css
@layer utilities {
  .press-down {
    transition: transform var(--duration-fast) var(--ease-out-expo);
  }
  .press-down:active { transform: scale(0.97); }
}
```

Or inline: `active:scale-[0.97] transition-transform duration-fast ease-out-expo`.

### 4.3 Lift on hover (cards, KPI tiles)

```css
@layer utilities {
  .lift-on-hover {
    transition: transform var(--duration-fast) var(--ease-out-expo),
                box-shadow var(--duration-fast) var(--ease-out-expo);
  }
  @media (hover: hover) {
    .lift-on-hover:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
  }
}
```

The `@media (hover: hover)` guard prevents sticky-hover bugs on touch devices.

### 4.4 Skeleton shimmer

```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@layer utilities {
  .shimmer {
    position: relative;
    overflow: hidden;
  }
  .shimmer::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255,255,255,0.05) 50%,
      transparent 100%);
    animation: shimmer 1.5s var(--ease-out-quart) infinite;
  }
}
```

Used by `<Skeleton>` primitive (F3).

### 4.5 Dialog / Sheet entrance

Base UI primitives expose `data-state="open|closed"` attributes. Tailwind `data-*` variants animate based on that:

```tsx
<Dialog.Backdrop className="
  fixed inset-0 bg-black/60 backdrop-blur-sm
  transition-opacity duration-base ease-out-expo
  data-[state=open]:opacity-100
  data-[state=closed]:opacity-0
" />

<Dialog.Popup className="
  fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
  bg-surface-3 rounded-xl shadow-xl
  transition-all duration-base ease-out-expo
  data-[state=open]:opacity-100 data-[state=open]:scale-100
  data-[state=closed]:opacity-0 data-[state=closed]:scale-95
" />
```

### 4.6 Mobile bottom sheet (swipe-up entrance)

```tsx
<Sheet.Popup className="
  fixed inset-x-0 bottom-0 bg-surface-3 rounded-t-2xl
  transition-transform duration-base ease-out-expo
  data-[state=open]:translate-y-0
  data-[state=closed]:translate-y-full
" />
```

### 4.7 Toast slide-in (sonner)

Sonner handles its own animation; just style the container with our tokens via the `theme` prop on `<Toaster>` and avoid overriding the slide-in math.

---

## 5. Stagger Patterns (Use Sparingly)

For hero reveals (login, dashboard first paint), staggered entrance can elevate the moment. Keep it under **600ms total** — beyond that the user thinks the page is loading.

```css
@layer utilities {
  .stagger > * { opacity: 0; transform: translateY(8px); animation: stagger-in var(--duration-slow) var(--ease-out-expo) forwards; }
  .stagger > *:nth-child(1) { animation-delay: 0ms; }
  .stagger > *:nth-child(2) { animation-delay: 60ms; }
  .stagger > *:nth-child(3) { animation-delay: 120ms; }
  .stagger > *:nth-child(4) { animation-delay: 180ms; }
  /* etc — keep total under 360ms cumulative delay */
}

@keyframes stagger-in {
  to { opacity: 1; transform: translateY(0); }
}
```

**Don't stagger** lists with > 6 items. Beyond 6, the user perceives the page as broken because items at the bottom take 400+ms to appear. Use a single fade for long lists.

---

## 6. What NOT to install (and why)

### 6.1 framer-motion

**Reject.** Reasons:
- ~50KB JS gzipped (significant on mobile budget)
- Imperative API conflicts with React Server Components
- View Transitions API + CSS keyframes cover 95% of needs
- Increases test surface (animation timing in tests)
- Vendor lock-in for variants/orchestration

### 6.2 react-spring, motion-one (standalone), gsap

Same family of objections. Use the platform.

### 6.3 Lottie

**Reject for ops UI.** Animations are JSON files that grow large fast, require a runtime, and tend to look like marketing-site decoration. If we ever need a celebration animation, do it in CSS.

### 6.4 What we DO use

- ✅ **Next.js 16 View Transitions API** (page-level)
- ✅ **CSS @keyframes + @starting-style** (component-level)
- ✅ **tw-animate-css** (already installed; provides `.animate-in`, `.animate-out`, `.fade-in`, `.slide-in-from-bottom-*` Tailwind utilities)
- ✅ **Sonner** (toast library, ~3KB, animation built-in)

---

## 7. Performance Budget

When in doubt, measure:

| Target | Tool | Threshold |
|---|---|---|
| Animation frame rate | Chrome DevTools Performance > FPS meter | 60fps minimum, 120fps on Pro phones |
| Layout shifts during animation | DevTools Performance > Layout shift events | Zero. Fix immediately. |
| Compositor thread saturation | DevTools Performance > Compositor thread | < 16ms per frame |
| Animation count active simultaneously | Visual count | ≤ 3 elements animating concurrently in user's viewport |

**Common red flags:**
- Multiple `transition-all` declarations stacking
- Animations that don't run on the compositor (look for "paint" or "layout" markers in DevTools)
- Long-running infinite loops (spinners, shimmers) that stay active when not visible — pause them with `animation-play-state: paused` via `IntersectionObserver` or via `:hover` parent state

---

## 8. PR Review Checklist

When reviewing animation/transition code, ask:

- [ ] Animated property is `transform`, `opacity`, or `filter` — not `width`, `height`, `color`, `font-size`?
- [ ] Duration uses a token (`duration-fast/base/slow`), not a magic number?
- [ ] Easing uses a token (`ease-out-expo` etc), not the browser default?
- [ ] Reduced-motion is respected (handled by global `@media` block, but check for inline `transition: ... !important` overrides)?
- [ ] Hover effects guarded with `@media (hover: hover)` to avoid sticky-hover on touch?
- [ ] No `framer-motion` / `react-spring` / `gsap` import?
- [ ] Stagger total under 600ms?
- [ ] No infinite animation outside loading/skeleton context?
- [ ] If using View Transitions: shared `view-transition-name` is unique per element pair?

If all green: ship.

---

**End of Motion Guidelines**

*Companion: [04_DESIGN_SYSTEM.md](./04_DESIGN_SYSTEM.md) — full design system reference*
