/**
 * Barrel export for UI primitives.
 *
 * Prefer importing from `@/components/ui` over individual file paths
 * to keep import lines tidy and the surface of the primitive library
 * single-source.
 *
 * Existing primitives (pre-sesi 5):
 *   avatar, badge, button, card, dialog, dropdown-menu, form, input,
 *   label, radio-group, select, separator, table, tabs, textarea
 *
 * F3a additions (sesi 5):
 *   alert-dialog, confirm-dialog, disclosure, tooltip, sheet, skeleton,
 *   empty-state
 *
 * F3b/c/F4 additions land later.
 */

export * from "./avatar";
export * from "./badge";
export * from "./button";
export * from "./card";
export * from "./dialog";
export * from "./dropdown-menu";
export * from "./form";
export * from "./input";
export * from "./label";
export * from "./select";
export * from "./separator";
export * from "./table";
export * from "./tabs";

// F3a — sesi 5
export * from "./alert-dialog";
export * from "./confirm-dialog";
export * from "./disclosure";
export * from "./empty-state";
export * from "./sheet";
export * from "./skeleton";
export * from "./tooltip";

// NOTE: textarea + radio-group are NOT separate primitives in this repo
// (yet). textarea uses a styled <input> wrapped via Form; radio is via
// Base UI's @base-ui/react/radio used directly where needed. If we want
// them as standalone primitives, add in F3b/c.
