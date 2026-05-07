"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

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
		params.delete("page"); // reset pagination on filter change
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
			<select
				name="action"
				defaultValue={defaultAction ?? ""}
				onChange={(e) => update("action", e.target.value)}
				disabled={pending}
				className="border-border bg-background h-9 rounded-md border px-3 text-sm"
			>
				<option value="">Semua action</option>
				{actions.map((a) => (
					<option key={a} value={a}>
						{a}
					</option>
				))}
			</select>

			<select
				name="entity"
				defaultValue={defaultEntity ?? ""}
				onChange={(e) => update("entity", e.target.value)}
				disabled={pending}
				className="border-border bg-background h-9 rounded-md border px-3 text-sm"
			>
				<option value="">Semua entity</option>
				{entityTypes.map((e) => (
					<option key={e} value={e}>
						{e}
					</option>
				))}
			</select>

			{hasFilter && (
				<button
					type="button"
					onClick={clear}
					disabled={pending}
					className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
				>
					Reset
				</button>
			)}
		</div>
	);
}
