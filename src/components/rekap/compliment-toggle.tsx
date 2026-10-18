"use client";

import { Gift } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	setEventCompliment,
	setEventOwnerPool,
} from "@/lib/actions/event-compliment";
import { cn } from "@/lib/utils";

/** Saklar "Acara compliment (gratis)" — hanya label, pembukuan tetap normal. */
export function ComplimentToggle({
	eventId,
	projectId,
	value,
}: {
	eventId: string;
	projectId: string;
	value: boolean;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<button
			type="button"
			aria-pressed={value}
			disabled={pending}
			onClick={() =>
				start(async () => {
					const r = await setEventCompliment(eventId, projectId, !value);
					if (!r.ok) return void toast.error(r.error);
					toast.success(
						!value
							? "Ditandai acara compliment — biayanya hadiah dari Tetra"
							: "Penanda compliment dilepas",
					);
					router.refresh();
				})
			}
			className={cn(
				"inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors disabled:opacity-50",
				value
					? "border-transparent bg-foreground text-background"
					: "border-border-default bg-card hover:bg-secondary",
			)}
		>
			<Gift className="size-4" />
			{value ? "Acara compliment (gratis)" : "Tandai acara compliment"}
		</button>
	);
}

/** Saklar "Bagi hasil owner" acara ini (bawaan aktif). */
export function OwnerPoolToggle({
	eventId,
	projectId,
	value,
}: {
	eventId: string;
	projectId: string;
	value: boolean;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<button
			type="button"
			role="switch"
			aria-checked={value}
			disabled={pending}
			onClick={() =>
				start(async () => {
					const r = await setEventOwnerPool(eventId, projectId, !value);
					if (!r.ok) return void toast.error(r.error);
					toast.success(
						!value
							? "Bagi hasil owner diaktifkan untuk acara ini"
							: "Bagi hasil owner dimatikan — tidak dibagi & tidak jadi tunggakan",
					);
					router.refresh();
				})
			}
			className="inline-flex h-9 items-center gap-2 rounded-full border border-border-default bg-card px-3 text-[13px] font-medium transition-colors hover:bg-secondary disabled:opacity-50"
		>
			<span
				className={cn(
					"relative inline-block h-5 w-9 rounded-full transition-colors",
					value ? "bg-emerald-600" : "bg-muted-foreground/30",
				)}
			>
				<span
					className={cn(
						"absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]",
						value ? "left-[18px]" : "left-0.5",
					)}
				/>
			</span>
			Bagi hasil owner {value ? "aktif" : "mati"}
		</button>
	);
}
