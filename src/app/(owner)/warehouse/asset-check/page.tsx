import {
	AlertTriangle,
	CheckCircle2,
	ChevronRight,
	Pencil,
	Wrench,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteAssetCheckButton } from "@/components/warehouse/delete-asset-check-button";
import { NewAssetCheckButton } from "@/components/warehouse/new-asset-check-button";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const STATUS_TONE: Record<string, string> = {
	draft:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	committed:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	cancelled: "border-border-default bg-surface-3 text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
	draft: "Sedang Dicek",
	committed: "Selesai",
	cancelled: "Dibatalkan",
};

type FilterKey = "active" | "all" | "committed" | "cancelled";

const TABS: ReadonlyArray<{ key: FilterKey; label: string }> = [
	{ key: "active", label: "Berjalan" },
	{ key: "all", label: "Semua" },
	{ key: "committed", label: "Selesai" },
	{ key: "cancelled", label: "Dibatalkan" },
];

export default async function AssetCheckListPage({
	searchParams,
}: {
	searchParams: Promise<{ filter?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/warehouse");
	}

	const { filter: filterRaw } = await searchParams;
	const filter: FilterKey = (
		["active", "all", "committed", "cancelled"] as const
	).includes(filterRaw as FilterKey)
		? (filterRaw as FilterKey)
		: "active";

	const supabase = await createClient();
	const { data: checks } = await supabase
		.from("asset_checks")
		.select(
			`id, taken_at, notes, status, committed_at,
			 checked_by_user:users!asset_checks_checked_by_fkey(full_name),
			 lines:asset_check_lines(item_id, result)`,
		)
		.order("taken_at", { ascending: false })
		.limit(100);

	type RawCheck = {
		id: string;
		taken_at: string;
		notes: string | null;
		status: string;
		committed_at: string | null;
		checked_by_user:
			| { full_name: string | null }
			| Array<{ full_name: string | null }>
			| null;
		lines: Array<{ item_id: string; result: string | null }> | null;
	};

	const allRows = ((checks ?? []) as RawCheck[]).map((c) => {
		const u = Array.isArray(c.checked_by_user)
			? c.checked_by_user[0]
			: c.checked_by_user;
		const lines = c.lines ?? [];
		return {
			id: c.id,
			taken_at: c.taken_at,
			notes: c.notes,
			status: c.status,
			committed_at: c.committed_at,
			checked_by_name: u?.full_name ?? "—",
			total_lines: lines.length,
			checked_lines: lines.filter((l) => l.result !== null).length,
			issue_lines: lines.filter(
				(l) => l.result === "rusak" || l.result === "hilang",
			).length,
		};
	});

	const rows =
		filter === "all"
			? allRows
			: allRows.filter((r) =>
					filter === "active" ? r.status === "draft" : r.status === filter,
				);

	const draftCount = allRows.filter((c) => c.status === "draft").length;
	const lastCommitted = allRows.find((c) => c.status === "committed");
	const daysSinceLast = lastCommitted?.committed_at
		? Math.floor(
				(Date.now() - new Date(lastCommitted.committed_at).getTime()) /
					86_400_000,
			)
		: null;

	const counts = {
		active: draftCount,
		all: allRows.length,
		committed: allRows.filter((c) => c.status === "committed").length,
		cancelled: allRows.filter((c) => c.status === "cancelled").length,
	};

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Cek Alat"
				description="Cek fisik peralatan secara rutin: alatnya masih ada, rusak, atau hilang. Hasilnya langsung memperbarui kondisi di register aset — tanpa angka stok, tanpa hitungan."
				actions={<NewAssetCheckButton />}
			/>

			<KpiRow className="lg:grid-cols-3">
				<KpiCard
					label="Cek Terakhir"
					value={
						daysSinceLast === null
							? "Belum pernah"
							: daysSinceLast === 0
								? "Hari ini"
								: `${daysSinceLast} hari lalu`
					}
					hint={
						daysSinceLast !== null && daysSinceLast > 30
							? "sudah lewat sebulan — saatnya cek lagi"
							: daysSinceLast === null
								? "idealnya sebulan sekali"
								: `selesai ${formatDateID(lastCommitted?.committed_at ?? "")}`
					}
					icon={CheckCircle2}
					accent={
						daysSinceLast === null || daysSinceLast > 30 ? "amber" : "emerald"
					}
				/>
				<KpiCard
					label="Sedang Berjalan"
					value={draftCount.toLocaleString("id-ID")}
					hint={
						draftCount === 0
							? "tidak ada cek yang menggantung"
							: "lanjutkan dan selesaikan"
					}
					icon={Pencil}
					accent={draftCount > 0 ? "amber" : "default"}
				/>
				<KpiCard
					label="Bermasalah Terakhir"
					value={
						lastCommitted
							? `${lastCommitted.issue_lines.toLocaleString("id-ID")} alat`
							: "—"
					}
					hint={
						lastCommitted
							? lastCommitted.issue_lines === 0
								? "semua alat ada & baik di cek terakhir"
								: "rusak / hilang di cek terakhir"
							: "belum ada cek selesai"
					}
					icon={AlertTriangle}
					accent={
						lastCommitted && lastCommitted.issue_lines > 0 ? "rose" : "default"
					}
				/>
			</KpiRow>

			<div className="inline-flex h-8 items-center gap-0.5 rounded-full border border-border-subtle bg-card p-0.5 shadow-[var(--shadow-level-1)]">
				{TABS.map((t) => {
					const active = t.key === filter;
					const href =
						t.key === "active"
							? "/warehouse/asset-check"
							: `/warehouse/asset-check?filter=${t.key}`;
					return (
						<Link
							key={t.key}
							href={href}
							className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
								active
									? "bg-[#059669] text-white"
									: "text-muted-foreground hover:bg-secondary hover:text-foreground"
							}`}
							aria-pressed={active}
						>
							{t.label}
							<span
								className={`tabular text-[10px] ${
									active ? "opacity-80" : "text-muted-foreground/70"
								}`}
							>
								{counts[t.key]}
							</span>
						</Link>
					);
				})}
			</div>

			{rows.length === 0 ? (
				<EmptyState
					icon={Wrench}
					title={
						filter === "active"
							? "Tidak ada cek alat yang sedang berjalan"
							: filter === "committed"
								? "Belum ada cek alat yang selesai"
								: filter === "cancelled"
									? "Tidak ada cek alat yang dibatalkan"
									: "Belum pernah cek alat"
					}
					description="Klik Mulai Cek Alat, lalu tandai tiap peralatan: Ada, Rusak, atau Hilang. Riwayat yang sudah selesai bisa dilihat di tab Semua."
				/>
			) : (
				<div className="space-y-3">
					{rows.map((r) => (
						<div
							key={r.id}
							className="flex items-center gap-3 rounded-lg border border-border-default bg-surface-2 p-3.5 transition-colors hover:bg-surface-3"
						>
							<Link
								href={`/warehouse/asset-check/${r.id}`}
								className="flex min-w-0 flex-1 items-center justify-between gap-3"
							>
								<div className="min-w-0 flex-1 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="tabular text-fluid-caption font-semibold text-foreground">
											{formatDateID(r.taken_at)}
										</span>
										<Badge
											variant="outline"
											className={STATUS_TONE[r.status] ?? ""}
										>
											{STATUS_LABEL[r.status] ?? r.status}
										</Badge>
										{r.issue_lines > 0 && (
											<Badge
												variant="outline"
												className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
											>
												{r.issue_lines} bermasalah
											</Badge>
										)}
									</div>
									<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
										<span>oleh {r.checked_by_name}</span>
										<span className="tabular">
											{r.checked_lines}/{r.total_lines} dicek
										</span>
										{r.notes ? <span className="italic">{r.notes}</span> : null}
									</div>
								</div>
								<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
							</Link>
							{r.status === "cancelled" && (
								<DeleteAssetCheckButton checkId={r.id} />
							)}
						</div>
					))}
				</div>
			)}
		</Container>
	);
}
