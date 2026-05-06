"use client";

import { useState, useTransition } from "react";
import { assignCrew } from "@/lib/actions/crew-assignments";

export type CrewOption = {
	id: string;
	full_name: string;
	tier: string | null;
	hasConflict: boolean;
};

const ROLE_OPTIONS: Array<[string, string]> = [
	["lead", "Lead"],
	["asisten", "Asisten"],
	["crew_c", "Crew C"],
];

export function AssignCrewForm({
	projectId,
	eventId,
	availableCrew,
}: {
	projectId: string;
	eventId: string;
	availableCrew: CrewOption[];
}) {
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [selectedUser, setSelectedUser] = useState<string>("");

	const conflict = availableCrew.find((c) => c.id === selectedUser)?.hasConflict;

	if (availableCrew.length === 0) {
		return (
			<p className="text-muted-foreground text-sm italic">
				Belum ada crew terdaftar. Tambah dari Settings → Master Crew.
			</p>
		);
	}

	async function handleSubmit(formData: FormData) {
		setError(null);
		formData.set("event_id", eventId);
		startTransition(async () => {
			const result = await assignCrew(projectId, formData);
			if (result.error) setError(result.error);
			else setSelectedUser("");
		});
	}

	return (
		<form action={handleSubmit} className="space-y-3">
			<div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
				<select
					name="user_id"
					value={selectedUser}
					onChange={(e) => setSelectedUser(e.target.value)}
					required
					className={selectClass}
				>
					<option value="" disabled>
						Pilih crew…
					</option>
					{availableCrew.map((c) => (
						<option key={c.id} value={c.id}>
							{c.full_name}
							{c.tier && ` · ${c.tier}`}
							{c.hasConflict && " ⚠"}
						</option>
					))}
				</select>
				<select name="role_in_event" defaultValue="asisten" className={selectClass}>
					{ROLE_OPTIONS.map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
				<button
					type="submit"
					disabled={pending || !selectedUser}
					className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-3 text-sm font-medium disabled:opacity-60"
				>
					{pending ? "Adding…" : "Assign"}
				</button>
			</div>
			{conflict && (
				<p className="text-amber-500 text-xs">
					⚠ Crew ini sudah punya assignment lain di tanggal yang sama
				</p>
			)}
			{error && <p className="text-destructive text-xs">{error}</p>}
		</form>
	);
}

const selectClass =
	"border-border bg-background h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none appearance-none";
