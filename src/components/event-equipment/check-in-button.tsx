"use client";

import { ArrowDownToLine } from "lucide-react";
import { useTransition } from "react";
import { checkInEquipment } from "@/lib/actions/event-equipment";

export function CheckInButton({
	itemId,
	eventId,
	projectId,
	itemName,
}: {
	itemId: string;
	eventId: string;
	projectId: string;
	itemName: string;
}) {
	const [pending, startTransition] = useTransition();

	function onClick() {
		const ok = window.confirm(`Kembalikan "${itemName}" ke gudang?`);
		if (!ok) return;
		startTransition(async () => {
			const result = await checkInEquipment(itemId, eventId, projectId);
			if (result.error) {
				window.alert(result.error);
			}
		});
	}

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={pending}
			title="Check-in (kembalikan)"
			className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 inline-flex h-8 items-center gap-1 rounded-md border border-emerald-500/30 px-2 text-xs font-medium transition-colors disabled:opacity-50"
		>
			<ArrowDownToLine className="h-3.5 w-3.5" />
			Check-in
		</button>
	);
}
