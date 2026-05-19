import { redirect } from "next/navigation";

/**
 * DEPRECATED — superseded by unified /operations/[projectId]/rekap flow.
 *
 * This route was the legacy mega-form combining rekap + approval + settle
 * in one submit. Pass 2 of the rekap refactor (commit a64d695) introduced
 * the unified /rekap page which decomposes the flow into review → fee →
 * settle steps. Keeping this route as a redirect to preserve bookmarks;
 * scheduled for deletion in a future cleanup pass.
 *
 * See AUDIT_UI_UX.md §2.4 + REFINEMENT_ROADMAP.md F2.1.
 */
export default async function TutupBukuPageRedirect({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	redirect(`/operations/${projectId}/rekap`);
}
