"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import {
	type LeadRow,
	STATUS_BADGE,
	statusLabel,
	topicLabel,
	waMePhone,
} from "./leads-shared";
import { PauseContactButton } from "./pause-contact-button";

/**
 * <LeadsListTable /> — desktop table / mobile cards of WhatsApp bot leads.
 * Mirrors src/components/contacts/contacts-list-table.tsx.
 */

function formatReceived(iso: string): string {
	return new Date(iso).toLocaleString("id-ID", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function LeadsListTable({
	leads,
	canManage = false,
}: {
	leads: LeadRow[];
	/** Owner / super_admin → show the per-contact pause action. */
	canManage?: boolean;
}) {
	const columns: ResponsiveTableColumn<LeadRow>[] = [
		{
			key: "phone",
			header: "Nomor",
			width: "190px",
			render: (l) => (
				<a
					href={`https://wa.me/${waMePhone(l.phone)}`}
					target="_blank"
					rel="noopener noreferrer"
					className="tabular inline-flex items-center gap-1 font-medium text-primary hover:underline"
					onClick={(e) => e.stopPropagation()}
				>
					{l.phone}
					<ExternalLink className="size-3" aria-hidden />
				</a>
			),
		},
		{
			key: "name",
			header: "Nama",
			width: "160px",
			truncate: true,
			render: (l) =>
				l.name ? (
					<span className="font-medium">{l.name}</span>
				) : (
					<span className="text-fluid-caption text-muted-foreground">—</span>
				),
		},
		{
			key: "topic",
			header: "Topik",
			width: "120px",
			render: (l) => (
				<Badge variant="outline" className="font-medium">
					{topicLabel(l.topic)}
				</Badge>
			),
		},
		{
			key: "message",
			header: "Pesan",
			truncate: true,
			render: (l) => (
				<span className="text-fluid-caption text-muted-foreground">
					{l.message?.trim() || "—"}
				</span>
			),
		},
		{
			key: "received_at",
			header: "Waktu",
			width: "140px",
			render: (l) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{formatReceived(l.received_at)}
					{l.is_after_hours ? (
						<span className="ml-1 text-amber-600 dark:text-amber-500">
							• luar jam
						</span>
					) : null}
				</span>
			),
		},
		{
			key: "status",
			header: "Status",
			width: "120px",
			align: "right",
			render: (l) => (
				<Badge variant={STATUS_BADGE[l.status] ?? "neutral"}>
					{statusLabel(l.status)}
				</Badge>
			),
		},
	];

	if (canManage) {
		columns.push({
			key: "actions",
			header: "",
			mobileLabel: "Aksi",
			width: "90px",
			align: "right",
			render: (l) => (
				<PauseContactButton waJid={l.wa_jid} name={l.name || l.phone} />
			),
		});
	}

	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
			<ResponsiveTable<LeadRow>
				keyExtractor={(l) => l.id}
				rows={leads}
				columns={columns}
			/>
		</div>
	);
}
