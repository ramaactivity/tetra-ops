/**
 * Plain constants for rekap assemblies — NOT "use server" so it can export
 * non-async values (the server-action file may only export async functions).
 */

/** Rekap fields that support component assemblies (1 unit → N inventory SKUs). */
export const ASSEMBLY_FIELDS = [
	"flashdisk_used",
	"pouch_used",
	"photomagnet_used",
	"keychain_used",
] as const;

export type AssemblyField = (typeof ASSEMBLY_FIELDS)[number];
