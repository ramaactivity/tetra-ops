"use client";

import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/ui/native-select";
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
	const [role, setRole] = useState<string>("asisten");

	const conflict = availableCrew.find((c) => c.id === selectedUser)?.hasConflict;

	if (availableCrew.length === 0) {
		return (
			<p className="text-fluid-body italic text-muted-foreground">
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
				<div>
					<NativeSelect
						value={selectedUser}
						onValueChange={setSelectedUser}
						placeholder="Pilih crew…"
						options={availableCrew.map((c) => ({
							value: c.id,
							label: `${c.full_name}${c.tier ? ` · ${c.tier}` : ""}${
								c.hasConflict ? " ⚠" : ""
							}`,
						}))}
						triggerClassName="w-full"
					/>
					<input type="hidden" name="user_id" value={selectedUser} required />
				</div>
				<div>
					<NativeSelect
						value={role}
						onValueChange={setRole}
						options={ROLE_OPTIONS.map(([value, label]) => ({
							value,
							label,
						}))}
					/>
					<input
						type="hidden"
						name="role_in_event"
						value={role}
						required
					/>
				</div>
				<button
					type="submit"
					disabled={pending || !selectedUser}
					className="press-down h-9 rounded-md bg-primary px-3 text-fluid-body font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
				>
					{pending ? "Adding…" : "Assign"}
				</button>
			</div>
			{conflict && (
				<p className="text-fluid-caption text-amber-500">
					⚠ Crew ini sudah punya assignment lain di tanggal yang sama
				</p>
			)}
			{error && <p className="text-fluid-caption text-destructive">{error}</p>}
		</form>
	);
}
