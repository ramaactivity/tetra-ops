"use client";

import { BadgeCheck, ClipboardCheck, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { issueBast, issueNotaLunas } from "@/lib/actions/documents";

/** Tombol Nota Lunas + BAST (buat-atau-buka). Nonaktif sebelum lunas. */
export function PaidDocButtons({
	eventId,
	isPaid,
}: {
	eventId: string;
	isPaid: boolean;
}) {
	const [pending, start] = useTransition();
	function open(kind: "nota" | "bast") {
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
		<div className="flex flex-wrap items-center gap-2">
			<Button
				variant={isPaid ? "default" : "outline"}
				size="sm"
				onClick={() => open("nota")}
				disabled={!isPaid || pending}
			>
				{pending ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Nota
				Lunas
			</Button>
			<Button
				variant="outline"
				size="sm"
				onClick={() => open("bast")}
				disabled={!isPaid || pending}
			>
				<ClipboardCheck /> BAST
			</Button>
			{!isPaid ? (
				<span className="text-[12px] text-muted-foreground">
					Terbuka setelah lunas
				</span>
			) : null}
		</div>
	);
}
