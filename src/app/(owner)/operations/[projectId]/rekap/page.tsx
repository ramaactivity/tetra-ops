import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { AddonSplitForm } from "@/components/rekap/addon-split-form";
import { RekapApprovalPreview } from "@/components/rekap/approval-preview";
import { CrewFeeForm } from "@/components/rekap/crew-fee-form";
import type { CrewAssignmentRow } from "@/components/rekap/crew-fee-form";
import { ProfitPreviewCard } from "@/components/rekap/profit-preview-card";
import { RekapAuditTab } from "@/components/rekap/rekap-audit-tab";
import { RekapForm } from "@/components/rekap/rekap-form";
import { RekapHeroCard } from "@/components/rekap/rekap-hero-card";
import { RekapProofGallery } from "@/components/rekap/rekap-proof-gallery";
import { RekapReviewButtons } from "@/components/rekap/review-buttons";
import { RekapSummaryTab } from "@/components/rekap/rekap-summary-tab";
import { SettleButton } from "@/components/rekap/settle-button";
import { SettledBanner } from "@/components/rekap/settled-banner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { getRekapContext } from "@/lib/actions/rekap";
import { getProfitPreview } from "@/lib/actions/profit-preview";
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
	photomagnet_paid: number;
	photomagnet_bonus: number;
	keychain_paid: number;
	keychain_bonus: number;
	custom_materials: Record<string, number> | null;
	proof_photo_urls: string[];
	crew_notes: string | null;
	is_approved: boolean | null;
	reviewed_at: string | null;
	review_notes: string | null;
	stock_committed_at: string | null;
	stock_movement_batch_id: string | null;
	created_at: string;
	status: "draft" | "submitted" | "reviewed" | "rejected" | "settled";
	locked: boolean | null;
	transport_method: "online" | "rental" | "none" | null;
	transport_cost: number | string | null;
	transport_proof_berangkat_url: string | null;
	transport_proof_pulang_url: string | null;
	bensin_cost: number | string | null;
	toll_cost: number | string | null;
	parking_cost: number | string | null;
	konsumsi_cost: number | string | null;
	lainnya_items: Array<{ note: string; amount: number }> | null;
	submitted_by_user: { full_name: string } | null;
	reviewer: { full_name: string } | null;
};

type AssignmentJoin = {
	id: string;
	role_in_event: "lead" | "asisten" | "crew_c";
	fee_amount: number | null;
	bonus_amount: number | null;
	reimbursement_amount: number | null;
	payment_notes: string | null;
	payment_proof_url: string | null;
	is_paid: boolean | null;
	user: { full_name: string } | { full_name: string }[] | null;
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
	if (!isOwnerLevel) redirect("/login");
	const isSuperAdmin = me.profile.role === "super_admin";

	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select(
			"id, project_id, client_name, event_date, venue_name, status, grand_total",
		)
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	const [{ data: rekapData }, { data: assignments }, { data: settlement }] =
		await Promise.all([
			supabase
				.from("crew_rekap")
				.select(
					`id, cetak_total, media_set_used, sleeve_used,
					flashdisk_used, pouch_used, photomagnet_used, keychain_used,
					photomagnet_paid, photomagnet_bonus, keychain_paid, keychain_bonus,
					custom_materials, status, locked,
					proof_photo_urls, crew_notes, is_approved, reviewed_at, review_notes,
					stock_committed_at, stock_movement_batch_id, created_at,
					transport_method, transport_cost,
					transport_proof_berangkat_url, transport_proof_pulang_url,
					bensin_cost, toll_cost, parking_cost, konsumsi_cost, lainnya_items,
					submitted_by_user:users!crew_rekap_submitted_by_fkey(full_name),
					reviewer:users!crew_rekap_reviewed_by_fkey(full_name)`,
				)
				.eq("event_id", event.id)
				.maybeSingle(),
			supabase
				.from("crew_assignments")
				.select(
					`id, role_in_event, fee_amount, bonus_amount, reimbursement_amount,
					payment_notes, payment_proof_url, is_paid,
					user:users!crew_assignments_user_id_fkey(full_name)`,
				)
				.eq("event_id", event.id),
			supabase
				.from("event_settlements")
				.select(
					`id, journal_entry_id, closed_at, is_reopened, reopen_reason,
					net_profit, closed_by_user:users!event_settlements_closed_by_fkey(full_name)`,
				)
				.eq("event_id", event.id)
				.maybeSingle(),
		]);

	const context = await getRekapContext(event.id as string);
	if ("error" in context) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
					<p className="text-sm font-medium text-foreground">
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

	const isSettled = event.status === "completed";
	const recapApproved = rekap?.is_approved === true || rekap?.status === "reviewed" || rekap?.status === "settled";
	const recapLocked = rekap?.locked === true || isSettled;

	const settlementClosedBy = settlement?.closed_by_user
		? Array.isArray(settlement.closed_by_user)
			? settlement.closed_by_user[0]?.full_name
			: (settlement.closed_by_user as { full_name: string }).full_name
		: null;

	// Profit preview only fetched if rekap exists (avoid empty RPC calls)
	const profitPreviewResult = rekap?.id
		? await getProfitPreview(event.id as string)
		: null;
	const profitPreview =
		profitPreviewResult && profitPreviewResult.ok ? profitPreviewResult.data : null;

	// Crew fee rows — normalize joined user
	const crewFeeRows: CrewAssignmentRow[] = (assignments ?? []).map((a) => {
		const aj = a as unknown as AssignmentJoin;
		const u = Array.isArray(aj.user) ? aj.user[0] : aj.user;
		return {
			assignment_id: aj.id,
			user_full_name: u?.full_name ?? "—",
			role_in_event: aj.role_in_event,
			fee_amount: Number(aj.fee_amount ?? 0),
			bonus_amount: Number(aj.bonus_amount ?? 0),
			reimbursement_amount: Number(aj.reimbursement_amount ?? 0),
			payment_notes: aj.payment_notes ?? null,
			payment_proof_url: aj.payment_proof_url ?? null,
			is_paid: Boolean(aj.is_paid),
		};
	});

	const allCrewHaveFee = crewFeeRows.length > 0 && crewFeeRows.every((r) => r.fee_amount > 0);
	const proofCount = rekap?.proof_photo_urls?.length ?? 0;

	// Field expense breakdown — ditampilkan sebagai INFO di Fee crew form.
	// Owner attribute manual ke crew yang sebenarnya bayar (mis. transport
	// online dibayar Lead, konsumsi dibayar Asisten). Tidak auto-divide
	// per crew karena 1 trip transport biasanya bersamaan, bukan terbagi.
	let fieldExpenseBreakdown:
		| {
				total: number;
				items: Array<{ label: string; amount: number }>;
		  }
		| undefined;
	if (rekap) {
		const items: Array<{ label: string; amount: number }> = [];
		const tc = Number(rekap.transport_cost ?? 0);
		const bc = Number(rekap.bensin_cost ?? 0);
		const tlc = Number(rekap.toll_cost ?? 0);
		const pkc = Number(rekap.parking_cost ?? 0);
		const kc = Number(rekap.konsumsi_cost ?? 0);
		if (tc > 0) items.push({ label: "Transport", amount: tc });
		if (bc > 0) items.push({ label: "Bensin", amount: bc });
		if (tlc > 0) items.push({ label: "Toll", amount: tlc });
		if (pkc > 0) items.push({ label: "Parkir", amount: pkc });
		if (kc > 0) items.push({ label: "Konsumsi", amount: kc });
		const total = items.reduce((s, x) => s + x.amount, 0);
		if (total > 0) fieldExpenseBreakdown = { total, items };
	}

	// Settle gating
	const settleDisabledReason = !rekap
		? "Rekap belum di-submit. Input data rekap dulu."
		: !recapApproved
			? "Approve rekap dulu sebelum settle."
			: proofCount < 1
				? "Minimal 1 foto bukti diperlukan."
				: !allCrewHaveFee
					? "Set fee crew dulu (semua harus > 0)."
					: undefined;

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
				transport_method: (rekap.transport_method ?? "none") as
					| "online"
					| "rental"
					| "none",
				transport_cost: String(rekap.transport_cost ?? 0),
				transport_proof_berangkat_url:
					rekap.transport_proof_berangkat_url ?? "",
				transport_proof_pulang_url: rekap.transport_proof_pulang_url ?? "",
				bensin_cost: String(rekap.bensin_cost ?? 0),
				toll_cost: String(rekap.toll_cost ?? 0),
				parking_cost: String(rekap.parking_cost ?? 0),
				konsumsi_cost: String(rekap.konsumsi_cost ?? 0),
				lainnya_items: JSON.stringify(rekap.lainnya_items ?? []),
			}
		: undefined;

	return (
		<Container size="xl" className="space-y-5 pb-32">
			<Link
				href={`/operations/${projectId}`}
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				{projectId}
			</Link>

			{isSettled && settlement && (
				<SettledBanner
					eventId={event.id as string}
					projectId={projectId}
					settledAt={settlement.closed_at}
					closedByName={settlementClosedBy}
					netProfit={Number(settlement.net_profit ?? 0)}
					isReopened={Boolean(settlement.is_reopened)}
					journalEntryId={settlement.journal_entry_id ?? null}
					isSuperAdmin={isSuperAdmin}
				/>
			)}

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

			{/* === No rekap yet: owner can input manually === */}
			{!rekap && (
				<>
					<div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs leading-relaxed text-foreground/80 dark:border-amber-900 dark:bg-amber-950/20">
						Crew belum submit rekap. Owner bisa input data ini retroaktif kalau perlu.
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

			{/* === Edit recap (owner override) — only if not locked === */}
			{rekap && !recapLocked && (
				<details className="rounded-lg border border-border-default bg-surface-2">
					<summary className="cursor-pointer px-5 py-3 text-sm font-semibold tracking-tight hover:bg-muted/30">
						Edit rekap (owner override)
					</summary>
					<div className="border-t border-border-default p-5">
						<RekapForm
							eventId={event.id}
							projectId={projectId}
							defaults={defaults}
							mode="update"
							context={context}
						/>
					</div>
				</details>
			)}

			{/* === Tabs view (display) === */}
			{rekap && (
				<Tabs defaultValue="ringkasan">
					<TabsList>
						<TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
						<TabsTrigger value="stok">Stok</TabsTrigger>
						<TabsTrigger value="bukti">Bukti ({proofCount})</TabsTrigger>
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

			{/* === Approve/Reject section (review stage, not settled yet) === */}
			{rekap && !recapApproved && !isSettled && (
				<div className="rounded-lg border border-border-default bg-surface-2 p-4">
					<header className="mb-3">
						<h2 className="text-fluid-h3 font-semibold tracking-tight">
							Review rekap
						</h2>
						<p className="text-xs text-muted-foreground">
							Approve untuk commit deduksi stok ke warehouse. Bisa reject untuk
							revisi.
						</p>
					</header>
					<RekapReviewButtons
						rekapId={rekap.id}
						projectId={projectId}
						currentApproved={rekap.is_approved}
						stockCommittedAt={rekap.stock_committed_at ?? null}
					/>
				</div>
			)}

			{/* === Pre-settle workflow: crew fees + addon split + profit preview + settle button === */}
			{rekap && recapApproved && !isSettled && (
				<>
					<CrewFeeForm
						eventId={event.id as string}
						projectId={projectId}
						rows={crewFeeRows}
						fieldExpenseBreakdown={fieldExpenseBreakdown}
						readOnly={recapLocked}
					/>

					<AddonSplitForm
						recapId={rekap.id}
						eventId={event.id as string}
						projectId={projectId}
						photomagnetTotal={rekap.photomagnet_used}
						keychainTotal={rekap.keychain_used}
						photomagnetPaid={rekap.photomagnet_paid}
						photomagnetBonus={rekap.photomagnet_bonus}
						keychainPaid={rekap.keychain_paid}
						keychainBonus={rekap.keychain_bonus}
						readOnly={recapLocked}
					/>

					{profitPreview && <ProfitPreviewCard preview={profitPreview} />}

					<div className="rounded-lg border border-border-default bg-surface-2 p-5">
						<header className="mb-3">
							<h2 className="text-fluid-h3 font-semibold tracking-tight">
								Settle event
							</h2>
							<p className="text-xs text-muted-foreground">
								Tutup buku event ini dan commit ke ledger. Aksi destructive —
								hanya bisa di-undo via Reopen Settlement.
							</p>
						</header>
						{profitPreview ? (
							<SettleButton
								eventId={event.id as string}
								projectId={projectId}
								recapId={rekap.id}
								revenueNet={profitPreview.revenue_net}
								hppTotal={profitPreview.hpp.total}
								opexTotal={profitPreview.opex.total}
								netProfit={profitPreview.net_profit}
								sinkingEstimate={profitPreview.sinking_estimate}
								ownerPoolEstimate={profitPreview.owner_pool_estimate}
								disabled={Boolean(settleDisabledReason)}
								disabledReason={settleDisabledReason}
							/>
						) : (
							<p className="text-xs text-muted-foreground">
								Profit preview tidak tersedia (cek error log).
							</p>
						)}
					</div>
				</>
			)}

			{/* === Post-settle: show profit preview + fee + addon split read-only === */}
			{rekap && isSettled && (
				<>
					<CrewFeeForm
						eventId={event.id as string}
						projectId={projectId}
						rows={crewFeeRows}
						readOnly
					/>

					<AddonSplitForm
						recapId={rekap.id}
						eventId={event.id as string}
						projectId={projectId}
						photomagnetTotal={rekap.photomagnet_used}
						keychainTotal={rekap.keychain_used}
						photomagnetPaid={rekap.photomagnet_paid}
						photomagnetBonus={rekap.photomagnet_bonus}
						keychainPaid={rekap.keychain_paid}
						keychainBonus={rekap.keychain_bonus}
						readOnly
					/>

					{profitPreview && <ProfitPreviewCard preview={profitPreview} />}
				</>
			)}
		</Container>
	);
}
