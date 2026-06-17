"use client";

import { LayoutGrid, Package, Pencil, Search, Table2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
	FRAME_SIZE_LABELS,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArchivePackageButton } from "./archive-button";

export type PackageRow = {
	id: string;
	name: string;
	category: string;
	frame_size: string;
	duration_hours: number;
	base_price: number;
	is_active: boolean;
};

type View = "grid" | "table";

const FRAME_TONE: Record<string, string> = {
	"2R": "bg-teal-500/10 text-teal-700 dark:text-teal-400",
	"4R": "bg-[#0070f3]/10 text-[#0070f3] dark:text-[#3b96ff]",
	polaroid: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
	none: "bg-secondary text-muted-foreground",
};

function categoryLabel(category: string) {
	return SERVICE_TYPE_LABELS[category] ?? category;
}

function frameLabel(frame: string) {
	const label = FRAME_SIZE_LABELS[frame] ?? frame;
	return label === "—" ? "No frame" : label;
}

export function PackagesExplorer({ packages }: { packages: PackageRow[] }) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string>("all");
	const [view, setView] = useState<View>("grid");

	// Categories present in the data, with their package counts — drives the
	// filter chips. Order follows first appearance (already category-sorted).
	const categories = useMemo(() => {
		const seen = new Map<string, number>();
		for (const pkg of packages) {
			seen.set(pkg.category, (seen.get(pkg.category) ?? 0) + 1);
		}
		return Array.from(seen.entries());
	}, [packages]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return packages.filter((pkg) => {
			if (category !== "all" && pkg.category !== category) return false;
			if (!q) return true;
			return (
				pkg.name.toLowerCase().includes(q) ||
				categoryLabel(pkg.category).toLowerCase().includes(q) ||
				frameLabel(pkg.frame_size).toLowerCase().includes(q)
			);
		});
	}, [packages, query, category]);

	// Group filtered rows under their category for the grid view.
	const groups = useMemo(() => {
		const map = new Map<string, PackageRow[]>();
		for (const pkg of filtered) {
			const list = map.get(pkg.category) ?? [];
			list.push(pkg);
			map.set(pkg.category, list);
		}
		return Array.from(map.entries());
	}, [filtered]);

	return (
		<div className="space-y-5">
			{/* Toolbar: search + category chips + view switch */}
			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="relative w-full lg:max-w-xs">
					<Search
						className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
						aria-hidden
					/>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Cari paket, frame…"
						className="border-border-default bg-card focus-visible:ring-ring h-9 w-full rounded-lg border pr-3 pl-9 text-sm shadow-[var(--shadow-level-2)] focus-visible:ring-2 focus-visible:outline-none"
					/>
				</div>

				<div className="flex items-center gap-2.5">
					<div className="border-border-default bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5 shadow-[var(--shadow-level-2)]">
						<ViewButton
							active={view === "grid"}
							onClick={() => setView("grid")}
							icon={LayoutGrid}
							label="Grid"
						/>
						<ViewButton
							active={view === "table"}
							onClick={() => setView("table")}
							icon={Table2}
							label="Tabel"
						/>
					</div>
				</div>
			</div>

			{/* Category filter chips */}
			<div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
				<Chip
					active={category === "all"}
					onClick={() => setCategory("all")}
					label="Semua"
					count={packages.length}
				/>
				{categories.map(([cat, count]) => (
					<Chip
						key={cat}
						active={category === cat}
						onClick={() => setCategory(cat)}
						label={categoryLabel(cat)}
						count={count}
					/>
				))}
			</div>

			{filtered.length === 0 ? (
				<EmptyState
					icon={Package}
					title="Tidak ada paket yang cocok"
					description="Coba ubah kata kunci pencarian atau filter kategori."
				/>
			) : view === "table" ? (
				<TableView rows={filtered} />
			) : (
				<div className="space-y-6">
					{groups.map(([cat, rows]) => {
						const min = Math.min(...rows.map((r) => r.base_price));
						return (
							<section key={cat} className="space-y-3">
								<div className="flex items-baseline justify-between gap-3 px-0.5">
									<div className="flex items-center gap-2">
										<h2 className="type-heading text-foreground">
											{categoryLabel(cat)}
										</h2>
										<span className="text-muted-foreground tabular text-sm">
											{rows.length}
										</span>
									</div>
									<span className="eyebrow text-muted-foreground">
										mulai {formatRupiah(min)}
									</span>
								</div>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
									{rows.map((pkg) => (
										<PackageCard key={pkg.id} pkg={pkg} />
									))}
								</div>
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}

function PackageCard({ pkg }: { pkg: PackageRow }) {
	return (
		<div className="group border-border-default bg-card relative flex flex-col gap-3 rounded-2xl border p-4 shadow-[var(--shadow-level-2)] transition-colors hover:border-border-strong">
			<div className="flex items-start justify-between gap-2">
				<div className="flex flex-wrap items-center gap-1.5">
					<span
						className={cn(
							"inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-semibold",
							FRAME_TONE[pkg.frame_size] ?? FRAME_TONE.none,
						)}
					>
						{frameLabel(pkg.frame_size)}
					</span>
					<span className="border-border-default text-muted-foreground tabular inline-flex h-[22px] items-center rounded-md border px-2 text-[11px] font-medium">
						{pkg.duration_hours} jam
					</span>
				</div>
				<span
					className={cn(
						"mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium",
						pkg.is_active
							? "text-emerald-600 dark:text-emerald-400"
							: "text-muted-foreground",
					)}
				>
					<span
						className={cn(
							"size-1.5 rounded-full",
							pkg.is_active ? "bg-emerald-500" : "bg-muted-foreground/50",
						)}
					/>
					{pkg.is_active ? "Aktif" : "Arsip"}
				</span>
			</div>

			<div className="min-w-0">
				<h3 className="text-foreground truncate text-[15px] font-semibold">
					{pkg.name}
				</h3>
			</div>

			<div className="mt-auto flex items-end justify-between gap-2 pt-1">
				<div className="flex flex-col">
					<span className="eyebrow text-muted-foreground">Base price</span>
					<span className="tabular text-foreground text-[17px] font-semibold tracking-tight">
						{formatRupiah(pkg.base_price)}
					</span>
				</div>
				<div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
					<Link
						href={`/operations/packages/${pkg.id}/edit`}
						title="Edit"
						aria-label={`Edit ${pkg.name}`}
						className="text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg transition-colors"
					>
						<Pencil className="size-4" />
					</Link>
					<ArchivePackageButton id={pkg.id} name={pkg.name} />
				</div>
			</div>
		</div>
	);
}

function TableView({ rows }: { rows: PackageRow[] }) {
	return (
		<div className="border-border-default bg-card overflow-hidden rounded-2xl border shadow-[var(--shadow-level-2)]">
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-border-default bg-secondary/40 border-b">
							<Th>Nama Paket</Th>
							<Th>Kategori</Th>
							<Th>Frame</Th>
							<Th className="text-right">Durasi</Th>
							<Th className="text-right">Base Price</Th>
							<Th>Status</Th>
							<Th className="w-[88px] text-right">Aksi</Th>
						</tr>
					</thead>
					<tbody>
						{rows.map((pkg) => (
							<tr
								key={pkg.id}
								className="group border-border-subtle hover:bg-secondary/40 border-b transition-colors last:border-0"
							>
								<td className="text-foreground px-4 py-3 font-medium">
									{pkg.name}
								</td>
								<td className="text-muted-foreground px-4 py-3">
									{categoryLabel(pkg.category)}
								</td>
								<td className="px-4 py-3">
									<span
										className={cn(
											"inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-semibold",
											FRAME_TONE[pkg.frame_size] ?? FRAME_TONE.none,
										)}
									>
										{frameLabel(pkg.frame_size)}
									</span>
								</td>
								<td className="tabular text-muted-foreground px-4 py-3 text-right">
									{pkg.duration_hours} jam
								</td>
								<td className="tabular text-foreground px-4 py-3 text-right font-semibold">
									{formatRupiah(pkg.base_price)}
								</td>
								<td className="px-4 py-3">
									{pkg.is_active ? (
										<Badge variant="success">Aktif</Badge>
									) : (
										<Badge variant="default">Arsip</Badge>
									)}
								</td>
								<td className="px-4 py-3">
									<div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
										<Link
											href={`/operations/packages/${pkg.id}/edit`}
											title="Edit"
											aria-label={`Edit ${pkg.name}`}
											className="text-muted-foreground hover:bg-secondary hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg transition-colors"
										>
											<Pencil className="size-4" />
										</Link>
										<ArchivePackageButton id={pkg.id} name={pkg.name} />
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
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

function ViewButton({
	active,
	onClick,
	icon: Icon,
	label,
}: {
	active: boolean;
	onClick: () => void;
	icon: typeof LayoutGrid;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			aria-pressed={active}
			className={cn(
				"inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
				active
					? "bg-secondary text-foreground shadow-[var(--shadow-level-1)]"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			<Icon className="size-4" />
			<span className="hidden sm:inline">{label}</span>
		</button>
	);
}
