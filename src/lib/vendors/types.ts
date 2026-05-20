/**
 * Shared vendor commission types + constants.
 *
 * Lives in a plain module (not "use server") because Next.js forbids
 * non-async exports from server-action files. The server actions in
 * src/lib/actions/vendors.ts re-import these.
 */

export const VENDOR_COMMISSION_MODES = ["commission", "upfront_cut"] as const;
export type VendorCommissionMode = (typeof VENDOR_COMMISSION_MODES)[number];

export const VENDOR_VALUE_TYPES = ["percent", "flat"] as const;
export type VendorCommissionValueType = (typeof VENDOR_VALUE_TYPES)[number];
