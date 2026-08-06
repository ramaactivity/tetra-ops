"use client";

import { Gift, ShoppingCart, Wallet2 } from "lucide-react";
import { useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

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
	unitLabel,
	kind,
}: {
	suppliers?: OriginSupplier[];
	/** Satuan yang dipakai untuk jumlah beli (mis. "pcs" / "unit"). */
	unitLabel: string;
	kind: "inventory" | "fixed_asset";
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
