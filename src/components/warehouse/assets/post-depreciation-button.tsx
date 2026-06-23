"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { postDepreciationForMonth } from "@/lib/actions/depreciation";

const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

function recentPeriods(count = 6): string[] {
	const out: string[] = [];
	const now = new Date();
	for (let i = 0; i < count; i++) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
	}
	return out;
}

function formatYm(ym: string): string {
	const [y, m] = ym.split("-");
	return `${MONTH_LABELS[Number(m) - 1]} ${y}`;
}

export function PostDepreciationButton() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [period, setPeriod] = useState<string>(recentPeriods(1)[0]);
	const [pending, startTransition] = useTransition();

	const handlePost = () => {
		startTransition(async () => {
			const result = await postDepreciationForMonth(period);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			if (result.posted === 0) {
				toast.warning(
					`Tidak ada asset yang perlu di-post untuk ${formatYm(period)}. (${result.skipped} sudah ter-post atau fully depreciated)`,
				);
			} else {
				toast.success(
					`Posted ${result.posted} jurnal untuk ${formatYm(period)} · total Rp ${result.totalAmount.toLocaleString("id-ID")}`,
				);
			}
			setOpen(false);
			router.refresh();
		});
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={buttonVariants({ variant: "outline", className: "h-9" })}
			>
				<CalendarClock className="size-3.5" />
				Post Depresiasi
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Post Depresiasi Bulanan</DialogTitle>
						<DialogDescription>
							Pilih periode → sistem otomatis post jurnal Dr 5-500 / Cr 1-401
							untuk semua aktiva tetap aktif. Idempotent: re-post bulan yang
							sama tidak akan duplikat.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-2">
						<div className="space-y-1">
							<label className="text-[12px] font-medium">Periode</label>
							<div className="grid grid-cols-3 gap-1.5">
								{recentPeriods(6).map((ym) => {
									const isActive = ym === period;
									return (
										<button
											key={ym}
											type="button"
											onClick={() => setPeriod(ym)}
											className={`press-down rounded-md py-1.5 text-[12px] font-medium transition-colors ${
												isActive
													? "bg-[#059669] text-white"
													: "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
											}`}
										>
											{formatYm(ym)}
										</button>
									);
								})}
							</div>
						</div>

						<div className="bg-surface-1 rounded-md p-3 text-[11px] text-muted-foreground">
							Asset yang BELUM punya purchase_price / useful_life akan di-skip
							otomatis. Pastikan field di asset register sudah lengkap sebelum
							post.
						</div>
					</div>

					<DialogFooter>
						<DialogClose className="press-down border-border-default bg-surface-1 hover:bg-surface-2 inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-medium">
							Batal
						</DialogClose>
						<button
							type="button"
							onClick={handlePost}
							disabled={pending}
							className="bg-[#059669] dark:bg-[#059669] text-white hover:bg-[#047857] dark:hover:bg-[#059669] press-down inline-flex h-9 items-center rounded-md px-3 text-[12px] font-medium disabled:opacity-60"
						>
							{pending ? "Posting…" : `Post ${formatYm(period)}`}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
