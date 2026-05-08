import { ChevronLeft, ChevronRight, History } from "lucide-react";
import Link from "next/link";
import { AuditFilterBar } from "@/components/audit-log/audit-filter-bar";
import {
	AuditListTable,
	type AuditRow,
} from "@/components/audit-log/audit-list-table";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

export default async function AuditLogPage({
	searchParams,
}: {
	searchParams: Promise<{ action?: string; entity?: string; page?: string }>;
}) {
	const params = await searchParams;
	const action = params.action?.trim() || "";
	const entity = params.entity?.trim() || "";
	const page = Math.max(1, Number(params.page ?? 1) || 1);
	const offset = (page - 1) * PAGE_SIZE;

	const supabase = await createClient();

	let query = supabase
		.from("audit_log")
		.select(
			`
			id, actor_id, actor_email, action, entity_type, entity_id,
			changes, metadata, created_at,
			actor:users!audit_log_actor_id_fkey(full_name)
		`,
			{ count: "exact" },
		)
		.order("created_at", { ascending: false })
		.range(offset, offset + PAGE_SIZE - 1);

	if (action) query = query.eq("action", action);
	if (entity) query = query.eq("entity_type", entity);

	const [{ data: rowsData, count, error }, { data: distinctData }] =
		await Promise.all([
			query,
			supabase
				.from("audit_log")
				.select("action, entity_type")
				.order("created_at", { ascending: false })
				.limit(500),
		]);

	if (error) {
		return (
			<div className="rounded-md border border-destructive bg-destructive/10 p-4">
				<p className="text-fluid-body font-medium text-destructive">
					Gagal memuat audit log: {error.message}
				</p>
			</div>
		);
	}

	const rows = (rowsData ?? []).map((r) => ({
		...r,
		actor: Array.isArray(r.actor) ? r.actor[0] : r.actor,
	})) as AuditRow[];

	const distinct = (distinctData ?? []) as Array<{
		action: string;
		entity_type: string;
	}>;
	const actions = Array.from(new Set(distinct.map((d) => d.action))).sort();
	const entityTypes = Array.from(
		new Set(distinct.map((d) => d.entity_type)),
	).sort();

	const totalCount = count ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const buildPageHref = (p: number) => {
		const sp = new URLSearchParams();
		if (action) sp.set("action", action);
		if (entity) sp.set("entity", entity);
		if (p > 1) sp.set("page", String(p));
		const qs = sp.toString();
		return `/settings/audit-log${qs ? `?${qs}` : ""}`;
	};

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h2 className="text-fluid-h2 font-semibold tracking-tight">
					Audit Log
				</h2>
				<p className="text-fluid-caption text-muted-foreground">
					Riwayat perubahan data penting (event, payment, settlement, user
					role).{" "}
					<span className="font-medium text-foreground">
						{totalCount.toLocaleString("id-ID")}
					</span>{" "}
					entri.
				</p>
			</div>

			<AuditFilterBar
				actions={actions}
				entityTypes={entityTypes}
				defaultAction={action}
				defaultEntity={entity}
			/>

			{rows.length === 0 ? (
				<EmptyState
					icon={History}
					title="Tidak ada entri"
					description={
						action || entity
							? "Coba ubah atau hapus filter."
							: "Belum ada audit yang ter-capture."
					}
				/>
			) : (
				<AuditListTable rows={rows} />
			)}

			{totalPages > 1 && (
				<div className="flex items-center justify-between gap-3 pt-2">
					<p className="text-fluid-caption text-muted-foreground">
						Halaman{" "}
						<span className="font-medium text-foreground">{page}</span> dari{" "}
						{totalPages} ·{" "}
						{((page - 1) * PAGE_SIZE + 1).toLocaleString("id-ID")}–
						{Math.min(page * PAGE_SIZE, totalCount).toLocaleString("id-ID")}{" "}
						dari {totalCount.toLocaleString("id-ID")}
					</p>
					<div className="flex items-center gap-1">
						{page > 1 ? (
							<Link
								href={buildPageHref(page - 1)}
								className="inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium transition-colors hover:bg-surface-3"
							>
								<ChevronLeft className="size-3.5" /> Prev
							</Link>
						) : (
							<button
								type="button"
								disabled
								className="inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium text-muted-foreground opacity-50"
							>
								<ChevronLeft className="size-3.5" /> Prev
							</button>
						)}
						{page < totalPages ? (
							<Link
								href={buildPageHref(page + 1)}
								className="inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium transition-colors hover:bg-surface-3"
							>
								Next <ChevronRight className="size-3.5" />
							</Link>
						) : (
							<button
								type="button"
								disabled
								className="inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium text-muted-foreground opacity-50"
							>
								Next <ChevronRight className="size-3.5" />
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
