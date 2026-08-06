"use client";

import { HandCoins, Loader2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import {
	type PatunganFormState,
	recordOwnerPatungan,
} from "@/lib/actions/owner-patungan";
import { formatRupiah } from "@/lib/format";

/** Beban yang lazim ditanggung patungan owner. */
const EXPENSE_OPTIONS = [
	{ value: "5-260", label: "Sewa tempat & kost" },
	{ value: "5-270", label: "Internet & telekomunikasi" },
	{ value: "5-250", label: "Perlengkapan & peralatan kecil" },
	{ value: "5-280", label: "Rapat & konsumsi rapat" },
	{ value: "5-900", label: "Operasional lain" },
];

const ID_MONTHS = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

/**
 * "Potong patungan" — beban yang ditanggung bersama owner, uangnya dipotong
 * dari bagi hasil (bukan transfer tunai). Dipakai saat bebannya sudah
 * terlanjur dibayar penuh dan patungannya baru dicatat belakangan.
 */
export function PatunganDialog({ ownerCount }: { ownerCount: number }) {
	const [open, setOpen] = useState(false);
	const [coa, setCoa] = useState("5-260");
	const [perOwner, setPerOwner] = useState("100000");
	const today = new Date();
	const [date, setDate] = useState(today.toISOString().slice(0, 10));
	const [state, formAction, pending] = useActionState<
		PatunganFormState,
		FormData
	>(recordOwnerPatungan, undefined);

	const per = Number(perOwner.replace(/[^\d]/g, "")) || 0;
	const total = per * ownerCount;
	const label = EXPENSE_OPTIONS.find((o) => o.value === coa)?.label ?? "";
	const defaultDesc = `Patungan ${label.toLowerCase()} ${ID_MONTHS[today.getMonth()]} ${today.getFullYear()}`;

	useEffect(() => {
		if (state?.ok) {
			toast.success(state.message ?? "Patungan dicatat");
			setOpen(false);
		} else if (state?.error) {
			toast.error(state.error);
		}
	}, [state]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="press tap inline-flex h-9 items-center gap-1.5 rounded-full border border-border-default px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary">
				<HandCoins className="size-4" aria-hidden />
				Potong patungan
			</DialogTrigger>
			<DialogContent className="max-h-[92vh] overflow-y-auto p-5 sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Potong patungan owner</DialogTitle>
					<DialogDescription>
						Beban yang ditanggung bersama, dipotong dari jatah bagi hasil tiap
						owner. Tidak ada uang berpindah.
					</DialogDescription>
				</DialogHeader>

				<form action={formAction} className="space-y-3">
					<Field label="Untuk beban apa" required>
						<NativeSelect
							value={coa}
							onValueChange={setCoa}
							options={EXPENSE_OPTIONS}
							triggerClassName="h-10! w-full rounded-xl px-3.5 text-[0.9375rem]"
						/>
						<input type="hidden" name="expense_coa" value={coa} />
					</Field>

					<div className="grid grid-cols-2 gap-3">
						<Field label="Per owner (Rp)" required>
							<input
								type="text"
								inputMode="numeric"
								value={perOwner}
								onChange={(e) =>
									setPerOwner(e.target.value.replace(/[^\d]/g, ""))
								}
								className="tabular h-10 w-full rounded-xl border border-border-default bg-background px-3.5 text-[0.9375rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
							<input type="hidden" name="per_owner" value={per} />
						</Field>
						<Field label="Tanggal" required>
							<input
								type="date"
								name="date"
								value={date}
								onChange={(e) => setDate(e.target.value)}
								className="h-10 w-full rounded-xl border border-border-default bg-background px-3.5 text-[0.9375rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
						</Field>
					</div>

					<Field label="Keterangan" required>
						<input
							type="text"
							name="description"
							defaultValue={defaultDesc}
							key={defaultDesc}
							className="h-10 w-full rounded-xl border border-border-default bg-background px-3.5 text-[0.9375rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</Field>

					<div className="space-y-1 rounded-xl border border-border-default bg-secondary/40 px-4 py-3">
						<div className="flex items-baseline justify-between">
							<span className="text-[12px] text-muted-foreground">
								Total dipotong ({ownerCount} owner)
							</span>
							<span className="tabular text-[17px] font-semibold text-foreground">
								{formatRupiah(total)}
							</span>
						</div>
						<p className="text-[11.5px] leading-relaxed text-muted-foreground">
							Jatah tiap owner berkurang {formatRupiah(per)} dan beban{" "}
							{label.toLowerCase()} berkurang {formatRupiah(total)}. Saldo kas
							tidak berubah — memang tidak ada uang berpindah.
						</p>
					</div>

					<button
						type="submit"
						disabled={pending || per <= 0}
						className="press tap inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#059669] text-sm font-medium text-white transition-colors hover:bg-[#047857] disabled:opacity-60"
					>
						{pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
						{pending ? "Menyimpan…" : `Potong ${formatRupiah(total)}`}
					</button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

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
			<span className="type-label block text-foreground">
				{label}
				{required && <span className="ml-0.5 text-destructive">*</span>}
			</span>
			{children}
		</div>
	);
}
