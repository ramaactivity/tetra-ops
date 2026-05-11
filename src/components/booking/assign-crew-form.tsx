"use client";

import { AlertTriangle, Search, UserPlus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { assignCrew } from "@/lib/actions/crew-assignments";

export type CrewOption = {
	id: string;
	full_name: string;
	tier: string | null;
	hasConflict: boolean;
};

const ROLE_OPTIONS: Array<{ value: string; label: string; tone: string }> = [
	{
		value: "lead",
		label: "Lead",
		tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20",
	},
	{
		value: "asisten",
		label: "Asisten",
		tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20",
	},
	{
		value: "crew_c",
		label: "Crew C",
		tone: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20",
	},
];

/**
 * One-click assign UX. Each crew row exposes 3 role buttons; clicking
 * assigns instantly via server action — no separate "Pilih crew →
 * Pilih role → Submit" sequence.
 */
export function AssignCrewForm({
	projectId,
	eventId,
	availableCrew,
}: {
	projectId: string;
	eventId: string;
	availableCrew: CrewOption[];
}) {
	const [query, setQuery] = useState("");
	const [pending, startTransition] = useTransition();
	const [pendingFor, setPendingFor] = useState<string | null>(null);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return availableCrew;
		return availableCrew.filter((c) =>
			`${c.full_name} ${c.tier ?? ""}`.toLowerCase().includes(q),
		);
	}, [availableCrew, query]);

	if (availableCrew.length === 0) {
		return (
			<p className="text-fluid-body italic text-muted-foreground">
				Semua crew aktif sudah ter-assign di event ini. Tambah crew baru dari
				Settings → Master Crew.
			</p>
		);
	}

	function handleAssign(userId: string, roleValue: string) {
		setPendingFor(`${userId}:${roleValue}`);
		startTransition(async () => {
			const fd = new FormData();
			fd.set("event_id", eventId);
			fd.set("user_id", userId);
			fd.set("role_in_event", roleValue);
			const res = await assignCrew(projectId, fd);
			setPendingFor(null);
			if (res.error) {
				toast.error(res.error);
			} else {
				const crew = availableCrew.find((c) => c.id === userId);
				const roleLabel = ROLE_OPTIONS.find((r) => r.value === roleValue)?.label;
				toast.success(
					`${crew?.full_name ?? "Crew"} assigned as ${roleLabel}`,
				);
			}
		});
	}

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search
					className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Cari nama crew…"
					className="h-9 w-full rounded-md border border-border-default bg-background pl-9 pr-3 text-fluid-body placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				/>
			</div>

			{filtered.length === 0 ? (
				<p className="rounded-md border border-dashed border-border-default bg-surface-2 p-3 text-center text-fluid-caption italic text-muted-foreground">
					Tidak ada crew cocok pencarian "{query}".
				</p>
			) : (
				<div className="max-h-[24rem] divide-y divide-border-default/40 overflow-y-auto rounded-lg border border-border-default bg-surface-2">
					{filtered.map((c) => (
						<CrewRow
							key={c.id}
							crew={c}
							pending={pending}
							pendingKey={pendingFor}
							onAssign={handleAssign}
						/>
					))}
				</div>
			)}

			<p className="text-fluid-caption text-muted-foreground">
				<UserPlus className="mr-1 inline-block size-3.5 align-text-bottom" />
				Klik tombol role di samping nama → instant assign. Tanda{" "}
				<AlertTriangle className="mx-0.5 inline-block size-3 align-text-bottom text-amber-600 dark:text-amber-400" />{" "}
				= crew ini punya assignment lain di tanggal sama.
			</p>
		</div>
	);
}

function CrewRow({
	crew,
	pending,
	pendingKey,
	onAssign,
}: {
	crew: CrewOption;
	pending: boolean;
	pendingKey: string | null;
	onAssign: (userId: string, role: string) => void;
}) {
	return (
		<div
			className={`flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/30 ${
				crew.hasConflict ? "bg-amber-500/5" : ""
			}`}
		>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<span className="truncate text-fluid-body font-medium text-foreground">
						{crew.full_name}
					</span>
					{crew.tier && (
						<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
							{crew.tier}
						</span>
					)}
					{crew.hasConflict && (
						<AlertTriangle
							className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
							aria-label="Punya assignment lain di tanggal sama"
						/>
					)}
				</div>
			</div>
			<div className="flex items-center gap-1">
				{ROLE_OPTIONS.map((r) => {
					const key = `${crew.id}:${r.value}`;
					const busy = pending && pendingKey === key;
					return (
						<button
							key={r.value}
							type="button"
							onClick={() => onAssign(crew.id, r.value)}
							disabled={pending}
							title={`Assign sebagai ${r.label}`}
							className={`press-down inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${r.tone}`}
						>
							{busy ? "..." : `+ ${r.label}`}
						</button>
					);
				})}
			</div>
		</div>
	);
}
