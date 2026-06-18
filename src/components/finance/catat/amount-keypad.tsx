"use client";

import { Delete } from "lucide-react";
import { useHaptics } from "@/lib/use-haptics";
import { cn } from "@/lib/utils";

/**
 * AmountKeypad — the mobile signature input. A big tactile numeric pad that
 * replaces the OS keyboard so the amount stays the hero and nothing reflows.
 * The committed amount lives in the parent; the pad only emits intents.
 */

const KEYS = [
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"000",
	"0",
	"del",
] as const;

export function AmountKeypad({
	onAppend,
	onTripleZero,
	onBackspace,
	className,
}: {
	onAppend: (digit: number) => void;
	onTripleZero: () => void;
	onBackspace: () => void;
	className?: string;
}) {
	const haptic = useHaptics();
	return (
		<div className={cn("grid grid-cols-3 gap-2", className)}>
			{KEYS.map((k) => (
				<button
					key={k}
					type="button"
					aria-label={k === "del" ? "Hapus angka" : k}
					onClick={() => {
						haptic("select");
						if (k === "del") onBackspace();
						else if (k === "000") onTripleZero();
						else onAppend(Number(k));
					}}
					className="press tap tabular flex h-12 items-center justify-center rounded-xl border border-border-subtle bg-card text-xl font-medium text-foreground active:bg-surface-3"
				>
					{k === "del" ? <Delete className="size-5" aria-hidden="true" /> : k}
				</button>
			))}
		</div>
	);
}

const QUICK_ADDS = [10_000, 50_000, 100_000, 500_000] as const;

export function shortAmount(v: number): string {
	if (v >= 1_000_000) return `${v / 1_000_000}jt`;
	if (v >= 1_000) return `${v / 1_000}rb`;
	return String(v);
}

export function QuickAmountChips({
	onAdd,
	className,
}: {
	onAdd: (delta: number) => void;
	className?: string;
}) {
	const haptic = useHaptics();
	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{QUICK_ADDS.map((v) => (
				<button
					key={v}
					type="button"
					onClick={() => {
						haptic("tap");
						onAdd(v);
					}}
					className="press tap h-8 rounded-full border border-border-default bg-card px-3 text-[13px] font-medium text-foreground hover:bg-secondary"
				>
					+{shortAmount(v)}
				</button>
			))}
		</div>
	);
}
