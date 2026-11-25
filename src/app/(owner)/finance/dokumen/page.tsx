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
import {
	ApprovalQueue,
	type ApprovalQueueRow,
} from "@/components/documents/send-to-client";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TabNav } from "@/components/ui/tab-nav";
import { getCurrentUser } from "@/lib/auth/get-user";
import { loadPendingApprovals } from "@/lib/documents/pending-approval";
import { infoPenerima, teksPenerima } from "@/lib/documents/penerima";
import { computeTotals } from "@/lib/documents/totals";
import {
	DOC_TYPE_LABEL,
	DOC_TYPES,
	type DocType,
	type DocumentRow,
	pendingAdminItems,
} from "@/lib/documents/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BASE = "/finance/dokumen";
const PAGE_SIZE = 60;

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
	// Default SEMUA bulan: angka di tab dihitung sepanjang waktu, jadi daftar
	// yang diam-diam terpotong ke bulan ini membuat dokumen tampak "hilang"
	// (mis. kuitansi DP bulan lalu). Bulan tertentu tetap bisa dipilih.
	const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";
	const monthShowsAll = !month;

	const supabase = await createClient();
	let query = supabase
		.from("documents")
		.select(
			"id, doc_type, doc_number, client, items, discount, gross_up_enabled, gross_up_rate, issued_at, status, delivered_at, event_id, event:events(project_id, event_date), payment:payments(amount)",
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

	// Antrean persetujuan hanya di tab Semua tanpa filter (daftar kerja harian).
	const showQueue = !type && !q && !status && !month;
	const [{ data: docs }, { data: counts }, { data: events }, approvalRows] =
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
			showQueue ? loadApprovalRows(supabase) : [],
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
			payment_amount:
				d.doc_type === "receipt"
					? ((
							(Array.isArray(d.payment) ? d.payment[0] : d.payment) as {
								amount: number;
							} | null
						)?.amount ?? null)
					: null,
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
		if (month) p.set("month", month);
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

			<ApprovalQueue rows={approvalRows} />

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

async function loadApprovalRows(
	supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ApprovalQueueRow[]> {
	const pending = await loadPendingApprovals(supabase);
	if (pending.length === 0) return [];
	const { data } = await supabase
		.from("documents")
		.select(
			"id, doc_type, doc_number, client, items, discount, gross_up_enabled, gross_up_rate, origin",
		)
		.in(
			"id",
			pending.map((p) => p.documentId),
		);
	const byId = new Map(
		((data ?? []) as DocumentRow[]).map((d) => [d.id, d] as const),
	);
	// Tujuan kirim tampil sebelum tombol ditekan (owner 25 Nov: nota Shella ke WO).
	const { data: reqs } = await supabase
		.from("doc_send_requests")
		.select("id, nomor")
		.in(
			"id",
			pending.map((p) => p.requestId),
		);
	const nomorReq = new Map(
		(reqs ?? []).map((r) => [r.id as string, r.nomor as string | null]),
	);
	const penerima = new Map(
		await Promise.all(
			pending.map(
				async (p) =>
					[
						p.documentId,
						await infoPenerima(
							supabase,
							p.documentId,
							nomorReq.get(p.requestId),
						).catch((e) => {
							console.error("[dokumen] penerima:", e);
							return null;
						}),
					] as const,
			),
		),
	);
	return pending.flatMap(({ documentId }) => {
		const d = byId.get(documentId);
		if (!d) return [];
		const info = penerima.get(documentId);
		return [
			{
				id: d.id,
				doc_type: d.doc_type,
				doc_number: d.doc_number,
				client_name: d.client.name ?? "",
				total: computeTotals(d.items, d.discount, {
					enabled: d.gross_up_enabled,
					ratePct: d.gross_up_rate,
				}).total,
				blockedBy: pendingAdminItems(d.items),
				fromBot: d.origin?.jenis === "wa_bot",
				tujuan: info?.tujuan ? teksPenerima(info.tujuan) : null,
				peringatan: info?.peringatan ?? null,
			},
		];
	});
}
