"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <ResponsiveTable /> — desktop renders a native <table>, mobile (<md)
 * collapses each row into a labeled card list. Eliminates horizontal
 * scroll on phones.
 *
 * Features:
 *   - `width` per column: explicit cell width (CSS string, e.g. "180px",
 *     "20%"). Layout becomes predictable across viewports.
 *   - `truncate`: cell content single-line with ellipsis. Original content
 *     still accessible via title attribute on hover.
 *   - `stickyHeader`: <thead> sticks to top during scroll inside parent
 *     overflow container.
 *
 * Usage:
 *   <ResponsiveTable
 *     columns={[
 *       { key: "client", header: "Klien", width: "280px", truncate: true },
 *       { key: "date", header: "Tanggal", render: (row) => formatDate(row.date) },
 *       { key: "status", header: "Status", render: (row) => <StatusBadge value={row.status} /> },
 *     ]}
 *     rows={events}
 *     keyExtractor={(row) => row.id}
 *     stickyHeader
 *     onRowClick={(row) => router.push(`/operations/${row.id}`)}
 *   />
 */

export interface ResponsiveTableColumn<T> {
	key: string;
	header: React.ReactNode;
	mobileLabel?: React.ReactNode;
	render?: (row: T, rowIndex: number) => React.ReactNode;
	className?: string;
	/** Hidden in mobile card view (e.g. row-action cells) */
	hideOnMobile?: boolean;
	/** Hidden in desktop table (e.g. derived summary) */
	hideOnDesktop?: boolean;
	align?: "left" | "right" | "center";
	/** Explicit width (CSS string). Falls back to auto. */
	width?: string;
	/** Single-line truncate with ellipsis. */
	truncate?: boolean;
}

interface ResponsiveTableProps<T> {
	columns: ReadonlyArray<ResponsiveTableColumn<T>>;
	rows: ReadonlyArray<T>;
	keyExtractor: (row: T, index: number) => string | number;
	onRowClick?: (row: T) => void;
	emptyState?: React.ReactNode;
	className?: string;
	rowClassName?: string | ((row: T) => string | undefined);
	/** Sticky table header (requires parent scroll container w/ max-height). */
	stickyHeader?: boolean;
}

export function ResponsiveTable<T>({
	columns,
	rows,
	keyExtractor,
	onRowClick,
	emptyState,
	className,
	rowClassName,
	stickyHeader = false,
}: ResponsiveTableProps<T>) {
	if (rows.length === 0 && emptyState) {
		return <div className={className}>{emptyState}</div>;
	}

	return (
		<div data-slot="responsive-table" className={className}>
			{/* Desktop table — hidden on mobile */}
			<div className="hidden md:block">
				<table className="w-full table-fixed text-sm">
					<colgroup>
						{columns
							.filter((c) => !c.hideOnDesktop)
							.map((col) => (
								<col
									key={col.key}
									style={col.width ? { width: col.width } : undefined}
								/>
							))}
					</colgroup>
					<thead
						className={cn(
							// Distinct soft-gray header band + darker labels so it reads
							// apart from the white rows (was blending in).
							"bg-surface-3 [&_.eyebrow]:!text-foreground",
							stickyHeader && "sticky top-0 z-10",
						)}
					>
						<tr className="border-b border-border-default text-left">
							{columns
								.filter((c) => !c.hideOnDesktop)
								.map((col) => (
									<th
										key={col.key}
										className={cn(
											"eyebrow px-3 py-2.5",
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
											"cursor-pointer hover:bg-surface-3/60 focus-within:bg-surface-3/60",
										dynamicClass,
									)}
									onClick={onRowClick ? () => onRowClick(row) : undefined}
								>
									{columns
										.filter((c) => !c.hideOnDesktop)
										.map((col) => {
											const content = col.render
												? col.render(row, rowIndex)
												: getRowValue(row, col.key);
											return (
												<td
													key={col.key}
													className={cn(
														"px-3 py-3 align-middle",
														col.align === "right" && "text-right",
														col.align === "center" && "text-center",
														col.truncate && "overflow-hidden",
														col.className,
													)}
													title={
														col.truncate &&
														typeof content === "string"
															? content
															: undefined
													}
												>
													{col.truncate ? (
														<div className="truncate">{content}</div>
													) : (
														content
													)}
												</td>
											);
										})}
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
								"rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]",
								onRowClick &&
									"press tap cursor-pointer transition-colors active:bg-surface-3",
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
											<dt className="eyebrow self-center">
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
