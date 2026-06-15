import { FileSpreadsheet, Users } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	type ContactRow,
	ContactsListTable,
} from "@/components/contacts/contacts-list-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { createClient } from "@/lib/supabase/server";

const TYPE_LABELS: Record<string, string> = {
	booker: "Booker",
	client: "Client",
	pic_event: "PIC Event",
	vendor: "Vendor",
	other: "Lainnya",
};

export default async function ContactsListPage({
	searchParams,
}: {
	searchParams: Promise<{ type?: string; q?: string }>;
}) {
	const params = await searchParams;
	const typeFilter = params.type?.trim() || "";
	const q = params.q?.trim() || "";

	const supabase = await createClient();
	let query = supabase
		.from("contacts")
		.select("id, legacy_contact_id, type, name, phone, email, notes, is_active")
		.eq("is_active", true)
		.order("type", { ascending: true, nullsFirst: false })
		.order("name", { ascending: true })
		.limit(500);

	if (typeFilter) query = query.eq("type", typeFilter);
	if (q) query = query.ilike("name", `%${q}%`);

	const { data, error } = await query;
	if (error) {
		return (
			<div className="rounded-md border border-destructive bg-destructive/10 p-4">
				<p className="text-fluid-body font-medium text-destructive">
					Gagal memuat contacts: {error.message}
				</p>
			</div>
		);
	}

	const contacts = (data ?? []) as ContactRow[];
	const counts = contacts.reduce<Record<string, number>>((acc, c) => {
		const k = c.type ?? "other";
		acc[k] = (acc[k] ?? 0) + 1;
		return acc;
	}, {});

	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				as="h1"
				title="Kontak"
				description="Master kontak: bookers, clients, PIC event, vendor. Diresolve otomatis saat import projects via Contact_ID legacy."
				actions={
					<Link
						href="/contacts/import"
						className={buttonVariants({ variant: "default", size: "sm" })}
					>
						<FileSpreadsheet className="size-4" />
						<span className="hidden sm:inline">Impor</span>
					</Link>
				}
			/>

			<div className="flex flex-wrap items-center gap-2">
				<form
					method="get"
					action="/contacts"
					className="relative min-w-[200px] flex-1 sm:max-w-xs"
				>
					<FilterSearchInput
						className="w-full"
						name="q"
						defaultValue={q}
						placeholder="Cari nama…"
					/>
					{typeFilter && <input type="hidden" name="type" value={typeFilter} />}
				</form>
				<div className="flex flex-wrap items-center gap-1.5">
					<TypeChip
						label="Semua"
						href="/contacts"
						active={!typeFilter}
						count={contacts.length}
					/>
					{Object.entries(TYPE_LABELS).map(([k, label]) => (
						<TypeChip
							key={k}
							label={label}
							href={`/contacts?type=${k}`}
							active={typeFilter === k}
							count={counts[k] ?? 0}
						/>
					))}
				</div>
			</div>

			{contacts.length === 0 ? (
				<EmptyState
					icon={Users}
					title="Belum ada kontak"
					description='Klik "Bulk Import" untuk paste DB_CONTACTS CSV.'
				/>
			) : (
				<ContactsListTable contacts={contacts} />
			)}
		</Container>
	);
}

function TypeChip({
	label,
	href,
	active,
	count,
}: {
	label: string;
	href: string;
	active: boolean;
	count: number;
}) {
	return (
		<Link
			href={href}
			className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-fluid-caption font-medium transition-colors duration-fast ease-out-expo ${
				active
					? "border-primary/40 bg-primary/10 text-primary"
					: "border-border-default bg-surface-2 text-muted-foreground hover:text-foreground"
			}`}
		>
			{label}
			{count > 0 && (
				<span className="tabular text-[10px] opacity-60">({count})</span>
			)}
		</Link>
	);
}
