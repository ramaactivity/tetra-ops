import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { RekapApprovalPreview } from "@/components/rekap/approval-preview";
import { RekapAuditTab } from "@/components/rekap/rekap-audit-tab";
import { RekapForm } from "@/components/rekap/rekap-form";
import { RekapHeroCard } from "@/components/rekap/rekap-hero-card";
import { RekapProofGallery } from "@/components/rekap/rekap-proof-gallery";
import { RekapReviewButtons } from "@/components/rekap/review-buttons";
import { RekapSummaryTab } from "@/components/rekap/rekap-summary-tab";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { getRekapContext } from "@/lib/actions/rekap";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

type RekapRow = {
	id: string;
	cetak_total: number;
	media_set_used: number;
	sleeve_used: number;
	flashdisk_used: number;
	pouch_used: number;
	photomagnet_used: number;
	keychain_used: number;
	custom_materials: Record<string, number> | null;
	proof_photo_urls: string[];
	crew_notes: string | null;
	is_approved: boolean | null;
	reviewed_at: string | null;
	review_notes: string | null;
	stock_committed_at: string | null;
	stock_movement_batch_id: string | null;
	created_at: string;
	submitted_by_user: { full_name: string } | null;
	reviewer: { full_name: string } | null;
};

export default async function EventRekapPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;

	const me = await getCurrentUser();
	if (!me) redirect("/login");

	const isOwnerLevel =
		me.profile.role === "super_admin" || me.profile.role === "owner";
	if (!isOwnerLevel) {
		redirect("/login");
	}

	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select("id, project_id, client_name, event_date, venue_name, status")
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	const { data: rekapData } = await supabase
		.from("crew_rekap")
		.select(
			`id, cetak_total, media_set_used, sleeve_used,
			flashdisk_used, pouch_used, photomagnet_used, keychain_used,
			custom_materials,
			proof_photo_urls, crew_notes, is_approved, reviewed_at, review_notes,
			stock_committed_at, stock_movement_batch_id, created_at,
			submitted_by_user:users!crew_rekap_submitted_by_fkey(full_name),
			reviewer:users!crew_rekap_reviewed_by_fkey(full_name)`,
		)
		.eq("event_id", event.id)
		.maybeSingle();

	const context = await getRekapContext(event.id as string);
	if ("error" in context) {
		return (
			<Container size="md">
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">
						Gagal load konteks rekap: {context.error}
					</p>
				</div>
			</Container>
		);
	}

	const rekap = rekapData
		? ({
				...rekapData,
				submitted_by_user: Array.isArray(rekapData.submitted_by_user)
					? rekapData.submitted_by_user[0]
					: rekapData.submitted_by_user,
				reviewer: Array.isArray(rekapData.reviewer)
					? rekapData.reviewer[0]
					: rekapData.reviewer,
			} as RekapRow)
		: null;

	const defaults = rekap
		? {
				cetak_total: String(rekap.cetak_total),
				media_set_used: String(rekap.media_set_used),
				sleeve_used: String(rekap.sleeve_used),
				flashdisk_used: String(rekap.flashdisk_used),
				pouch_used: String(rekap.pouch_used),
				photomagnet_used: String(rekap.photomagnet_used),
				keychain_used: String(rekap.keychain_used),
				custom_materials: JSON.stringify(rekap.custom_materials ?? {}),
				proof_photo_urls: (rekap.proof_photo_urls ?? []).join("\n"),
				crew_notes: rekap.crew_notes ?? "",
			}
		: undefined;

	// Owner can always edit; rekap stays editable until approved
	const canEdit = !rekap || rekap.is_approved !== true;
	const showApprovalUi =
		rekap !== null && rekap.is_approved !== true;
	const showTabsView = rekap !== null;

	return (
		<Container size="md" className="space-y-5 pb-32">
			<Link
				href={`/operations/${projectId}`}
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				{projectId}
			</Link>

			<RekapHeroCard
				clientName={event.client_name}
				projectId={event.project_id}
				eventDate={event.event_date}
				venueName={event.venue_name}
				pkg={context.pkg}
				isApproved={rekap?.is_approved}
				submitted={Boolean(rekap)}
			/>

			{rekap && (
				<p className="text-fluid-caption text-muted-foreground">
					Submitted by{" "}
					<span className="font-medium text-foreground">
						{rekap.submitted_by_user?.full_name ?? "—"}
					</span>
					{rekap.reviewed_at && rekap.reviewer?.full_name && (
						<>
							{" · "}reviewed by{" "}
							<span className="font-medium text-foreground">
								{rekap.reviewer.full_name}
							</span>
						</>
					)}
				</p>
			)}

			{/* === Editable form (for not-yet-approved or absent rekap) === */}
			{canEdit && !rekap && (
				<>
					<div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs leading-relaxed text-foreground/80 dark:border-amber-900 dark:bg-amber-950/20">
						Crew belum submit rekap. Owner bisa input data ini retroaktif
						kalau perlu.
					</div>
					<RekapForm
						eventId={event.id}
						projectId={projectId}
						defaults={defaults}
						mode="create"
						context={context}
					/>
				</>
			)}

			{canEdit && rekap && (
				<details className="rounded-xl border border-border-default bg-surface-2">
					<summary className="cursor-pointer px-5 py-3 text-sm font-semibold tracking-tight hover:bg-muted/30">
						Edit rekap (owner override)
					</summary>
					<div className="border-t border-border-default p-5">
						<RekapForm
							eventId={event.id}
							projectId={projectId}
							defaults={defaults}
							mode={rekap ? "update" : "create"}
							context={context}
						/>
					</div>
				</details>
			)}

			{/* === Tabs view (submitted rekap) === */}
			{showTabsView && rekap && (
				<Tabs defaultValue="ringkasan">
					<TabsList>
						<TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
						<TabsTrigger value="stok">Stok</TabsTrigger>
						<TabsTrigger value="bukti">
							Bukti ({rekap.proof_photo_urls?.length ?? 0})
						</TabsTrigger>
						<TabsTrigger value="audit">Audit</TabsTrigger>
					</TabsList>

					<TabsContent value="ringkasan">
						<RekapSummaryTab rekap={rekap} context={context} />
						{rekap.crew_notes && (
							<div className="mt-4 space-y-1 rounded-lg border border-border-default bg-surface-2 p-4">
								<p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Catatan crew
								</p>
								<p className="text-foreground whitespace-pre-wrap text-sm">
									{rekap.crew_notes}
								</p>
							</div>
						)}
					</TabsContent>

					<TabsContent value="stok">
						<RekapApprovalPreview rekapId={rekap.id} />
					</TabsContent>

					<TabsContent value="bukti">
						<RekapProofGallery urls={rekap.proof_photo_urls ?? []} />
					</TabsContent>

					<TabsContent value="audit">
						<RekapAuditTab
							submittedAt={rekap.created_at}
							submittedBy={rekap.submitted_by_user?.full_name ?? null}
							reviewedAt={rekap.reviewed_at}
							reviewedBy={rekap.reviewer?.full_name ?? null}
							isApproved={rekap.is_approved}
							reviewNotes={rekap.review_notes}
							stockCommittedAt={rekap.stock_committed_at}
							stockMovementBatchId={rekap.stock_movement_batch_id}
						/>
					</TabsContent>
				</Tabs>
			)}

			{/* === Sticky review action bar === */}
			{showApprovalUi && rekap && (
				<div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface-2/95 px-4 py-3 backdrop-blur-md shadow-lg">
					<div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
						<div className="hidden flex-1 sm:block">
							<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
								Decision
							</p>
							<p className="text-fluid-caption text-foreground">
								Approve untuk commit deduksi stok ke warehouse.
							</p>
						</div>
						<div className="flex-1 sm:flex-none">
							<RekapReviewButtons
								rekapId={rekap.id}
								projectId={projectId}
								currentApproved={rekap.is_approved}
								stockCommittedAt={rekap.stock_committed_at ?? null}
							/>
						</div>
					</div>
				</div>
			)}

			{/* When already approved/rejected, show review controls inline (no sticky bar) */}
			{rekap && !showApprovalUi && (
				<div className="rounded-xl border border-border-default bg-surface-2 p-4">
					<RekapReviewButtons
						rekapId={rekap.id}
						projectId={projectId}
						currentApproved={rekap.is_approved}
						stockCommittedAt={rekap.stock_committed_at ?? null}
					/>
				</div>
			)}
		</Container>
	);
}
