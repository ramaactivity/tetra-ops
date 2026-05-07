import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RekapForm } from "@/components/rekap/rekap-form";
import { RekapReviewButtons } from "@/components/rekap/review-buttons";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID } from "@/lib/format";
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
	proof_photo_urls: string[];
	crew_notes: string | null;
	is_approved: boolean | null;
	reviewed_at: string | null;
	review_notes: string | null;
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
		.select("id, project_id, client_name, event_date, status")
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	const { data: rekapData } = await supabase
		.from("crew_rekap")
		.select(
			`id, cetak_total, media_set_used, sleeve_used,
			flashdisk_used, pouch_used, photomagnet_used, keychain_used,
			proof_photo_urls, crew_notes, is_approved, reviewed_at, review_notes,
			submitted_by_user:users!crew_rekap_submitted_by_fkey(full_name),
			reviewer:users!crew_rekap_reviewed_by_fkey(full_name)`,
		)
		.eq("event_id", event.id)
		.maybeSingle();

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
				proof_photo_urls: (rekap.proof_photo_urls ?? []).join("\n"),
				crew_notes: rekap.crew_notes ?? "",
			}
		: undefined;

	// Owner can always edit; rekap stays editable until approved
	const canEdit = !rekap || rekap.is_approved !== true;

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-2">
				<Link
					href={`/operations/${projectId}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{projectId}
				</Link>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Rekap Crew</h1>
					<p className="text-muted-foreground text-sm">
						{event.client_name} · {formatDateID(event.event_date)}
					</p>
				</div>
			</div>

			{rekap && (
				<section className="border-border bg-card space-y-3 rounded-xl border p-5">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h2 className="text-base font-semibold tracking-tight">Status</h2>
						<p className="text-muted-foreground text-xs">
							Submitted by{" "}
							<span className="text-foreground font-medium">
								{rekap.submitted_by_user?.full_name ?? "—"}
							</span>
							{rekap.reviewed_at && rekap.reviewer?.full_name && (
								<>
									{" · "}
									reviewed by{" "}
									<span className="text-foreground font-medium">
										{rekap.reviewer.full_name}
									</span>
								</>
							)}
						</p>
					</div>

					{rekap.review_notes && (
						<div className="border-border bg-muted/40 rounded-md border p-3">
							<p className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">
								Catatan owner
							</p>
							<p className="text-foreground text-sm">{rekap.review_notes}</p>
						</div>
					)}

					{isOwnerLevel && (
						<RekapReviewButtons
							rekapId={rekap.id}
							projectId={projectId}
							currentApproved={rekap.is_approved}
						/>
					)}
				</section>
			)}

			{rekap && !canEdit && (
				<section className="border-border bg-card space-y-3 rounded-xl border p-5">
					<h2 className="text-base font-semibold tracking-tight">
						Data tersubmit
					</h2>
					<dl className="grid gap-3 sm:grid-cols-2">
						<RekapStat
							label="Total cetak"
							value={rekap.cetak_total}
							unit="pcs"
						/>
						<RekapStat
							label="Media set"
							value={rekap.media_set_used}
							unit="set"
						/>
						<RekapStat label="Sleeve" value={rekap.sleeve_used} unit="pcs" />
						<RekapStat
							label="Flashdisk"
							value={rekap.flashdisk_used}
							unit="pcs"
						/>
						<RekapStat label="Pouch" value={rekap.pouch_used} unit="pcs" />
						<RekapStat
							label="Photomagnet"
							value={rekap.photomagnet_used}
							unit="pcs"
						/>
						<RekapStat
							label="Keychain"
							value={rekap.keychain_used}
							unit="pcs"
						/>
					</dl>
					{rekap.crew_notes && (
						<div className="border-border bg-muted/40 rounded-md border p-3">
							<p className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">
								Catatan crew
							</p>
							<p className="text-foreground whitespace-pre-wrap text-sm">
								{rekap.crew_notes}
							</p>
						</div>
					)}
					{rekap.proof_photo_urls && rekap.proof_photo_urls.length > 0 && (
						<div className="space-y-1.5">
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								Foto bukti
							</p>
							<ul className="space-y-1">
								{rekap.proof_photo_urls.map((url) => (
									<li key={url}>
										<a
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary hover:underline inline-flex items-center gap-1 font-mono text-xs"
										>
											{url}
											<ExternalLink className="h-3 w-3" />
										</a>
									</li>
								))}
							</ul>
						</div>
					)}
				</section>
			)}

			{canEdit && (
				<RekapForm
					eventId={event.id}
					projectId={projectId}
					defaults={defaults}
					mode={rekap ? "update" : "create"}
				/>
			)}
		</div>
	);
}

function RekapStat({
	label,
	value,
	unit,
}: {
	label: string;
	value: number;
	unit: string;
}) {
	return (
		<div className="flex items-baseline justify-between border-b border-border/60 pb-2 text-sm">
			<dt className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className="tabular text-foreground font-medium">
				{value.toLocaleString("id-ID")}{" "}
				<span className="text-muted-foreground/70 text-xs font-normal">
					{unit}
				</span>
			</dd>
		</div>
	);
}
