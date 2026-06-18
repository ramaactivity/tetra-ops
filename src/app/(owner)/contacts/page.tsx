import { Briefcase, FileSpreadsheet, Handshake, Users } from "lucide-react";
import Link from "next/link";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import {
	type ContactRow,
	ContactsExplorer,
} from "@/components/contacts/contacts-explorer";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function ContactsListPage({
	searchParams,
}: {
	searchParams: Promise<{ type?: string }>;
}) {
	const { type } = await searchParams;
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("contacts")
		.select("id, legacy_contact_id, type, name, phone, email, notes, is_active")
		.eq("is_active", true)
		.order("type", { ascending: true, nullsFirst: false })
		.order("name", { ascending: true })
		.limit(500);

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

	const stats: StatItem[] = [
		{
			label: "Total Kontak",
			value: String(contacts.length),
			hint: "kontak aktif",
			icon: Users,
		},
		{
			label: "Booker",
			value: String(counts.booker ?? 0),
			hint: "pemesan",
			icon: Briefcase,
		},
		{
			label: "Client",
			value: String(counts.client ?? 0),
			hint: "klien akhir",
			icon: Users,
			accent: "info",
		},
		{
			label: "Vendor",
			value: String(counts.vendor ?? 0),
			hint: "partner organizer",
			icon: Handshake,
			accent: "emerald",
		},
	];

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				as="h1"
				eyebrow="Kontak"
				title="Daftar Kontak"
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

			<StatRow stats={stats} />

			<ContactsExplorer contacts={contacts} initialType={type?.trim()} />
		</Container>
	);
}
