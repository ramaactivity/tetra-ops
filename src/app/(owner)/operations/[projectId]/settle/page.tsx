import { ChevronLeft, Lock } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
	SettlementForm,
	type SinkingFundConfig,
} from "@/components/settlement/settlement-form";
import { getCurrentUser } from "@/lib/auth/get-user";
import { SETTLEMENT_DEFAULTS } from "@/lib/constants/settlement";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function SettlePage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;

	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect(`/operations/${projectId}`);
	}

	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select(
			`
			id, project_id, status, client_name, event_date, grand_total, discount_amount,
			crew_assignments:crew_assignments(role_in_event, fee_amount)
			`,
		)
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	// If already settled, redirect back to event detail (summary shown there)
	const { data: existingSettlement } = await supabase
		.from("event_settlements")
		.select("id")
		.eq("event_id", event.id)
		.maybeSingle();

	if (existingSettlement) {
		redirect(`/operations/${projectId}`);
	}

	// Status gate
	if (
		event.status !== "in_progress" &&
		event.status !== "awaiting_settlement"
	) {
		return (
			<div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 md:px-8">
				<Link
					href={`/operations/${projectId}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{projectId}
				</Link>
				<div className="border-border bg-card flex items-start gap-3 rounded-xl border p-5">
					<Lock className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
					<div className="space-y-1">
						<h2 className="text-base font-semibold">
							Settlement belum bisa dibuka
						</h2>
						<p className="text-muted-foreground text-sm">
							Status event sekarang{" "}
							<code className="font-mono">{event.status}</code>. Pindah ke{" "}
							<code className="font-mono">in_progress</code> atau{" "}
							<code className="font-mono">awaiting_settlement</code> dulu via
							tombol status di event detail.
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Load sinking funds + active owners count (in parallel)
	const [{ data: fundsData }, { count: ownerCount }] = await Promise.all([
		supabase
			.from("sinking_funds")
			.select("id, code, name, allocation_type, allocation_value")
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
		supabase
			.from("users")
			.select("id", { count: "exact", head: true })
			.in("role", ["super_admin", "owner"])
			.eq("is_active", true),
	]);

	const funds = (fundsData ?? []) as SinkingFundConfig[];

	// Resolve crew fees from assignments
	const assignments = (event.crew_assignments ?? []) as Array<{
		role_in_event: string;
		fee_amount: number;
	}>;
	const feeBy = (role: string) =>
		assignments.find((a) => a.role_in_event === role)?.fee_amount ?? 0;

	const defaults = {
		revenue_gross: event.grand_total ?? 0,
		discount_total: event.discount_amount ?? 0,
		fee_lead: feeBy("lead"),
		fee_asisten: feeBy("asisten"),
		fee_crew_c: feeBy("crew_c"),
		platform_fee: SETTLEMENT_DEFAULTS.PLATFORM_FEE_DEFAULT,
		owner_pool_per_person: SETTLEMENT_DEFAULTS.OWNER_POOL_PER_PERSON,
	};

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-2">
				<Link
					href={`/operations/${projectId}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{projectId}
				</Link>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Settle Event
					</h1>
					<p className="text-muted-foreground text-sm">
						{event.client_name} · {formatDateID(event.event_date)} · Grand Total{" "}
						<span className="tabular">
							{formatRupiah(event.grand_total ?? 0)}
						</span>
					</p>
				</div>
			</div>

			<SettlementForm
				eventId={event.id}
				projectId={projectId}
				defaults={defaults}
				sinkingFunds={funds}
				ownerCount={ownerCount ?? 0}
			/>
		</div>
	);
}
