"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";

export type SourceDocOption = {
	id: string;
	doc_type: "invoice" | "quotation";
	doc_number: string;
	client_name: string;
	event_date: string | null;
};

/**
 * "Isi dari invoice DP / quotation" di atas form booking. Memilih dokumen
 * membuka ulang halaman dengan ?fromInvoice / ?fromQuotation sehingga form
 * terisi dan dokumennya ikut tertaut ke event saat disimpan.
 */
export function SourceDocPicker({ options }: { options: SourceDocOption[] }) {
	const router = useRouter();
	if (options.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-card px-4 py-3 shadow-[var(--shadow-level-1)]">
			<FileText className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="text-[14px] font-medium">
					Sudah ada invoice DP atau quotation?
				</p>
				<p className="text-[12.5px] text-muted-foreground">
					Pilih supaya form terisi otomatis dan dokumennya tertaut ke event ini.
				</p>
			</div>
			<div className="w-full sm:w-[340px]">
				<Combobox
					value=""
					onValueChange={(id) => {
						const doc = options.find((o) => o.id === id);
						if (!doc) return;
						const key =
							doc.doc_type === "invoice" ? "fromInvoice" : "fromQuotation";
						router.push(`/operations/new?${key}=${doc.id}`);
					}}
					options={options.map((o) => ({
						value: o.id,
						label: o.client_name || "(tanpa nama)",
						sublabel: [
							o.doc_type === "invoice" ? "Invoice DP" : "Quotation",
							o.doc_number,
							o.event_date,
						]
							.filter(Boolean)
							.join(" · "),
					}))}
					allowFreeText={false}
					wrapOptions
					minPopupWidth={360}
					placeholder="Pilih invoice DP / quotation…"
					aria-label="Isi dari dokumen"
				/>
			</div>
		</div>
	);
}
