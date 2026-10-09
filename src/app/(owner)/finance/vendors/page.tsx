import { Handshake, X } from "lucide-react";
import Link from "next/link";
import type { CommissionBankOption } from "@/components/finance/commissions/commission-pay-dialog";
import { CommissionsExplorer } from "@/components/finance/commissions/commissions-explorer";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { getCommissionsOverview } from "@/lib/finance/commissions-data";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function CommissionsPage({
	searchParams,
}: {
	searchParams: Promise<{ vendor?: string }>;
}) {
	const { vendor } = await searchParams;
	const supabase = await createClient();
	const today = new Date();
	const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

	const [{ rows, totals }, { data: banksData }, { data: vendorRow }] =
		await Promise.all([
			getCommissionsOverview(supabase, { vendorContactId: vendor }),
			supabase
				.from("bank_accounts")
				.select("coa_code, bank_name, account_number, account_holder")
				.eq("is_active", true)
				// Komisi tidak pernah dibayar dari kartu e-toll.
				.neq("account_kind", "emoney")
				.order("is_default_receive", { ascending: false })
				.order("bank_name", { ascending: true }),
			vendor
				? supabase
						.from("contacts")
						.select("id, name")
						.eq("id", vendor)
						.maybeSingle()
				: Promise.resolve({ data: null }),
		]);

	const banks: CommissionBankOption[] = (banksData ?? []).map((b) => ({
		coa_code: b.coa_code as string,
		label: `${b.bank_name}${b.account_number ? ` · ${b.account_number}` : ""}${b.account_holder ? ` · ${b.account_holder}` : ""}`,
	}));

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Komisi Vendor & Relasi"
				description="Komisi yang Tetra bayarkan ke vendor & relasi. Bisa dibayar setelah acara ditutup (settle); pembayaran otomatis tercatat di jurnal."
			/>
			{vendorRow && (
				<div className="flex flex-wrap items-center gap-2">
					<span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground pl-3.5 pr-1 text-[13px] font-medium text-background">
						Vendor: {vendorRow.name as string}
						<Link
							href="/finance/vendors"
							aria-label="Tampilkan semua komisi"
							className="grid size-6 place-items-center rounded-full hover:bg-white/15"
						>
							<X className="size-3.5" />
						</Link>
					</span>
					<Link
						href={`/vendors/${vendorRow.id as string}`}
						className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
					>
						Buka Pusat Vendor →
					</Link>
				</div>
			)}

			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<SummaryCard
					label="Siap dibayar"
					value={formatRupiah(totals.payableAmount)}
					hint={`${totals.payableCount} komisi · acara sudah ditutup`}
					tone="rose"
				/>
				<SummaryCard
					label="Dibayar di muka"
					value={formatRupiah(totals.advanceAmount)}
					hint="Sudah ditransfer, acara belum ditutup"
					tone="sky"
				/>
				<SummaryCard
					label="Sudah dibayar"
					value={formatRupiah(totals.paidAmount)}
					hint="Total komisi terbayar"
					tone="emerald"
				/>
				<SummaryCard
					label="Menunggu acara ditutup"
					value={formatRupiah(totals.notSettledAmount)}
					hint={`Belum bisa dibayar · ${rows.length} komisi total`}
					tone="amber"
				/>
			</dl>

			<CommissionsExplorer rows={rows} banks={banks} defaultDate={todayISO} />

			<div className="rounded-lg border border-border-default bg-surface-3/40 p-3 text-fluid-caption text-muted-foreground">
				<p className="flex items-start gap-2">
					<Handshake className="mt-0.5 size-3.5 shrink-0" aria-hidden />
					<span>
						Komisi di-akrual sebagai utang (2-103 vendor / 2-102 relasi) saat
						event di-settle, lalu dibayar dari sini — Dr utang komisi / Cr
						kas-bank. Belum di-settle pun tetap bisa dibayar lewat{" "}
						<b>Bayar di muka</b>: uangnya dicatat sebagai aset Uang Muka Komisi
						(1-310) dan otomatis diperhitungkan saat event di-settle — jadi
						tidak pernah tertagih dua kali. Vendor <b>Potongan Langsung</b>{" "}
						ditandai "Dipotong vendor" (sudah dipotong dari aliran uang, bukan
						uang keluar).
					</span>
				</p>
			</div>
		</Container>
	);
}

function SummaryCard({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string;
	hint: string;
	tone: "rose" | "emerald" | "amber" | "sky" | "muted";
}) {
	const cls =
		tone === "rose"
			? "text-rose-600 dark:text-rose-400"
			: tone === "emerald"
				? "text-emerald-600 dark:text-emerald-400"
				: tone === "amber"
					? "text-amber-600 dark:text-amber-400"
					: tone === "sky"
						? "text-sky-600 dark:text-sky-400"
						: "text-foreground";
	return (
		<div className="space-y-1 rounded-xl border border-border-default bg-card p-4">
			<dt className="text-fluid-caption font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</dt>
			<dd className={`tabular text-fluid-h2 font-semibold ${cls}`}>{value}</dd>
			<p className="text-[10px] text-muted-foreground">{hint}</p>
		</div>
	);
}
