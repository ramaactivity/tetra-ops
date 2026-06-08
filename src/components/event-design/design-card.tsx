"use client";

import { ExternalLink, Palette } from "lucide-react";
import { useActionState } from "react";
import { DesignStatusSelect } from "@/components/event-design/design-status-select";
import {
	type DesignFormState,
	saveDesignBrief,
} from "@/lib/actions/event-design";
import {
	DESIGN_STATUS_LABELS,
	DESIGN_STATUS_TONE,
	type DesignStatus,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function DesignCard({
	eventId,
	projectId,
	driveUrl,
	briefAt,
	designStatus,
	canEdit,
}: {
	eventId: string;
	projectId: string;
	driveUrl: string | null;
	briefAt: string | null;
	designStatus: DesignStatus;
	canEdit: boolean;
}) {
	const action = saveDesignBrief.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		DesignFormState,
		FormData
	>(action, undefined);

	const initialUrl = state?.values?.design_drive_folder_url ?? driveUrl ?? "";
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

			{driveUrl && (
				<a
					href={driveUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="border-border-default bg-background hover:bg-muted text-primary flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
				>
					<span className="truncate font-mono">{driveUrl}</span>
					<ExternalLink className="h-3.5 w-3.5 shrink-0" />
				</a>
			)}

			{briefAt && (
				<p className="text-muted-foreground text-xs">
					Design dikirim {formatRel(briefAt)}
				</p>
			)}

			{canEdit && (
				<form action={formAction} className="space-y-2">
					<label
						htmlFor="design_drive_folder_url"
						className="text-sm font-medium"
					>
						Drive Folder URL
					</label>
					<div className="flex gap-2">
						<input
							id="design_drive_folder_url"
							name="design_drive_folder_url"
							type="url"
							defaultValue={initialUrl}
							placeholder="https://drive.google.com/drive/folders/..."
							className="border-border-default bg-background text-foreground focus-visible:ring-ring tabular h-10 flex-1 rounded-md border px-3 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none"
						/>
						<button
							type="submit"
							disabled={pending}
							className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 shrink-0 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
						>
							{pending ? "…" : driveUrl ? "Update" : "Simpan link"}
						</button>
					</div>
					<p className="text-muted-foreground text-xs">
						Tempel link folder Drive berisi design/mockup. Status design diatur
						lewat tombol di atas (atau di halaman Asset &amp; Design).
					</p>
				</form>
			)}
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
