"use client";

import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Field, inputClass } from "@/components/items/item-form-primitives";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toaster";
import {
	type DisposalFormState,
	disposeFixedAsset,
} from "@/lib/actions/depreciation";

const DISPOSAL_OPTIONS = [
	{ value: "sold", label: "Sold — dijual ke pihak lain" },
	{ value: "scrapped", label: "Scrapped — dimusnahkan/dibuang" },
	{ value: "lost", label: "Lost — hilang/dicuri" },
	{ value: "donated", label: "Donated — disumbangkan" },
	{ value: "transferred", label: "Transferred — pindah entitas" },
];

export function DisposeAssetDialog({
	itemId,
	itemName,
	itemSku,
	purchasePrice,
	bookValue,
}: {
	itemId: string;
	itemName: string;
	itemSku: string;
	purchasePrice: number;
	bookValue: number;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const action = disposeFixedAsset.bind(null, itemId);
	const [state, formAction, pending] = useActionState<
		DisposalFormState,
		FormData
	>(action, undefined);

	const [date, setDate] = useState<string>(
		new Date().toISOString().slice(0, 10),
	);
	const [method, setMethod] = useState<string>("sold");
	const [salePrice, setSalePrice] = useState<string>("0");

	const saleNum = Number(salePrice) || 0;
	const net = saleNum - bookValue;

	useEffect(() => {
		if (state?.success) {
			toast.success("Asset di-dispose. Jurnal sudah ter-post.");
			setOpen(false);
			router.refresh();
		}
	}, [state, router]);

	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 inline-flex size-7 items-center justify-center rounded-md hover:bg-rose-500/10"
				title="Dispose / Write-off asset"
			>
				<Archive className="size-3.5" />
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Dispose Asset</DialogTitle>
						<DialogDescription>
							<strong>{itemName}</strong> · {itemSku}
							<br />
							Sistem akan post jurnal: Dr 1-401 (reverse akum) + Dr Kas (kalau
							sold) + Cr 1-400 (reverse asset) +/- Gain/Loss.
						</DialogDescription>
					</DialogHeader>

					<form action={formAction} className="space-y-4">
						{state?.errors?._form && (
							<div className="border-destructive bg-destructive/10 rounded-md border p-3">
								<p className="text-destructive text-sm font-medium">
									{state.errors._form[0]}
								</p>
							</div>
						)}

						<div className="bg-surface-1 rounded-md p-3 text-[12px] space-y-1 tabular">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Purchase price</span>
								<span className="font-medium">
									Rp {purchasePrice.toLocaleString("id-ID")}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									Nilai buku saat ini
								</span>
								<span className="font-semibold text-emerald-700 dark:text-emerald-300">
									Rp {bookValue.toLocaleString("id-ID")}
								</span>
							</div>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<Field
								label="Tanggal Disposal"
								name="disposal_date"
								error={err("disposal_date")}
								required
							>
								<DatePicker
									value={date}
									onValueChange={setDate}
									aria-invalid={!!err("disposal_date")}
								/>
								<input
									type="hidden"
									name="disposal_date"
									value={date}
									required
								/>
							</Field>

							<Field
								label="Metode"
								name="disposal_method"
								error={err("disposal_method")}
								required
							>
								<NativeSelect
									value={method}
									onValueChange={setMethod}
									options={DISPOSAL_OPTIONS}
									triggerClassName="w-full"
								/>
								<input
									type="hidden"
									name="disposal_method"
									value={method}
									required
								/>
							</Field>
						</div>

						<Field
							label="Sale Price (Rp)"
							name="disposal_sale_price"
							error={err("disposal_sale_price")}
							hint={
								method === "sold"
									? "Harga penjualan aktual"
									: "Default 0 untuk scrap/lost/donated"
							}
						>
							<input
								type="number"
								name="disposal_sale_price"
								min={0}
								step={1}
								value={salePrice}
								onChange={(e) => setSalePrice(e.target.value)}
								className={`${inputClass} tabular`}
							/>
						</Field>

						{net !== 0 && (
							<div
								className={`rounded-md px-3 py-2 text-[12px] ${
									net > 0
										? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
										: "bg-rose-500/10 text-rose-900 dark:text-rose-100"
								}`}
							>
								Akan dijurnal sebagai{" "}
								<strong>
									{net > 0 ? "Gain" : "Loss"} on Disposal Rp{" "}
									{Math.abs(net).toLocaleString("id-ID")}
								</strong>{" "}
								<span className="text-muted-foreground">
									(sale {saleNum.toLocaleString("id-ID")} − book{" "}
									{bookValue.toLocaleString("id-ID")})
								</span>
							</div>
						)}

						<Field
							label="Catatan"
							name="disposal_notes"
							error={err("disposal_notes")}
							hint="Opsional — alasan disposal, ke siapa dijual, dll"
						>
							<RichTextarea
								name="disposal_notes"
								rows={2}
								maxLength={500}
								toolbar={false}
							/>
						</Field>

						<DialogFooter>
							<DialogClose className="press-down border-border-default bg-surface-1 hover:bg-surface-2 inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-medium">
								Batal
							</DialogClose>
							<button
								type="submit"
								disabled={pending}
								className="press-down inline-flex h-9 items-center rounded-md bg-rose-600 px-3 text-[12px] font-medium text-white hover:bg-rose-700 disabled:opacity-60"
							>
								{pending ? "Processing…" : "Dispose Asset"}
							</button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
