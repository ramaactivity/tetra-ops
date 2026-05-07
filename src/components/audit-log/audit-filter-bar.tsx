"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/ui/native-select";

export function AuditFilterBar({
	actions,
	entityTypes,
	defaultAction,
	defaultEntity,
}: {
	actions: string[];
	entityTypes: string[];
	defaultAction?: string;
	defaultEntity?: string;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [pending, startTransition] = useTransition();

	function update(key: "action" | "entity", value: string) {
		const params = new URLSearchParams(searchParams.toString());
		if (value) params.set(key, value);
		else params.delete(key);
		params.delete("page");
		startTransition(() => {
			router.push(`/settings/audit-log?${params.toString()}`);
		});
	}

	function clear() {
		startTransition(() => {
			router.push("/settings/audit-log");
		});
	}

	const hasFilter = !!(defaultAction || defaultEntity);

	return (
		<div className="flex flex-wrap items-center gap-2">
			<NativeSelect
				value={defaultAction ?? ""}
				onValueChange={(v) => update("action", v)}
				placeholder="Semua action"
				options={[
					{ value: "", label: "Semua action" },
					...actions.map((a) => ({ value: a, label: a })),
				]}
				disabled={pending}
				aria-label="Filter action"
			/>

			<NativeSelect
				value={defaultEntity ?? ""}
				onValueChange={(v) => update("entity", v)}
				placeholder="Semua entity"
				options={[
					{ value: "", label: "Semua entity" },
					...entityTypes.map((e) => ({ value: e, label: e })),
				]}
				disabled={pending}
				aria-label="Filter entity"
			/>

			{hasFilter && (
				<button
					type="button"
					onClick={clear}
					disabled={pending}
					className="text-fluid-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				>
					Reset
				</button>
			)}
		</div>
	);
}
