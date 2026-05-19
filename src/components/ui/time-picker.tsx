"use client";

import { Clock } from "lucide-react";
import {
	type ChangeEvent,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * <TimePicker /> — branded HH:MM picker (24-hour).
 *
 * Two large segmented cells (hour + minute) yang jadi target klik gampang.
 * Type angka langsung overwrite; auto-advance ke menit setelah 2 digit
 * jam. Arrow up/down step values. Tab pindah antar cell.
 *
 * Quick presets (08:00 / 10:00 / 13:00 / 15:00 / 19:00) muncul via clock
 * button — cocok buat event start times yang umum di Tetra.
 */

interface TimePickerProps {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	id?: string;
	className?: string;
	step?: number; // minute step (arrow up/down), default 15
	"aria-label"?: string;
	"aria-invalid"?: boolean;
	presets?: ReadonlyArray<string>;
}

const DEFAULT_PRESETS = [
	"08:00",
	"10:00",
	"13:00",
	"14:00",
	"15:00",
	"17:00",
	"18:00",
	"19:00",
];

export function TimePicker({
	value,
	defaultValue,
	onValueChange,
	disabled,
	id,
	className,
	step = 15,
	presets = DEFAULT_PRESETS,
	...ariaProps
}: TimePickerProps) {
	const isControlled = value !== undefined;
	const [internal, setInternal] = useState<string>(defaultValue ?? "");
	const current = isControlled ? value : internal;

	const [hh, mm] = splitTime(current);
	const rootRef = useRef<HTMLDivElement>(null);
	const hourRef = useRef<HTMLInputElement>(null);
	const minuteRef = useRef<HTMLInputElement>(null);
	const [presetOpen, setPresetOpen] = useState(false);

	function commit(nextHh: string, nextMm: string) {
		const padded = `${pad2(nextHh)}:${pad2(nextMm)}`;
		if (!isControlled) setInternal(padded);
		onValueChange?.(padded);
	}

	function onHourChange(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
		const num = Math.max(0, Math.min(23, Number(raw) || 0));
		commit(String(num), mm || "0");
		if (raw.length === 2) minuteRef.current?.focus();
	}

	function onMinuteChange(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
		const num = Math.max(0, Math.min(59, Number(raw) || 0));
		commit(hh || "0", String(num));
	}

	function onKeyStep(unit: "h" | "m", direction: 1 | -1) {
		const incrementer = unit === "h" ? 1 : step;
		if (unit === "h") {
			const nextH = (Number(hh || "0") + direction + 24) % 24;
			commit(String(nextH), mm || "0");
		} else {
			const total = Number(hh || "0") * 60 + Number(mm || "0");
			const nextTotal =
				(total + direction * incrementer + 24 * 60) % (24 * 60);
			commit(String(Math.floor(nextTotal / 60)), String(nextTotal % 60));
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
			minuteRef.current?.select();
		}
	}

	function onMinuteKey(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			onKeyStep("m", 1);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			onKeyStep("m", -1);
		} else if (e.key === "ArrowLeft") {
			if ((e.target as HTMLInputElement).selectionStart === 0) {
				e.preventDefault();
				hourRef.current?.focus();
				hourRef.current?.select();
			}
		}
	}

	function pickPreset(t: string) {
		const [h, m] = splitTime(t);
		commit(h, m);
		setPresetOpen(false);
		minuteRef.current?.blur();
		hourRef.current?.blur();
	}

	// Close preset popup on outside click
	useEffect(() => {
		if (!presetOpen) return;
		function handle(e: MouseEvent) {
			if (!rootRef.current?.contains(e.target as Node)) {
				setPresetOpen(false);
			}
		}
		document.addEventListener("mousedown", handle);
		return () => document.removeEventListener("mousedown", handle);
	}, [presetOpen]);

	return (
		<div ref={rootRef} className={cn("relative", className)}>
			<div
				className={cn(
					"flex h-10 items-stretch rounded-md border border-border-default bg-background transition-shadow",
					"focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
					"aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20",
					disabled && "pointer-events-none opacity-60",
				)}
				data-slot="time-picker"
				aria-invalid={ariaProps["aria-invalid"]}
			>
				<input
					ref={hourRef}
					id={id}
					type="text"
					inputMode="numeric"
					pattern="\d{0,2}"
					aria-label={ariaProps["aria-label"] ?? "Jam"}
					value={hh}
					onChange={onHourChange}
					onKeyDown={onHourKey}
					onFocus={(e) => e.currentTarget.select()}
					onBlur={() => commit(hh || "0", mm || "0")}
					disabled={disabled}
					placeholder="HH"
					className="tabular flex-1 bg-transparent text-center text-fluid-body font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/40 focus:bg-primary/5"
				/>
				<span
					aria-hidden
					className="grid select-none place-items-center px-0.5 text-base font-medium text-muted-foreground/70"
				>
					:
				</span>
				<input
					ref={minuteRef}
					type="text"
					inputMode="numeric"
					pattern="\d{0,2}"
					aria-label="Menit"
					value={mm}
					onChange={onMinuteChange}
					onKeyDown={onMinuteKey}
					onFocus={(e) => e.currentTarget.select()}
					onBlur={() => commit(hh || "0", mm || "0")}
					disabled={disabled}
					placeholder="MM"
					className="tabular flex-1 bg-transparent text-center text-fluid-body font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/40 focus:bg-primary/5"
				/>
				<button
					type="button"
					onClick={() => setPresetOpen((o) => !o)}
					disabled={disabled}
					aria-label="Preset jam"
					title="Pilih dari preset"
					className="grid w-9 shrink-0 place-items-center border-l border-border-default/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<Clock className="size-4" />
				</button>
			</div>

			{presetOpen && (
				<div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border-default bg-popover shadow-[var(--shadow-level-3)] animate-in fade-in-0 zoom-in-95 duration-100">
					<div className="grid grid-cols-4 gap-1 p-1.5">
						{presets.map((t) => {
							const active = t === `${pad2(hh)}:${pad2(mm)}`;
							return (
								<button
									key={t}
									type="button"
									onClick={() => pickPreset(t)}
									className={cn(
										"tabular rounded-md border px-2 py-1.5 text-fluid-caption font-medium transition-colors",
										active
											? "border-primary/40 bg-primary/10 text-primary"
											: "border-border-default/60 bg-surface-2 text-foreground hover:bg-muted",
									)}
								>
									{t}
								</button>
							);
						})}
					</div>
					<div className="border-t border-border-default/60 px-3 py-1.5 text-[10px] text-muted-foreground">
						↑↓ untuk step · ketik angka langsung · Tab pindah cell
					</div>
				</div>
			)}
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
