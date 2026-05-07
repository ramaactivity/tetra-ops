"use client";

import {
	type ChangeEvent,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * <TimePicker /> — segmented HH:MM input. Replaces <input type="time">.
 *
 * Two number inputs (hour 0-23, minute 0-59) with up/down arrow keys to
 * step. Auto-pads to 2 digits on blur. Mobile-friendly (numeric keyboard,
 * inputMode=numeric, no native picker).
 *
 * Value: HH:MM string (24-hour).
 *
 * Usage:
 *   <TimePicker
 *     value={form.watch("setup_at")}
 *     onValueChange={(v) => form.setValue("setup_at", v)}
 *   />
 */

interface TimePickerProps {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	id?: string;
	className?: string;
	step?: number; // minute step, default 15
	"aria-label"?: string;
	"aria-invalid"?: boolean;
}

export function TimePicker({
	value,
	defaultValue,
	onValueChange,
	disabled,
	id,
	className,
	step = 15,
	...ariaProps
}: TimePickerProps) {
	const isControlled = value !== undefined;
	const [internal, setInternal] = useState<string>(defaultValue ?? "");
	const current = isControlled ? value : internal;

	const [hh, mm] = splitTime(current);
	const minuteRef = useRef<HTMLInputElement>(null);

	function commit(nextHh: string, nextMm: string) {
		const padded = `${pad2(nextHh)}:${pad2(nextMm)}`;
		if (!isControlled) setInternal(padded);
		onValueChange?.(padded);
	}

	function onHourChange(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
		const num = Math.max(0, Math.min(23, Number(raw) || 0));
		commit(String(num), mm);
		if (raw.length === 2) minuteRef.current?.focus();
	}

	function onMinuteChange(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
		const num = Math.max(0, Math.min(59, Number(raw) || 0));
		commit(hh, String(num));
	}

	function onKeyStep(unit: "h" | "m", direction: 1 | -1) {
		const incrementer = unit === "h" ? 1 : step;
		if (unit === "h") {
			const nextH = (Number(hh || "0") + direction + 24) % 24;
			commit(String(nextH), mm || "0");
		} else {
			const total = Number(hh || "0") * 60 + Number(mm || "0");
			const nextTotal = (total + direction * incrementer + 24 * 60) % (24 * 60);
			commit(
				String(Math.floor(nextTotal / 60)),
				String(nextTotal % 60),
			);
		}
	}

	function onHourKey(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			onKeyStep("h", 1);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			onKeyStep("h", -1);
		} else if (e.key === "ArrowRight" || e.key === ":") {
			e.preventDefault();
			minuteRef.current?.focus();
		}
	}

	function onMinuteKey(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			onKeyStep("m", 1);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			onKeyStep("m", -1);
		}
	}

	return (
		<div
			className={cn(
				"inline-flex h-9 items-center gap-1 rounded-lg border border-input bg-transparent px-2 text-sm tabular-nums",
				"focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
				"aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-destructive/20",
				disabled && "pointer-events-none opacity-60",
				className,
			)}
			data-slot="time-picker"
		>
			<input
				ref={undefined}
				id={id}
				type="text"
				inputMode="numeric"
				pattern="\d{0,2}"
				aria-label={ariaProps["aria-label"] ?? "Jam"}
				aria-invalid={ariaProps["aria-invalid"]}
				value={hh}
				onChange={onHourChange}
				onKeyDown={onHourKey}
				onBlur={() => commit(hh || "0", mm || "0")}
				disabled={disabled}
				className="w-7 bg-transparent text-center outline-none"
				placeholder="HH"
			/>
			<span className="select-none text-muted-foreground">:</span>
			<input
				ref={minuteRef}
				type="text"
				inputMode="numeric"
				pattern="\d{0,2}"
				aria-label="Menit"
				value={mm}
				onChange={onMinuteChange}
				onKeyDown={onMinuteKey}
				onBlur={() => commit(hh || "0", mm || "0")}
				disabled={disabled}
				className="w-7 bg-transparent text-center outline-none"
				placeholder="MM"
			/>
		</div>
	);
}

function splitTime(s?: string): [string, string] {
	if (!s) return ["", ""];
	const m = s.match(/^(\d{1,2}):(\d{1,2})/);
	if (!m) return ["", ""];
	return [m[1], m[2]];
}

function pad2(n: string | number) {
	return String(n).padStart(2, "0");
}

// Hint to disable the unused-effect lint warning if biome flags the empty
// import — suppress by referencing useEffect indirectly. (Kept import for
// future: if we want to focus first segment on mount.)
void useEffect;
