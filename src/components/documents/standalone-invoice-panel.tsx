"use client";

import { CalendarPlus, Link2, Loader2 } from "lucide-react";
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
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
	type LinkableEvent,
	linkInvoice,
	listLinkableEvents,
} from "@/lib/actions/documents";
import { formatDateID } from "@/lib/format";

/**
 * Invoice DP yang belum punya event. Dua jalan keluar: DP masuk → buat event
 * (form booking terisi, invoice tertaut otomatis), atau tautkan ke event yang
 * sudah diinput. Pembayaran baru bisa dicatat setelah tertaut.
 */
export function StandaloneInvoicePanel({
	invoiceId,
	dirty,
}: {
	invoiceId: string | null;
	dirty: boolean;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [events, setEvents] = useState<LinkableEvent[] | null>(null);
	const [eventId, setEventId] = useState("");
	const [pending, start] = useTransition();

	function openLink() {
		setOpen(true);
		if (events === null) {
			start(async () => setEvents(await listLinkableEvents()));
		}
	}
	function link() {
		if (!invoiceId || !eventId) return;
		start(async () => {
			const res = await linkInvoice(invoiceId, eventId);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Invoice tertaut ke event");
			setOpen(false);
			router.refresh();
		});
	}

	const needSave = !invoiceId || dirty;

	return (
		<section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
			<div>
				<h2 className="text-[15px] font-semibold tracking-[-0.01em]">
					Invoice DP — belum tertaut event
				</h2>
				<p className="text-[12.5px] text-muted-foreground">
					Kirim ke klien untuk menagih DP. Setelah DP masuk, buat event-nya dari
					sini; invoice ini ikut tertaut dengan nomor yang sama, lalu DP dicatat
					di event.
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					disabled={needSave}
					onClick={() =>
						router.push(`/operations/new?fromInvoice=${invoiceId}`)
					}
				>
					<CalendarPlus /> DP masuk → Buat event
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={needSave}
					onClick={openLink}
				>
					<Link2 /> Tautkan ke event yang sudah ada
				</Button>
				{needSave ? (
					<span className="self-center text-[12px] text-muted-foreground">
						Simpan dulu invoice-nya.
					</span>
				) : null}
			</div>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Tautkan ke event</DialogTitle>
						<DialogDescription>
							Hanya event yang belum punya invoice. Jatuh tempo invoice akan
							mengikuti tenggat pelunasan event.
						</DialogDescription>
					</DialogHeader>
					<Combobox
						value={eventId}
						onValueChange={setEventId}
						options={(events ?? []).map((e) => ({
							value: e.id,
							label: e.client_name,
							sublabel: `${formatDateID(e.event_date)} · ${e.project_id}`,
						}))}
						allowFreeText={false}
						wrapOptions
						placeholder={
							events === null ? "Memuat event…" : "Cari klien / kode event…"
						}
						emptyMessage="Semua event sudah punya invoice"
						aria-label="Event"
					/>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button onClick={link} disabled={!eventId || pending}>
							{pending ? <Loader2 className="animate-spin" /> : <Link2 />}{" "}
							Tautkan
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
