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
	"WAC",
	"StokAwal_Qty",
	"StokAwal_Total",
	"Pembelian_Qty",
	"Pembelian_Total",
	"StokAkhir_Qty",
	"StokAkhir_Total",
	"Pemakaian_Qty",
	"Pemakaian_Total",
	"Selisih_Total",
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
						it.wac,
						it.openingQty,
						it.openingTotal,
						it.purchasesQty,
						it.purchasesTotal,
						it.closingQty,
						it.closingTotal,
						it.usageQty,
						it.usageTotal,
						it.varianceTotal,
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
