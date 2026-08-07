"use client";

import {
	Gift,
	Loader2,
	Paperclip,
	ShoppingCart,
	Wallet2,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import {
	type CashAccountOption,
	defaultCashAccount,
} from "@/lib/finance/cash-accounts";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotaUpload } from "./nota-upload";

export type OriginSupplier = { id: string; name: string };

/**
 * "Asal barang" — menambah item hampir selalu berarti barangnya baru masuk
 * gudang. Bagian ini yang menyambungkannya ke pembukuan, supaya owner tidak
 * perlu ingat untuk mampir ke modul Pembelian setelahnya.
 *
 * Tiga pilihan, tiga perlakuan akuntansi berbeda (lihat lib/inventory/item-origin.ts):
 *   Beli sekarang       → lewat modul Pembelian: stok masuk + kas/hutang keluar
 *   Sudah dimiliki      → Dr barang / Cr Modal Owner, tanpa uang keluar
 *   Daftar saja         → tanpa stok, tanpa jurnal
 */
export function ItemOriginSection({
	suppliers = [],
	cashAccounts = [],
	unitLabel,
	kind,
	itemName = "",
}: {
	suppliers?: OriginSupplier[];
	/** Rekening kas/bank + saldo — sumber dana kalau belinya tunai. */
	cashAccounts?: CashAccountOption[];
	/** Satuan yang dipakai untuk jumlah beli (mis. "pcs" / "unit"). */
	unitLabel: string;
	kind: "inventory" | "fixed_asset";
	/** Nama item — dipakai untuk keterangan nota di Arsip Nota. */
	itemName?: string;
}) {
	const [origin, setOrigin] = useState<
		"purchase" | "owner_contribution" | "none"
	>("purchase");
	const [qty, setQty] = useState("1");
	const [unitCost, setUnitCost] = useState("");
	const [method, setMethod] = useState("cash");
	const [supplierId, setSupplierId] = useState("");

	const qtyNum = Number(qty) || 0;
	const costNum = Number(unitCost.replace(/[^\d]/g, "")) || 0;
	const total = Math.round(qtyNum * costNum);
	const noun = kind === "fixed_asset" ? "alat" : "barang";

	// Rekening sumber dana untuk pembelian tunai. Kosong = default pintar:
	// rekening pertama yang saldonya cukup, bukan asal 1-100 Kas Tunai.
	const [account, setAccount] = useState("");
	const payAccount = account || defaultCashAccount(cashAccounts, total);
	const selectedAcct = cashAccounts.find((a) => a.code === payAccount);
	const insufficient = !!selectedAcct && selectedAcct.balance < total;

	const OPTIONS = [
		{
			value: "purchase" as const,
			icon: ShoppingCart,
			title: "Beli sekarang",
			desc: `Uang keluar untuk ${noun} ini. Stok masuk + tercatat di pembukuan.`,
		},
		{
			value: "owner_contribution" as const,
			icon: Gift,
			title: "Sudah dimiliki",
			desc: "Barang lama / setoran owner. Masuk sebagai modal, bukan uang keluar.",
		},
		{
			value: "none" as const,
			icon: Wallet2,
			title: "Daftar saja",
			desc: "Cuma didaftarkan. Tanpa stok & tanpa catatan keuangan.",
		},
	];

	return (
		<div className="space-y-4">
			<input type="hidden" name="origin" value={origin} />

			<div className="grid gap-2 sm:grid-cols-3">
				{OPTIONS.map((o) => {
					const active = origin === o.value;
					const Icon = o.icon;
					return (
						<button
							key={o.value}
							type="button"
							onClick={() => setOrigin(o.value)}
							className={cn(
								"press tap rounded-xl border p-3 text-left transition-colors",
								active
									? "border-foreground bg-card shadow-[var(--shadow-level-1)]"
									: "border-border-default hover:bg-secondary/50",
							)}
						>
							<span className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground">
								<Icon className="size-4 text-muted-foreground" aria-hidden />
								{o.title}
							</span>
							<span className="text-muted-foreground mt-0.5 block text-[11.5px] leading-relaxed">
								{o.desc}
							</span>
						</button>
					);
				})}
			</div>

			{origin !== "none" && (
				<div className="space-y-3 rounded-xl border border-border-default bg-surface-2 p-4">
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={`Jumlah (${unitLabel})`} required>
							<input
								type="number"
								name="buy_quantity"
								min="0"
								step="any"
								value={qty}
								onChange={(e) => setQty(e.target.value)}
								className={inputCls}
							/>
						</Field>
						<Field
							label={
								origin === "purchase"
									? "Harga satuan (Rp)"
									: "Nilai per satuan (Rp)"
							}
							required
						>
							<input
								type="text"
								inputMode="numeric"
								name="buy_unit_cost"
								value={unitCost}
								onChange={(e) =>
									setUnitCost(e.target.value.replace(/[^\d]/g, ""))
								}
								placeholder="0"
								className={cn(inputCls, "tabular")}
							/>
						</Field>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={origin === "purchase" ? "Tanggal beli" : "Tanggal"}>
							<input
								type="date"
								name="buy_date"
								defaultValue={new Date().toISOString().slice(0, 10)}
								className={inputCls}
							/>
						</Field>
						{origin === "purchase" && (
							<Field label="Cara bayar">
								<NativeSelect
									value={method}
									onValueChange={setMethod}
									options={[
										{ value: "cash", label: "Tunai (kas langsung keluar)" },
										{ value: "top_7", label: "Tempo 7 hari" },
										{ value: "top_14", label: "Tempo 14 hari" },
										{ value: "top_30", label: "Tempo 30 hari" },
									]}
									triggerClassName="h-10! w-full rounded-lg px-3 text-sm"
								/>
								<input type="hidden" name="buy_payment_method" value={method} />
							</Field>
						)}
					</div>

					{/* Sumber dana pembelian tunai. Tanpa ini semua belanja diam-diam
					    memotong 1-100 Kas Tunai, termasuk yang dibayar lewat bank. */}
					{origin === "purchase" && method === "cash" && (
						<>
							<input
								type="hidden"
								name="buy_payment_account_code"
								value={payAccount}
							/>
							{cashAccounts.length > 0 && (
								<Field label="Uang diambil dari">
									<NativeSelect
										value={payAccount}
										onValueChange={setAccount}
										options={cashAccounts.map((a) => ({
											value: a.code,
											label: `${a.name} — ${formatRupiah(a.balance)}`,
										}))}
										triggerClassName="h-10! w-full rounded-lg px-3 text-sm"
									/>
									{insufficient && (
										<p className="text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
											Saldo {selectedAcct?.name} tinggal{" "}
											<span className="tabular">
												{formatRupiah(selectedAcct?.balance ?? 0)}
											</span>
											, sedangkan uang keluar{" "}
											<span className="tabular">{formatRupiah(total)}</span> —
											pastikan rekeningnya benar.
										</p>
									)}
								</Field>
							)}
						</>
					)}

					{origin === "purchase" && (
						<div className="grid gap-3 sm:grid-cols-2">
							<Field label="Supplier (opsional)">
								<NativeSelect
									value={supplierId}
									onValueChange={setSupplierId}
									placeholder="Pilih supplier…"
									options={suppliers.map((s) => ({
										value: s.id,
										label: s.name,
									}))}
									triggerClassName="h-10! w-full rounded-lg px-3 text-sm"
								/>
								<input
									type="hidden"
									name="buy_supplier_id"
									value={supplierId}
								/>
							</Field>
							<Field label="No. nota / invoice (opsional)">
								<input
									type="text"
									name="buy_invoice_no"
									placeholder="INV-8891"
									className={inputCls}
								/>
							</Field>
						</div>
					)}

					{origin === "purchase" && (
						<Field label="Foto nota (opsional)">
							<NotaUpload itemName={itemName} amount={total} />
						</Field>
					)}

					<div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
						<span className="text-[12px] text-muted-foreground">
							{origin === "purchase" ? "Total dibayar" : "Nilai masuk"}
						</span>
						<span className="tabular text-[15px] font-semibold text-foreground">
							{formatRupiah(total)}
						</span>
					</div>

					<p className="text-muted-foreground text-[11px] leading-relaxed">
						{origin === "purchase"
							? method === "cash"
								? "Stok bertambah, kas berkurang, dan jurnalnya dibuat otomatis. Bukti nota bisa dilampirkan di Arsip Nota."
								: "Stok bertambah dan muncul sebagai Hutang Dagang — dilunasi lewat Finance › Hutang Dagang."
							: "Stok bertambah tanpa uang keluar; nilainya dicatat sebagai setoran modal owner."}
					</p>
				</div>
			)}
		</div>
	);
}

const inputCls =
	"h-10 w-full rounded-lg border border-border-default bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({
	label,
	required,
	children,
}: {
	label: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<span className="block text-[12px] font-medium text-foreground">
				{label}
				{required && <span className="ml-0.5 text-destructive">*</span>}
			</span>
			{children}
		</div>
	);
}
