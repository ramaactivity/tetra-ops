import { ExternalLink, FileSpreadsheet, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

const TYPE_LABELS: Record<string, string> = {
	booker: "Booker",
	client: "Client",
	pic_event: "PIC Event",
	vendor: "Vendor",
	other: "Lainnya",
};

const TYPE_TONES: Record<string, string> = {
	booker:
		"border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
	client:
		"border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
	pic_event:
		"border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
	vendor:
		"border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
};

type ContactRow = {
	id: string;
	legacy_contact_id: string | null;
	type: string | null;
	name: string;
	phone: string | null;
	email: string | null;
	notes: string | null;
	is_active: boolean;
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
		.select(
			"id, legacy_contact_id, type, name, phone, email, notes, is_active",
		)
		.eq("is_active", true)
		.order("type", { ascending: true, nullsFirst: false })
		.order("name", { ascending: true })
		.limit(500);

	if (typeFilter) query = query.eq("type", typeFilter);
	if (q) query = query.ilike("name", `%${q}%`);

	const { data, error } = await query;
	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
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
		<div className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">Contacts</h2>
					<p className="text-muted-foreground text-sm">
						Master kontak: bookers, clients, PIC event, vendor. Diresolve
						otomatis saat import projects via Contact_ID legacy.
					</p>
				</div>
				<Link
					href="/settings/contacts/import"
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
				>
					<FileSpreadsheet className="h-4 w-4" />
					Bulk Import
				</Link>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<form
					method="get"
					action="/settings/contacts"
					className="relative min-w-[200px] flex-1 sm:max-w-xs"
				>
					<input
						type="search"
						name="q"
						defaultValue={q}
						placeholder="Cari nama…"
						className="border-border bg-card focus-visible:ring-ring placeholder:text-muted-foreground/60 h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
					/>
					{typeFilter && <input type="hidden" name="type" value={typeFilter} />}
				</form>
				<div className="flex flex-wrap items-center gap-1.5">
					<TypeChip
						label="Semua"
						href="/settings/contacts"
						active={!typeFilter}
						count={contacts.length}
					/>
					{Object.entries(TYPE_LABELS).map(([k, label]) => (
						<TypeChip
							key={k}
							label={label}
							href={`/settings/contacts?type=${k}`}
							active={typeFilter === k}
							count={counts[k] ?? 0}
						/>
					))}
				</div>
			</div>

			{contacts.length === 0 ? (
				<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
					<Users className="text-muted-foreground h-8 w-8" />
					<div className="space-y-1">
						<p className="font-medium">Belum ada contacts</p>
						<p className="text-muted-foreground text-sm">
							Klik "Bulk Import" untuk paste DB_CONTACTS CSV.
						</p>
					</div>
				</div>
			) : (
				<div className="border-border bg-card overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Phone / WA</TableHead>
								<TableHead>Email</TableHead>
								<TableHead className="tabular text-xs">Legacy ID</TableHead>
								<TableHead>Notes</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{contacts.map((c) => (
								<TableRow key={c.id}>
									<TableCell className="font-medium">{c.name}</TableCell>
									<TableCell>
										{c.type ? (
											<Badge
												variant="outline"
												className={
													TYPE_TONES[c.type] ?? "text-muted-foreground"
												}
											>
												{TYPE_LABELS[c.type] ?? c.type}
											</Badge>
										) : (
											<span className="text-muted-foreground text-xs">—</span>
										)}
									</TableCell>
									<TableCell className="tabular text-sm">
										{c.phone ? (
											<a
												href={`https://wa.me/${c.phone.replace(/^\+|^0/, "62")}`}
												target="_blank"
												rel="noopener noreferrer"
												className="text-primary inline-flex items-center gap-1 hover:underline"
											>
												{c.phone}
												<ExternalLink className="h-3 w-3" />
											</a>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{c.email ?? "—"}
									</TableCell>
									<TableCell className="text-muted-foreground tabular font-mono text-xs">
										{c.legacy_contact_id ?? "—"}
									</TableCell>
									<TableCell className="text-muted-foreground max-w-xs truncate text-sm">
										{c.notes ?? "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
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
			className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
				active
					? "border-primary/40 bg-primary/10 text-primary"
					: "border-border bg-card text-muted-foreground hover:text-foreground"
			}`}
		>
			{label}
			{count > 0 && (
				<span className="tabular text-[10px] opacity-60">({count})</span>
			)}
		</Link>
	);
}
