"use client";

import { Camera, Loader2 } from "lucide-react";
import { formatRupiah } from "@/lib/format";

/**
 * <RekapSummaryBar /> — sticky bottom bar with live HPP total + submit
 * button. On mobile takes full-width fixed at bottom; on desktop sticks
 * relative inside the form column.
 *
 * Estimate vs Final note: HPP shown here is *estimate* — final HPP is
 * computed server-side at approval (planRekapDeduction). They should
 * match because we use computeRekapCost from the same module both
 * places, but tiny drift is possible if mappings change between submit
 * and approve. Hence label "Estimasi".
 *
 * Disabled UX (Phase F2): when `disabled=true`, button label switches to
 * `disabledLabel` (e.g. "Upload bukti dulu") and left chip shows the
 * `disabledReason` instead of HPP estimate. Crew immediately understands
 * why submit is blocked rather than seeing a silent grey button.
 */
export function RekapSummaryBar({
	hppTotal,
	pending,
	disabled,
	submitLabel,
	disabledLabel,
	disabledReason,
}: {
	hppTotal: number;
	pending: boolean;
	disabled?: boolean;
	submitLabel: string;
	disabledLabel?: string;
	disabledReason?: string;
}) {
	const showDisabledHint = Boolean(disabled && disabledReason);
	const buttonLabel =
		pending
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
								<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
									Estimasi HPP
								</p>
								<p className="tabular text-fluid-h3 font-semibold text-foreground">
									{formatRupiah(hppTotal)}
								</p>
							</>
						)}
					</div>
					<button
						type="submit"
						disabled={pending || disabled}
						className="press-down inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-6 text-fluid-body font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{pending ? (
							<Loader2 className="size-4 animate-spin" />
						) : null}
						{buttonLabel}
					</button>
				</div>
			</div>
		</>
	);
}
