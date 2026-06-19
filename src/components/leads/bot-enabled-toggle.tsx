"use client";

import { Power } from "lucide-react";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
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
		<div className="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-card p-5 shadow-[var(--shadow-level-2)]">
			<div className="flex items-start gap-3">
				<span
					className={cn(
						"grid size-10 shrink-0 place-items-center rounded-full border transition-colors",
						on
							? "border-emerald-500/30 bg-emerald-300/40 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
							: "border-border-default text-muted-foreground",
					)}
				>
					<Power className="size-[18px]" strokeWidth={2} aria-hidden />
				</span>
				<div className="min-w-0">
					<p className="type-body-strong text-foreground">
						Auto-reply {on ? "aktif" : "mati"}
					</p>
					<p className="type-secondary mt-0.5 leading-snug">
						{on
							? "Bot membalas pesan masuk sesuai rule di bawah."
							: "Bot diam — tidak membalas pesan apa pun."}
					</p>
				</div>
			</div>

			<Switch
				checked={on}
				onCheckedChange={toggle}
				disabled={pending}
				size="lg"
				aria-label="Master on/off bot"
			/>
		</div>
	);
}
