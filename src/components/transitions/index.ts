/**
 * Transition primitives — F4.
 *
 * Use these to opt into Next.js 16 + React 19.2 View Transitions:
 *   <PageTransition> wraps a page or layout to enable nav-forward/back +
 *     default crossfade
 *   <SharedElement name="..."> wraps an element so it morphs into the
 *     element of the same name on the next page
 */

export * from "./page-transition";
export * from "./shared-element";
