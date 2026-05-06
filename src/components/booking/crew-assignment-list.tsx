"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import {
	unassignCrew,
	updateCrewAssignment,
} from "@/lib/actions/crew-assignments";
import { formatRupiah } from "@/lib/format";

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const ROLE_OPTIONS = ["lead", "asisten", "crew_c"];

export type AssignmentRow = {
	id: string;
	user: { full_name: string; tier: string | null };
	role_in_event: string;
	fee_amount: number;
	bonus_amount: number;
	fee_override_reason: string | null;
};

export function CrewAssignmentList({
	projectId,
	assignments,
}: {
	projectId: string;
	assignments: AssignmentRow[];
}) {
	if (assignments.length === 0) {
		return (
			<p className="text-muted-foreground text-sm italic">
				Belum ada crew di-assign.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{assignments.map((row) => (
				<AssignmentItem key={row.id} projectId={projectId} row={row} />
			))}
		</div>
	);
}

function AssignmentItem({
	projectId,
	row,
}: {
	projectId: string;
	row: AssignmentRow;
}) {
	const [editing, setEditing] = useState(false);
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handleUnassign() {
		if (!confirm(`Lepas ${row.user.full_name} dari event ini?`)) return;
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
				className="border-border bg-card space-y-3 rounded-md border p-3"
			>
				<div className="flex items-center justify-between gap-3">
					<span className="text-sm font-medium">{row.user.full_name}</span>
					<button
						type="button"
						onClick={() => setEditing(false)}
						className="text-muted-foreground text-xs hover:underline"
					>
						Cancel
					</button>
				</div>
				<div className="grid gap-3 sm:grid-cols-3">
					<select
						name="role_in_event"
						defaultValue={row.role_in_event}
						className={selectClass}
					>
						{ROLE_OPTIONS.map((r) => (
							<option key={r} value={r}>
								{ROLE_LABELS[r]}
							</option>
						))}
					</select>
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
					className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 rounded-md px-3 text-xs font-medium disabled:opacity-60"
				>
					{pending ? "Saving…" : "Save"}
				</button>
			</form>
		);
	}

	return (
		<div className="border-border bg-card flex items-center gap-3 rounded-md border p-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<span className="text-sm font-medium">{row.user.full_name}</span>
					{row.user.tier && (
						<span className="text-muted-foreground text-xs">
							{row.user.tier}
						</span>
					)}
					<Badge variant="outline">{ROLE_LABELS[row.role_in_event]}</Badge>
				</div>
				<div className="text-muted-foreground tabular text-xs">
					{formatRupiah(row.fee_amount)}
					{row.bonus_amount > 0 && (
						<> + {formatRupiah(row.bonus_amount)} bonus</>
					)}
					{row.fee_override_reason && <> · {row.fee_override_reason}</>}
				</div>
				{error && <p className="text-destructive text-xs">{error}</p>}
			</div>
			<button
				type="button"
				onClick={() => setEditing(true)}
				className="text-muted-foreground hover:text-foreground text-xs hover:underline"
			>
				Edit
			</button>
			<button
				type="button"
				onClick={handleUnassign}
				disabled={pending}
				title="Lepas crew"
				className="text-muted-foreground hover:bg-muted hover:text-destructive inline-flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-50"
			>
				<Trash2 className="h-4 w-4" />
			</button>
		</div>
	);
}

const inputClass =
	"border-border bg-background h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";
const selectClass = `${inputClass} appearance-none`;
