"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BotEnabledToggle } from "./bot-enabled-toggle";

/**
 * <BotConfigGroup /> — the master toggle plus the config it governs.
 *
 * When auto-reply is off, the settings/rules below dim so it reads at a glance
 * that they're dormant. They stay fully editable (you'd want to prep config
 * before switching the bot on), so the dim is a signal, not a lock.
 */
export function BotConfigGroup({
	initialEnabled,
	children,
}: {
	initialEnabled: boolean;
	children: React.ReactNode;
}) {
	const [enabled, setEnabled] = useState(initialEnabled);

	return (
		<div className="space-y-3">
			<BotEnabledToggle enabled={initialEnabled} onChange={setEnabled} />

			{!enabled ? (
				<p className="type-secondary flex items-center gap-1.5 px-1">
					<span
						className="size-1.5 shrink-0 rounded-full bg-amber-500"
						aria-hidden
					/>
					Auto-reply mati — setelan di bawah tetap bisa diedit dan berlaku saat
					bot dinyalakan.
				</p>
			) : null}

			<div
				className={cn(
					"space-y-3 transition-opacity duration-200",
					!enabled && "opacity-60",
				)}
			>
				{children}
			</div>
		</div>
	);
}
