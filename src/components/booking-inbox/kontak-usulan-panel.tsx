"use client";

import { Loader2, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { tambahkanKontak, tandaiBukanKlien } from "@/lib/actions/kontak-usulan";
import { pilihanEventDraft } from "@/lib/actions/payment-drafts";

export type KontakUsulanView = {
	id: string;
	judul: string;
	nomor: string | null;
	namaWa: string | null;
	mengakuBooking: boolean;
	cuplikan: string | null;
	tanggal: string;
	kandidat: Array<{
		eventId: string;
		projectId: string;
		label: string;
		alasan: string;
	}>;
};

/**
 * "Kontak belum terdaftar" (DR-064): orang yang chat bot dari nomor yang tidak
 * ada di event mana pun. Owner memutuskan — nomor klien, PIC cadangan, atau
 * bukan klien. Tidak ada pesan WA yang terkirim dari sini.
 */
export function KontakUsulanPanel({ rows }: { rows: KontakUsulanView[] }) {
	if (rows.length === 0) return null;
	return (
		<section className="space-y-2 rounded-[16px] border border-sky-200 bg-card p-4 shadow-[var(--shadow-level-1)]">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="flex items-center gap-2 text-[15px] font-semibold">
					<UserRoundPlus className="size-4 text-sky-600" aria-hidden />
					Kontak belum terdaftar
					<span className="tabular text-[13px] font-medium text-muted-foreground">
						{rows.length}
					</span>
				</h2>
				<p className="text-[12.5px] text-muted-foreground">
					Chat bot dari nomor yang tidak ada di event mana pun.
				</p>
			</div>
			<ul className="divide-y divide-border-subtle">
				{rows.map((r) => (
					<Baris key={r.id} r={r} />
				))}
			</ul>
		</section>
	);
}

function Baris({ r }: { r: KontakUsulanView }) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const [manual, setManual] = useState<ComboboxOption[] | null>(null);
	const [eventId, setEventId] = useState("");

	function tambah(evId: string, peran: "klien" | "pic", ganti = false) {
		start(async () => {
			const res = await tambahkanKontak(r.id, evId, peran, ganti);
			if (!res.ok && res.gantiDari) {
				const ok = await confirm({
					title: "Ganti nomor klien?",
					description: `${res.error} Ganti dengan ${r.nomor ? r.nomor.replace(/^62/, "0") : "nomor ini"}? Nomor lama bisa dijadikan PIC cadangan dari halaman event.`,
					confirmLabel: "Ganti nomor klien",
				});
				if (ok) tambah(evId, peran, true);
				return;
			}
			if (!res.ok) return void toast.error(res.error);
			toast.success(
				peran === "klien"
					? "Nomor klien diperbarui — bot langsung mengenalinya"
					: "Ditambahkan sebagai PIC cadangan — bot langsung mengenalinya",
			);
			router.refresh();
		});
	}

	async function bukan() {
		const ok = await confirm({
			title: "Bukan klien?",
			description:
				"Usulan ditutup dan nomor ini tidak diusulkan lagi. Tidak ada data event yang berubah.",
			confirmLabel: "Bukan klien",
		});
		if (!ok) return;
		start(async () => {
			const res = await tandaiBukanKlien(r.id);
			if (!res.ok) return void toast.error(res.error);
			toast.success("Ditandai bukan klien");
			router.refresh();
		});
	}

	function bukaManual() {
		start(async () => {
			const rows = await pilihanEventDraft();
			setManual(
				rows.map((e) => ({
					value: e.id,
					label: e.label,
					sublabel: e.sublabel,
				})),
			);
		});
	}

	return (
		<li className="space-y-2.5 py-3">
			<div>
				<p className="text-[14.5px] font-semibold">{r.judul}</p>
				<p className="text-[12.5px] text-muted-foreground">
					{r.nomor ? r.nomor.replace(/^62/, "0") : "nomor tidak diketahui"}
					{r.namaWa ? ` · nama WA "${r.namaWa}"` : ""} · {r.tanggal}
					{r.mengakuBooking ? " · mengaku sudah booking" : ""}
				</p>
				{r.cuplikan ? (
					<p className="mt-1 border-l-2 border-border-default pl-2.5 text-[13px] text-foreground/80">
						{r.cuplikan}
					</p>
				) : null}
			</div>

			{r.kandidat.map((k) => (
				<div
					key={k.eventId}
					className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-secondary/60 px-3 py-2"
				>
					<div className="min-w-0 flex-1 basis-60">
						<Link
							href={`/operations/${k.projectId}`}
							className="text-[13.5px] font-medium hover:underline"
						>
							{k.label}
						</Link>
						<p className="text-[12px] text-muted-foreground">{k.alasan}</p>
					</div>
					<div className="flex flex-wrap gap-1.5">
						<Button
							size="lg"
							className="rounded-full"
							disabled={pending || !r.nomor}
							onClick={() => tambah(k.eventId, "klien")}
						>
							Nomor klien
						</Button>
						<Button
							size="lg"
							variant="outline"
							className="rounded-full"
							disabled={pending || !r.nomor}
							onClick={() => tambah(k.eventId, "pic")}
						>
							PIC cadangan
						</Button>
					</div>
				</div>
			))}

			{manual ? (
				<div className="flex flex-wrap items-center gap-2">
					<div className="min-w-0 flex-1 basis-64">
						<Combobox
							value={eventId}
							onValueChange={setEventId}
							options={manual}
							allowFreeText={false}
							placeholder="Cari nama klien, tanggal, atau PRJ"
							emptyMessage="Event tidak ketemu"
							wrapOptions
						/>
					</div>
					<Button
						size="lg"
						className="rounded-full"
						disabled={pending || !eventId || !r.nomor}
						onClick={() => tambah(eventId, "klien")}
					>
						Nomor klien
					</Button>
					<Button
						size="lg"
						variant="outline"
						className="rounded-full"
						disabled={pending || !eventId || !r.nomor}
						onClick={() => tambah(eventId, "pic")}
					>
						PIC cadangan
					</Button>
				</div>
			) : null}

			<div className="flex flex-wrap gap-1.5">
				{manual ? null : (
					<Button
						size="lg"
						variant="outline"
						className="rounded-full"
						disabled={pending}
						onClick={bukaManual}
					>
						{pending ? <Loader2 className="animate-spin" /> : null}
						{r.kandidat.length ? "Event lain" : "Pilih event"}
					</Button>
				)}
				<Button
					size="lg"
					variant="ghost"
					className="rounded-full text-muted-foreground"
					disabled={pending}
					onClick={bukan}
				>
					Bukan klien
				</Button>
			</div>
		</li>
	);
}
