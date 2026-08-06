"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TopbarActionPortal } from "@/components/layouts/topbar-action-portal";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { CatatData } from "@/lib/finance/quick-record-data";
import { useHaptics } from "@/lib/use-haptics";
import { useMediaQuery } from "@/lib/use-media-query";
import { QuickRecordCore, type QuickRecordPrefill } from "./quick-record-core";

/**
 * CatatLauncher — the single entry point to quick-record, one component for
 * both shells: a desktop trigger teleported into the topbar that opens a wide,
 * centered two-column modal (Dialog); and a mobile emerald FAB that opens a
 * bottom Sheet with the on-screen keypad. `autoOpen` opens it on mount (used by
 * the `?catat=1` deep-link from the mobile bottom nav).
 */
export function CatatLauncher({
	data,
	autoOpen = false,
	prefill,
}: {
	data: CatatData;
	autoOpen?: boolean;
	/** Nilai awal form (deep-link dari rekap owner: biaya dibayar owner). */
	prefill?: QuickRecordPrefill;
}) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const haptic = useHaptics();

	useEffect(() => {
		if (autoOpen) setOpen(true);
	}, [autoOpen]);

	const hasCash = data.cashAccounts.length > 0;

	return (
		<>
			{/* Desktop trigger → topbar action slot */}
			<TopbarActionPortal>
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="press-down inline-flex h-9 items-center gap-1.5 rounded-md bg-[#059669] px-3 text-fluid-caption font-medium text-white hover:bg-[#047857] dark:bg-[#0b9e6a] dark:hover:bg-[#059669]"
				>
					<Plus className="size-4" />
					Catat transaksi
				</button>
			</TopbarActionPortal>

			{/* Mobile FAB */}
			<button
				type="button"
				aria-label="Catat transaksi"
				onClick={() => {
					haptic("tap");
					setOpen(true);
				}}
				className="press tap fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-2xl bg-[#059669] text-white shadow-[var(--shadow-fab)] active:scale-95 md:hidden"
			>
				<Plus className="size-7" strokeWidth={2.25} />
			</button>

			{isDesktop ? (
				// Desktop — wide, centered modal with a two-column form.
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogContent className="flex max-h-[94vh] flex-col overflow-hidden sm:max-w-6xl lg:max-w-7xl">
						<DialogHeader className="shrink-0">
							<DialogTitle>Catat transaksi</DialogTitle>
							<DialogDescription>
								Langsung masuk ke pembukuan.
							</DialogDescription>
						</DialogHeader>
						{hasCash ? (
							<QuickRecordCore
								data={data}
								keypad={false}
								wide
								prefill={prefill}
								onDone={() => setOpen(false)}
							/>
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">
								Belum ada rekening Kas/Bank. Tambahkan dulu di Finance ›
								Rekening Bank.
							</p>
						)}
					</DialogContent>
				</Dialog>
			) : (
				// Mobile — bottom slide-over with on-screen keypad.
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetContent side="bottom" showCloseButton={false}>
						<SheetHeader className="flex-row items-start justify-between gap-3">
							<div className="min-w-0">
								<SheetTitle>Catat transaksi</SheetTitle>
								<SheetDescription>
									Langsung masuk ke pembukuan.
								</SheetDescription>
							</div>
							<SheetClose
								aria-label="Tutup"
								className="press tap -mt-1 -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							>
								<X className="size-5" />
							</SheetClose>
						</SheetHeader>
						{hasCash ? (
							<QuickRecordCore
								data={data}
								keypad
								prefill={prefill}
								onDone={() => setOpen(false)}
							/>
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">
								Belum ada rekening Kas/Bank. Tambahkan dulu di Finance ›
								Rekening Bank.
							</p>
						)}
					</SheetContent>
				</Sheet>
			)}
		</>
	);
}
