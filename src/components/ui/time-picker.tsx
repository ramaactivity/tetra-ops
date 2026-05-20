"use client";

import { Clock } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * <TimePicker /> — native HH:MM picker (24-hour) with optional preset popup.
 *
 * Backed by a real `<input type="time">` so users get the browser-native
 * picker UX, mobile keyboard auto-switches to time mode, and copy/paste
 * just works. The Clock affordance reveals quick presets for the most
 * common event start/end slots at Tetra.
 */

interface TimePickerProps {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	id?: string;
	className?: string;
	step?: number; // minute step for native picker (seconds resolution)
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
	step = 300, // 5-minute granularity
	presets = DEFAULT_PRESETS,
	...ariaProps
}: TimePickerProps) {
	const isControlled = value !== undefined;
	const [internal, setInternal] = useState<string>(defaultValue ?? "");
	const current = isControlled ? value : internal;

	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [presetOpen, setPresetOpen] = useState(false);

	function commit(next: string) {
		if (!isControlled) setInternal(next);
		onValueChange?.(next);
	}

	function onInputChange(e: ChangeEvent<HTMLInputElement>) {
		commit(e.target.value);
	}

	function pickPreset(t: string) {
		commit(t);
		setPresetOpen(false);
		inputRef.current?.blur();
	}

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
					ref={inputRef}
					id={id}
					type="time"
					step={step}
					aria-label={ariaProps["aria-label"] ?? "Waktu"}
					value={current ?? ""}
					onChange={onInputChange}
					disabled={disabled}
					className="tabular flex-1 bg-transparent px-3 text-fluid-body font-medium outline-none placeholder:text-muted-foreground/40"
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
							const active = t === current;
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
						Pilih preset atau ketik manual di kolom waktu
					</div>
				</div>
			)}
		</div>
	);
}
