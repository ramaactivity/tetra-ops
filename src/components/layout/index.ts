/**
 * Layout primitives — F4.
 *
 * Use these instead of ad-hoc `<div className="flex flex-col gap-4">`:
 *   <Stack> for vertical flow
 *   <Cluster> for horizontal flow with wrap
 *   <Container> for page-level horizontal padding + max-width
 *   <SectionHeader> for page-top + section-top headers (REPLACES text-3xl h1)
 */

export * from "./container";
export * from "./stack";
export * from "./cluster";
export * from "./section-header";
