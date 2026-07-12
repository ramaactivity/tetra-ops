import { Handshake } from "lucide-react";
import type { CommissionBankOption } from "@/components/finance/commissions/commission-pay-dialog";
import { CommissionsExplorer } from "@/components/finance/commissions/commissions-explorer";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { getCommissionsOverview } from "@/lib/finance/commissions-data";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function CommissionsPage() {
	const supabase = await createClient();
	const today = new Date();
	const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

	const [{ rows, totals }, { data: banksData }] = await Promise.all([
		getCommissionsOverview(supabase),
		supabase
			.from("bank_accounts")
			.select("coa_code, bank_name, account_number, account_holder")
			.eq("is_active", true)
			.order("is_default_receive", { ascending: false })
			.order("bank_name", { ascending: true }),
	]);

	const banks: CommissionBankOption[] = (banksData ?? []).map((b) => ({
		coa_code: b.coa_code as string,
		label: `${b.bank_name}${b.account_number ? ` · ${b.account_number}` : ""}${b.account_holder ? ` · ${b.account_holder}` : ""}`,
	}));

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Komisi Vendor & Relasi"
				description="Lacak & bayar komisi tiap event. Pembayaran otomatis tercatat di jurnal."
			/>

			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<SummaryCard
					label="Perlu dibayar"
					value={formatRupiah(totals.payableAmount)}
					hint={`${totals.payableCount} komisi terutang`}
					tone="rose"
				/>
				<SummaryCard
					label="Sudah dibayar"
					value={formatRupiah(totals.paidAmount)}
					hint="Total komisi terbayar"
					tone="emerald"
				/>
				<SummaryCard
					label="Belum settle"
					value={formatRupiah(totals.notSettledAmount)}
					hint="Menunggu event di-settle"
					tone="amber"
				/>
				<SummaryCard
					label="Jumlah komisi"
					value={rows.length.toLocaleString("id-ID")}
					hint="Vendor + relasi"
					tone="muted"
				/>
			</dl>

			<CommissionsExplorer rows={rows} banks={banks} defaultDate={todayISO} />

			<div className="rounded-lg border border-border-default bg-surface-3/40 p-3 text-fluid-caption text-muted-foreground">
				<p className="flex items-start gap-2">
					<Handshake className="mt-0.5 size-3.5 shrink-0" aria-hidden />
					<span>
						Komisi di-akrual sebagai utang (2-101 vendor / 2-102 relasi) saat
						event di-settle, lalu bisa dibayar dari sini — Dr utang komisi / Cr
						kas-bank. Vendor <b>Potongan Langsung</b> ditandai "Potong di muka"
						(sudah dipotong dari aliran uang, bukan uang keluar). Status{" "}
						<b>Belum settle</b> = tunggu event di-settle dulu.
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
	tone: "rose" | "emerald" | "amber" | "muted";
}) {
	const cls =
		tone === "rose"
			? "text-rose-600 dark:text-rose-400"
			: tone === "emerald"
				? "text-emerald-600 dark:text-emerald-400"
				: tone === "amber"
					? "text-amber-600 dark:text-amber-400"
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
