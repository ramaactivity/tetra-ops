import { Archive, FileText } from "lucide-react";
import Link from "next/link";
import { NotaFilterBar } from "@/components/arsip-nota/nota-filter-bar";
import { NotaManualTable } from "@/components/arsip-nota/nota-manual-table";
import { NotaSistemTable } from "@/components/arsip-nota/nota-sistem-table";
import { UploadNotaModal } from "@/components/arsip-nota/upload-nota-modal";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import {
	type ManualNotaRow,
	type NotaSistemRow,
	SOURCE_FILTER_OPTIONS,
} from "@/lib/arsip-nota/types";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const BASE_PATH = "/finance/arsip-nota";

type SearchParams = {
	tab?: string;
	q?: string;
	source?: string;
	category?: string;
	month?: string;
	sort?: string;
	page?: string;
};

/** Map sort key → kolom + arah. Default tanggal terbaru. */
function sortConfig(sort: string): { col: string; ascending: boolean } {
	switch (sort) {
		case "date_asc":
			return { col: "nota_date", ascending: true };
		case "amount_desc":
			return { col: "amount", ascending: false };
		case "amount_asc":
			return { col: "amount", ascending: true };
		default:
			return { col: "nota_date", ascending: false };
	}
}

function currentYearMonth(): string {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(
	month: string | undefined,
): { start: string; end: string } | null {
	if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
	const [y, m] = month.split("-").map(Number);
	const start = `${month}-01`;
	const lastDay = new Date(y, m, 0).getDate();
	const end = `${month}-${String(lastDay).padStart(2, "0")}`;
	return { start, end };
}

export default async function ArsipNotaPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	const sp = await searchParams;
	const tab = sp.tab === "manual" ? "manual" : "sistem";
	const q = (sp.q ?? "").trim();
	const source = sp.source ?? "";
	const category = sp.category ?? "";
	const month = sp.month ?? "";
	const sort = sp.sort ?? "date_desc";
	const { col: sortCol, ascending: sortAsc } = sortConfig(sort);
	const page = Math.max(1, Number(sp.page) || 1);
	const range = monthRange(month);

	const me = await getCurrentUser();
	const isOwnerLevel =
		me?.profile.role === "super_admin" || me?.profile.role === "owner";

	if (!isOwnerLevel) {
		return (
			<Container size="lg">
				<EmptyState
					icon={Archive}
					title="Khusus owner"
					description="Arsip Nota hanya bisa diakses oleh owner."
				/>
			</Container>
		);
	}

	const supabase = await createClient();

	let sistemRows: NotaSistemRow[] = [];
	let manualRows: ManualNotaRow[] = [];
	let sistemTotal = 0;
	let manualTotal = 0;

	const [{ count: sistemCount }, { count: manualCount }] = await Promise.all([
		supabase.from("v_nota_sistem").select("*", { count: "exact", head: true }),
		supabase.from("manual_notas").select("*", { count: "exact", head: true }),
	]);
	sistemTotal = sistemCount ?? 0;
	manualTotal = manualCount ?? 0;

	if (tab === "sistem") {
		let query = supabase
			.from("v_nota_sistem")
			.select("*", { count: "exact" })
			.order(sortCol, { ascending: sortAsc, nullsFirst: false })
			.order("created_at", { ascending: false })
			.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

		if (source && source !== "all") query = query.eq("source_type", source);
		if (q) {
			query = query.or(
				`client_name.ilike.%${q}%,project_id.ilike.%${q}%,label.ilike.%${q}%`,
			);
		}
		if (range)
			query = query.gte("nota_date", range.start).lte("nota_date", range.end);

		const { data } = await query;
		sistemRows = (data as NotaSistemRow[] | null) ?? [];
	} else {
		let query = supabase
			.from("manual_notas")
			.select("*, uploader:users(full_name)", { count: "exact" })
			.order(sortCol, { ascending: sortAsc, nullsFirst: false })
			.order("created_at", { ascending: false })
			.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

		if (category && category !== "all") query = query.eq("category", category);
		if (q) query = query.or(`description.ilike.%${q}%,category.ilike.%${q}%`);
		if (range)
			query = query.gte("nota_date", range.start).lte("nota_date", range.end);

		const { data } = await query;
		manualRows = (
			(data as Array<
				ManualNotaRow & { uploader?: { full_name: string } | null }
			> | null) ?? []
		).map((r) => ({ ...r, uploaded_by_name: r.uploader?.full_name ?? null }));
	}

	// Distinct categories for the manual filter dropdown.
	let categoryOptions = SOURCE_FILTER_OPTIONS;
	if (tab === "manual") {
		const { data: cats } = await supabase
			.from("manual_notas")
			.select("category")
			.order("category");
		const distinct = Array.from(
			new Set((cats ?? []).map((c) => c.category).filter(Boolean)),
		);
		categoryOptions = [
			{ value: "all", label: "Semua kategori" },
			...distinct.map((c) => ({ value: c, label: c })),
		] as typeof SOURCE_FILTER_OPTIONS;
	}

	const monthTotal =
		tab === "sistem"
			? sistemRows.reduce((s, r) => s + (r.amount ?? 0), 0)
			: manualRows.reduce((s, r) => s + (r.amount ?? 0), 0);

	const tabs = [
		{ key: "sistem", label: "Nota Sistem", count: sistemTotal },
		{ key: "manual", label: "Nota Manual", count: manualTotal },
	] as const;

	const hasRows =
		tab === "sistem" ? sistemRows.length > 0 : manualRows.length > 0;

	return (
		<Container size="xl" className="space-y-5">
			<SectionHeader
				eyebrow="Finance"
				title="Arsip Nota"
				description="Semua nota & bukti transaksi tersimpan rapi di satu tempat — mudah dicek, ditracking, dan dicari antar owner."
				actions={tab === "manual" ? <UploadNotaModal /> : undefined}
			/>

			{/* Stat cards */}
			<dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<StatCard
					label="Nota Sistem"
					value={String(sistemTotal)}
					hint="Bukti otomatis dari sistem"
					icon={FileText}
				/>
				<StatCard
					label="Nota Manual"
					value={String(manualTotal)}
					hint="Di-upload manual (luar sistem)"
					icon={Archive}
				/>
				<StatCard
					label="Total nominal (halaman)"
					value={formatRupiah(monthTotal)}
					hint="Jumlah nominal di hasil saat ini"
					tone="default"
				/>
			</dl>

			<NotaFilterBar
				tab={tab}
				basePath={BASE_PATH}
				defaultQ={q}
				defaultSelect={tab === "sistem" ? source : category}
				defaultMonth={month}
				defaultSort={sort}
				selectOptions={
					tab === "sistem" ? SOURCE_FILTER_OPTIONS : categoryOptions
				}
				selectParamName={tab === "sistem" ? "source" : "category"}
				selectPlaceholder={tab === "sistem" ? "Semua sumber" : "Semua kategori"}
				searchPlaceholder={
					tab === "sistem"
						? "Cari klien / project / keterangan…"
						: "Cari keterangan…"
				}
				rightSlot={
					<div className="flex items-center gap-0.5 rounded-lg border border-border-default bg-secondary/40 p-0.5">
						{tabs.map((t) => {
							const active = tab === t.key;
							return (
								<Link
									key={t.key}
									href={`${BASE_PATH}?tab=${t.key}`}
									className={cn(
										"inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
										active
											? "bg-card text-foreground shadow-[var(--shadow-level-1)]"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{t.label}
									<span
										className={cn(
											"tabular text-xs",
											active
												? "text-foreground/55"
												: "text-muted-foreground/60",
										)}
									>
										{t.count}
									</span>
								</Link>
							);
						})}
					</div>
				}
			/>

			{hasRows ? (
				<div className="space-y-3">
					{tab === "sistem" ? (
						<NotaSistemTable rows={sistemRows} />
					) : (
						<NotaManualTable rows={manualRows} />
					)}

					{/* Pagination */}
					<div className="flex items-center justify-between text-sm text-muted-foreground">
						<span>Halaman {page}</span>
						<div className="flex gap-2">
							{page > 1 ? (
								<Link
									href={`${BASE_PATH}?${new URLSearchParams({ tab, q, source, category, month, sort, page: String(page - 1) }).toString()}`}
									className={buttonVariants({
										variant: "secondary",
										size: "sm",
									})}
								>
									Sebelumnya
								</Link>
							) : null}
							{(tab === "sistem" ? sistemRows.length : manualRows.length) ===
							PAGE_SIZE ? (
								<Link
									href={`${BASE_PATH}?${new URLSearchParams({ tab, q, source, category, month, sort, page: String(page + 1) }).toString()}`}
									className={buttonVariants({
										variant: "secondary",
										size: "sm",
									})}
								>
									Berikutnya
								</Link>
							) : null}
						</div>
					</div>
				</div>
			) : (
				<EmptyState
					icon={tab === "sistem" ? FileText : Archive}
					title={
						tab === "sistem" ? "Belum ada nota sistem" : "Belum ada nota manual"
					}
					description={
						tab === "sistem"
							? "Nota akan muncul otomatis saat ada pembayaran, rekap crew, atau bukti transaksi lain."
							: "Upload nota di luar sistem (belanja pasar, operasional, dll) supaya tersimpan rapi di Drive."
					}
					action={tab === "manual" ? <UploadNotaModal /> : undefined}
				/>
			)}
		</Container>
	);
}
