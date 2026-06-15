import { ChevronRight, Package2 } from "lucide-react";
import Link from "next/link";
import { AppHeader, AppScreen, Section } from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

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

function EmptyAlat({ title, body }: { title: string; body: string }) {
	return (
		<div className="mt-4 rounded-[1.25rem] border border-dashed border-border-default bg-card/40 px-5 py-10 text-center">
			<Package2 className="mx-auto mb-2.5 size-7 text-muted-foreground/50" />
			<p className="type-body-strong">{title}</p>
			<p className="type-secondary mx-auto mt-1 max-w-[18rem]">{body}</p>
		</div>
	);
}

export default async function CrewEquipmentPage() {
	const me = await getCurrentUser();
	if (!me) return null;

	const todayISO = isoDate(new Date());
	const supabase = await createClient();

	const { data: assignments } = await supabase
		.from("crew_assignments")
		.select(
			`event:events!inner(
				id, project_id, client_name, event_date, start_time, venue_name, venue_city
			)`,
		)
		.eq("user_id", me.profile.id)
		.gte("event.event_date", todayISO);

	const eventList = (
		(assignments ?? []) as Array<{
			event: AssignedEvent | AssignedEvent[] | null;
		}>
	)
		.map((a) => (Array.isArray(a.event) ? a.event[0] : a.event))
		.filter((e): e is AssignedEvent => !!e);

	const eventIds = eventList.map((e) => e.id);

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

	eventList.sort((a, b) => a.event_date.localeCompare(b.event_date));

	return (
		<AppScreen>
			<AppHeader
				title="Alat"
				subtitle="Alat yang udah disiapin buat event lo. Diatur sama owner."
			/>

			{eventList.length === 0 ? (
				<EmptyAlat
					title="Belum ada event mendatang"
					body="Begitu lo dapet jadwal baru, daftar alat bakal muncul di sini."
				/>
			) : totalCheckedOut === 0 ? (
				<EmptyAlat
					title="Belum ada alat disiapin"
					body="Tunggu owner nyiapin alat sebelum hari H. Listnya muncul otomatis."
				/>
			) : (
				<Section className="mt-4">
					<ul className="space-y-3">
						{eventList.map((ev) => {
							const equipment = equipmentByEvent.get(ev.id) ?? [];
							if (equipment.length === 0) return null;
							return (
								<li
									key={ev.id}
									className="overflow-hidden rounded-[1.25rem] border border-border-default bg-card shadow-[var(--shadow-level-2)]"
								>
									<Link
										href={`/crew/jadwal/${ev.project_id}`}
										className="press tap flex items-center gap-3 border-b border-border-subtle px-4 py-3 transition-colors active:bg-surface-3"
									>
										<div className="min-w-0 flex-1">
											<p className="type-body-strong truncate">
												{ev.client_name}
											</p>
											<p className="type-secondary tabular truncate">
												{formatDateID(ev.event_date)} · {ID_TIME(ev.start_time)}{" "}
												· {ev.venue_name}
											</p>
										</div>
										<span className="type-num inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-2 text-[0.75rem] text-primary">
											{equipment.length}
										</span>
										<ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
									</Link>
									<ul>
										{equipment.map((eq) => {
											const cond = eq.condition ?? "normal";
											return (
												<li
													key={eq.id}
													className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0"
												>
													<div className="min-w-0 flex-1">
														<p className="type-body truncate">{eq.name}</p>
														<p className="eyebrow tabular mt-0.5">{eq.sku}</p>
													</div>
													<span
														className={cn(
															"type-label",
															CONDITION_TONES[cond] ?? "text-muted-foreground",
														)}
													>
														{CONDITION_LABELS[cond] ?? cond}
													</span>
												</li>
											);
										})}
									</ul>
								</li>
							);
						})}
					</ul>
				</Section>
			)}
		</AppScreen>
	);
}
