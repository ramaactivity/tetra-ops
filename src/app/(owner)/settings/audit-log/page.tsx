import { ChevronLeft, ChevronRight, History } from "lucide-react";
import Link from "next/link";
import { AuditFilterBar } from "@/components/audit-log/audit-filter-bar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

type AuditRow = {
	id: string;
	actor_id: string | null;
	actor_email: string | null;
	action: string;
	entity_type: string;
	entity_id: string | null;
	changes: Record<string, unknown> | null;
	metadata: Record<string, unknown> | null;
	created_at: string;
	actor: { full_name: string } | null;
};

const ACTION_TONE: Record<string, "default" | "secondary" | "destructive"> = {
	insert: "default",
	create: "default",
	settlement_close: "default",
	update: "secondary",
	delete: "destructive",
	settlement_reopen: "destructive",
	role_change: "secondary",
};

function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString("id-ID", {
		dateStyle: "short",
		timeStyle: "short",
	});
}

function summarizeMetadata(meta: Record<string, unknown> | null): string {
	if (!meta || Object.keys(meta).length === 0) return "";
	// Cherry-pick a few human-friendly keys
	const parts: string[] = [];
	if (meta.project_id) parts.push(`project=${String(meta.project_id)}`);
	if (meta.net_profit !== undefined) {
		parts.push(`profit=${Number(meta.net_profit).toLocaleString("id-ID")}`);
	}
	if (meta.is_loss) parts.push("LOSS");
	if (meta.reason) parts.push(`reason="${String(meta.reason)}"`);
	if (parts.length > 0) return parts.join(" · ");
	return JSON.stringify(meta).slice(0, 80);
}

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

	// Build filtered query
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

	// Distinct values for filter dropdowns (top 200 rows scan — sufficient for MVP)
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
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
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
				<h2 className="text-xl font-semibold tracking-tight">Audit Log</h2>
				<p className="text-muted-foreground text-sm">
					Riwayat perubahan data penting (event, payment, settlement, user
					role).{" "}
					<span className="text-foreground font-medium">
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
				<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
					<History className="text-muted-foreground h-10 w-10" />
					<div className="space-y-1">
						<h3 className="font-medium">Tidak ada entri</h3>
						<p className="text-muted-foreground text-sm">
							{action || entity
								? "Coba ubah atau hapus filter."
								: "Belum ada audit yang ter-capture."}
						</p>
					</div>
				</div>
			) : (
				<div className="border-border bg-card overflow-x-auto rounded-lg border">
					<table className="w-full">
						<thead className="border-border bg-muted/30 border-b">
							<tr className="text-muted-foreground text-xs uppercase tracking-wider">
								<th className="px-3 py-2 text-left font-medium">Waktu</th>
								<th className="px-3 py-2 text-left font-medium">Actor</th>
								<th className="px-3 py-2 text-left font-medium">Action</th>
								<th className="px-3 py-2 text-left font-medium">Entity</th>
								<th className="px-3 py-2 text-left font-medium">Detail</th>
							</tr>
						</thead>
						<tbody className="divide-border divide-y">
							{rows.map((r) => {
								const actorName =
									r.actor?.full_name ?? r.actor_email ?? "system";
								const tone = ACTION_TONE[r.action] ?? "secondary";
								const meta = summarizeMetadata(r.metadata);
								return (
									<tr
										key={r.id}
										className="hover:bg-muted/30 text-sm transition-colors"
									>
										<td className="text-muted-foreground tabular px-3 py-2 text-xs whitespace-nowrap">
											{formatDateTime(r.created_at)}
										</td>
										<td className="px-3 py-2 whitespace-nowrap">
											<div className="font-medium">{actorName}</div>
											{r.actor_email && r.actor && (
												<div className="text-muted-foreground text-xs">
													{r.actor_email}
												</div>
											)}
										</td>
										<td className="px-3 py-2">
											<Badge variant={tone}>{r.action}</Badge>
										</td>
										<td className="px-3 py-2">
											<div className="font-mono text-xs">{r.entity_type}</div>
											{r.entity_id && (
												<div className="text-muted-foreground/70 truncate font-mono text-[10px]">
													{r.entity_id.slice(0, 8)}…
												</div>
											)}
										</td>
										<td className="text-muted-foreground max-w-md px-3 py-2 text-xs">
											{meta || (
												<span className="text-muted-foreground/60 italic">
													—
												</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{totalPages > 1 && (
				<div className="flex items-center justify-between gap-3 pt-2">
					<p className="text-muted-foreground text-xs">
						Halaman <span className="text-foreground font-medium">{page}</span>{" "}
						dari {totalPages} ·{" "}
						{((page - 1) * PAGE_SIZE + 1).toLocaleString("id-ID")}–
						{Math.min(page * PAGE_SIZE, totalCount).toLocaleString("id-ID")}{" "}
						dari {totalCount.toLocaleString("id-ID")}
					</p>
					<div className="flex items-center gap-1">
						{page > 1 ? (
							<Link
								href={buildPageHref(page - 1)}
								className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium"
							>
								<ChevronLeft className="h-3.5 w-3.5" /> Prev
							</Link>
						) : (
							<button
								type="button"
								disabled
								className="border-border bg-card text-muted-foreground inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium opacity-50"
							>
								<ChevronLeft className="h-3.5 w-3.5" /> Prev
							</button>
						)}
						{page < totalPages ? (
							<Link
								href={buildPageHref(page + 1)}
								className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium"
							>
								Next <ChevronRight className="h-3.5 w-3.5" />
							</Link>
						) : (
							<button
								type="button"
								disabled
								className="border-border bg-card text-muted-foreground inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium opacity-50"
							>
								Next <ChevronRight className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
