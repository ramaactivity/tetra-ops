"use client";

import {
	ArrowDownLeft,
	ArrowUpRight,
	Calculator,
	ChevronDown,
	PiggyBank,
} from "lucide-react";
import { useState } from "react";
import { RekapCard, SectionHeader } from "@/components/rekap/rekap-ui";
import type {
	HppBreakdown,
	OpexBreakdown,
	ProfitPreview,
} from "@/lib/actions/profit-preview";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Hitungan untung event" — dibaca orang awam dari atas ke bawah:
 *   uang masuk → uang keluar → untung bersih → dibagi ke mana → sisa kas.
 *
 * Angka tetap dari mesin settlement (profit-preview.ts); kartu ini hanya
 * menyusun ulang supaya jelas. Satu hal yang sengaja dibuat jujur: dana
 * cadangan & bagi hasil owner dihitung settle dari untung SEBELUM pengeluaran
 * lain, padahal pengeluaran lain juga dibayar dari kas — jadi "sisa untuk kas
 * usaha" = untung bersih − pembagian, bukan operating cash versi settle.
 */

type Props = {
	preview: ProfitPreview;
	/**
	 * Biaya lapangan dibayar owner yang BELUM dibukukan. Dipotong dari untung
	 * walau belum jadi jurnal — uangnya sudah keluar.
	 */
	ownerPaidPending?: number;
	className?: string;
};

const HPP_LABELS: Record<keyof Omit<HppBreakdown, "total">, string> = {
	mediaset: "Media set (kertas & tinta)",
	sleeve: "Sleeve",
	flashdisk: "Flashdisk",
	pouch: "Pouch",
	photomagnet: "Photomagnet",
	keychain: "Keychain",
	bonus: "Bonus klien",
	other: "Lainnya",
};

const OPEX_LABELS: Record<
	keyof Omit<OpexBreakdown, "total" | "owner_paid_total">,
	string
> = {
	fee_lead: "Fee crew lead",
	fee_asisten: "Fee asisten",
	fee_crew_c: "Fee crew C",
	fee_extra: "Bonus crew",
	reimbursement: "Reimbursement",
	transport: "Transport",
	bensin: "Bensin",
	toll: "Tol",
	parking: "Parkir",
	konsumsi: "Konsumsi",
	misc: "Lain-lain",
	komisi_vendor: "Komisi vendor",
	komisi_relasi: "Komisi relasi",
	komisi_sales: "Komisi sales Tetra",
};

type Line = { label: string; value: number; note?: string };

export function ProfitPreviewCard({
	preview,
	ownerPaidPending = 0,
	className,
}: Props) {
	const ex = preview.extra;

	// ── Uang masuk ──
	const masukLines: Line[] = [
		{ label: "Harga paket", value: preview.revenue_gross },
		...(preview.addon_revenue > 0
			? [{ label: "Add-on", value: preview.addon_revenue }]
			: []),
		...(preview.discount_total > 0
			? [{ label: "Diskon", value: -preview.discount_total }]
			: []),
		...ex.items
			.filter((i) => i.direction === "masuk")
			.map((i) => ({
				label: i.label,
				value: i.amount,
				note: "pemasukan lain",
			})),
	];
	const uangMasuk = preview.revenue_net + ex.incomeTotal;

	// ── Uang keluar ──
	const hppLines: Line[] = (
		Object.keys(HPP_LABELS) as Array<keyof typeof HPP_LABELS>
	)
		.filter((k) => preview.hpp[k] !== 0)
		.map((k) => ({ label: HPP_LABELS[k], value: preview.hpp[k] }));
	const opexLines: Line[] = (
		Object.keys(OPEX_LABELS) as Array<keyof typeof OPEX_LABELS>
	)
		.filter((k) => preview.opex[k] !== 0)
		.map((k) => ({ label: OPEX_LABELS[k], value: preview.opex[k] }));
	const lainLines: Line[] = [
		...ex.items
			.filter((i) => i.direction === "keluar")
			.map((i) => ({ label: i.label, value: i.amount })),
		...(ownerPaidPending > 0
			? [
					{
						label: "Dibayar owner, belum dicatat",
						value: ownerPaidPending,
						note: "catat di kartu Pemasukan / pengeluaran lain",
					},
				]
			: []),
	];
	const lainTotal = ex.expenseTotal + ownerPaidPending;
	const uangKeluar = preview.total_biaya + lainTotal;

	// ── Hasil ──
	const untung = uangMasuk - uangKeluar;
	const rugi = untung < 0;
	const persen = uangMasuk > 0 ? (untung / uangMasuk) * 100 : 0;

	// ── Pembagian (aturan settle: dari untung sebelum pengeluaran lain) ──
	const adaPembagian = !preview.is_loss;
	const cadangan = adaPembagian ? preview.sinking_estimate : 0;
	const bagiHasil = adaPembagian ? preview.owner_pool_estimate : 0;
	const sisaKas = untung - cadangan - bagiHasil;

	return (
		<RekapCard className={cn("space-y-4", className)}>
			<SectionHeader
				icon={Calculator}
				title="Hitungan untung event"
				description="Dari uang yang masuk, dikurangi semua biaya, sampai sisa yang masuk kas usaha. Berubah otomatis saat rekap diisi."
			/>

			{/* Ringkasan 3 angka */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<SummaryTile
					label="Uang masuk"
					hint="dari klien"
					value={uangMasuk}
					icon={ArrowDownLeft}
					tone="in"
				/>
				<SummaryTile
					label="Uang keluar"
					hint="bahan, crew & operasional"
					value={uangKeluar}
					icon={ArrowUpRight}
					tone="out"
				/>
				<SummaryTile
					label={rugi ? "Rugi event" : "Untung bersih"}
					hint={
						uangMasuk > 0
							? `${persen.toFixed(1).replace(".", ",")}% dari uang masuk`
							: "belum ada uang masuk"
					}
					value={untung}
					tone={rugi ? "loss" : "profit"}
				/>
			</div>

			{/* 1. Uang masuk */}
			<Step
				n={1}
				title="Uang masuk"
				total={uangMasuk}
				groups={[{ title: null, lines: masukLines }]}
			/>

			{/* 2. Uang keluar */}
			<Step
				n={2}
				title="Uang keluar"
				total={-uangKeluar}
				groups={[
					{
						title: "Bahan habis pakai",
						hint: "HPP — barang yang terpakai di event",
						lines: hppLines,
						empty: "Belum ada pemakaian bahan tercatat",
					},
					{
						title: "Crew & operasional",
						hint: "OpEx — fee crew, perjalanan, komisi",
						lines: opexLines,
						empty: "Belum ada biaya operasional tercatat",
						footnote:
							preview.opex.owner_paid_total > 0
								? `${formatRupiah(preview.opex.owner_paid_total)} dibayar langsung owner — dihitung di "Pengeluaran lain", bukan di sini, supaya tidak dobel.`
								: undefined,
					},
					...(lainLines.length > 0
						? [
								{
									title: "Pengeluaran lain",
									hint: "dari kartu Pemasukan / pengeluaran lain",
									lines: lainLines,
								},
							]
						: []),
				]}
			/>

			{/* Hasil */}
			<ResultRow
				label={rugi ? "Rugi event" : "Untung bersih event"}
				sub="Uang masuk − uang keluar"
				value={untung}
				tone={rugi ? "loss" : "profit"}
			/>

			{/* 3. Dibagi ke mana */}
			<section className="rounded-2xl border border-border-subtle bg-secondary/40 p-4">
				<div className="flex items-start gap-3">
					<StepBadge n={3} />
					<div className="min-w-0 flex-1 space-y-3">
						<div>
							<h4 className="text-[14px] font-semibold text-foreground">
								Untungnya dibagi ke mana
							</h4>
							<p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
								{adaPembagian ? (
									<>
										Saat settle, sebagian untung disisihkan dulu. Hitungannya
										dari untung sebelum pengeluaran lain (
										<span className="tabular">
											{formatRupiah(preview.net_profit)}
										</span>
										).
									</>
								) : (
									"Event ini tidak untung, jadi tidak ada yang disisihkan ke dana cadangan atau bagi hasil owner."
								)}
							</p>
						</div>
						<div className="space-y-1.5">
							<AmountRow label="Untung bersih event" value={untung} />
							{adaPembagian ? (
								<>
									<AmountRow
										label="Disisihkan ke dana cadangan"
										value={-cadangan}
										muted
									/>
									<AmountRow
										label="Bagi hasil owner"
										value={-bagiHasil}
										muted
									/>
								</>
							) : null}
						</div>
						<div className="border-t border-border-default pt-3">
							<div className="flex items-baseline justify-between gap-3">
								<span className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
									<PiggyBank className="size-4 text-muted-foreground" />
									Sisa untuk kas usaha
								</span>
								<span
									data-nominal
									className={cn(
										"tabular text-[20px] font-bold tracking-[-0.01em]",
										sisaKas < 0 ? "text-amber-700" : "text-foreground",
									)}
								>
									{formatSigned(sisaKas)}
								</span>
							</div>
							{sisaKas < 0 ? (
								<p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
									Kas usaha <b>nombok {formatRupiah(-sisaKas)}</b> dari event
									ini: dana cadangan & bagi hasil tetap diambil dari untung
									sebelum pengeluaran lain, sedangkan pengeluaran lain juga
									dibayar dari kas.
								</p>
							) : null}
							{lainTotal > 0 && adaPembagian ? (
								<p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
									Di buku settle tercatat{" "}
									<span className="tabular">
										{formatRupiah(preview.operating_cash_estimate)}
									</span>{" "}
									masuk kas usaha, lalu pengeluaran lain{" "}
									<span className="tabular">{formatRupiah(lainTotal)}</span>{" "}
									keluar dari kas — hasil akhirnya angka di atas.
								</p>
							) : null}
						</div>
					</div>
				</div>
			</section>

			{ex.expenseQueued + ex.incomeQueued > 0 ? (
				<p className="text-[11.5px] text-muted-foreground">
					<span className="tabular">
						{formatRupiah(ex.expenseQueued + ex.incomeQueued)}
					</span>{" "}
					dari pengeluaran/pemasukan lain baru masuk buku saat event di-settle.
				</p>
			) : null}
		</RekapCard>
	);
}

// ─────────────────────────────────────────────────────────────────────────

function formatSigned(v: number) {
	return v < 0 ? `−${formatRupiah(-v)}` : formatRupiah(v);
}

const TILE_TONE = {
	in: "bg-card border-border-subtle",
	out: "bg-card border-border-subtle",
	profit: "bg-[#059669] border-transparent text-white",
	loss: "bg-amber-50 border-amber-200 text-amber-900",
} as const;

function SummaryTile({
	label,
	hint,
	value,
	icon: Icon,
	tone,
}: {
	label: string;
	hint: string;
	value: number;
	icon?: typeof ArrowDownLeft;
	tone: keyof typeof TILE_TONE;
}) {
	const dark = tone === "profit";
	const hasil = tone === "profit" || tone === "loss";
	return (
		<div
			className={cn(
				"min-w-0 rounded-2xl border px-4 py-3.5",
				// HP: hasil selebar penuh di bawah dua kotak masuk/keluar.
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
							tone === "in" && "text-emerald-600",
							tone === "out" && "text-rose-600",
						)}
					/>
				) : null}
				{label}
			</p>
			<p
				data-nominal
				className="tabular mt-1 text-[18px] font-bold leading-tight tracking-[-0.02em] sm:text-[22px]"
			>
				{formatSigned(value)}
			</p>
			<p
				className={cn(
					"mt-0.5 text-[12px]",
					dark ? "text-white/70" : "text-muted-foreground",
				)}
			>
				{hint}
			</p>
		</div>
	);
}

function StepBadge({ n }: { n: number }) {
	return (
		<span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">
			{n}
		</span>
	);
}

type Group = {
	title: string | null;
	hint?: string;
	lines: Line[];
	empty?: string;
	footnote?: string;
};

function Step({
	n,
	title,
	total,
	groups,
}: {
	n: number;
	title: string;
	total: number;
	groups: Group[];
}) {
	return (
		<section className="rounded-2xl border border-border-subtle p-4">
			<div className="flex items-start gap-3">
				<StepBadge n={n} />
				<div className="min-w-0 flex-1 space-y-3">
					<div className="flex items-baseline justify-between gap-3">
						<h4 className="text-[14px] font-semibold text-foreground">
							{title}
						</h4>
						<span
							data-nominal
							className="tabular text-[15px] font-semibold text-foreground"
						>
							{formatSigned(total)}
						</span>
					</div>
					{groups.map((g) =>
						g.title ? (
							<SubGroup key={g.title} group={g} />
						) : (
							<div key="_" className="space-y-1.5">
								{g.lines.map((l) => (
									<AmountRow
										key={l.label}
										label={l.label}
										value={l.value}
										note={l.note}
										muted
									/>
								))}
							</div>
						),
					)}
				</div>
			</div>
		</section>
	);
}

/** Kelompok biaya: judul + subtotal, rincian bisa dibuka-tutup. */
function SubGroup({ group }: { group: Group }) {
	const [open, setOpen] = useState(true);
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
						{formatRupiah(subtotal)}
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
							label={l.label}
							value={l.value}
							note={l.note}
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

function AmountRow({
	label,
	value,
	note,
	muted,
	small,
}: {
	label: string;
	value: number;
	note?: string;
	muted?: boolean;
	small?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-baseline justify-between gap-3",
				small ? "text-[12.5px]" : "text-[13.5px]",
			)}
		>
			<span
				className={cn(
					"min-w-0",
					muted || small ? "text-muted-foreground" : "text-foreground",
				)}
			>
				{label}
				{note ? (
					<span className="ml-1.5 text-[11px] text-muted-foreground/80">
						· {note}
					</span>
				) : null}
			</span>
			<span
				data-nominal
				className={cn(
					"tabular shrink-0",
					small ? "text-foreground/90" : "text-foreground",
				)}
			>
				{formatSigned(value)}
			</span>
		</div>
	);
}

function ResultRow({
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
				{formatSigned(value)}
			</span>
		</div>
	);
}
