"use client";

import { Badge } from "@/components/ui/badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";

/**
 * <AuditListTable /> — client wrapper for settings/audit-log.
 */

export type AuditRow = {
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

export function AuditListTable({ rows }: { rows: AuditRow[] }) {
	const columns: ResponsiveTableColumn<AuditRow>[] = [
		{
			key: "created_at",
			header: "Waktu",
			render: (r) => (
				<span className="tabular text-fluid-caption text-muted-foreground whitespace-nowrap">
					{formatDateTime(r.created_at)}
				</span>
			),
		},
		{
			key: "actor",
			header: "Actor",
			render: (r) => {
				const actorName = r.actor?.full_name ?? r.actor_email ?? "system";
				return (
					<div className="whitespace-nowrap">
						<div className="font-medium">{actorName}</div>
						{r.actor_email && r.actor && (
							<div className="text-fluid-caption text-muted-foreground">
								{r.actor_email}
							</div>
						)}
					</div>
				);
			},
		},
		{
			key: "action",
			header: "Action",
			render: (r) => {
				const tone = ACTION_TONE[r.action] ?? "secondary";
				return <Badge variant={tone}>{r.action}</Badge>;
			},
		},
		{
			key: "entity",
			header: "Entity",
			render: (r) => (
				<div>
					<div className="font-mono text-fluid-caption">{r.entity_type}</div>
					{r.entity_id && (
						<div className="truncate font-mono text-[10px] text-muted-foreground/70">
							{r.entity_id.slice(0, 8)}…
						</div>
					)}
				</div>
			),
		},
		{
			key: "detail",
			header: "Detail",
			hideOnMobile: true,
			render: (r) => {
				const meta = summarizeMetadata(r.metadata);
				return (
					<span className="line-clamp-2 max-w-md text-fluid-caption text-muted-foreground">
						{meta || (
							<span className="italic text-muted-foreground/60">—</span>
						)}
					</span>
				);
			},
		},
	];

	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
			<ResponsiveTable<AuditRow>
				keyExtractor={(r) => r.id}
				rows={rows}
				columns={columns}
			/>
		</div>
	);
}
