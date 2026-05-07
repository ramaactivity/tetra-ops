"use client";

import { CheckCircle2, ExternalLink, Palette, Sparkles } from "lucide-react";
import { useActionState, useTransition } from "react";
import {
	approveDesign,
	type DesignFormState,
	saveDesignBrief,
} from "@/lib/actions/event-design";

export function DesignCard({
	eventId,
	projectId,
	driveUrl,
	briefAt,
	approvedAt,
	canEdit,
}: {
	eventId: string;
	projectId: string;
	driveUrl: string | null;
	briefAt: string | null;
	approvedAt: string | null;
	canEdit: boolean;
}) {
	const action = saveDesignBrief.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		DesignFormState,
		FormData
	>(action, undefined);

	const [approving, startApprove] = useTransition();

	function onApprove() {
		const ok = window.confirm("Approve design ini? Status event auto-promote.");
		if (!ok) return;
		startApprove(async () => {
			const result = await approveDesign(eventId, projectId);
			if (result.error) window.alert(result.error);
		});
	}

	const initialUrl = state?.values?.design_drive_folder_url ?? driveUrl ?? "";

	return (
		<div className="border-border-default bg-surface-2 md:col-span-2 space-y-4 rounded-xl border p-5">
			<div className="flex items-baseline justify-between gap-2">
				<div className="flex items-center gap-2">
					<Palette className="text-primary h-4 w-4" />
					<h3 className="text-sm font-semibold tracking-tight">Design</h3>
				</div>
				{approvedAt ? (
					<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 text-xs font-medium">
						<CheckCircle2 className="h-3.5 w-3.5" />
						Approved {formatRel(approvedAt)}
					</span>
				) : driveUrl ? (
					<span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 text-xs font-medium">
						<Sparkles className="h-3.5 w-3.5" />
						Brief uploaded · belum approved
					</span>
				) : (
					<span className="text-muted-foreground text-xs italic">
						Belum ada design
					</span>
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
					Brief dikirim {formatRel(briefAt)}
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
							{pending ? "…" : driveUrl ? "Update" : "Save brief"}
						</button>
					</div>
					<p className="text-muted-foreground text-xs">
						Tempel link folder Drive berisi mockup / referensi. Status event
						otomatis pindah ke Design Brief.
					</p>
				</form>
			)}

			{canEdit && driveUrl && !approvedAt && (
				<button
					type="button"
					onClick={onApprove}
					disabled={approving}
					className="bg-emerald-600 text-white hover:bg-emerald-700 inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					<CheckCircle2 className="h-4 w-4" />
					{approving ? "Memproses…" : "Approve design"}
				</button>
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
