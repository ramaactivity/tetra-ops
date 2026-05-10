/**
 * Constants + types for /design Visual Asset Hub.
 *
 * Lives outside `src/lib/actions/event-assets.ts` because that file is
 * `"use server"` — server-action modules can only export async
 * functions (Next.js rule). Constants/types must be in a plain module.
 */

export const ASSET_TYPES = [
	"design_frame",
	"footage_crew",
	"softfile_photo",
	"softfile_video",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
	design_frame: "Design Frame",
	footage_crew: "Footage Crew",
	softfile_photo: "Softfile Photo",
	softfile_video: "Softfile Video",
};
