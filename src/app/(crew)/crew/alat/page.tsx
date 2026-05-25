import { ChevronRight, Package2 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const CONDITION_LABELS: Record<string, string> = {
	normal: "Normal",
	service: "Service",
	damaged: "Rusak",
	lost: "Hilang",
};

const CONDITION_TONES: Record<string, string> = {
	normal: "text-emerald-600 dark:text-emerald-400",
	service: "text-amber-600 dark:text-amber-400",
	damaged: "text-rose-600 dark:text-rose-400",
	lost: "text-rose-600 dark:text-rose-400",
};

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ID_TIME = (t: string | null) => (t ? t.slice(0, 5) : "—");

type AssignedEvent = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	start_time: string | null;
	venue_name: string;
	venue_city: string | null;
};

type EquipmentItem = {
	id: string;
	sku: string;
	name: string;
	condition: string | null;
	current_event_id: string | null;
};

export default async function CrewEquipmentPage() {
	const me = await getCurrentUser();
	if (!me) return null;

	const todayISO = isoDate(new Date());
	const supabase = await createClient();

	// Get my upcoming/in-progress assigned events
	const { data: assignments } = await supabase
		.from("crew_assignments")
		.select(
			`event:events!inner(
				id, project_id, client_name, event_date, start_time, venue_name, venue_city
			)`,
		)
		.eq("user_id", me.profile.id)
		.gte("event.event_date", todayISO);

	const eventList = ((assignments ?? []) as Array<{
		event: AssignedEvent | AssignedEvent[] | null;
	}>)
		.map((a) => (Array.isArray(a.event) ? a.event[0] : a.event))
		.filter((e): e is AssignedEvent => !!e);

	const eventIds = eventList.map((e) => e.id);

	// Get equipment checked out to those events
	const equipmentByEvent = new Map<string, EquipmentItem[]>();
	if (eventIds.length > 0) {
		const { data: equipmentRows } = await supabase
			.from("inventory_items")
			.select("id, sku, name, condition, current_event_id")
			.eq("category", "fixed_asset")
			.in("current_event_id", eventIds);

		for (const eq of (equipmentRows ?? []) as EquipmentItem[]) {
			if (!eq.current_event_id) continue;
			const list = equipmentByEvent.get(eq.current_event_id) ?? [];
			list.push(eq);
			equipmentByEvent.set(eq.current_event_id, list);
		}
	}

	const totalCheckedOut = Array.from(equipmentByEvent.values()).reduce(
		(s, l) => s + l.length,
		0,
	);

	// Sort events by date asc
	eventList.sort((a, b) => a.event_date.localeCompare(b.event_date));

	return (
		<div className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
			<header className="space-y-1">
				<h1 className="text-fluid-h1 font-semibold tracking-tight">Alat</h1>
				<p className="text-muted-foreground text-sm">
					Equipment yang ke-checkout buat event-event lo. Checkout/check-in
					di-handle owner via Operations.
				</p>
			</header>

			{eventList.length === 0 ? (
				<EmptyState
					icon={Package2}
					title="Belum ada event upcoming"
					description="Begitu lo dapet jadwal baru, daftar alat bakal muncul di sini."
				/>
			) : totalCheckedOut === 0 ? (
				<EmptyState
					icon={Package2}
					title="Belum ada alat ke-checkout"
					description="Tunggu owner checkout alat sebelum hari H. Listnya bakal muncul otomatis."
				/>
			) : (
				<div className="space-y-3">
					{eventList.map((ev) => {
						const equipment = equipmentByEvent.get(ev.id) ?? [];
						if (equipment.length === 0) return null;
						return (
							<div
								key={ev.id}
								className="border-border-default bg-surface-2 overflow-hidden rounded-xl border"
							>
								<Link
									href={`/crew/jadwal/${ev.project_id}`}
									className="hover:bg-muted/40 flex items-start justify-between gap-2 p-3 transition-colors"
								>
									<div className="min-w-0 flex-1 space-y-0.5">
										<p className="text-foreground truncate text-sm font-medium">
											{ev.client_name}
										</p>
										<p className="text-muted-foreground tabular text-xs">
											{formatDateID(ev.event_date)} · {ID_TIME(ev.start_time)}{" "}
											· {ev.venue_name}
										</p>
									</div>
									<div className="flex items-center gap-1.5">
										<span className="bg-primary/15 text-primary tabular rounded-full px-2 py-0.5 text-xs font-bold">
											{equipment.length}
										</span>
										<ChevronRight className="text-muted-foreground/60 h-4 w-4" />
									</div>
								</Link>
								<ul className="divide-border divide-y">
									{equipment.map((eq) => {
										const cond = eq.condition ?? "normal";
										return (
											<li
												key={eq.id}
												className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
											>
												<div className="min-w-0 flex-1">
													<p className="text-foreground truncate">{eq.name}</p>
													<p className="text-muted-foreground tabular text-[11px]">
														{eq.sku}
													</p>
												</div>
												<span
													className={`text-[11px] font-medium ${CONDITION_TONES[cond] ?? "text-muted-foreground"}`}
												>
													{CONDITION_LABELS[cond] ?? cond}
												</span>
											</li>
										);
									})}
								</ul>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
