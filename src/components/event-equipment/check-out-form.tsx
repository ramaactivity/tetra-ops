"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
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
import { checkOutEquipment } from "@/lib/actions/event-equipment";

export type AvailableItem = {
	id: string;
	sku: string;
	name: string;
	condition: string | null;
	current_location: string | null;
};

export type CrewOption = {
	id: string;
	full_name: string;
	role_in_event: string;
};

export function CheckOutDialog({
	eventId,
	projectId,
	availableItems,
	assignedCrew,
}: {
	eventId: string;
	projectId: string;
	availableItems: AvailableItem[];
	assignedCrew: CrewOption[];
}) {
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [selectedItem, setSelectedItem] = useState<string>("");
	const [crewId, setCrewId] = useState<string>("");
	const [notes, setNotes] = useState<string>("");

	function reset() {
		setSelectedItem("");
		setCrewId("");
		setNotes("");
		setError(null);
	}

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!selectedItem) {
			setError("Pilih equipment dulu");
			return;
		}
		setError(null);
		const fd = new FormData();
		// Selalu set, walau kosong. Kalau key-nya tidak ada, formData.get()
		// mengembalikan null dan Zod `z.string().optional()` MELEMPAR
		// ("expected string, received null") — bukan menganggapnya absen.
		// Karena kedua state ini default "", check-out di jalur normal
		// (opsi "Disimpan di event (tanpa crew carry)" + catatan kosong)
		// selalu gagal dengan "Invalid input".
		fd.set("to_crew_id", crewId);
		fd.set("notes", notes);
		startTransition(async () => {
			const result = await checkOutEquipment(
				selectedItem,
				eventId,
				projectId,
				fd,
			);
			if (result.error) {
				setError(result.error);
				return;
			}
			reset();
			setOpen(false);
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) reset();
			}}
		>
			<DialogTrigger className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium">
				<Plus className="h-4 w-4" />
				Tambah equipment
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Check-out Equipment</DialogTitle>
					<DialogDescription>
						Pilih equipment dari gudang untuk dibawa ke event.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit} className="space-y-4">
					{error && (
						<div className="border-destructive bg-destructive/10 rounded-md border p-3">
							<p className="text-destructive text-sm font-medium">{error}</p>
						</div>
					)}

					<div className="space-y-1.5">
						<label htmlFor="item_id" className="text-sm font-medium">
							Equipment
							<span className="text-primary ml-0.5">*</span>
						</label>
						<NativeSelect
							value={selectedItem}
							onValueChange={setSelectedItem}
							placeholder={
								availableItems.length === 0
									? "Tidak ada equipment available di gudang"
									: "Pilih equipment…"
							}
							options={availableItems.map((it) => ({
								value: it.id,
								label: `${it.sku} · ${it.name}${
									it.condition && it.condition !== "normal"
										? ` (${it.condition})`
										: ""
								}`,
							}))}
							triggerClassName="w-full"
						/>
					</div>

					<div className="space-y-1.5">
						<label htmlFor="to_crew_id" className="text-sm font-medium">
							Dibawa oleh
						</label>
						<NativeSelect
							value={crewId}
							onValueChange={setCrewId}
							placeholder="Disimpan di event (tanpa crew carry)"
							options={[
								{
									value: "",
									label: "Disimpan di event (tanpa crew carry)",
								},
								...assignedCrew.map((c) => ({
									value: c.id,
									label: `${c.full_name} · ${c.role_in_event}`,
								})),
							]}
							triggerClassName="w-full"
						/>
						<p className="text-muted-foreground text-xs">
							Pilih kalau crew yang bawa langsung dari gudang
						</p>
					</div>

					<div className="space-y-1.5">
						<label htmlFor="notes" className="text-sm font-medium">
							Catatan
						</label>
						<RichTextarea
							id="notes"
							rows={2}
							maxLength={300}
							value={notes}
							onChange={setNotes}
							toolbar={false}
							placeholder="Optional"
						/>
					</div>

					<DialogFooter>
						<DialogClose className="border-border-default bg-surface-2 hover:bg-muted inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium">
							Batal
						</DialogClose>
						<button
							type="submit"
							disabled={pending || availableItems.length === 0}
							className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
						>
							{pending ? "Menyimpan…" : "Check-out"}
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
