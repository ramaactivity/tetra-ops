"use client";

import { PauseCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { pauseContact } from "@/lib/actions/bot-control";

/**
 * <PauseContactButton /> — pause the bot for one contact (human handoff) for
 * the default `pause_hours` window. Owner-only (action enforces). Low-risk →
 * no confirm dialog, just a toast.
 */
export function PauseContactButton({
	waJid,
	name,
	iconOnly = false,
}: {
	waJid: string;
	name: string;
	/** Tabel padat: ikon saja (label tetap terbaca screen reader & tooltip). */
	iconOnly?: boolean;
}) {
	const [pending, start] = useTransition();

	function handlePause() {
		start(async () => {
			try {
				await pauseContact(waJid);
				toast.success(`Bot di-pause untuk ${name}`);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Gagal pause kontak");
			}
		});
	}

	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				handlePause();
			}}
			disabled={pending}
			title="Pause bot untuk kontak ini"
			aria-label={iconOnly ? `Pause bot untuk ${name}` : undefined}
			className={
				iconOnly
					? "press-down inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-60"
					: "press-down inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-60"
			}
		>
			<PauseCircle className={iconOnly ? "size-4" : "size-3.5"} aria-hidden />
			{iconOnly ? null : pending ? "…" : "Pause"}
		</button>
	);
}
