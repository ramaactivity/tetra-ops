import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatRupiah } from "@/lib/format";
import { COGS_BUCKETS, inventoryCoaForSku } from "@/lib/inventory/cogs-buckets";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Rekonsiliasi" };

type Row = {
	label: string;
	code: string;
	gl: number; // saldo di Buku Besar (natural sign)
	sub: number; // nilai dari sub-ledger / stok fisik
	note?: string;
};

// Toleransi pembulatan (rupiah). Qty stok bisa pecahan (mis. media set
// 8,9229 unit) → nilai fisik = qty × WAC punya sisa sub-rupiah, sementara GL
// memposting bilangan bulat per event. Selisih ≤ toleransi = sinkron
// (pembulatan), bukan drift yang butuh jurnal koreksi. Drift nyata (transaksi
// hilang/dobel) selalu ratusan rupiah ke atas, jadi Rp5 aman.
const RECONCILE_TOLERANCE = 5;

export default async function ReconciliationPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		redirect("/");
	}

	const sb = await createClient();

	// ── GL balances per account (raw = Σdebit − Σcredit) ──────────────────────
	const { data: lines } = await sb
		.from("journal_lines")
		.select("account_code, debit_amount, credit_amount");
	const glRaw = new Map<string, number>();
	for (const l of (lines ?? []) as Array<{
		account_code: string;
		debit_amount: number;
		credit_amount: number;
	}>) {
		glRaw.set(
			l.account_code,
			(glRaw.get(l.account_code) ?? 0) +
				Number(l.debit_amount) -
				Number(l.credit_amount),
		);
	}
	const assetGl = (code: string) => glRaw.get(code) ?? 0; // debit-normal
	const liabGl = (code: string) => -(glRaw.get(code) ?? 0); // credit-normal

	// ── Persediaan: GL 1-2xx vs nilai stok fisik (qty × WAC) per bucket ───────
	const { data: items } = await sb
		.from("inventory_items")
		.select("id, sku, purchase_price_avg")
		.eq("category", "inventory")
		.eq("is_active", true)
		.is("deleted_at", null);
	const itemRows = (items ?? []) as Array<{
		id: string;
		sku: string;
		purchase_price_avg: number;
	}>;
	const ids = itemRows.map((i) => i.id);
	const { data: levels } = ids.length
		? await sb.rpc("get_stock_levels", { p_item_ids: ids })
		: { data: [] };
	const stock = new Map(
		((levels ?? []) as Array<{ item_id: string; stock: number }>).map((r) => [
			r.item_id,
			Number(r.stock),
		]),
	);
	// Akumulasi TANPA pembulatan per item, bulatkan sekali per bucket — round
	// per item menumpuk error ±0,5/item (kasus nyata: media set qty 8,9229 ×
	// WAC = xxx,50 → dibulatkan naik → "selisih Rp-1" palsu vs GL).
	const physByCoa = new Map<string, number>();
	for (const it of itemRows) {
		const coa = inventoryCoaForSku(it.sku);
		const val = (stock.get(it.id) ?? 0) * (Number(it.purchase_price_avg) || 0);
		physByCoa.set(coa, (physByCoa.get(coa) ?? 0) + val);
	}
	for (const [coa, val] of physByCoa) physByCoa.set(coa, Math.round(val));
	const bucketCoa: Record<string, { code: string; label: string }> = {
		mediaset: { code: "1-200", label: "Persediaan Media Set" },
		sleeve: { code: "1-201", label: "Persediaan Sleeve" },
		flashdisk: { code: "1-202", label: "Persediaan Flashdisk" },
		pouch: { code: "1-203", label: "Persediaan Pouch" },
		photomagnet: { code: "1-204", label: "Persediaan Photomagnet" },
		keychain: { code: "1-205", label: "Persediaan Keychain" },
		other: { code: "1-209", label: "Persediaan Lainnya" },
	};
	const inventoryRows: Row[] = COGS_BUCKETS.map((b) => {
		const meta = bucketCoa[b.key];
		return {
			label: meta.label,
			code: meta.code,
			gl: assetGl(meta.code),
			sub: physByCoa.get(meta.code) ?? 0,
		};
	}).filter((r) => r.gl !== 0 || r.sub !== 0);

	// ── Hutang Vendor 2-101 vs payables terbuka ───────────────────────────────
	const { data: payables } = await sb
		.from("payables")
		.select("amount, amount_paid, status");
	const apSub = (
		(payables ?? []) as Array<{
			amount: number;
			amount_paid: number;
			status: string;
		}>
	)
		.filter((p) => p.status !== "cancelled")
		.reduce((s, p) => s + (Number(p.amount) - Number(p.amount_paid)), 0);

	// ── Owner pool 2-300 vs owner_earnings ────────────────────────────────────
	const { data: earnings } = await sb.from("owner_earnings").select("amount");
	const ownerSub = ((earnings ?? []) as Array<{ amount: number }>).reduce(
		(s, e) => s + Number(e.amount),
		0,
	);

	// ── Sinking 2-2xx vs sinking_fund_movements per fund ──────────────────────
	const { data: funds } = await sb
		.from("sinking_funds")
		.select("id, code, coa_account, name");
	const { data: moves } = await sb
		.from("sinking_fund_movements")
		.select("fund_id, movement_type, amount");
	const fundNet = new Map<string, number>();
	for (const m of (moves ?? []) as Array<{
		fund_id: string;
		movement_type: string;
		amount: number;
	}>) {
		const sign = m.movement_type === "withdrawal" ? -1 : 1;
		fundNet.set(
			m.fund_id,
			(fundNet.get(m.fund_id) ?? 0) + sign * Number(m.amount),
		);
	}
	const sinkingRows: Row[] = (
		(funds ?? []) as Array<{
			id: string;
			code: string;
			coa_account: string;
			name: string;
		}>
	)
		.map((f) => ({
			label: f.name ?? f.code,
			code: f.coa_account,
			gl: liabGl(f.coa_account),
			sub: fundNet.get(f.id) ?? 0,
		}))
		.filter((r) => r.gl !== 0 || r.sub !== 0);

	const liabilityRows: Row[] = [
		{
			label: "Hutang Vendor",
			code: "2-101",
			gl: liabGl("2-101"),
			sub: apSub,
		},
		{
			label: "Hutang Bagi Hasil Owner",
			code: "2-300",
			gl: liabGl("2-300"),
			sub: ownerSub,
		},
		...sinkingRows,
	].filter((r) => r.gl !== 0 || r.sub !== 0);

	const crewGl = liabGl("2-100");

	const sections: Array<{ title: string; desc: string; rows: Row[] }> = [
		{
			title: "Persediaan (GL vs stok fisik)",
			desc: "Saldo akun persediaan di Buku Besar harus sama dengan nilai stok fisik (qty × harga rata-rata) per kategori.",
			rows: inventoryRows,
		},
		{
			title: "Kewajiban (GL vs sub-ledger)",
			desc: "Akun kontrol di Buku Besar harus sama dengan total catatan rinciannya.",
			rows: liabilityRows,
		},
	];

	const allRows = [...inventoryRows, ...liabilityRows];
	const drifts = allRows.filter(
		(r) => Math.abs(r.gl - r.sub) > RECONCILE_TOLERANCE,
	);

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-lg font-semibold">Rekonsiliasi</h1>
				<p className="text-sm text-muted-foreground">
					Membandingkan saldo Buku Besar (GL) dengan catatan rinci & stok fisik.
					Selisih = ada yang belum sinkron.
				</p>
			</div>

			<div
				className={cn(
					"flex items-center gap-2 rounded-2xl border p-4 text-sm",
					drifts.length === 0
						? "border-emerald-200 bg-emerald-50 text-emerald-800"
						: "border-amber-200 bg-amber-50 text-amber-800",
				)}
			>
				{drifts.length === 0 ? (
					<>
						<CheckCircle2 className="size-5 shrink-0" />
						<span>
							Semua cocok — GL sinkron dengan sub-ledger & stok fisik.
						</span>
					</>
				) : (
					<>
						<AlertTriangle className="size-5 shrink-0" />
						<span>
							{drifts.length} akun belum sinkron — perlu jurnal koreksi.
						</span>
					</>
				)}
			</div>

			{sections.map((sec) => (
				<section
					key={sec.title}
					className="overflow-hidden rounded-2xl border border-border-subtle bg-card"
				>
					<div className="border-b border-border-subtle p-4">
						<h2 className="text-sm font-semibold">{sec.title}</h2>
						<p className="mt-0.5 text-xs text-muted-foreground">{sec.desc}</p>
					</div>
					{sec.rows.length === 0 ? (
						<p className="p-4 text-sm text-muted-foreground">
							Belum ada saldo.
						</p>
					) : (
						<table className="w-full text-sm">
							<thead className="bg-secondary/40 text-xs text-muted-foreground">
								<tr>
									<th className="px-4 py-2 text-left font-medium">Akun</th>
									<th className="px-4 py-2 text-right font-medium">
										Buku Besar
									</th>
									<th className="px-4 py-2 text-right font-medium">
										Sub-ledger / Fisik
									</th>
									<th className="px-4 py-2 text-right font-medium">Selisih</th>
									<th className="px-4 py-2 text-center font-medium">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border-subtle">
								{sec.rows.map((r) => {
									const delta = r.gl - r.sub;
									const ok = Math.abs(delta) <= RECONCILE_TOLERANCE;
									return (
										<tr key={`${sec.title}-${r.code}-${r.label}`}>
											<td className="px-4 py-2">
												<span className="font-medium">{r.label}</span>{" "}
												<span className="text-xs text-muted-foreground">
													{r.code}
												</span>
											</td>
											<td className="px-4 py-2 text-right tabular">
												{formatRupiah(r.gl)}
											</td>
											<td className="px-4 py-2 text-right tabular">
												{formatRupiah(r.sub)}
											</td>
											<td
												className={cn(
													"px-4 py-2 text-right tabular",
													!ok && "font-semibold text-amber-700",
												)}
											>
												{delta === 0 ? (
													"—"
												) : ok ? (
													<span
														className="text-muted-foreground"
														title="Sisa pembulatan qty pecahan × harga rata-rata — bukan drift"
													>
														{formatRupiah(delta)}{" "}
														<span className="text-xs">(pembulatan)</span>
													</span>
												) : (
													formatRupiah(delta)
												)}
											</td>
											<td className="px-4 py-2 text-center">
												{ok ? (
													<CheckCircle2 className="inline size-4 text-emerald-600" />
												) : (
													<AlertTriangle className="inline size-4 text-amber-600" />
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</section>
			))}

			<p className="text-xs text-muted-foreground">
				Catatan: Hutang Crew (2-100) saldo GL ={" "}
				<span className="tabular font-medium">{formatRupiah(crewGl)}</span> —
				tidak punya sub-ledger terpisah (dikelola via settlement + "Bayar fee
				crew"), jadi tidak direkonsiliasi di sini.
			</p>
		</div>
	);
}
