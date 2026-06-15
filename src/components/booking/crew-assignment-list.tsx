"use client";

import { MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import {
	unassignCrew,
	updateCrewAssignment,
} from "@/lib/actions/crew-assignments";
import { formatRupiah, nameInitials } from "@/lib/format";
import {
	buildCrewReminderMessage,
	type EventForWA,
	whatsappUrl,
} from "@/lib/whatsapp";

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const ROLE_OPTIONS = ["lead", "asisten", "crew_c"];

export type AssignmentRow = {
	id: string;
	user: { full_name: string; tier: string | null; phone_wa: string | null };
	role_in_event: string;
	fee_amount: number;
	bonus_amount: number;
	fee_override_reason: string | null;
};

export function CrewAssignmentList({
	projectId,
	assignments,
	event,
}: {
	projectId: string;
	assignments: AssignmentRow[];
	event: EventForWA;
}) {
	if (assignments.length === 0) {
		return (
			<p className="text-muted-foreground text-[13px] italic">
				Belum ada crew di-assign.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{assignments.map((row) => (
				<AssignmentItem
					key={row.id}
					projectId={projectId}
					row={row}
					allAssignments={assignments}
					event={event}
				/>
			))}
		</div>
	);
}

function AssignmentItem({
	projectId,
	row,
	allAssignments,
	event,
}: {
	projectId: string;
	row: AssignmentRow;
	allAssignments: AssignmentRow[];
	event: EventForWA;
}) {
	const [editing, setEditing] = useState(false);
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const confirm = useConfirm();

	async function handleUnassign() {
		const ok = await confirm({
			title: `Lepas ${row.user.full_name} dari event ini?`,
			confirmLabel: "Lepas",
			variant: "destructive",
		});
		if (!ok) return;
		setError(null);
		startTransition(async () => {
			const result = await unassignCrew(projectId, row.id);
			if (result.error) setError(result.error);
		});
	}

	async function handleUpdate(formData: FormData) {
		setError(null);
		startTransition(async () => {
			formData.set("id", row.id);
			const result = await updateCrewAssignment(projectId, formData);
			if (result.error) setError(result.error);
			else setEditing(false);
		});
	}

	if (editing) {
		return (
			<form
				action={handleUpdate}
				className="border-border-default bg-surface-2 space-y-3 rounded-md border p-3"
			>
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<span
							className="bg-secondary text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold"
							aria-hidden
						>
							{nameInitials(row.user.full_name)}
						</span>
						<span className="text-[13px] font-medium">
							{row.user.full_name}
						</span>
					</div>
					<button
						type="button"
						onClick={() => setEditing(false)}
						className="text-muted-foreground text-[12px] hover:underline"
					>
						Cancel
					</button>
				</div>
				<div className="grid gap-3 sm:grid-cols-3">
					<RoleSelect defaultValue={row.role_in_event} />
					<input
						type="number"
						name="fee_amount"
						min={0}
						defaultValue={row.fee_amount}
						placeholder="Fee"
						className={`${inputClass} tabular`}
					/>
					<input
						type="number"
						name="bonus_amount"
						min={0}
						defaultValue={row.bonus_amount}
						placeholder="Bonus"
						className={`${inputClass} tabular`}
					/>
				</div>
				<input
					type="text"
					name="fee_override_reason"
					maxLength={255}
					defaultValue={row.fee_override_reason ?? ""}
					placeholder="Alasan override fee (opsional)"
					className={inputClass}
				/>
				{error && <p className="text-destructive text-xs">{error}</p>}
				<button
					type="submit"
					disabled={pending}
					className="bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 h-8 rounded-md px-3 text-xs font-medium disabled:opacity-60"
				>
					{pending ? "Saving…" : "Save"}
				</button>
			</form>
		);
	}

	function handleSendWa() {
		const phone = row.user.phone_wa;
		if (!phone) {
			toast.warning(
				`${row.user.full_name} belum punya nomor WA — set di Settings → Master Crew.`,
			);
			return;
		}
		const team = allAssignments.map((a) => a.user.full_name);
		const body = buildCrewReminderMessage({
			crew_name: row.user.full_name,
			team,
			event,
		});
		const url = whatsappUrl(phone, body);
		window.open(url, "_blank", "noopener,noreferrer");
	}

	return (
		<div className="border-border-default bg-surface-2 flex items-center gap-3 rounded-lg border p-3">
			<span
				className="bg-secondary text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
				aria-hidden
			>
				{nameInitials(row.user.full_name)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-[13px] font-medium leading-tight text-foreground">
						{row.user.full_name}
					</span>
					<Badge variant="outline">{ROLE_LABELS[row.role_in_event]}</Badge>
					{row.user.tier && (
						<span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.04em]">
							{row.user.tier}
						</span>
					)}
				</div>
				<div className="text-muted-foreground tabular mt-0.5 text-[12px]">
					{formatRupiah(row.fee_amount)}
					{row.bonus_amount > 0 && (
						<> + {formatRupiah(row.bonus_amount)} bonus</>
					)}
					{row.fee_override_reason && <> · {row.fee_override_reason}</>}
				</div>
				{error && (
					<p className="text-destructive mt-0.5 text-[11.5px]">{error}</p>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<button
					type="button"
					onClick={handleSendWa}
					title={
						row.user.phone_wa
							? `Send WA reminder ke ${row.user.full_name}`
							: "Belum ada nomor WA — set di Master Crew"
					}
					className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50"
				>
					<MessageCircle className="size-3.5" aria-hidden />
					WA
				</button>
				<button
					type="button"
					onClick={() => setEditing(true)}
					title="Edit fee / role"
					className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
				>
					<Pencil className="size-3.5" aria-hidden />
				</button>
				<button
					type="button"
					onClick={handleUnassign}
					disabled={pending}
					title="Lepas crew"
					className="text-muted-foreground hover:bg-muted hover:text-destructive inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
				>
					<Trash2 className="size-3.5" aria-hidden />
				</button>
			</div>
		</div>
	);
}

function RoleSelect({ defaultValue }: { defaultValue: string }) {
	const [role, setRole] = useState(defaultValue);
	return (
		<>
			<NativeSelect
				value={role}
				onValueChange={setRole}
				options={ROLE_OPTIONS.map((r) => ({
					value: r,
					label: ROLE_LABELS[r],
				}))}
				triggerClassName="w-full"
			/>
			<input type="hidden" name="role_in_event" value={role} />
		</>
	);
}

const inputClass =
	"border-border-default bg-background h-9 w-full rounded-md border px-3 text-[13px] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";
