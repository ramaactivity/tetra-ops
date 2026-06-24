"use client";

import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { RollforwardResult } from "@/lib/finance/inventory-rollforward";

function csvEscape(v: string | number): string {
	const s = String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = [
	"Jenis",
	"SKU",
	"Nama",
	"Unit",
	"StokAwal_Qty",
	"StokAwal_Harga",
	"StokAwal_Total",
	"Pembelian_Qty",
	"Pembelian_Harga",
	"Pembelian_Total",
	"StokAkhir_Qty",
	"StokAkhir_Harga",
	"StokAkhir_Total",
	"COGS_Qty",
	"COGS_Harga",
	"COGS_Total",
	"CostBasis",
];

export function ExportCsvButton({
	data,
	month,
}: {
	data: RollforwardResult;
	month: string; // YYYY-MM
}) {
	function download() {
		const lines: string[] = [HEADER.join(",")];
		for (const bucket of data.buckets) {
			for (const it of bucket.items) {
				lines.push(
					[
						bucket.label,
						it.sku,
						it.name,
						it.unit,
						it.openingQty,
						it.wac,
						it.openingTotal,
						it.purchasesQty,
						it.purchasesQty > 0 ? it.purchasesPrice : "",
						it.purchasesTotal,
						it.closingQty,
						it.wac,
						it.closingTotal,
						it.usageQty,
						it.wac,
						it.usageTotal,
						it.openingDerived || it.closingDerived ? "Derived" : "Opname",
					]
						.map(csvEscape)
						.join(","),
				);
			}
		}
		const blob = new Blob([`${lines.join("\n")}\n`], {
			type: "text/csv;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `persediaan-${month}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	return (
		<button
			type="button"
			onClick={download}
			className={buttonVariants({ variant: "outline" })}
		>
			<Download className="size-4" />
			CSV
		</button>
	);
}
