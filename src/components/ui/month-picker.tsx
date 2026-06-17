"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { format, parse } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * <MonthPicker /> — year-nav + 12-month grid in a popover. Replaces
 * <input type="month">.
 *
 * Value: ISO month string `yyyy-MM` (matches HTML input type=month).
 *
 * Usage:
 *   <MonthPicker
 *     value={month}
 *     onValueChange={setMonth}
 *     placeholder="Pilih bulan"
 *   />
 */

interface MonthPickerProps {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
	className?: string;
	"aria-label"?: string;
	"aria-invalid"?: boolean;
	/**
	 * Quick-action buttons rendered at the top of the calendar dropdown
	 * (e.g. "Bulan ini" / "Semua bulan"). Keeps these shortcuts inside the
	 * picker instead of as separate chrome beside it.
	 */
	quickActions?: Array<{
		label: string;
		onSelect: () => void;
		active?: boolean;
	}>;
}

const ISO_MONTH = "yyyy-MM";

export function MonthPicker({
	value,
	defaultValue,
	onValueChange,
	placeholder = "Pilih bulan",
	disabled,
	id,
	className,
	quickActions,
	...ariaProps
}: MonthPickerProps) {
	const isControlled = value !== undefined;
	const [internal, setInternal] = useState<string | undefined>(defaultValue);
	const current = isControlled ? value : internal;

	const selected = current ? parseIsoMonth(current) : undefined;
	const [open, setOpen] = useState(false);
	const [viewYear, setViewYear] = useState<number>(
		(selected ?? new Date()).getFullYear(),
	);

	function commit(year: number, monthIndex: number) {
		const date = new Date(year, monthIndex, 1);
		const iso = format(date, ISO_MONTH);
		if (!isControlled) setInternal(iso);
		onValueChange?.(iso);
		setOpen(false);
	}

	const months = Array.from({ length: 12 }, (_, i) => i);

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
					{selected
						? format(selected, "MMMM yyyy", { locale: idLocale })
						: placeholder}
				</span>
				<CalendarIcon className="size-4 text-muted-foreground" aria-hidden />
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Positioner
					side="bottom"
					align="start"
					sideOffset={6}
					className="isolate z-50"
				>
					<PopoverPrimitive.Popup
						className={cn(
							"w-[280px] rounded-md border border-border-default bg-popover p-3 text-popover-foreground shadow-[var(--shadow-level-5)] outline-none",
							"data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
							"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
							"duration-base ease-out-expo",
						)}
					>
						{quickActions && quickActions.length > 0 ? (
							<div className="mb-3 flex flex-wrap gap-1.5 border-b border-border-subtle pb-3">
								{quickActions.map((qa) => (
									<button
										key={qa.label}
										type="button"
										onClick={() => {
											qa.onSelect();
											setOpen(false);
										}}
										className={cn(
											"h-8 flex-1 rounded-md px-2 text-[12.5px] font-medium transition-colors",
											qa.active
												? "bg-primary text-primary-foreground"
												: "bg-secondary text-foreground hover:bg-muted",
										)}
									>
										{qa.label}
									</button>
								))}
							</div>
						) : null}
						<div className="mb-3 flex items-center justify-between">
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={(e) => {
									e.preventDefault();
									setViewYear((y) => y - 1);
								}}
								aria-label="Tahun sebelumnya"
							>
								<ChevronLeftIcon />
							</Button>
							<div className="text-sm font-medium">{viewYear}</div>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={(e) => {
									e.preventDefault();
									setViewYear((y) => y + 1);
								}}
								aria-label="Tahun berikutnya"
							>
								<ChevronRightIcon />
							</Button>
						</div>
						<div className="grid grid-cols-3 gap-2">
							{months.map((m) => {
								const isSelected =
									selected &&
									selected.getFullYear() === viewYear &&
									selected.getMonth() === m;
								return (
									<button
										key={m}
										type="button"
										onClick={() => commit(viewYear, m)}
										className={cn(
											"h-9 rounded-md px-2 text-[13px] transition-colors",
											"hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
											isSelected &&
												"bg-primary font-medium text-primary-foreground hover:bg-primary",
										)}
									>
										{format(new Date(2000, m, 1), "MMM", { locale: idLocale })}
									</button>
								);
							})}
						</div>
					</PopoverPrimitive.Popup>
				</PopoverPrimitive.Positioner>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}

function parseIsoMonth(iso: string): Date | undefined {
	if (!iso) return undefined;
	const parsed = parse(iso, ISO_MONTH, new Date());
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
