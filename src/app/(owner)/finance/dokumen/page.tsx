import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { DocumentFilterBar } from "@/components/documents/document-filter-bar";
import {
	DocumentList,
	type DocumentListRow,
} from "@/components/documents/document-list";
import {
	type InvoiceEventOption,
	NewInvoiceDialog,
} from "@/components/documents/new-invoice-dialog";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TabNav } from "@/components/ui/tab-nav";
import { getCurrentUser } from "@/lib/auth/get-user";
import { DOC_TYPE_LABEL, DOC_TYPES, type DocType } from "@/lib/documents/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BASE = "/finance/dokumen";
const PAGE_SIZE = 60;

function currentYearMonth() {
	const t = new Date();
	return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}

export default async function DokumenPage({
	searchParams,
}: {
	searchParams: Promise<{
		type?: string;
		q?: string;
		status?: string;
		month?: string;
	}>;
}) {
	const sp = await searchParams;
	const me = await getCurrentUser();
	if (
		!me ||
		(me.profile.role !== "super_admin" && me.profile.role !== "owner")
	) {
		return (
			<Container size="lg">
				<EmptyState
					icon={FileText}
					title="Khusus owner"
					description="Dokumen klien hanya bisa diakses owner."
				/>
			</Container>
		);
	}

	const type = (DOC_TYPES as readonly string[]).includes(sp.type ?? "")
		? (sp.type as DocType)
		: "";
	const q = (sp.q ?? "").trim();
	const status = sp.status ?? "";
	const monthParam = sp.month?.trim() ?? "";
	const monthShowsAll = monthParam === "all";
	const month = monthShowsAll
		? ""
		: /^\d{4}-\d{2}$/.test(monthParam)
			? monthParam
			: currentYearMonth();

	const supabase = await createClient();
	let query = supabase
		.from("documents")
		.select(
			"id, doc_type, doc_number, client, items, discount, gross_up_enabled, gross_up_rate, issued_at, status, event_id, event:events(project_id, event_date)",
		)
		.order("created_at", { ascending: false })
		.limit(PAGE_SIZE);
	if (type) query = query.eq("doc_type", type);
	if (status) query = query.eq("status", status);
	if (month) {
		const [y, m] = month.split("-").map(Number);
		const last = new Date(y, m, 0).getDate();
		query = query
			.gte("issued_at", `${month}-01`)
			.lte("issued_at", `${month}-${String(last).padStart(2, "0")}`);
	}
	if (q) {
		const like = `%${q.replace(/[%_,]/g, "")}%`;
		query = query.or(
			`doc_number.ilike.${like},client->>name.ilike.${like},client->>org.ilike.${like}`,
		);
	}

	const [{ data: docs }, { data: counts }, { data: events }] =
		await Promise.all([
			query,
			supabase.from("documents").select("doc_type").neq("status", "void"),
			supabase
				.from("events")
				.select(
					"id, project_id, client_name, event_date, grand_total, documents(id, doc_type, status)",
				)
				.eq("is_migrated_legacy", false)
				.order("event_date", { ascending: false })
				.limit(150),
		]);

	const rows: DocumentListRow[] = (docs ?? []).map((d) => {
		const ev = Array.isArray(d.event) ? d.event[0] : d.event;
		return {
			...(d as unknown as Omit<
				DocumentListRow,
				"event_project_id" | "event_date"
			>),
			event_project_id:
				(ev as { project_id: string } | null)?.project_id ?? null,
			event_date: (ev as { event_date: string } | null)?.event_date ?? null,
		};
	});

	const countBy = new Map<string, number>();
	for (const c of counts ?? [])
		countBy.set(
			c.doc_type as string,
			(countBy.get(c.doc_type as string) ?? 0) + 1,
		);

	const eventOptions: InvoiceEventOption[] = (events ?? []).map((e) => ({
		id: e.id as string,
		project_id: e.project_id as string,
		client_name: e.client_name as string,
		event_date: e.event_date as string,
		grand_total: (e.grand_total as number) ?? 0,
		has_invoice: (
			(e.documents ?? []) as Array<{ doc_type: string; status: string }>
		).some((d) => d.doc_type === "invoice" && d.status !== "void"),
	}));

	const tabHref = (t: string) => {
		const p = new URLSearchParams();
		if (t) p.set("type", t);
		if (q) p.set("q", q);
		if (status) p.set("status", status);
		if (monthShowsAll) p.set("month", "all");
		else if (month !== currentYearMonth()) p.set("month", month);
		const s = p.toString();
		return s ? `${BASE}?${s}` : BASE;
	};

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Dokumen"
				actions={
					<div className="flex items-center gap-2">
						<NewInvoiceDialog events={eventOptions} />
						<Link
							href={`${BASE}/new`}
							className="inline-flex h-8 items-center gap-1.5 rounded-[12px] bg-[#059669] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#047857]"
						>
							<Plus className="size-4" /> Quotation
						</Link>
					</div>
				}
			/>

			<TabNav
				aria-label="Jenis dokumen"
				items={[
					{ label: "Semua", href: tabHref(""), active: type === "" },
					...DOC_TYPES.map((t) => ({
						label: DOC_TYPE_LABEL[t],
						href: tabHref(t),
						active: type === t,
						count: countBy.get(t) ?? 0,
					})),
				]}
			/>

			<DocumentFilterBar
				type={type}
				q={q}
				status={status}
				month={month}
				monthShowsAll={monthShowsAll}
			/>

			{rows.length === 0 ? (
				<EmptyState
					icon={FileText}
					title={
						q || status || type ? "Tidak ada yang cocok" : "Belum ada dokumen"
					}
					description={
						q || status || type
							? "Coba longgarkan filter atau lihat semua bulan."
							: "Mulai dari quotation untuk prospek, atau buat invoice dari event yang sudah ada."
					}
				/>
			) : (
				<DocumentList rows={rows} />
			)}
		</Container>
	);
}
