"use client";

import { Camera, Loader2 } from "lucide-react";

/**
 * <RekapSummaryBar /> — sticky bottom bar with a live summary + submit button.
 *
 * IMPORTANT: this is the CREW view. It shows "Total cetak" (a count), never
 * HPP / cost — material cost is a business secret the crew must not see.
 *
 * Disabled UX: when `disabled=true`, the button label switches to
 * `disabledLabel` (e.g. "Upload bukti dulu") and the left chip shows the
 * `disabledReason` so crew understand why submit is blocked.
 */
export function RekapSummaryBar({
	cetakTotal,
	pending,
	disabled,
	submitLabel,
	disabledLabel,
	disabledReason,
}: {
	cetakTotal: number;
	pending: boolean;
	disabled?: boolean;
	submitLabel: string;
	disabledLabel?: string;
	disabledReason?: string;
}) {
	const showDisabledHint = Boolean(disabled && disabledReason);
	const buttonLabel = pending
		? "Menyimpan…"
		: disabled && disabledLabel
			? disabledLabel
			: submitLabel;

	return (
		<>
			{/* Spacer so the last form section isn't covered by the fixed bar */}
			<div aria-hidden="true" className="h-20 sm:h-0" />

			<div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface-2/95 px-4 py-3 backdrop-blur-md shadow-[var(--shadow-level-4)] sm:static sm:z-auto sm:rounded-lg sm:border sm:shadow-none sm:px-5 sm:py-4">
				<div className="mx-auto flex max-w-md items-center justify-between gap-3 sm:max-w-none">
					<div className="min-w-0 flex-1">
						{showDisabledHint ? (
							<p className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300">
								<Camera className="h-3.5 w-3.5" />
								<span className="truncate">{disabledReason}</span>
							</p>
						) : (
							<>
								<p className="eyebrow">Total cetak</p>
								<p className="type-num text-fluid-h3 text-foreground">
									{cetakTotal.toLocaleString("id-ID")}
									<span className="ml-1 text-[0.8125rem] font-normal text-muted-foreground">
										pcs
									</span>
								</p>
							</>
						)}
					</div>
					<button
						type="submit"
						disabled={pending || disabled}
						className="press-down inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary dark:bg-primary px-6 text-fluid-body font-semibold text-white transition-colors hover:bg-primary/90 dark:hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
					>
						{pending ? <Loader2 className="size-4 animate-spin" /> : null}
						{buttonLabel}
					</button>
				</div>
			</div>
		</>
	);
}
