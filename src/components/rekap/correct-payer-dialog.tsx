"use client";

import { Loader2, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { correctExpensePayers } from "@/lib/actions/rekap";
import { isOwnerPaid } from "@/lib/finance/emoney";
import { formatRupiah } from "@/lib/format";

export type PayerOptions = {
	crew: Array<{ id: string; name: string }>;
	cards: Array<{ id: string; name: string }>;
	/**
	 * Crew pemegang uang jalan dari owner (DR-049). Pilihannya tampil sebagai
	 * "Uang jalan dari owner"; nilainya tetap id crew itu (pembukuannya
	 * talangan → uang jalan dipotong otomatis saat bayar fee).
	 */
	ujHolders?: string[];
	/** Owner aktif — "Ditransfer / dibayar <owner>" = 'owner:<id>' → hutang ke dia. */
	owners?: Array<{ id: string; name: string }>;
};

type Item = {
	key: string;
	rawPayer: string;
	label: string;
	amount: number;
	/** Biaya dibayar owner yang sudah dicatat ke pembukuan. */
	catatRecorded?: boolean;
};

/**
 * Owner membetulkan "dibayar oleh" yang salah diisi crew (mis. tol ditulis
 * ditalangi crew padahal pakai kartu e-toll). Settlement membaca pilihan ini:
 * crew → Hutang Crew (di-rembers), owner → dicatat manual, kartu → saldo kartu
 * berkurang otomatis saat settle.
 */
export function CorrectPayerDialog({
	eventId,
	items,
	options,
}: {
	eventId: string;
	items: Item[];
	options: PayerOptions;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<Record<string, string>>({});
	const [pending, start] = useTransition();

	const holders = options.ujHolders ?? [];
	const choices = [
		...options.crew
			.filter((c) => holders.includes(c.id))
			.map((c) => ({
				value: c.id,
				label: `💵 Uang jalan dari owner (${c.name.split(" ")[0]})`,
			})),
		...options.crew
			.filter((c) => !holders.includes(c.id))
			.map((c) => ({ value: c.id, label: `Ditalangi ${c.name}` })),
		{ value: "crew", label: "Ditalangi crew (belum dipilih siapa)" },
		...options.cards.map((c) => ({
			value: `acct:${c.id}`,
			label: `Kartu e-toll/e-money: ${c.name}`,
		})),
		...(options.owners ?? []).map((o) => ({
			value: `owner:${o.id}`,
			label: `Ditransfer / dibayar ${o.name} (jadi hutang ke ${o.name})`,
		})),
	];
	const payerOf = (it: Item) => draft[it.key] ?? it.rawPayer;
	const changed = items.filter((it) => payerOf(it) !== it.rawPayer);
	// Sudah dicatat sebagai pengeluaran owner lalu dipindah → bebannya dobel
	// kalau catatannya tidak dihapus.
	const doubleRisk = changed.filter(
		(it) => it.catatRecorded && !isOwnerPaid(payerOf(it)),
	);

	function save() {
		start(async () => {
			const res = await correctExpensePayers(
				eventId,
				Object.fromEntries(changed.map((it) => [it.key, payerOf(it)])),
			);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(`${res.changed} pembayar dikoreksi`);
			setOpen(false);
			setDraft({});
			router.refresh();
		});
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="press-down inline-flex items-center gap-1.5 rounded-md border border-border-default bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary"
			>
				<PencilLine className="h-3 w-3" />
				Koreksi pembayar
			</button>
			<Dialog
				open={open}
				onOpenChange={(v) => {
					setOpen(v);
					if (!v) setDraft({});
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Koreksi pembayar biaya lapangan</DialogTitle>
						<DialogDescription>
							Betulkan isian crew. Contoh: tol dibayar pakai kartu e-toll
							perusahaan, bukan ditalangi crew.
						</DialogDescription>
					</DialogHeader>
					<ul className="space-y-2.5">
						{items.map((it) => (
							<li
								key={it.key}
								className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-3"
							>
								<div className="min-w-0">
									<p className="truncate text-[13.5px] font-medium">
										{it.label}
									</p>
									<p
										data-nominal
										className="tabular text-[12px] text-muted-foreground"
									>
										{formatRupiah(it.amount)}
									</p>
								</div>
								<NativeSelect
									value={payerOf(it)}
									onValueChange={(v) =>
										setDraft((d) => ({ ...d, [it.key]: v }))
									}
									options={
										// Nilai lama yang tidak ada di daftar (crew sudah
										// dilepas) tetap tampil supaya tidak tertimpa diam-diam.
										choices.some((c) => c.value === it.rawPayer)
											? choices
											: [
													{
														value: it.rawPayer,
														label:
															it.rawPayer === "owner"
																? "Owner (belum dipilih siapa)"
																: "Pembayar lama",
													},
													...choices,
												]
									}
									aria-label={`Pembayar ${it.label}`}
									className="w-full min-w-0 *:data-[slot=select-value]:truncate"
								/>
							</li>
						))}
					</ul>
					<div className="space-y-1.5 text-[12px] leading-snug text-muted-foreground">
						<p>
							<b>Uang jalan dari owner</b> → sisa uang jalan dipotong otomatis
							saat bayar fee. <b>Ditalangi crew</b> → masuk Hutang Crew, dibayar
							lewat kolom Reimbursement. <b>Kartu</b> → saldo kartu berkurang
							otomatis saat settle. <b>Owner</b> → otomatis jadi hutang ke owner
							itu (kartu Hutang-piutang owner), lunasi kapan saja. Pilihan lama
							tanpa nama → catat lewat Pemasukan / pengeluaran lain.
						</p>
						<p>Setelah menyimpan, cek lagi kolom Reimbursement tiap crew.</p>
						{doubleRisk.length > 0 ? (
							<p className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900">
								{doubleRisk.map((it) => it.label).join(", ")} sudah dicatat ke
								pembukuan sebagai pengeluaran owner — hapus catatannya di kartu
								Pemasukan / pengeluaran lain supaya tidak dobel.
							</p>
						) : null}
					</div>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button onClick={save} disabled={pending || changed.length === 0}>
							{pending ? <Loader2 className="animate-spin" /> : null}
							Simpan koreksi
							{changed.length > 0 ? ` (${changed.length})` : ""}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
