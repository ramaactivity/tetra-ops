"use client";

import {
	BadgeCheck,
	ChevronDown,
	ClipboardCheck,
	Files,
	FileText,
	Loader2,
	Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import {
	ensureInvoiceForEvent,
	issueBast,
	issueNotaLunas,
} from "@/lib/actions/documents";
import { cn } from "@/lib/utils";

/**
 * Menu "Dokumen" satu event — dipakai di halaman event dan baris Billing.
 * Invoice: buka yang ada / buat dari event. Nota Lunas & BAST: hanya setelah lunas.
 */
export function DocumentMenu({
	eventId,
	isPaid,
	className,
	label = "Dokumen",
}: {
	eventId: string;
	isPaid: boolean;
	className?: string;
	label?: string;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();

	function openInvoice() {
		start(async () => {
			const res = await ensureInvoiceForEvent(eventId);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			if (res.created) toast.success("Invoice dibuat dari data event");
			router.push(`/finance/dokumen/${res.id}`);
		});
	}
	function openPaid(kind: "nota" | "bast") {
		start(async () => {
			const res =
				kind === "nota"
					? await issueNotaLunas(eventId)
					: await issueBast(eventId);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			if (res.created)
				toast.success(
					kind === "nota" ? "Nota Lunas diterbitkan" : "BAST diterbitkan",
				);
			window.open(`/api/pdf/document/${res.id}`, "_blank");
		});
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={pending}
				className={cn(
					"inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-border-default bg-card px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50",
					className,
				)}
			>
				{pending ? (
					<Loader2 className="size-3.5 animate-spin" />
				) : (
					<Files className="size-3.5" />
				)}
				{label}
				<ChevronDown className="size-3.5 text-muted-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={6} className="w-60">
				<DropdownMenuItem onClick={openInvoice} className="gap-2">
					<FileText className="size-4" /> Invoice
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => openPaid("nota")}
					disabled={!isPaid}
					className="gap-2"
				>
					{isPaid ? (
						<BadgeCheck className="size-4" />
					) : (
						<Lock className="size-4" />
					)}{" "}
					Nota Lunas
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => openPaid("bast")}
					disabled={!isPaid}
					className="gap-2"
				>
					{isPaid ? (
						<ClipboardCheck className="size-4" />
					) : (
						<Lock className="size-4" />
					)}{" "}
					BAST
				</DropdownMenuItem>
				{!isPaid ? (
					<p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
						Nota Lunas & BAST terbuka setelah event lunas. Kuitansi per
						pembayaran ada di daftar pembayaran.
					</p>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
