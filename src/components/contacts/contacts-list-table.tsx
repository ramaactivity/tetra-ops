"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { waLink } from "@/lib/whatsapp";

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

// Contact type badges share neutral chrome — type signal carried by
// label text only. DESIGN.md §867 forbids decorative color
// categorization (previous sky/emerald/amber/violet palette removed).
const TYPE_TONES: Record<string, string> = {
	booker: "border-border-default bg-secondary text-foreground/85",
	client: "border-border-default bg-secondary text-foreground/85",
	pic_event: "border-border-default bg-secondary text-foreground/85",
	vendor: "border-border-default bg-secondary text-foreground/85",
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
						href={waLink(c.phone) ?? undefined}
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
