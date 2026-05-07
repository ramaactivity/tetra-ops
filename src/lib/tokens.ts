/**
 * Design tokens — type-safe mirror of values defined in src/app/globals.css.
 * Source of truth is globals.css; this file exposes the names for CVA variants
 * and component prop typing so we can't accidentally reference a token that
 * doesn't exist.
 *
 * When adding/removing a token in globals.css, update this file in lockstep.
 */

// ─── Surface hierarchy ────────────────────────────────────────────────────
// Rule: never stack same-level surfaces. Card-on-card → L2 + L3.
// Popover always L3 with L4 hover row.
export const surfaceLevels = ["1", "2", "3", "4"] as const;
export type SurfaceLevel = (typeof surfaceLevels)[number];

// ─── Border hierarchy ────────────────────────────────────────────────────
export const borderTones = ["subtle", "default", "strong"] as const;
export type BorderTone = (typeof borderTones)[number];

// ─── Motion ───────────────────────────────────────────────────────────────
export const durations = ["fast", "base", "slow"] as const;
export type Duration = (typeof durations)[number];

export const easings = ["out-expo", "out-quart", "spring"] as const;
export type Easing = (typeof easings)[number];

// ─── Branded gradients ───────────────────────────────────────────────────
// Use SPARINGLY: hero, empty-state, login/splash, KPI hero, PDF cover, FAB primary.
// NEVER on cards in lists.
export const gradients = [
  "sunrise",
  "aurora",
  "sunrise-radial",
  "aurora-radial",
  "mesh-warm",
] as const;
export type Gradient = (typeof gradients)[number];

// ─── Branded glow shadows ────────────────────────────────────────────────
export const glowShadows = ["crimson", "aurora", "sunrise"] as const;
export type GlowShadow = (typeof glowShadows)[number];

// ─── Fluid type scale (mobile shrinkage via clamp) ──────────────────────
export const fluidTypeSizes = [
  "fluid-caption",
  "fluid-body",
  "fluid-h3",
  "fluid-h2",
  "fluid-h1",
  "fluid-display",
] as const;
export type FluidTypeSize = (typeof fluidTypeSizes)[number];

// ─── Category color mapping ──────────────────────────────────────────────
// Apply to icon glyph + 1px section header border ONLY. Never card backgrounds.
// Note: violet/cyan/fuchsia rely on Tailwind v4 default palette (not redefined
// in our @theme block, so the framework defaults apply).
export const categoryColors = {
  operations: "violet-300",
  finance: "emerald-300",
  warehouse: "sky-300",
  design: "gold-300",
  reminders: "fuchsia-300",
  reports: "cyan-300",
} as const;
export type CategoryKey = keyof typeof categoryColors;

// ─── Helpers for runtime CSS-var access ──────────────────────────────────
// Useful when applying a gradient via inline style (e.g. dynamic key).
export const cssVar = {
  surface: (level: SurfaceLevel) => `var(--surface-${level})`,
  border: (tone: BorderTone) => `var(--border-${tone})`,
  gradient: (g: Gradient) => `var(--gradient-${g})`,
  duration: (d: Duration) => `var(--duration-${d})`,
  easing: (e: Easing) => `var(--ease-${e})`,
} as const;
