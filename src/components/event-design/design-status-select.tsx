"use client";

import { useTransition } from "react";
import { NativeSelect } from "@/components/ui/native-select";
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
 * Compact design-status control (Belum / Proses / Approved). Single entry point
 * shared by the Asset & Design list (inline per row) and the event detail page.
 * Trigger is tinted by status tone; changes persist via setDesignStatus.
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
	const tone = DESIGN_STATUS_TONE[value] ?? DESIGN_STATUS_TONE.belum;

	function onChange(next: string) {
		if (next === value) return;
		startTransition(async () => {
			const res = await setDesignStatus(
				eventId,
				projectId,
				next as DesignStatus,
			);
			if (res.error) {
				toast.error(res.error);
			} else {
				toast.success(
					`Status design → ${DESIGN_STATUS_LABELS[next as DesignStatus]}`,
				);
			}
		});
	}

	return (
		<NativeSelect
			value={value}
			onValueChange={onChange}
			disabled={disabled || pending}
			options={DESIGN_STATUS_VALUES.map((s) => ({
				value: s,
				label: DESIGN_STATUS_LABELS[s],
			}))}
			aria-label="Status design"
			triggerClassName={cn(
				"h-8 w-[120px] justify-between font-medium",
				tone.badge,
				className,
			)}
		/>
	);
}
