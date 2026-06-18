"use client";

import { MessageCircle, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { assignCrew, unassignCrew } from "@/lib/actions/crew-assignments";
import { formatRupiah, nameInitials } from "@/lib/format";
import {
	buildCrewReminderMessage,
	type EventForWA,
	whatsappUrl,
} from "@/lib/whatsapp";
import type { CrewOption } from "./assign-crew-form";
import type { AssignmentRow } from "./crew-assignment-list";

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const PRIMARY_SLOTS = [
	{ role: "lead", label: "Lead" },
	{ role: "asisten", label: "Asisten" },
] as const;

/**
 * <CrewSlotAssign /> — compact, slot-first crew assignment for the event recap.
 *
 * Default view shows the role slots (Lead, Asisten) right away — pick the person
 * from a dropdown (fee auto from tier), no scrolling through a list. "+ Tambah
 * crew" adds Crew C. Replaces the old browse-all-people + 3-buttons-per-row UI.
 */
export function CrewSlotAssign({
	projectId,
	eventId,
	assignments,
	availableCrew,
	event,
}: {
	projectId: string;
	eventId: string;
	assignments: AssignmentRow[];
	availableCrew: CrewOption[];
	event: EventForWA;
}) {
	const [pending, startTransition] = useTransition();
	const [addOpen, setAddOpen] = useState(false);
	const confirm = useConfirm();

	const team = assignments.map((a) => a.user.full_name);
	const options = availableCrew.map((c) => ({
		value: c.id,
		label: `${c.full_name}${c.tier ? ` · ${c.tier}` : ""}${
			c.hasConflict ? "  ⚠" : ""
		}`,
	}));
	const noOptions = options.length === 0;

	function assign(userId: string, role: string) {
		startTransition(async () => {
			const fd = new FormData();
			fd.set("event_id", eventId);
			fd.set("user_id", userId);
			fd.set("role_in_event", role);
			const res = await assignCrew(projectId, fd);
			if (res.error) toast.error(res.error);
			else setAddOpen(false);
		});
	}

	async function remove(row: AssignmentRow) {
		const ok = await confirm({
			title: `Lepas ${row.user.full_name} dari event ini?`,
			confirmLabel: "Lepas",
			variant: "destructive",
		});
		if (!ok) return;
		startTransition(async () => {
			const res = await unassignCrew(projectId, row.id);
			if (res.error) toast.error(res.error);
		});
	}

	function sendWa(row: AssignmentRow) {
		const phone = row.user.phone_wa;
		if (!phone) {
			toast.warning(
				`${row.user.full_name} belum punya nomor WA — set di Settings → Master Crew.`,
			);
			return;
		}
		const body = buildCrewReminderMessage({
			crew_name: row.user.full_name,
			team,
			event,
		});
		window.open(whatsappUrl(phone, body), "_blank", "noopener,noreferrer");
	}

	const extras = assignments.filter(
		(a) => a.role_in_event !== "lead" && a.role_in_event !== "asisten",
	);

	return (
		<div className="mt-3.5 space-y-2">
			{PRIMARY_SLOTS.map((slot) => {
				const row = assignments.find((a) => a.role_in_event === slot.role);
				return (
					<SlotRow
						key={slot.role}
						label={slot.label}
						row={row}
						onWa={row ? () => sendWa(row) : undefined}
						onRemove={row ? () => remove(row) : undefined}
						picker={
							<NativeSelect
								value=""
								placeholder={
									noOptions ? "Tidak ada crew tersedia" : `Pilih ${slot.label}`
								}
								options={options}
								onValueChange={(v) => v && assign(v, slot.role)}
								disabled={pending || noOptions}
								aria-label={`Pilih crew untuk ${slot.label}`}
								triggerClassName="w-full rounded-full"
							/>
						}
					/>
				);
			})}

			{extras.map((row) => (
				<SlotRow
					key={row.id}
					label={ROLE_LABELS[row.role_in_event] ?? row.role_in_event}
					row={row}
					onWa={() => sendWa(row)}
					onRemove={() => remove(row)}
				/>
			))}

			{addOpen ? (
				<div className="flex items-center gap-2 rounded-[12px] border border-border-subtle bg-card p-2.5">
					<span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
						Crew C
					</span>
					<div className="min-w-0 flex-1">
						<NativeSelect
							value=""
							placeholder={noOptions ? "Tidak ada crew" : "Pilih crew"}
							options={options}
							onValueChange={(v) => v && assign(v, "crew_c")}
							disabled={pending || noOptions}
							aria-label="Pilih crew tambahan"
							triggerClassName="w-full rounded-full"
						/>
					</div>
					<button
						type="button"
						onClick={() => setAddOpen(false)}
						className="text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full"
						aria-label="Batal"
					>
						<X className="size-4" aria-hidden />
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setAddOpen(true)}
					disabled={noOptions}
					className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-border-default text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-[#059669]/40 hover:text-foreground disabled:opacity-50"
				>
					<Plus className="size-3.5" aria-hidden />
					Tambah crew
				</button>
			)}
		</div>
	);
}

function SlotRow({
	label,
	row,
	picker,
	onWa,
	onRemove,
}: {
	label: string;
	row?: AssignmentRow;
	picker?: React.ReactNode;
	onWa?: () => void;
	onRemove?: () => void;
}) {
	return (
		<div className="flex items-center gap-2.5 rounded-[12px] border border-border-subtle bg-card p-2.5">
			<span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
				{label}
			</span>
			{row ? (
				<>
					<span
						className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground"
						aria-hidden
					>
						{nameInitials(row.user.full_name)}
					</span>
					<div className="min-w-0 flex-1">
						<div className="truncate text-[13.5px] font-medium leading-tight text-foreground">
							{row.user.full_name}
						</div>
						<div className="tabular mt-0.5 text-[12px] text-muted-foreground">
							{formatRupiah(row.fee_amount)}
							{row.user.tier ? ` · ${row.user.tier}` : ""}
						</div>
					</div>
					<button
						type="button"
						onClick={onWa}
						title="Kirim WA reminder"
						className="text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
					>
						<MessageCircle className="size-3.5" aria-hidden />
					</button>
					<button
						type="button"
						onClick={onRemove}
						title="Lepas crew"
						className="text-muted-foreground hover:bg-secondary hover:text-destructive inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
					>
						<Trash2 className="size-3.5" aria-hidden />
					</button>
				</>
			) : (
				<div className="min-w-0 flex-1">{picker}</div>
			)}
		</div>
	);
}
