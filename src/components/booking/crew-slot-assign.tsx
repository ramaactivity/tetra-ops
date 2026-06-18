"use client";

import { MessageCircle, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { assignCrew, unassignCrew } from "@/lib/actions/crew-assignments";
import { formatRupiah } from "@/lib/format";
import {
	buildCrewReminderMessage,
	type EventForWA,
	whatsappUrl,
} from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
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

function crewLabel(c: { full_name: string; tier: string | null }): string {
	return `${c.full_name}${c.tier ? ` · ${c.tier}` : ""}`;
}

/** Optimistic row so a pick fills the slot instantly (fee -1 = "menyiapkan"). */
function optimisticRow(crew: CrewOption, role: string): AssignmentRow {
	return {
		id: `temp-${crew.id}-${role}`,
		user_id: crew.id,
		role_in_event: role,
		fee_amount: -1,
		bonus_amount: 0,
		fee_override_reason: null,
		user: { full_name: crew.full_name, tier: crew.tier, phone_wa: null },
	};
}

type OptAction =
	| { type: "assign"; role: string; crew: CrewOption }
	| { type: "reassign"; oldId: string; role: string; crew: CrewOption }
	| { type: "remove"; id: string };

function reducer(state: AssignmentRow[], action: OptAction): AssignmentRow[] {
	switch (action.type) {
		case "assign":
			return [...state, optimisticRow(action.crew, action.role)];
		case "reassign":
			return state.map((a) =>
				a.id === action.oldId ? optimisticRow(action.crew, action.role) : a,
			);
		case "remove":
			return state.filter((a) => a.id !== action.id);
	}
}

/**
 * <CrewSlotAssign /> — slot-first, instant crew assignment for the recap.
 *
 * Role slots (Lead, Asisten) are always dropdowns: pick to assign, pick a
 * different name to swap directly (no delete-first), fee auto from tier.
 * useOptimistic fills/changes the slot instantly without waiting for the server
 * round-trip. "+ Tambah crew" adds Crew C.
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
	const [optimistic, applyOptimistic] = useOptimistic(assignments, reducer);
	const [addOpen, setAddOpen] = useState(false);
	const confirm = useConfirm();
	const router = useRouter();
	// Guards against the dropdown re-emitting a just-removed person (which would
	// resurrect the slot as a fresh assign). Cleared after a short window so a
	// genuine re-pick still works.
	const suppressed = useRef<Set<string>>(new Set());

	function suppress(role: string, userId: string) {
		const key = `${role}:${userId}`;
		suppressed.current.add(key);
		setTimeout(() => suppressed.current.delete(key), 1200);
	}

	const team = optimistic.map((a) => a.user.full_name);
	const baseOptions = availableCrew.map((c) => ({
		value: c.id,
		label: `${crewLabel(c)}${c.hasConflict ? "  ⚠" : ""}`,
	}));

	/** Options for a slot — include the currently-assigned crew so it shows. */
	function slotOptions(row?: AssignmentRow) {
		if (!row) return baseOptions;
		if (baseOptions.some((o) => o.value === row.user_id)) return baseOptions;
		return [{ value: row.user_id, label: crewLabel(row.user) }, ...baseOptions];
	}

	function pick(role: string, userId: string, current?: AssignmentRow) {
		if (!userId || userId === current?.user_id) return;
		if (suppressed.current.has(`${role}:${userId}`)) return;
		const crew = availableCrew.find((c) => c.id === userId);
		if (!crew) return;
		setAddOpen(false);
		startTransition(async () => {
			applyOptimistic(
				current
					? { type: "reassign", oldId: current.id, role, crew }
					: { type: "assign", role, crew },
			);
			if (current) {
				const un = await unassignCrew(projectId, current.id);
				if (un?.error) {
					toast.error(un.error);
					return;
				}
			}
			const fd = new FormData();
			fd.set("event_id", eventId);
			fd.set("user_id", userId);
			fd.set("role_in_event", role);
			const res = await assignCrew(projectId, fd);
			if (res?.error) toast.error(res.error);
			router.refresh();
		});
	}

	async function remove(row: AssignmentRow) {
		const ok = await confirm({
			title: `Lepas ${row.user.full_name} dari event ini?`,
			confirmLabel: "Lepas",
			variant: "destructive",
		});
		if (!ok) return;
		suppress(row.role_in_event, row.user_id);
		startTransition(async () => {
			applyOptimistic({ type: "remove", id: row.id });
			const res = await unassignCrew(projectId, row.id);
			if (res?.error) toast.error(res.error);
			router.refresh();
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

	const extras = optimistic.filter(
		(a) => a.role_in_event !== "lead" && a.role_in_event !== "asisten",
	);
	const noBase = baseOptions.length === 0;

	return (
		<div className="mt-3.5 space-y-2">
			{PRIMARY_SLOTS.map((slot) => {
				const row = optimistic.find((a) => a.role_in_event === slot.role);
				return (
					<Slot
						key={slot.role}
						label={slot.label}
						row={row}
						options={slotOptions(row)}
						placeholder={noBase && !row ? "Tidak ada crew" : `Pilih ${slot.label}`}
						disabled={pending || (noBase && !row)}
						onPick={(v) => pick(slot.role, v, row)}
						onWa={row ? () => sendWa(row) : undefined}
						onRemove={row ? () => remove(row) : undefined}
					/>
				);
			})}

			{extras.map((row) => (
				<Slot
					key={row.id}
					label={ROLE_LABELS[row.role_in_event] ?? row.role_in_event}
					row={row}
					options={slotOptions(row)}
					placeholder="Pilih crew"
					disabled={pending}
					onPick={(v) => pick(row.role_in_event, v, row)}
					onWa={() => sendWa(row)}
					onRemove={() => remove(row)}
				/>
			))}

			{addOpen ? (
				<Slot
					label="Crew C"
					options={baseOptions}
					placeholder={noBase ? "Tidak ada crew" : "Pilih crew"}
					disabled={pending || noBase}
					onPick={(v) => pick("crew_c", v)}
					onCancel={() => setAddOpen(false)}
				/>
			) : (
				<button
					type="button"
					onClick={() => setAddOpen(true)}
					disabled={noBase}
					className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-border-default text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-[#059669]/40 hover:text-foreground disabled:opacity-50"
				>
					<Plus className="size-3.5" aria-hidden />
					Tambah crew
				</button>
			)}
		</div>
	);
}

function Slot({
	label,
	row,
	options,
	placeholder,
	disabled,
	onPick,
	onWa,
	onRemove,
	onCancel,
}: {
	label: string;
	row?: AssignmentRow;
	options: ReadonlyArray<{ value: string; label: string }>;
	placeholder: string;
	disabled?: boolean;
	onPick: (value: string) => void;
	onWa?: () => void;
	onRemove?: () => void;
	onCancel?: () => void;
}) {
	return (
		<div className="rounded-[12px] border border-border-subtle bg-card p-2.5">
			<div className="flex items-center gap-2.5">
				<span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
					{label}
				</span>
				<div className="min-w-0 flex-1">
					<NativeSelect
						value={row?.user_id ?? ""}
						placeholder={placeholder}
						options={options}
						onValueChange={onPick}
						disabled={disabled}
						aria-label={`Pilih crew untuk ${label}`}
						triggerClassName="w-full rounded-full"
					/>
				</div>
				{onCancel && (
					<button
						type="button"
						onClick={onCancel}
						className="text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full"
						aria-label="Batal"
					>
						<X className="size-4" aria-hidden />
					</button>
				)}
			</div>

			{row && (
				<div className="mt-2 flex items-center justify-between gap-2 pl-[4.625rem]">
					<span className="tabular text-[12px] text-muted-foreground">
						{row.fee_amount < 0
							? "menyiapkan fee…"
							: formatRupiah(row.fee_amount)}
						{row.user.tier ? ` · ${row.user.tier}` : ""}
					</span>
					<div className="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onClick={onWa}
							title="Kirim WA reminder"
							className="text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 inline-flex size-7 items-center justify-center rounded-full transition-colors"
						>
							<MessageCircle className="size-3.5" aria-hidden />
						</button>
						<button
							type="button"
							onClick={onRemove}
							title="Lepas crew"
							className={cn(
								"text-muted-foreground hover:bg-secondary hover:text-destructive inline-flex size-7 items-center justify-center rounded-full transition-colors",
							)}
						>
							<Trash2 className="size-3.5" aria-hidden />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
