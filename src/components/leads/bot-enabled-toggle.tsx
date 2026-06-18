"use client";

import { Power } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { setBotEnabled } from "@/lib/actions/bot-control";
import { cn } from "@/lib/utils";

/**
 * <BotEnabledToggle /> — master on/off for the WhatsApp bot auto-reply.
 * Optimistic switch + toast; the bot picks up the change within ~1 menit
 * (it polls bot_settings).
 */
export function BotEnabledToggle({ enabled }: { enabled: boolean }) {
	const [on, setOn] = useState(enabled);
	const [pending, startTransition] = useTransition();

	function toggle() {
		const next = !on;
		setOn(next); // optimistic
		startTransition(async () => {
			try {
				await setBotEnabled(next);
				toast.success(
					next
						? "Bot diaktifkan — auto-reply jalan"
						: "Bot dimatikan — auto-reply berhenti",
				);
			} catch (e) {
				setOn(!next); // revert
				toast.error(
					e instanceof Error ? e.message : "Gagal mengubah status bot",
				);
			}
		});
	}

	return (
		<div className="flex items-center justify-between gap-4 rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)] sm:p-5">
			<div className="flex items-start gap-3">
				<span
					className={cn(
						"mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border transition-colors",
						on
							? "border-emerald-500/30 bg-emerald-300/40 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
							: "border-border-default text-muted-foreground",
					)}
				>
					<Power className="size-[18px]" strokeWidth={2} aria-hidden />
				</span>
				<div className="min-w-0">
					<p className="text-[15px] font-semibold text-foreground">
						Auto-reply {on ? "Aktif" : "Mati"}
					</p>
					<p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
						{on
							? "Bot membalas pesan masuk sesuai rule di bawah."
							: "Bot diam — tidak membalas pesan apa pun."}
					</p>
				</div>
			</div>

			<button
				type="button"
				role="switch"
				aria-checked={on}
				aria-label="Master on/off bot"
				disabled={pending}
				onClick={toggle}
				className={cn(
					"relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
					on ? "bg-[#059669]" : "bg-border-default",
				)}
			>
				<span
					className={cn(
						"inline-block size-5 transform rounded-full bg-white shadow transition-transform",
						on ? "translate-x-6" : "translate-x-1",
					)}
				/>
			</button>
		</div>
	);
}
