"use client";

import { ArrowRight, Download, ExternalLink, Palette } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { DesignStatusSelect } from "@/components/event-design/design-status-select";
import {
	addDesignLink,
	type DesignFormState,
} from "@/lib/actions/event-design";
import {
	DESIGN_STATUS_LABELS,
	DESIGN_STATUS_TONE,
	type DesignStatus,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type DesignFrame = {
	id: string;
	label: string;
	url: string;
	drive_file_id: string | null;
};

export function DesignCard({
	eventId,
	projectId,
	frames,
	briefAt,
	designStatus,
	canEdit,
}: {
	eventId: string;
	projectId: string;
	frames: DesignFrame[];
	briefAt: string | null;
	designStatus: DesignStatus;
	canEdit: boolean;
}) {
	const action = addDesignLink.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		DesignFormState,
		FormData
	>(action, undefined);

	const tone = DESIGN_STATUS_TONE[designStatus] ?? DESIGN_STATUS_TONE.belum;

	return (
		<div className="border-border-default bg-surface-2 md:col-span-2 space-y-4 rounded-xl border p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<Palette className="text-primary h-4 w-4" />
					<h3 className="text-sm font-semibold tracking-tight">Design</h3>
					<span
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
							tone.badge,
						)}
					>
						<span
							className={cn("size-1.5 rounded-full", tone.dot)}
							aria-hidden
						/>
						{DESIGN_STATUS_LABELS[designStatus]}
					</span>
				</div>
				{canEdit && (
					<div className="flex items-center gap-2">
						<span className="text-[11px] font-medium text-muted-foreground">
							Status design
						</span>
						<DesignStatusSelect
							eventId={eventId}
							projectId={projectId}
							value={designStatus}
						/>
					</div>
				)}
			</div>

			{state?.error && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">{state.error}</p>
				</div>
			)}

			{/* Design frames — SAME data as the Asset & Design page (event_assets) */}
			{frames.length > 0 ? (
				<ul className="space-y-1.5">
					{frames.map((f) => (
						<li
							key={f.id}
							className="border-border-default bg-background flex items-center justify-between gap-2 rounded-md border px-3 py-2"
						>
							<span className="truncate text-sm">{f.label}</span>
							<div className="flex shrink-0 items-center gap-3">
								{f.drive_file_id && (
									<a
										href={`https://drive.google.com/uc?export=download&id=${f.drive_file_id}`}
										className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
									>
										<Download className="h-3.5 w-3.5" />
										Download
									</a>
								)}
								<a
									href={f.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
								>
									Buka
									<ExternalLink className="h-3.5 w-3.5" />
								</a>
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground text-xs italic">
					Belum ada design. Tempel link folder/design di bawah, atau kelola di
					halaman Asset &amp; Design.
				</p>
			)}

			{briefAt && (
				<p className="text-muted-foreground text-xs">
					Design pertama dikirim {formatRel(briefAt)}
				</p>
			)}

			{canEdit && (
				<form action={formAction} className="space-y-2">
					<label htmlFor="design-link-url" className="text-sm font-medium">
						Tambah link design
					</label>
					<div className="flex gap-2">
						<input
							id="design-link-url"
							name="url"
							type="url"
							key={state ? "reset" : "init"}
							placeholder="https://drive.google.com/drive/folders/..."
							className="border-border-default bg-background text-foreground focus-visible:ring-ring tabular h-10 flex-1 rounded-md border px-3 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none"
						/>
						<button
							type="submit"
							disabled={pending}
							className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-10 shrink-0 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
						>
							{pending ? "…" : "Tambah link"}
						</button>
					</div>
				</form>
			)}

			<Link
				href={`/design/${projectId}`}
				className="border-border-default bg-background hover:bg-muted text-foreground flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
			>
				<span className="flex items-center gap-2">
					<Palette className="text-primary h-4 w-4" />
					Kelola di Asset &amp; Design
					<span className="text-muted-foreground text-xs font-normal">
						(frame, footage, softfile)
					</span>
				</span>
				<ArrowRight className="h-4 w-4 shrink-0" />
			</Link>
		</div>
	);
}

function formatRel(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}
