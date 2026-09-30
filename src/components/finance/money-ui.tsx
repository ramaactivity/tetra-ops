"use client";

import { ArrowDownLeft, ArrowUpRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { useState } from "react";
import { formatRupiah, formatSignedRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Kit tampilan uang "dibaca orang awam dari atas ke bawah" — asalnya kartu
 * Hitungan untung event di rekap, dipakai juga di Finance supaya dua halaman
 * itu terasa satu keluarga: kotak ringkasan, langkah bernomor, kelompok yang
 * bisa dibuka-tutup, baris hasil.
 *
 * Client module (SubGroup punya state). Props sengaja data polos — ikon dipilih
 * lewat string, bukan komponen, supaya bisa dipakai dari server component.
 */

export type MoneyLine = {
	label: string;
	value: number;
	note?: string;
	href?: string;
};

export type MoneyGroup = {
	title: string | null;
	hint?: string;
	lines: MoneyLine[];
	empty?: string;
	footnote?: string;
	defaultOpen?: boolean;
};

const TILE_TONE = {
	in: "bg-card border-border-subtle",
	out: "bg-card border-border-subtle",
	neutral: "bg-card border-border-subtle",
	profit: "bg-[#059669] border-transparent text-white",
	loss: "bg-amber-50 border-amber-200 text-amber-900",
} as const;

export function SummaryTile({
	label,
	hint,
	value,
	tone,
	icon,
	children,
}: {
	label: string;
	hint?: React.ReactNode;
	value: number;
	tone: keyof typeof TILE_TONE;
	icon?: "in" | "out";
	/** Baris tambahan di bawah hint (mis. "Bebas dipakai Rp…"). */
	children?: React.ReactNode;
}) {
	const dark = tone === "profit";
	const hasil = tone === "profit" || tone === "loss";
	const Icon =
		icon === "in" ? ArrowDownLeft : icon === "out" ? ArrowUpRight : null;
	return (
		<div
			className={cn(
				"min-w-0 rounded-2xl border px-4 py-3.5",
				// HP: hasil selebar penuh di bawah dua kotak lainnya.
				hasil && "col-span-2 sm:col-span-1",
				TILE_TONE[tone],
			)}
		>
			<p
				className={cn(
					"flex items-center gap-1.5 text-[12.5px] font-medium",
					dark ? "text-white/80" : "text-muted-foreground",
				)}
			>
				{Icon ? (
					<Icon
						className={cn(
							"size-3.5",
							icon === "in" && "text-emerald-600",
							icon === "out" && "text-rose-600",
						)}
					/>
				) : null}
				{label}
			</p>
			<p
				data-nominal
				className="tabular mt-1 text-[18px] font-bold leading-tight tracking-[-0.02em] sm:text-[22px]"
			>
				{formatSignedRupiah(value)}
			</p>
			{hint ? (
				<p
					className={cn(
						"mt-0.5 text-[12px]",
						dark ? "text-white/70" : "text-muted-foreground",
					)}
				>
					{hint}
				</p>
			) : null}
			{children}
		</div>
	);
}

export function StepBadge({ n }: { n: number }) {
	return (
		<span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">
			{n}
		</span>
	);
}

export function Step({
	n,
	title,
	description,
	total,
	groups = [],
	children,
}: {
	n: number;
	title: string;
	description?: string;
	total?: number;
	groups?: MoneyGroup[];
	children?: React.ReactNode;
}) {
	return (
		<section className="rounded-2xl border border-border-subtle p-4">
			<div className="flex items-start gap-3">
				<StepBadge n={n} />
				<div className="min-w-0 flex-1 space-y-3">
					<div className="flex items-baseline justify-between gap-3">
						<div className="min-w-0">
							<h4 className="text-[14px] font-semibold text-foreground">
								{title}
							</h4>
							{description ? (
								<p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
									{description}
								</p>
							) : null}
						</div>
						{total !== undefined ? (
							<span
								data-nominal
								className="tabular shrink-0 text-[15px] font-semibold text-foreground"
							>
								{formatSignedRupiah(total)}
							</span>
						) : null}
					</div>
					{groups.map((g) =>
						g.title ? (
							<SubGroup key={g.title} group={g} />
						) : (
							<div key="_" className="space-y-1.5">
								{g.lines.map((l) => (
									<AmountRow key={l.label} {...l} muted />
								))}
							</div>
						),
					)}
					{children}
				</div>
			</div>
		</section>
	);
}

/** Kelompok: judul + subtotal, rincian bisa dibuka-tutup. */
export function SubGroup({ group }: { group: MoneyGroup }) {
	const [open, setOpen] = useState(group.defaultOpen ?? true);
	const subtotal = group.lines.reduce((s, l) => s + l.value, 0);
	return (
		<div className="rounded-xl bg-secondary/50 px-3 py-2.5">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full items-start justify-between gap-3 text-left"
			>
				<span className="min-w-0">
					<span className="block text-[13.5px] font-medium text-foreground">
						{group.title}
					</span>
					{group.hint ? (
						<span className="block text-[11.5px] text-muted-foreground">
							{group.hint}
						</span>
					) : null}
				</span>
				<span className="flex shrink-0 items-center gap-1.5">
					<span data-nominal className="tabular text-[13.5px] font-medium">
						{formatRupiah(Math.round(subtotal))}
					</span>
					<ChevronDown
						className={cn(
							"size-4 text-muted-foreground transition-transform",
							open && "rotate-180",
						)}
					/>
				</span>
			</button>
			{open ? (
				<div className="mt-2 space-y-1 border-t border-border-default/70 pt-2">
					{group.lines.length === 0 && group.empty ? (
						<p className="text-[12.5px] text-muted-foreground">{group.empty}</p>
					) : null}
					{group.lines.map((l, i) => (
						<AmountRow
							// biome-ignore lint/suspicious/noArrayIndexKey: label bisa kembar (mis. dua baris "Parkir")
							key={i}
							{...l}
							small
						/>
					))}
					{group.footnote ? (
						<p className="pt-1 text-[11.5px] leading-snug text-muted-foreground">
							{group.footnote}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export function AmountRow({
	label,
	value,
	note,
	href,
	muted,
	small,
	strong,
}: MoneyLine & { muted?: boolean; small?: boolean; strong?: boolean }) {
	const labelEl = (
		<span
			className={cn(
				"min-w-0",
				strong
					? "font-semibold text-foreground"
					: muted || small
						? "text-muted-foreground"
						: "text-foreground",
				href && "underline-offset-2 hover:text-foreground hover:underline",
			)}
		>
			{label}
			{note ? (
				<span className="ml-1.5 text-[11px] text-muted-foreground/80">
					· {note}
				</span>
			) : null}
		</span>
	);
	return (
		<div
			className={cn(
				"flex items-baseline justify-between gap-3",
				small ? "text-[12.5px]" : "text-[13.5px]",
			)}
		>
			{href ? <Link href={href}>{labelEl}</Link> : labelEl}
			<span
				data-nominal
				className={cn(
					"tabular shrink-0",
					strong && "font-semibold",
					small ? "text-foreground/90" : "text-foreground",
				)}
			>
				{formatSignedRupiah(value)}
			</span>
		</div>
	);
}

export function ResultRow({
	label,
	sub,
	value,
	tone,
}: {
	label: string;
	sub: string;
	value: number;
	tone: "profit" | "loss";
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5",
				tone === "profit"
					? "bg-emerald-50 text-emerald-950"
					: "bg-amber-50 text-amber-950",
			)}
		>
			<div>
				<p className="text-[14px] font-semibold">{label}</p>
				<p className="text-[12px] opacity-70">{sub}</p>
			</div>
			<span
				data-nominal
				className="tabular text-[22px] font-bold tracking-[-0.02em]"
			>
				{formatSignedRupiah(value)}
			</span>
		</div>
	);
}
