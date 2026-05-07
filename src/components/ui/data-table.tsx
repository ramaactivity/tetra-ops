"use client";

import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { cn } from "@/lib/utils";

/**
 * <DataTable /> — ResponsiveTable plus search-filter and pagination.
 *
 * For tables with sort/filter/pagination needs but where data is fully
 * client-side. For server-side pagination, drop down to <ResponsiveTable />
 * directly and manage state outside.
 *
 * Usage:
 *   <DataTable
 *     columns={[...]}
 *     rows={events}
 *     keyExtractor={(r) => r.id}
 *     searchKeys={["client", "venue"]}
 *     pageSize={25}
 *   />
 */

interface DataTableProps<T> {
	columns: ReadonlyArray<ResponsiveTableColumn<T>>;
	rows: ReadonlyArray<T>;
	keyExtractor: (row: T, index: number) => string | number;
	onRowClick?: (row: T) => void;
	emptyState?: React.ReactNode;
	className?: string;
	searchKeys?: ReadonlyArray<string>;
	searchPlaceholder?: string;
	pageSize?: number;
	toolbar?: React.ReactNode;
}

export function DataTable<T>({
	columns,
	rows,
	keyExtractor,
	onRowClick,
	emptyState,
	className,
	searchKeys,
	searchPlaceholder = "Cari…",
	pageSize = 25,
	toolbar,
}: DataTableProps<T>) {
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(0);

	const filtered = useMemo(() => {
		if (!query.trim() || !searchKeys?.length) return rows;
		const q = query.toLowerCase();
		return rows.filter((row) =>
			searchKeys.some((key) => {
				const value = (row as Record<string, unknown>)[key];
				if (value == null) return false;
				return String(value).toLowerCase().includes(q);
			}),
		);
	}, [rows, query, searchKeys]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const safePage = Math.min(page, pageCount - 1);
	const pageRows = filtered.slice(
		safePage * pageSize,
		(safePage + 1) * pageSize,
	);

	function reset() {
		setPage(0);
	}

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{(searchKeys?.length || toolbar) && (
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					{searchKeys?.length ? (
						<div className="relative w-full sm:max-w-xs">
							<SearchIcon
								className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
								aria-hidden
							/>
							<Input
								value={query}
								onChange={(e) => {
									setQuery(e.target.value);
									reset();
								}}
								placeholder={searchPlaceholder}
								className="pl-8"
							/>
						</div>
					) : (
						<div />
					)}
					{toolbar ? (
						<div className="flex items-center gap-2">{toolbar}</div>
					) : null}
				</div>
			)}

			<ResponsiveTable
				columns={columns}
				rows={pageRows}
				keyExtractor={keyExtractor}
				onRowClick={onRowClick}
				emptyState={emptyState}
			/>

			{filtered.length > pageSize ? (
				<div className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
					<div>
						Halaman {safePage + 1} dari {pageCount} · {filtered.length} item
					</div>
					<div className="flex gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => setPage((p) => Math.max(0, p - 1))}
							disabled={safePage === 0}
							aria-label="Halaman sebelumnya"
						>
							<ChevronLeftIcon />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
							disabled={safePage >= pageCount - 1}
							aria-label="Halaman berikutnya"
						>
							<ChevronRightIcon />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
