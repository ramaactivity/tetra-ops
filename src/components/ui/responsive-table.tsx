"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <ResponsiveTable /> — desktop renders a native <table>, mobile (<md)
 * collapses each row into a labeled card list. Eliminates horizontal
 * scroll on phones.
 *
 * Usage:
 *   <ResponsiveTable
 *     columns={[
 *       { key: "client", header: "Klien" },
 *       { key: "date", header: "Tanggal", render: (row) => formatDate(row.date) },
 *       { key: "status", header: "Status", render: (row) => <StatusBadge value={row.status} /> },
 *     ]}
 *     rows={events}
 *     keyExtractor={(row) => row.id}
 *     onRowClick={(row) => router.push(`/operations/${row.id}`)}
 *   />
 */

export interface ResponsiveTableColumn<T> {
	key: string;
	header: React.ReactNode;
	mobileLabel?: React.ReactNode; // optional; falls back to header on mobile
	render?: (row: T, rowIndex: number) => React.ReactNode;
	className?: string;
	/** Hidden in mobile card view (e.g. row-action cells) */
	hideOnMobile?: boolean;
	/** Hidden in desktop table (e.g. derived summary) */
	hideOnDesktop?: boolean;
	align?: "left" | "right" | "center";
}

interface ResponsiveTableProps<T> {
	columns: ReadonlyArray<ResponsiveTableColumn<T>>;
	rows: ReadonlyArray<T>;
	keyExtractor: (row: T, index: number) => string | number;
	onRowClick?: (row: T) => void;
	emptyState?: React.ReactNode;
	className?: string;
	rowClassName?: string | ((row: T) => string | undefined);
}

export function ResponsiveTable<T>({
	columns,
	rows,
	keyExtractor,
	onRowClick,
	emptyState,
	className,
	rowClassName,
}: ResponsiveTableProps<T>) {
	if (rows.length === 0 && emptyState) {
		return <div className={className}>{emptyState}</div>;
	}

	return (
		<div data-slot="responsive-table" className={className}>
			{/* Desktop table — hidden on mobile */}
			<div className="hidden md:block">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-border-default text-left text-xs uppercase tracking-wide text-muted-foreground">
							{columns
								.filter((c) => !c.hideOnDesktop)
								.map((col) => (
									<th
										key={col.key}
										className={cn(
											"px-3 py-2 font-medium",
											col.align === "right" && "text-right",
											col.align === "center" && "text-center",
											col.className,
										)}
										scope="col"
									>
										{col.header}
									</th>
								))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row, rowIndex) => {
							const dynamicClass =
								typeof rowClassName === "function"
									? rowClassName(row)
									: rowClassName;
							return (
								<tr
									key={keyExtractor(row, rowIndex)}
									className={cn(
										"border-b border-border-subtle transition-colors",
										onRowClick &&
											"cursor-pointer hover:bg-surface-3 focus-within:bg-surface-3",
										dynamicClass,
									)}
									onClick={onRowClick ? () => onRowClick(row) : undefined}
								>
									{columns
										.filter((c) => !c.hideOnDesktop)
										.map((col) => (
											<td
												key={col.key}
												className={cn(
													"px-3 py-2.5 align-middle",
													col.align === "right" && "text-right",
													col.align === "center" && "text-center",
													col.className,
												)}
											>
												{col.render
													? col.render(row, rowIndex)
													: getRowValue(row, col.key)}
											</td>
										))}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{/* Mobile card list */}
			<div className="space-y-3 md:hidden">
				{rows.map((row, rowIndex) => {
					const dynamicClass =
						typeof rowClassName === "function"
							? rowClassName(row)
							: rowClassName;
					return (
						<div
							key={keyExtractor(row, rowIndex)}
							className={cn(
								"rounded-lg border border-border-default bg-surface-2 p-3",
								onRowClick && "cursor-pointer active:bg-surface-3",
								dynamicClass,
							)}
							onClick={onRowClick ? () => onRowClick(row) : undefined}
							onKeyDown={
								onRowClick
									? (e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												onRowClick(row);
											}
										}
									: undefined
							}
							tabIndex={onRowClick ? 0 : undefined}
							role={onRowClick ? "button" : undefined}
						>
							<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
								{columns
									.filter((c) => !c.hideOnMobile)
									.map((col) => (
										<div key={col.key} className="contents">
											<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
												{col.mobileLabel ?? col.header}
											</dt>
											<dd
												className={cn(
													"min-w-0 truncate",
													col.align === "right" && "text-right",
												)}
											>
												{col.render
													? col.render(row, rowIndex)
													: getRowValue(row, col.key)}
											</dd>
										</div>
									))}
							</dl>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function getRowValue<T>(row: T, key: string): React.ReactNode {
	const value = (row as Record<string, unknown>)[key];
	if (value == null) return null;
	if (typeof value === "string" || typeof value === "number") return value;
	return String(value);
}
