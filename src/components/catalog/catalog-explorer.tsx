"use client";

import { type LucideIcon, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

/**
 * <CatalogExplorer /> — shared list surface for the operations catalog
 * pages (Paket, Add-on, Backdrop). Client-side search + category chips
 * over a server-fetched row set. Renders a dense table on desktop and a
 * card stack on mobile (a 7-column table is unusable on a phone). There is
 * deliberately NO grid/table view toggle — table is the single desktop view.
 *
 * Columns carry render functions, so each module wraps this in its own
 * `"use client"` component (functions can't cross the server→client prop
 * boundary).
 */

export interface CatalogColumn<T> {
	key: string;
	header: string;
	align?: "left" | "right";
	/** Tailwind width/utility for the <th>. */
	headClassName?: string;
	cell: (row: T) => React.ReactNode;
	/** Hide this column from the mobile card body. */
	cardHidden?: boolean;
	/** Override the label shown in the mobile card (defaults to `header`). */
	cardLabel?: string;
}

export interface CatalogCategory {
	value: string;
	label: string;
	count: number;
}

interface CatalogExplorerProps<T> {
	rows: T[];
	columns: CatalogColumn<T>[];
	getId: (row: T) => string;
	/** Concatenated searchable text for the row. */
	searchText: (row: T) => string;
	searchPlaceholder?: string;
	/** Category key for filter chips — omit to hide the chip row. */
	getCategory?: (row: T) => string;
	categoryLabel?: (value: string) => string;
	/** Initial selected category (e.g. from a deep link). Defaults to "all". */
	initialCategory?: string;
	/** Column key used as the card title on mobile (defaults to first). */
	titleKey?: string;
	/** Optional subtitle node under the mobile card title. */
	cardSubtitle?: (row: T) => React.ReactNode;
	/** Trailing actions (edit / archive / toggle). */
	renderActions?: (row: T) => React.ReactNode;
	/** Extra control rendered to the right of the search box (e.g. a toggle). */
	toolbar?: React.ReactNode;
	emptyIcon: LucideIcon;
	emptyTitle: string;
	emptyDescription: string;
}

export function CatalogExplorer<T>({
	rows,
	columns,
	getId,
	searchText,
	searchPlaceholder = "Cari…",
	getCategory,
	categoryLabel = (v) => v,
	initialCategory,
	titleKey,
	cardSubtitle,
	renderActions,
	toolbar,
	emptyIcon,
	emptyTitle,
	emptyDescription,
}: CatalogExplorerProps<T>) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState(initialCategory ?? "all");

	const categories: CatalogCategory[] = useMemo(() => {
		if (!getCategory) return [];
		const seen = new Map<string, number>();
		for (const row of rows) {
			const c = getCategory(row);
			seen.set(c, (seen.get(c) ?? 0) + 1);
		}
		return Array.from(seen.entries()).map(([value, count]) => ({
			value,
			label: categoryLabel(value),
			count,
		}));
	}, [rows, getCategory, categoryLabel]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((row) => {
			if (getCategory && category !== "all" && getCategory(row) !== category)
				return false;
			if (!q) return true;
			return searchText(row).toLowerCase().includes(q);
		});
	}, [rows, query, category, getCategory, searchText]);

	const titleCol = columns.find((c) => c.key === titleKey) ?? columns[0];
	const bodyCols = columns.filter(
		(c) => c.key !== titleCol.key && !c.cardHidden,
	);

	return (
		<div className="space-y-5">
			{/* Search + optional toolbar */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative w-full sm:max-w-xs">
					<Search
						className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
						aria-hidden
					/>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={searchPlaceholder}
						className="border-border-default bg-card focus-visible:ring-ring h-9 w-full rounded-lg border pr-3 pl-9 text-sm shadow-[var(--shadow-level-2)] focus-visible:ring-2 focus-visible:outline-none"
					/>
				</div>
				{toolbar ? <div className="shrink-0">{toolbar}</div> : null}
			</div>

			{/* Category chips */}
			{categories.length > 0 && (
				<div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
					<Chip
						active={category === "all"}
						onClick={() => setCategory("all")}
						label="Semua"
						count={rows.length}
					/>
					{categories.map((c) => (
						<Chip
							key={c.value}
							active={category === c.value}
							onClick={() => setCategory(c.value)}
							label={c.label}
							count={c.count}
						/>
					))}
				</div>
			)}

			{filtered.length === 0 ? (
				<EmptyState
					icon={emptyIcon}
					title={query || category !== "all" ? "Tidak ada hasil" : emptyTitle}
					description={
						query || category !== "all"
							? "Coba ubah kata kunci atau filter."
							: emptyDescription
					}
				/>
			) : (
				<>
					{/* Desktop table */}
					<div className="border-border-default bg-card hidden overflow-hidden rounded-2xl border shadow-[var(--shadow-level-2)] md:block">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-border-default bg-secondary/40 border-b">
										{columns.map((col) => (
											<Th
												key={col.key}
												className={cn(
													col.align === "right" && "text-right",
													col.headClassName,
												)}
											>
												{col.header}
											</Th>
										))}
										{renderActions && (
											<Th className="w-[88px] text-right">Aksi</Th>
										)}
									</tr>
								</thead>
								<tbody>
									{filtered.map((row) => (
										<tr
											key={getId(row)}
											className="group border-border-subtle hover:bg-secondary/40 border-b transition-colors last:border-0"
										>
											{columns.map((col) => (
												<td
													key={col.key}
													className={cn(
														"px-4 py-3 align-middle",
														col.align === "right" && "text-right",
													)}
												>
													{col.cell(row)}
												</td>
											))}
											{renderActions && (
												<td className="px-4 py-3 align-middle">
													<div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
														{renderActions(row)}
													</div>
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					{/* Mobile cards */}
					<div className="space-y-3 md:hidden">
						{filtered.map((row) => (
							<div
								key={getId(row)}
								className="border-border-default bg-card rounded-2xl border p-4 shadow-[var(--shadow-level-2)]"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="text-foreground text-[15px] font-semibold">
											{titleCol.cell(row)}
										</div>
										{cardSubtitle && (
											<div className="text-muted-foreground mt-0.5 text-xs">
												{cardSubtitle(row)}
											</div>
										)}
									</div>
									{renderActions && (
										<div className="flex shrink-0 items-center gap-1">
											{renderActions(row)}
										</div>
									)}
								</div>
								<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
									{bodyCols.map((col) => (
										<div key={col.key} className="flex flex-col gap-0.5">
											<dt className="eyebrow text-muted-foreground">
												{col.cardLabel ?? col.header}
											</dt>
											<dd className="text-foreground text-sm">
												{col.cell(row)}
											</dd>
										</div>
									))}
								</dl>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function Th({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<th
			className={cn(
				"eyebrow text-muted-foreground px-4 py-2.5 text-left font-medium whitespace-nowrap",
				className,
			)}
		>
			{children}
		</th>
	);
}

function Chip({
	active,
	onClick,
	label,
	count,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	count: number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
				active
					? "border-foreground bg-foreground text-background"
					: "border-border-default bg-card text-muted-foreground hover:text-foreground hover:bg-secondary",
			)}
		>
			{label}
			<span
				className={cn(
					"tabular text-[11px]",
					active ? "text-background/70" : "text-muted-foreground/70",
				)}
			>
				{count}
			</span>
		</button>
	);
}
