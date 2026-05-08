import { ChevronLeft, ClipboardList, Lock } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
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
			<Container size="sm" className="space-y-4">
				<Link
					href={`/operations/${projectId}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{projectId}
				</Link>
				<div className="border-border-default bg-surface-2 flex items-start gap-3 rounded-xl border p-5">
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
			</Container>
		);
	}

	// Load sinking funds + active owners count + rekap (in parallel)
	const [{ data: fundsData }, { count: ownerCount }, { data: rekap }] =
		await Promise.all([
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
			supabase
				.from("crew_rekap")
				.select(
					`cetak_total, media_set_used, sleeve_used,
					flashdisk_used, pouch_used, photomagnet_used, keychain_used,
					is_approved`,
				)
				.eq("event_id", event.id)
				.maybeSingle(),
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
		<Container size="sm" className="space-y-6">
			<div className="space-y-2">
				<Link
					href={`/operations/${projectId}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{projectId}
				</Link>
				<SectionHeader
					title="Settle Event"
					description={
						<>
							{event.client_name} · {formatDateID(event.event_date)} · Grand
							Total{" "}
							<span className="tabular">
								{formatRupiah(event.grand_total ?? 0)}
							</span>
						</>
					}
				/>
			</div>

			{rekap ? (
				<div
					className={`rounded-md border p-3 ${
						rekap.is_approved
							? "border-emerald-500/30 bg-emerald-500/10"
							: "border-amber-500/30 bg-amber-500/10"
					}`}
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p
							className={`inline-flex items-center gap-1.5 text-sm font-medium ${
								rekap.is_approved
									? "text-emerald-700 dark:text-emerald-300"
									: "text-amber-700 dark:text-amber-300"
							}`}
						>
							<ClipboardList className="h-3.5 w-3.5" />
							Rekap{" "}
							{rekap.is_approved
								? "approved"
								: rekap.is_approved === false
									? "perlu revisi"
									: "menunggu review"}
						</p>
						<Link
							href={`/operations/${projectId}/rekap`}
							className="text-foreground text-xs underline-offset-2 hover:underline"
						>
							Buka rekap →
						</Link>
					</div>
					<dl className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-7">
						<RekapTinyStat label="Cetak" value={rekap.cetak_total} />
						<RekapTinyStat label="Media" value={rekap.media_set_used} />
						<RekapTinyStat label="Sleeve" value={rekap.sleeve_used} />
						<RekapTinyStat label="FD" value={rekap.flashdisk_used} />
						<RekapTinyStat label="Pouch" value={rekap.pouch_used} />
						<RekapTinyStat label="Magnet" value={rekap.photomagnet_used} />
						<RekapTinyStat label="Keychain" value={rekap.keychain_used} />
					</dl>
					<p className="text-muted-foreground mt-2 text-xs">
						Pakai angka qty di atas × harga avg di Warehouse untuk isi HPP.
					</p>
				</div>
			) : (
				<div className="border-border-default bg-muted/40 flex items-baseline justify-between gap-2 rounded-md border p-3">
					<p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
						<ClipboardList className="h-3.5 w-3.5" />
						Belum ada rekap untuk event ini
					</p>
					<Link
						href={`/operations/${projectId}/rekap`}
						className="text-primary text-xs font-medium underline-offset-2 hover:underline"
					>
						Input rekap →
					</Link>
				</div>
			)}

			<SettlementForm
				eventId={event.id}
				projectId={projectId}
				defaults={defaults}
				sinkingFunds={funds}
				ownerCount={ownerCount ?? 0}
			/>
		</Container>
	);
}

function RekapTinyStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="space-y-0">
			<dt className="text-muted-foreground text-[9px] uppercase tracking-wider">
				{label}
			</dt>
			<dd className="tabular text-foreground text-sm font-semibold">
				{value.toLocaleString("id-ID")}
			</dd>
		</div>
	);
}
