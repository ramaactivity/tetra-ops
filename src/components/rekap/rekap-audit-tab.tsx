import {
	Boxes,
	CheckCircle2,
	Clock,
	ExternalLink,
	FileEdit,
	UserCheck,
	XCircle,
} from "lucide-react";
import { formatDateID } from "@/lib/format";

type Event = {
	id: string;
	title: string;
	at: string; // ISO
	actor?: string | null;
	tone: "default" | "emerald" | "rose" | "sky";
	note?: string | null;
	link?: { href: string; label: string } | null;
	icon: typeof Clock;
};

/**
 * <RekapAuditTab /> — vertical timeline of rekap lifecycle. Shows
 * submission, owner review (approve/reject with notes), and stock
 * commit (link to warehouse batch).
 */
export function RekapAuditTab({
	submittedAt,
	submittedBy,
	reviewedAt,
	reviewedBy,
	isApproved,
	reviewNotes,
	stockCommittedAt,
	stockMovementBatchId,
}: {
	submittedAt: string | null;
	submittedBy: string | null;
	reviewedAt: string | null;
	reviewedBy: string | null;
	isApproved: boolean | null;
	reviewNotes: string | null;
	stockCommittedAt: string | null;
	stockMovementBatchId: string | null;
}) {
	const events: Event[] = [];

	if (submittedAt) {
		events.push({
			id: "submitted",
			title: "Rekap di-submit",
			at: submittedAt,
			actor: submittedBy,
			tone: "default",
			icon: FileEdit,
		});
	}

	if (reviewedAt) {
		events.push({
			id: "reviewed",
			title:
				isApproved === true
					? "Approved oleh owner"
					: isApproved === false
						? "Rejected oleh owner"
						: "Direview oleh owner",
			at: reviewedAt,
			actor: reviewedBy,
			tone: isApproved === true ? "emerald" : isApproved === false ? "rose" : "default",
			note: reviewNotes,
			icon: isApproved === false ? XCircle : isApproved === true ? CheckCircle2 : UserCheck,
		});
	}

	if (stockCommittedAt) {
		events.push({
			id: "stock_committed",
			title: "Stok dikurangi (auto-deduct)",
			at: stockCommittedAt,
			tone: "sky",
			icon: Boxes,
			link: stockMovementBatchId
				? {
						href: `/warehouse?batch=${stockMovementBatchId}`,
						label: `Lihat movements batch ${stockMovementBatchId.slice(0, 8)}`,
					}
				: null,
		});
	}

	if (events.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
				Belum ada aktivitas audit.
			</div>
		);
	}

	return (
		<ol className="relative space-y-4 border-l-2 border-border-default pl-6">
			{events.map((e) => {
				const Icon = e.icon;
				const dotClass = toneClass(e.tone);
				return (
					<li key={e.id} className="relative">
						<span
							className={`absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background ${dotClass}`}
						>
							<Icon className="h-3.5 w-3.5 text-white" aria-hidden />
						</span>
						<div className="space-y-1">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<h4 className="text-sm font-semibold text-foreground">
									{e.title}
								</h4>
								<p className="tabular text-[11px] text-muted-foreground">
									{formatDateID(e.at)} ·{" "}
									{new Date(e.at).toLocaleTimeString("id-ID", {
										hour: "2-digit",
										minute: "2-digit",
									})}
								</p>
							</div>
							{e.actor && (
								<p className="text-fluid-caption text-muted-foreground">
									oleh{" "}
									<span className="font-medium text-foreground">{e.actor}</span>
								</p>
							)}
							{e.note && (
								<div className="mt-1 rounded-md border border-border-default bg-surface-2 p-2 text-fluid-caption text-foreground/80">
									"{e.note}"
								</div>
							)}
							{e.link && (
								<a
									href={e.link.href}
									className="inline-flex items-center gap-1 text-fluid-caption font-medium text-primary hover:underline"
								>
									{e.link.label}
									<ExternalLink className="h-3 w-3" />
								</a>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}

function toneClass(tone: Event["tone"]) {
	switch (tone) {
		case "emerald":
			return "bg-emerald-500";
		case "rose":
			return "bg-rose-500";
		case "sky":
			return "bg-sky-500";
		default:
			return "bg-muted-foreground";
	}
}
