"use client";

import { AlertTriangle } from "lucide-react";
import { useActionState, useState } from "react";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import {
	type IncidentFormState,
	reportEquipmentIncident,
} from "@/lib/actions/event-equipment";

export function IncidentDialog({
	itemId,
	eventId,
	projectId,
	itemName,
}: {
	itemId: string;
	eventId: string;
	projectId: string;
	itemName: string;
}) {
	const action = reportEquipmentIncident.bind(null, itemId, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		IncidentFormState,
		FormData
	>(action, undefined);
	const [open, setOpen] = useState(false);

	const get = (key: string, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";

	const [severity, setSeverity] = useState<string>(get("severity", "minor"));
	const [markCondition, setMarkCondition] = useState<string>(
		get("mark_condition", ""),
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className="text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 inline-flex h-8 items-center gap-1 rounded-md border border-amber-500/30 px-2 text-xs font-medium transition-colors"
				title="Report incident"
			>
				<AlertTriangle className="h-3.5 w-3.5" />
				Incident
			</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Report Incident</DialogTitle>
					<DialogDescription>
						{itemName} — laporkan kalau ada damage / hilang / abnormal selama
						event.
					</DialogDescription>
				</DialogHeader>

				<form
					action={(fd) => {
						formAction(fd);
						// auto-close on success (state remains undefined when no error)
						setTimeout(() => {
							if (!pending) setOpen(false);
						}, 100);
					}}
					className="space-y-4"
				>
					{state?.error && (
						<div className="border-destructive bg-destructive/10 rounded-md border p-3">
							<p className="text-destructive text-sm font-medium">
								{state.error}
							</p>
						</div>
					)}

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<label htmlFor="severity" className="text-sm font-medium">
								Severity
								<span className="text-primary ml-0.5">*</span>
							</label>
							<NativeSelect
								value={severity}
								onValueChange={setSeverity}
								options={[
									{
										value: "minor",
										label: "Minor — masih bisa dipakai",
									},
									{ value: "major", label: "Major — perlu service" },
									{
										value: "total",
										label: "Total — rusak/hilang permanen",
									},
								]}
								triggerClassName="w-full"
							/>
							<input type="hidden" name="severity" value={severity} required />
						</div>

						<div className="space-y-1.5">
							<label htmlFor="mark_condition" className="text-sm font-medium">
								Update Kondisi Item
							</label>
							<NativeSelect
								value={markCondition}
								onValueChange={setMarkCondition}
								placeholder="Tidak diubah"
								options={[
									{ value: "", label: "Tidak diubah" },
									{
										value: "service",
										label: "Service (perlu perbaikan)",
									},
									{ value: "damaged", label: "Damaged" },
									{ value: "lost", label: "Lost" },
								]}
								triggerClassName="w-full"
							/>
							<input
								type="hidden"
								name="mark_condition"
								value={markCondition}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label htmlFor="description" className="text-sm font-medium">
							Deskripsi singkat
							<span className="text-primary ml-0.5">*</span>
						</label>
						<input
							id="description"
							name="description"
							type="text"
							required
							maxLength={500}
							defaultValue={get("description")}
							placeholder="Lensa kamera retak"
							className={inputClass}
						/>
					</div>

					<div className="space-y-1.5">
						<label htmlFor="what_happened" className="text-sm font-medium">
							Apa yang terjadi
						</label>
						<RichTextarea
							id="what_happened"
							name="what_happened"
							rows={3}
							maxLength={500}
							defaultValue={get("what_happened")}
							toolbar={false}
							placeholder="Kronologi singkat — kapan, gimana"
						/>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<label
								htmlFor="location_of_incident"
								className="text-sm font-medium"
							>
								Lokasi kejadian
							</label>
							<input
								id="location_of_incident"
								name="location_of_incident"
								type="text"
								maxLength={200}
								defaultValue={get("location_of_incident")}
								placeholder="Stage area, ballroom, dst"
								className={inputClass}
							/>
						</div>

						<div className="space-y-1.5">
							<label htmlFor="witnesses" className="text-sm font-medium">
								Saksi
							</label>
							<input
								id="witnesses"
								name="witnesses"
								type="text"
								maxLength={300}
								defaultValue={get("witnesses")}
								placeholder="Indra, Bima"
								className={inputClass}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label htmlFor="photo_urls" className="text-sm font-medium">
							URL Foto
						</label>
						<RichTextarea
							id="photo_urls"
							name="photo_urls"
							rows={2}
							defaultValue={get("photo_urls")}
							placeholder="https://drive.google.com/...&#10;https://drive.google.com/..."
							toolbar={false}
							className="font-mono"
						/>
						<p className="text-muted-foreground text-xs">
							Pisah dengan baris baru atau koma. Upload manual ke Drive untuk
							sekarang.
						</p>
					</div>

					<DialogFooter>
						<DialogClose className="border-border-default bg-surface-2 hover:bg-muted inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium">
							Batal
						</DialogClose>
						<button
							type="submit"
							disabled={pending}
							className="bg-amber-600 text-white hover:bg-amber-700 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
						>
							{pending ? "Menyimpan…" : "Submit incident"}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-base md:text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";
const selectClass = `${inputClass} appearance-none`;
