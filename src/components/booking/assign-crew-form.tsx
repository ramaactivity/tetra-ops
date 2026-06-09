"use client";

import { AlertTriangle, Search, UserPlus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { assignCrew } from "@/lib/actions/crew-assignments";
import { nameInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CrewOption = {
	id: string;
	full_name: string;
	tier: string | null;
	hasConflict: boolean;
};

// Role buttons share neutral chrome (border + surface). Differentiation
// is the label text only — DESIGN.md §867 forbids decorative color
// categorization.
const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "lead", label: "Lead" },
	{ value: "asisten", label: "Asisten" },
	{ value: "crew_c", label: "Crew C" },
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
			<p className="text-[12.5px] italic text-muted-foreground">
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
				const roleLabel = ROLE_OPTIONS.find(
					(r) => r.value === roleValue,
				)?.label;
				toast.success(`${crew?.full_name ?? "Crew"} assigned as ${roleLabel}`);
			}
		});
	}

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search
					className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Cari nama crew…"
					className="h-8 w-full rounded-md border border-border-default bg-card pl-8 pr-3 text-[13px] leading-none text-foreground placeholder:text-muted-foreground/70 transition-colors hover:bg-secondary/40 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
				/>
			</div>

			{filtered.length === 0 ? (
				<p className="rounded-lg border border-dashed border-border-default bg-card p-4 text-center text-[12px] italic text-muted-foreground">
					Tidak ada crew cocok pencarian "{query}".
				</p>
			) : (
				<div className="max-h-[22rem] divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border-default bg-card">
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

			<p className="flex flex-wrap items-center gap-x-1 text-[11.5px] leading-relaxed text-muted-foreground">
				<UserPlus className="size-3.5" aria-hidden />
				Klik tombol role di samping nama untuk assign instan.
				<AlertTriangle
					className="size-3 text-amber-600 dark:text-amber-400"
					aria-hidden
				/>
				= crew punya assignment lain di tanggal sama.
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
			className={cn(
				"flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40",
				crew.hasConflict && "bg-amber-500/[0.06]",
			)}
		>
			<span
				className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground"
				aria-hidden
			>
				{nameInitials(crew.full_name)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-[13px] font-medium leading-tight text-foreground">
						{crew.full_name}
					</span>
					{crew.hasConflict && (
						<AlertTriangle
							className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
							aria-label="Punya assignment lain di tanggal sama"
						/>
					)}
				</div>
				{crew.tier && (
					<div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
						{crew.tier}
					</div>
				)}
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
							className="press-down inline-flex h-7 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
						>
							{busy ? "…" : `+ ${r.label}`}
						</button>
					);
				})}
			</div>
		</div>
	);
}
