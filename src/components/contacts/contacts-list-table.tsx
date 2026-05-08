"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";

/**
 * <ContactsListTable /> — client wrapper for settings/contacts.
 */

export type ContactRow = {
	id: string;
	legacy_contact_id: string | null;
	type: string | null;
	name: string;
	phone: string | null;
	email: string | null;
	notes: string | null;
	is_active: boolean;
};

const TYPE_LABELS: Record<string, string> = {
	booker: "Booker",
	client: "Client",
	pic_event: "PIC Event",
	vendor: "Vendor",
	other: "Lainnya",
};

const TYPE_TONES: Record<string, string> = {
	booker:
		"border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	client:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	pic_event:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	vendor:
		"border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function ContactsListTable({ contacts }: { contacts: ContactRow[] }) {
	const columns: ResponsiveTableColumn<ContactRow>[] = [
		{
			key: "name",
			header: "Name",
			render: (c) => <span className="font-medium">{c.name}</span>,
		},
		{
			key: "type",
			header: "Type",
			render: (c) =>
				c.type ? (
					<Badge
						variant="outline"
						className={TYPE_TONES[c.type] ?? "text-muted-foreground"}
					>
						{TYPE_LABELS[c.type] ?? c.type}
					</Badge>
				) : (
					<span className="text-fluid-caption text-muted-foreground">—</span>
				),
		},
		{
			key: "phone",
			header: "Phone / WA",
			render: (c) =>
				c.phone ? (
					<a
						href={`https://wa.me/${c.phone.replace(/^\+|^0/, "62")}`}
						target="_blank"
						rel="noopener noreferrer"
						className="tabular inline-flex items-center gap-1 text-fluid-caption text-primary hover:underline"
					>
						{c.phone}
						<ExternalLink className="size-3" />
					</a>
				) : (
					<span className="text-fluid-caption text-muted-foreground">—</span>
				),
		},
		{
			key: "email",
			header: "Email",
			hideOnMobile: true,
			render: (c) => (
				<span className="text-fluid-caption text-muted-foreground">
					{c.email ?? "—"}
				</span>
			),
		},
		{
			key: "legacy_contact_id",
			header: "Legacy ID",
			hideOnMobile: true,
			render: (c) => (
				<span className="tabular font-mono text-fluid-caption text-muted-foreground">
					{c.legacy_contact_id ?? "—"}
				</span>
			),
		},
		{
			key: "notes",
			header: "Notes",
			hideOnMobile: true,
			render: (c) => (
				<span className="line-clamp-2 max-w-xs text-fluid-caption text-muted-foreground">
					{c.notes ?? "—"}
				</span>
			),
		},
	];

	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
			<ResponsiveTable<ContactRow>
				keyExtractor={(c) => c.id}
				rows={contacts}
				columns={columns}
			/>
		</div>
	);
}
