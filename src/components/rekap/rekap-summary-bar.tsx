"use client";

import { Loader2 } from "lucide-react";
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
 */
export function RekapSummaryBar({
	hppTotal,
	pending,
	disabled,
	submitLabel,
}: {
	hppTotal: number;
	pending: boolean;
	disabled?: boolean;
	submitLabel: string;
}) {
	return (
		<>
			{/* Spacer so the last form section isn't covered by the fixed bar */}
			<div aria-hidden="true" className="h-20 sm:h-0" />

			<div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface-2/95 px-4 py-3 backdrop-blur-md shadow-lg sm:static sm:z-auto sm:rounded-xl sm:border sm:shadow-none sm:px-5 sm:py-4">
				<div className="mx-auto flex max-w-md items-center justify-between gap-3 sm:max-w-none">
					<div className="min-w-0 flex-1">
						<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
							Estimasi HPP
						</p>
						<p className="tabular text-fluid-h3 font-semibold text-foreground">
							{formatRupiah(hppTotal)}
						</p>
					</div>
					<button
						type="submit"
						disabled={pending || disabled}
						className="press-down inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-5 text-fluid-body font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{pending ? (
							<Loader2 className="size-4 animate-spin" />
						) : null}
						{pending ? "Menyimpan…" : submitLabel}
					</button>
				</div>
			</div>
		</>
	);
}
