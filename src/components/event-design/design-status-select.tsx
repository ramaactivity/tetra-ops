"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DesignApproveDialog } from "@/components/event-design/design-approve-dialog";
import { toast } from "@/components/ui/toaster";
import { setDesignStatus } from "@/lib/actions/event-design";
import {
	DESIGN_STATUS_LABELS,
	DESIGN_STATUS_TONE,
	DESIGN_STATUS_VALUES,
	type DesignStatus,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Design-status control as a one-click SEGMENTED toggle (Belum / Proses /
 * Approved) — no dropdown/portal, so it doesn't make the page inert (which
 * previously swallowed clicks on nearby links). Shared by the Asset & Design
 * list (inline per row) and the event detail design card.
 */
export function DesignStatusSelect({
	eventId,
	projectId,
	value,
	disabled,
	className,
}: {
	eventId: string;
	projectId: string;
	value: DesignStatus;
	disabled?: boolean;
	className?: string;
}) {
	const [pending, startTransition] = useTransition();
	const [approveOpen, setApproveOpen] = useState(false);
	const router = useRouter();

	function set(next: DesignStatus) {
		if (next === value || pending) return;
		// "Approved" tidak pernah langsung — desainer harus menyatakan ukuran
		// file yang dia buat dulu (gerbang terakhir sebelum cetak).
		if (next === "approved") {
			setApproveOpen(true);
			return;
		}
		startTransition(async () => {
			try {
				const res = await setDesignStatus(eventId, projectId, next);
				if (res.error) {
					toast.error(res.error);
				} else {
					toast.success(`Status design → ${DESIGN_STATUS_LABELS[next]}`);
				}
			} catch {
				toast.error("Gagal mengubah status design. Coba lagi.");
			}
		});
	}

	return (
		<>
			<DesignApproveDialog
				eventId={eventId}
				projectId={projectId}
				open={approveOpen}
				onOpenChange={setApproveOpen}
				onApproved={() => router.refresh()}
			/>
			<div
				className={cn(
					"inline-flex h-8 items-center rounded-full border border-border-default bg-secondary p-0.5",
					pending && "opacity-60",
					className,
				)}
				role="group"
				aria-label="Status design"
			>
				{DESIGN_STATUS_VALUES.map((s) => {
					const active = s === value;
					const tone = DESIGN_STATUS_TONE[s];
					return (
						<button
							key={s}
							type="button"
							disabled={disabled || pending}
							aria-pressed={active}
							onClick={() => set(s)}
							className={cn(
								"inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium leading-none transition-colors disabled:cursor-not-allowed",
								active
									? cn("bg-card shadow-[var(--shadow-level-2)]", tone.text)
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<span
								className={cn(
									"size-1.5 rounded-full",
									active ? tone.dot : "bg-muted-foreground/30",
								)}
								aria-hidden
							/>
							{DESIGN_STATUS_LABELS[s]}
						</button>
					);
				})}
			</div>
		</>
	);
}
