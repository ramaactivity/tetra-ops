"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { approveCrew } from "@/lib/actions/crew";

/** Tombol ACC akun pending → crew (owner). */
export function ApproveCrew({
	userId,
	userName,
}: {
	userId: string;
	userName: string;
}) {
	const [pending, start] = useTransition();
	const confirm = useConfirm();
	const go = async (tier: "junior" | "senior") => {
		if (
			!(await confirm({
				title: `ACC ${userName} jadi crew ${tier === "senior" ? "Senior" : "Junior"}?`,
			}))
		)
			return;
		start(async () => {
			const r = await approveCrew(userId, tier);
			if (r.error) toast.error(r.error);
			else toast.success(`${userName} sudah jadi crew`);
		});
	};
	return (
		<div className="inline-flex items-center gap-1.5">
			{(["junior", "senior"] as const).map((t) => (
				<button
					key={t}
					type="button"
					disabled={pending}
					onClick={() => go(t)}
					className={
						t === "junior"
							? "bg-foreground text-background inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-medium disabled:opacity-50"
							: "border-border-default hover:bg-secondary inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-medium disabled:opacity-50"
					}
				>
					<Check className="size-3.5 shrink-0" /> ACC{" "}
					{t === "senior" ? "Senior" : "Junior"}
				</button>
			))}
		</div>
	);
}
