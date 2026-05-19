import { redirect } from "next/navigation";

/**
 * DEPRECATED — superseded by unified /operations/[projectId]/rekap flow.
 *
 * This route was the legacy settlement form (Phase A→B). Pass 2 of the
 * rekap refactor (commit a64d695) introduced the unified /rekap page
 * which handles review + settlement in one place. Keeping this route
 * as a redirect to preserve bookmarks; scheduled for deletion in a
 * future cleanup pass.
 *
 * See AUDIT_UI_UX.md §2.4 + REFINEMENT_ROADMAP.md F2.1.
 */
export default async function SettlePageRedirect({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	redirect(`/operations/${projectId}/rekap`);
}
