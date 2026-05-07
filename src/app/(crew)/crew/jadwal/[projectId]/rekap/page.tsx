import { CheckCircle2, ChevronLeft, Clock, Image, Info } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RekapForm } from "@/components/rekap/rekap-form";
import { Badge } from "@/components/ui/badge";
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
};

export default async function CrewRekapPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const me = await getCurrentUser();
	if (!me) redirect("/login");

	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select(
			`id, project_id, client_name, event_date, venue_name, status,
			crew_assignments:crew_assignments!inner(
				role_in_event,
				user:users!crew_assignments_user_id_fkey(id)
			)`,
		)
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	// Security: must be the assigned crew for this event
	const crewAssignments = (event.crew_assignments ?? []) as Array<{
		role_in_event: string;
		user:
			| { id: string }
			| Array<{ id: string }>
			| null;
	}>;
	const isAssigned = crewAssignments.some((a) => {
		const u = Array.isArray(a.user) ? a.user[0] : a.user;
		return u?.id === me.profile.id;
	});
	if (!isAssigned) notFound();

	// Existing rekap (if any)
	const { data: rekapData } = await supabase
		.from("crew_rekap")
		.select(
			`id, cetak_total, media_set_used, sleeve_used,
			flashdisk_used, pouch_used, photomagnet_used, keychain_used,
			proof_photo_urls, crew_notes, is_approved, reviewed_at, review_notes`,
		)
		.eq("event_id", event.id)
		.maybeSingle();

	const rekap = rekapData as RekapRow | null;
	const mode: "create" | "update" = rekap ? "update" : "create";

	const todayISO = new Date().toISOString().slice(0, 10);
	const isPastEvent = event.event_date <= todayISO;

	const defaults = rekap
		? {
				cetak_total: String(rekap.cetak_total),
				media_set_used: String(rekap.media_set_used),
				sleeve_used: String(rekap.sleeve_used),
				flashdisk_used: String(rekap.flashdisk_used),
				pouch_used: String(rekap.pouch_used),
				photomagnet_used: String(rekap.photomagnet_used),
				keychain_used: String(rekap.keychain_used),
				proof_photo_urls: rekap.proof_photo_urls.join("\n"),
				crew_notes: rekap.crew_notes ?? "",
			}
		: undefined;

	return (
		<div className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
			<Link
				href={`/crew/jadwal/${projectId}`}
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				{event.client_name}
			</Link>

			<header className="space-y-2">
				<h1 className="text-2xl font-semibold leading-tight tracking-tight">
					Rekap Event
				</h1>
				<p className="text-muted-foreground text-sm">
					{event.client_name} · {formatDateID(event.event_date)} ·{" "}
					{event.venue_name}
				</p>

				<div className="flex flex-wrap items-center gap-2">
					{rekap?.is_approved === true && (
						<Badge
							variant="outline"
							className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
						>
							<CheckCircle2 className="mr-1 h-3 w-3" />
							Approved owner
						</Badge>
					)}
					{rekap && rekap.is_approved === null && (
						<Badge
							variant="outline"
							className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
						>
							<Clock className="mr-1 h-3 w-3" />
							Menunggu review owner
						</Badge>
					)}
					{rekap?.is_approved === false && (
						<Badge
							variant="outline"
							className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
						>
							Need revision
						</Badge>
					)}
				</div>
			</header>

			{!isPastEvent && !rekap && (
				<div className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 flex items-start gap-2 rounded-lg border p-3">
					<Info className="text-amber-700 dark:text-amber-400 mt-0.5 h-4 w-4 shrink-0" />
					<p className="text-foreground/80 text-xs leading-relaxed">
						Event belum lewat. Lo bisa submit rekap setelah event selesai.
						Form ini boleh kepake duluan kalau memang event-nya udah beres.
					</p>
				</div>
			)}

			{rekap?.is_approved === false && rekap.review_notes && (
				<div className="border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20 space-y-1 rounded-lg border p-3">
					<p className="text-rose-900 dark:text-rose-200 text-[11px] font-semibold uppercase tracking-wider">
						Owner minta revisi
					</p>
					<p className="text-foreground/80 text-xs leading-relaxed">
						{rekap.review_notes}
					</p>
				</div>
			)}

			{rekap?.is_approved === true ? (
				<div className="border-border bg-card space-y-3 rounded-xl border p-4">
					<div className="flex items-center gap-2">
						<CheckCircle2 className="text-emerald-600 dark:text-emerald-400 h-4 w-4" />
						<p className="text-foreground text-sm font-medium">
							Rekap sudah di-approve
						</p>
					</div>
					<dl className="grid grid-cols-2 gap-3 text-xs">
						<DetailRow label="Cetak total" value={rekap.cetak_total} />
						<DetailRow label="Media set" value={rekap.media_set_used} />
						<DetailRow label="Sleeve" value={rekap.sleeve_used} />
						<DetailRow label="Flashdisk" value={rekap.flashdisk_used} />
						<DetailRow label="Pouch" value={rekap.pouch_used} />
						<DetailRow label="Photomagnet" value={rekap.photomagnet_used} />
						<DetailRow label="Keychain" value={rekap.keychain_used} />
					</dl>
					{rekap.proof_photo_urls.length > 0 && (
						<div className="space-y-1.5">
							<p className="text-muted-foreground text-[11px] uppercase tracking-wider">
								<Image className="mr-1 inline h-3 w-3" />
								Foto bukti ({rekap.proof_photo_urls.length})
							</p>
							<ul className="space-y-1">
								{rekap.proof_photo_urls.map((url, i) => (
									<li key={`${url}-${i}`}>
										<a
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary block truncate text-xs hover:underline"
										>
											{url}
										</a>
									</li>
								))}
							</ul>
						</div>
					)}
					{rekap.crew_notes && (
						<div className="space-y-0.5">
							<p className="text-muted-foreground text-[11px] uppercase tracking-wider">
								Catatan
							</p>
							<p className="text-foreground/80 whitespace-pre-line text-xs leading-relaxed">
								{rekap.crew_notes}
							</p>
						</div>
					)}
					<p className="text-muted-foreground text-[10px] italic">
						Sudah approved — gak bisa di-edit lagi.
					</p>
				</div>
			) : (
				<div className="border-border bg-card rounded-xl border p-4">
					<RekapForm
						eventId={event.id}
						projectId={event.project_id}
						defaults={defaults}
						mode={mode}
					/>
				</div>
			)}
		</div>
	);
}

function DetailRow({ label, value }: { label: string; value: number }) {
	return (
		<div className="space-y-0.5">
			<dt className="text-muted-foreground text-[10px] uppercase tracking-wider">
				{label}
			</dt>
			<dd className="text-foreground tabular text-sm font-semibold">
				{value.toLocaleString("id-ID")}
			</dd>
		</div>
	);
}
