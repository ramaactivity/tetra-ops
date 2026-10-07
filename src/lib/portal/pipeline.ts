/**
 * Papan pipeline owner/admin (ruang lingkup "Dashboard admin/owner" di
 * docs/RENCANA-BOOKING-PORTAL.md): lead → DP → desain → siap → hari H → selesai.
 * Logika murni; halaman /operations/pipeline yang memuat datanya.
 */

export const PIPELINE_STAGES = [
	"lead",
	"dp",
	"desain",
	"siap",
	"hari_h",
	"selesai",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_TITLE: Record<PipelineStage, string> = {
	lead: "Lead (belum DP)",
	dp: "DP perlu dicek",
	desain: "Desain",
	siap: "Siap",
	hari_h: "Hari H",
	selesai: "Selesai",
};

/** Event resmi → tahap. null = tidak ditampilkan (batal / sudah lama selesai). */
export function eventStage(
	ev: {
		status: string;
		event_date: string;
		design_status: string | null;
		frame_size?: string | null;
	},
	today: string,
): PipelineStage | null {
	if (ev.status === "cancelled" || ev.status === "archived") return null;
	if (
		ev.status === "completed" ||
		ev.status === "awaiting_settlement" ||
		ev.event_date < today
	)
		return "selesai";
	if (ev.status === "in_progress" || ev.event_date === today) return "hari_h";
	if (ev.design_status !== "approved") return "desain";
	return "siap";
}

/** Lead portal hampir kedaluwarsa (≤ 5 hari lagi) → ditandai di papan. */
export function leadExpiringSoon(expiresAt: string, now: Date): boolean {
	return Date.parse(expiresAt) - now.getTime() <= 5 * 86_400_000;
}
