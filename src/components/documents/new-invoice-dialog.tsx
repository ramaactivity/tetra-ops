"use client";

import { FileText, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { ensureInvoiceForEvent } from "@/lib/actions/documents";
import { formatDateID, formatRupiah } from "@/lib/format";

export type InvoiceEventOption = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	grand_total: number;
	has_invoice: boolean;
};

/** "+ Invoice": pilih event, lalu buka invoice-nya (dibuat dari data event bila belum ada). */
export function NewInvoiceDialog({ events }: { events: InvoiceEventOption[] }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [eventId, setEventId] = useState("");
	const [pending, start] = useTransition();

	const options = events.map((e) => ({
		value: e.id,
		label: `${e.client_name}`,
		sublabel: `${formatDateID(e.event_date)} · ${e.project_id} · ${formatRupiah(e.grand_total)}${e.has_invoice ? " · sudah ada invoice" : ""}`,
	}));

	function go() {
		if (!eventId) return;
		start(async () => {
			const res = await ensureInvoiceForEvent(eventId);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			setOpen(false);
			toast.success(
				res.created
					? "Invoice dibuat dari data event"
					: "Membuka invoice yang sudah ada",
			);
			router.push(`/finance/dokumen/${res.id}`);
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-border-default bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary">
				<Plus className="size-4" /> Invoice
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Invoice dari event</DialogTitle>
					<DialogDescription>
						Pilih event untuk menagih pelunasan. Klien baru mau DP dan event-nya
						belum diinput? Buat invoice DP dulu — nanti ditautkan ke event saat
						DP masuk.
					</DialogDescription>
				</DialogHeader>
				<Combobox
					value={eventId}
					onValueChange={setEventId}
					options={options}
					allowFreeText={false}
					placeholder="Cari nama klien / kode event…"
					aria-label="Event"
				/>
				<DialogFooter className="sm:justify-between">
					<Button
						variant="outline"
						onClick={() => {
							setOpen(false);
							router.push("/finance/dokumen/new?type=invoice");
						}}
						disabled={pending}
					>
						<Plus /> Invoice DP (belum ada event)
					</Button>
					<Button onClick={go} disabled={!eventId || pending}>
						{pending ? <Loader2 className="animate-spin" /> : <FileText />} Buka
						invoice
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
