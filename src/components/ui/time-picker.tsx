"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ChevronDown, Clock } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * <TimePicker /> — custom HH:MM picker.
 *
 * Trigger: branded button showing "HH:MM" + Clock icon + chevron. Click
 * opens a popover with:
 *   1. Preset chips row (most-common Tetra event start slots)
 *   2. Two scrollable columns — hours 00-23, minutes 00-55 (step 5)
 *   3. Keyboard: arrows move within column, Tab switches column,
 *      Enter commits, Escape closes
 *
 * No native browser controls — design system-consistent with DatePicker
 * (same Popover primitive, same surface tokens).
 */

interface TimePickerProps {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	id?: string;
	className?: string;
	"aria-label"?: string;
	"aria-invalid"?: boolean;
	presets?: ReadonlyArray<string>;
	placeholder?: string;
}

const DEFAULT_PRESETS = ["08:00", "10:00", "13:00", "19:00"];
const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
	(i * 5).toString().padStart(2, "0"),
);

function splitTime(s?: string): { hh: string; mm: string } {
	if (!s) return { hh: "", mm: "" };
	const m = s.match(/^(\d{1,2}):(\d{1,2})/);
	if (!m) return { hh: "", mm: "" };
	return { hh: m[1].padStart(2, "0"), mm: m[2].padStart(2, "0") };
}

function nearestMinuteStep(mm: string): string {
	if (!mm) return "00";
	const num = Number(mm);
	if (!Number.isFinite(num)) return "00";
	const stepped = Math.round(num / 5) * 5;
	return Math.min(55, Math.max(0, stepped)).toString().padStart(2, "0");
}

export function TimePicker({
	value,
	defaultValue,
	onValueChange,
	disabled,
	id,
	className,
	presets = DEFAULT_PRESETS,
	placeholder = "Pilih waktu",
	...ariaProps
}: TimePickerProps) {
	const isControlled = value !== undefined;
	const [internal, setInternal] = useState<string>(defaultValue ?? "");
	const current = isControlled ? value : internal;
	const [open, setOpen] = useState(false);
	const [activeCol, setActiveCol] = useState<"hh" | "mm">("hh");

	const { hh, mm } = splitTime(current);
	const hourListRef = useRef<HTMLDivElement>(null);
	const minuteListRef = useRef<HTMLDivElement>(null);

	function commit(nextHh: string, nextMm: string) {
		const padded = `${nextHh.padStart(2, "0")}:${nextMm.padStart(2, "0")}`;
		if (!isControlled) setInternal(padded);
		onValueChange?.(padded);
	}

	function pickHour(h: string) {
		commit(h, mm || "00");
		setActiveCol("mm");
	}

	function pickMinute(m: string) {
		commit(hh || "00", m);
		setOpen(false);
	}

	function pickPreset(t: string) {
		const { hh: h, mm: m } = splitTime(t);
		commit(h, m);
		setOpen(false);
	}

	const scrollActiveIntoView = useCallback(() => {
		const scrollColumn = (
			container: HTMLDivElement | null,
			activeValue: string,
		) => {
			if (!container || !activeValue) return;
			const el = container.querySelector<HTMLElement>(
				`[data-value="${activeValue}"]`,
			);
			if (el) {
				const containerRect = container.getBoundingClientRect();
				const elRect = el.getBoundingClientRect();
				const target =
					el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
				container.scrollTop = Math.max(0, target);
				void containerRect;
				void elRect;
			}
		};
		scrollColumn(hourListRef.current, hh);
		scrollColumn(minuteListRef.current, nearestMinuteStep(mm));
	}, [hh, mm]);

	useEffect(() => {
		if (open) {
			// Defer to next paint so refs are mounted.
			const id = requestAnimationFrame(scrollActiveIntoView);
			return () => cancelAnimationFrame(id);
		}
	}, [open, scrollActiveIntoView]);

	function handleColumnKey(
		col: "hh" | "mm",
		e: KeyboardEvent<HTMLDivElement>,
	) {
		const list = col === "hh" ? HOURS : MINUTES;
		const currentVal = col === "hh" ? hh || "00" : nearestMinuteStep(mm) || "00";
		const idx = list.indexOf(currentVal);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			const next = list[Math.min(list.length - 1, idx + 1)];
			if (col === "hh") commit(next, mm || "00");
			else commit(hh || "00", next);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			const next = list[Math.max(0, idx - 1)];
			if (col === "hh") commit(next, mm || "00");
			else commit(hh || "00", next);
		} else if (e.key === "ArrowRight" || e.key === "Tab") {
			if (col === "hh") {
				e.preventDefault();
				setActiveCol("mm");
			}
		} else if (e.key === "ArrowLeft") {
			if (col === "mm") {
				e.preventDefault();
				setActiveCol("hh");
			}
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (col === "hh") setActiveCol("mm");
			else setOpen(false);
		} else if (e.key === "Escape") {
			e.preventDefault();
			setOpen(false);
		}
	}

	const displayValue = current ? current : "";

	return (
		<PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
			<PopoverPrimitive.Trigger
				render={
					<Button
						id={id}
						type="button"
						variant="outline"
						disabled={disabled}
						className={cn(
							"w-full justify-between gap-2 font-normal",
							!displayValue && "text-muted-foreground",
							className,
						)}
						{...ariaProps}
					/>
				}
			>
				<span className="inline-flex items-center gap-2">
					<Clock className="size-4 text-muted-foreground" aria-hidden />
					<span className={cn("tabular", displayValue && "text-foreground")}>
						{displayValue || placeholder}
					</span>
				</span>
				<ChevronDown className="size-4 text-muted-foreground" aria-hidden />
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Positioner sideOffset={6} className="isolate z-50">
					<PopoverPrimitive.Popup
						className={cn(
							"w-[280px] rounded-lg bg-surface-3 p-3 shadow-[var(--shadow-level-3)] ring-1 ring-border-strong/40 outline-none",
							"data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
							"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
							"duration-base ease-out-expo",
						)}
					>
						<div className="space-y-3">
							{/* Preset chips */}
							{presets.length > 0 ? (
								<div className="flex flex-wrap gap-1.5">
									{presets.map((p) => {
										const active = p === current;
										return (
											<button
												key={p}
												type="button"
												onClick={() => pickPreset(p)}
												className={cn(
													"tabular rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors",
													active
														? "border-primary/40 bg-primary/10 text-primary"
														: "border-border-default/60 bg-surface-2 text-foreground hover:bg-muted",
												)}
											>
												{p}
											</button>
										);
									})}
								</div>
							) : null}

							{/* 2-col HH/MM scroll picker */}
							<div className="grid grid-cols-2 gap-2">
								<div className="space-y-1">
									<div className="eyebrow flex items-center justify-between">
										<span>Jam</span>
									</div>
									<div
										ref={hourListRef}
										role="listbox"
										aria-label="Pilih jam"
										aria-activedescendant={hh ? `tp-hh-${hh}` : undefined}
										tabIndex={0}
										onFocus={() => setActiveCol("hh")}
										onKeyDown={(e) => handleColumnKey("hh", e)}
										className={cn(
											"max-h-[200px] overflow-y-auto rounded-md border border-border-default/60 bg-surface-2 p-1",
											"focus:outline-none",
											activeCol === "hh" &&
												"ring-2 ring-ring/40 ring-offset-1 ring-offset-surface-3",
										)}
									>
										{HOURS.map((h) => {
											const active = h === hh;
											return (
												<button
													id={`tp-hh-${h}`}
													key={h}
													type="button"
													data-value={h}
													role="option"
													aria-selected={active}
													tabIndex={-1}
													onClick={() => pickHour(h)}
													className={cn(
														"tabular block w-full rounded-sm px-2 py-1 text-center text-[13px] font-medium transition-colors",
														active
															? "bg-primary text-primary-foreground"
															: "text-foreground hover:bg-muted",
													)}
												>
													{h}
												</button>
											);
										})}
									</div>
								</div>
								<div className="space-y-1">
									<div className="eyebrow flex items-center justify-between">
										<span>Menit</span>
									</div>
									<div
										ref={minuteListRef}
										role="listbox"
										aria-label="Pilih menit"
										aria-activedescendant={mm ? `tp-mm-${mm}` : undefined}
										tabIndex={0}
										onFocus={() => setActiveCol("mm")}
										onKeyDown={(e) => handleColumnKey("mm", e)}
										className={cn(
											"max-h-[200px] overflow-y-auto rounded-md border border-border-default/60 bg-surface-2 p-1",
											"focus:outline-none",
											activeCol === "mm" &&
												"ring-2 ring-ring/40 ring-offset-1 ring-offset-surface-3",
										)}
									>
										{MINUTES.map((m) => {
											const active = m === nearestMinuteStep(mm);
											return (
												<button
													id={`tp-mm-${m}`}
													key={m}
													type="button"
													data-value={m}
													role="option"
													aria-selected={active}
													tabIndex={-1}
													onClick={() => pickMinute(m)}
													className={cn(
														"tabular block w-full rounded-sm px-2 py-1 text-center text-[13px] font-medium transition-colors",
														active
															? "bg-primary text-primary-foreground"
															: "text-foreground hover:bg-muted",
													)}
												>
													{m}
												</button>
											);
										})}
									</div>
								</div>
							</div>

							<div className="flex items-center justify-between border-t border-border-subtle pt-2 text-[11px] text-muted-foreground">
								<span>↑↓ pilih · → ganti kolom · Esc tutup</span>
								{current ? (
									<button
										type="button"
										onClick={() => {
											if (!isControlled) setInternal("");
											onValueChange?.("");
											setOpen(false);
										}}
										className="font-medium text-foreground hover:underline"
									>
										Bersihkan
									</button>
								) : null}
							</div>
						</div>
					</PopoverPrimitive.Popup>
				</PopoverPrimitive.Positioner>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}
