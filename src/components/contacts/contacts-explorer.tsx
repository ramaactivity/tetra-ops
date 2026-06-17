"use client";

import { ExternalLink, Users } from "lucide-react";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import { Badge } from "@/components/ui/badge";

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

function typeLabel(t: string) {
	return TYPE_LABELS[t] ?? t;
}

function waHref(phone: string) {
	return `https://wa.me/${phone.replace(/^\+|^0/, "62")}`;
}

const columns: CatalogColumn<ContactRow>[] = [
	{
		key: "name",
		header: "Nama",
		cell: (c) => <span className="text-foreground font-medium">{c.name}</span>,
	},
	{
		key: "type",
		header: "Tipe",
		cell: (c) =>
			c.type ? (
				<Badge variant="neutral">{typeLabel(c.type)}</Badge>
			) : (
				<span className="text-muted-foreground text-xs">—</span>
			),
	},
	{
		key: "phone",
		header: "Phone / WA",
		cell: (c) =>
			c.phone ? (
				<a
					href={waHref(c.phone)}
					target="_blank"
					rel="noopener noreferrer"
					className="tabular text-link inline-flex items-center gap-1 text-sm hover:underline"
				>
					{c.phone}
					<ExternalLink className="size-3" />
				</a>
			) : (
				<span className="text-muted-foreground">—</span>
			),
	},
	{
		key: "email",
		header: "Email",
		cell: (c) => (
			<span className="text-muted-foreground text-sm">{c.email ?? "—"}</span>
		),
	},
	{
		key: "legacy_contact_id",
		header: "Legacy ID",
		cardLabel: "Legacy ID",
		cell: (c) => (
			<span className="tabular text-muted-foreground font-mono text-xs">
				{c.legacy_contact_id ?? "—"}
			</span>
		),
	},
	{
		key: "notes",
		header: "Notes",
		cell: (c) => (
			<span className="text-muted-foreground line-clamp-2 max-w-xs text-sm">
				{c.notes ?? "—"}
			</span>
		),
	},
];

export function ContactsExplorer({
	contacts,
	initialType,
}: {
	contacts: ContactRow[];
	initialType?: string;
}) {
	return (
		<CatalogExplorer
			rows={contacts}
			columns={columns}
			getId={(c) => c.id}
			titleKey="name"
			cardSubtitle={(c) => (c.type ? typeLabel(c.type) : null)}
			searchText={(c) =>
				`${c.name} ${c.phone ?? ""} ${c.email ?? ""} ${c.legacy_contact_id ?? ""} ${c.notes ?? ""}`
			}
			searchPlaceholder="Cari nama, telepon…"
			getCategory={(c) => c.type ?? "other"}
			categoryLabel={typeLabel}
			initialCategory={initialType}
			emptyIcon={Users}
			emptyTitle="Belum ada kontak"
			emptyDescription="Impor DB_CONTACTS CSV untuk mengisi master kontak."
		/>
	);
}
