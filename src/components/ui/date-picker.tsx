"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
	addMonths,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isAfter,
	isBefore,
	isSameDay,
	isSameMonth,
	parse,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * <DatePicker /> — calendar in a popover. Replaces <input type="date">.
 *
 * Value model: stores ISO date string `yyyy-MM-dd` (no time, no timezone)
 * which is the same shape Postgres `date` columns and HTML date inputs use.
 * Internally parses to Date for rendering, so callers never deal with TZ
 * weirdness.
 *
 * Usage:
 *   <DatePicker
 *     value={form.watch("event_date")}
 *     onValueChange={(v) => form.setValue("event_date", v)}
 *     placeholder="Pilih tanggal event"
 *   />
 */

interface DatePickerProps {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
	className?: string;
	min?: string; // yyyy-MM-dd
	max?: string;
	"aria-invalid"?: boolean;
	"aria-label"?: string;
}

const ISO_FORMAT = "yyyy-MM-dd";

export function DatePicker({
	value,
	defaultValue,
	onValueChange,
	placeholder = "Pilih tanggal",
	disabled,
	id,
	className,
	min,
	max,
	...ariaProps
}: DatePickerProps) {
	const [open, setOpen] = useState(false);
	const [internal, setInternal] = useState<string | undefined>(defaultValue);
	const isControlled = value !== undefined;
	const current = isControlled ? value : internal;

	const selectedDate = current ? parseIsoDate(current) : undefined;
	const minDate = min ? parseIsoDate(min) : undefined;
	const maxDate = max ? parseIsoDate(max) : undefined;

	const [viewMonth, setViewMonth] = useState<Date>(
		selectedDate ?? new Date(),
	);

	function commit(next: Date) {
		const iso = format(next, ISO_FORMAT);
		if (!isControlled) setInternal(iso);
		onValueChange?.(iso);
		setOpen(false);
	}

	const days = useMemo(() => {
		const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
		const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
		return eachDayOfInterval({ start, end });
	}, [viewMonth]);

	const today = startOfDay(new Date());
	const yesterday = subDays(today, 1);

	return (
		<PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
			<PopoverPrimitive.Trigger
				render={
					<Button
						id={id}
						variant="outline"
						disabled={disabled}
						className={cn(
							"w-full justify-between gap-2 font-normal",
							!current && "text-muted-foreground",
							className,
						)}
						{...ariaProps}
					/>
				}
			>
				<span>
					{selectedDate
						? format(selectedDate, "d MMMM yyyy", { locale: idLocale })
						: placeholder}
				</span>
				<CalendarIcon className="size-4 text-muted-foreground" aria-hidden />
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Positioner sideOffset={6} className="isolate z-50">
					<PopoverPrimitive.Popup
						className={cn(
							"w-[300px] rounded-lg bg-surface-3 p-3 shadow-[var(--shadow-level-3)] ring-1 ring-border-strong/40 outline-none",
							"data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
							"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
							"duration-base ease-out-expo",
						)}
					>
						<div className="mb-3 flex items-center justify-between">
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={(e) => {
									e.preventDefault();
									setViewMonth((m) => addMonths(m, -1));
								}}
								aria-label="Bulan sebelumnya"
							>
								<ChevronLeftIcon />
							</Button>
							<div className="text-sm font-medium">
								{format(viewMonth, "MMMM yyyy", { locale: idLocale })}
							</div>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={(e) => {
									e.preventDefault();
									setViewMonth((m) => addMonths(m, 1));
								}}
								aria-label="Bulan berikutnya"
							>
								<ChevronRightIcon />
							</Button>
						</div>
						<div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							{["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"].map((d) => (
								<div key={d}>{d}</div>
							))}
						</div>
						<div className="mt-1 grid grid-cols-7 gap-1">
							{days.map((day) => {
								const inMonth = isSameMonth(day, viewMonth);
								const isSelected = selectedDate
									? isSameDay(day, selectedDate)
									: false;
								const isOutOfRange =
									(minDate && isBefore(day, minDate)) ||
									(maxDate && isAfter(day, maxDate));
								return (
									<button
										key={day.toISOString()}
										type="button"
										disabled={isOutOfRange}
										onClick={() => commit(day)}
										className={cn(
											"h-8 rounded-md text-sm transition-colors",
											"hover:bg-surface-4",
											"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
											!inMonth && "text-muted-foreground/50",
											isSelected &&
												"bg-primary font-medium text-primary-foreground hover:bg-primary",
											isOutOfRange &&
												"cursor-not-allowed opacity-30 hover:bg-transparent",
										)}
									>
										{format(day, "d")}
									</button>
								);
							})}
						</div>
						<div className="mt-3 flex items-center justify-between gap-1 border-t border-border-subtle pt-2">
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									disabled={outOfRange(today, minDate, maxDate)}
									onClick={(e) => {
										e.preventDefault();
										commit(today);
									}}
								>
									Hari ini
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={outOfRange(yesterday, minDate, maxDate)}
									onClick={(e) => {
										e.preventDefault();
										commit(yesterday);
									}}
								>
									Kemarin
								</Button>
							</div>
							{current ? (
								<Button
									variant="ghost"
									size="sm"
									onClick={(e) => {
										e.preventDefault();
										if (!isControlled) setInternal(undefined);
										onValueChange?.("");
										setOpen(false);
									}}
								>
									Bersihkan
								</Button>
							) : null}
						</div>
					</PopoverPrimitive.Popup>
				</PopoverPrimitive.Positioner>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}

function parseIsoDate(iso: string): Date | undefined {
	if (!iso) return undefined;
	const parsed = parse(iso, ISO_FORMAT, new Date());
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** True kalau `day` di luar batas min/max (untuk disable quick-button). */
function outOfRange(
	day: Date,
	minDate: Date | undefined,
	maxDate: Date | undefined,
): boolean {
	return Boolean(
		(minDate && isBefore(day, minDate)) || (maxDate && isAfter(day, maxDate)),
	);
}
