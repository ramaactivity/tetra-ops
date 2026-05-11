"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * <Combobox /> — controlled, branded autocomplete + free-text input.
 *
 * Rewritten dari nol (sesi 9) — sebelumnya pakai Base UI Combobox.Root
 * yang reset input pada blur saat value=null (no selected item).
 * Sekarang pure React: input controlled + popup absolute di bawah trigger.
 *
 * Modes:
 * - `allowFreeText` (default true): input value IS the committed value.
 *   Options are suggestions. Owner can type "anything new" + tab/click
 *   away → tersimpan apa adanya.
 * - `allowFreeText=false`: input shows selected option's label.
 *   Typing-while-open filters list; only explicit click-to-select
 *   commits a new value. Useful when value must be a UUID (relasi picker).
 *
 * Form integration: parent renders a hidden <input name="..."
 * value={state}/> for FormData submission. Combobox is purely controlled.
 */

export interface ComboboxOption {
	value: string;
	label: string;
	/** Secondary line shown smaller below label */
	sublabel?: string;
	disabled?: boolean;
}

export interface ComboboxProps {
	value: string;
	onValueChange: (value: string) => void;
	options: ReadonlyArray<ComboboxOption>;
	placeholder?: string;
	disabled?: boolean;
	/** If true, user can type free-text not in the option list. Default true. */
	allowFreeText?: boolean;
	/** Empty-state message when filter yields no results */
	emptyMessage?: string;
	"aria-label"?: string;
	"aria-invalid"?: boolean;
	className?: string;
	id?: string;
}

export function Combobox({
	value,
	onValueChange,
	options,
	placeholder = "Pilih…",
	disabled,
	allowFreeText = true,
	emptyMessage = "Tidak ada yang cocok",
	className,
	id: idProp,
	...ariaProps
}: ComboboxProps) {
	const fallbackId = useId();
	const inputId = idProp ?? fallbackId;
	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState(""); // only used in select-only mode
	const [highlightIdx, setHighlightIdx] = useState(0);

	const selectedOption = useMemo(
		() => options.find((o) => o.value === value),
		[options, value],
	);

	// What's displayed inside the input?
	// - allowFreeText: always show committed value (so blur is reliable)
	// - !allowFreeText: show selected option's label, OR live search when open
	const displayValue = allowFreeText
		? value
		: open
			? search
			: (selectedOption?.label ?? "");

	// What text drives filtering?
	const filterText = allowFreeText ? value : search;

	const filtered = useMemo(() => {
		const lc = filterText.trim().toLowerCase();
		if (!lc) return options;
		return options.filter((o) => {
			const hay = `${o.label} ${o.sublabel ?? ""} ${o.value}`.toLowerCase();
			return hay.includes(lc);
		});
	}, [options, filterText]);

	// Reset highlight when filter changes
	useEffect(() => {
		setHighlightIdx(0);
	}, []);

	const closeAndReset = useCallback(() => {
		setOpen(false);
		if (!allowFreeText) setSearch("");
	}, [allowFreeText]);

	// Click outside → close
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			const target = e.target as Node;
			if (!rootRef.current?.contains(target)) {
				closeAndReset();
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open, closeAndReset]);

	function handleSelect(opt: ComboboxOption) {
		if (opt.disabled) return;
		onValueChange(opt.value);
		closeAndReset();
		requestAnimationFrame(() => inputRef.current?.blur());
	}

	function handleClear() {
		onValueChange("");
		setSearch("");
		inputRef.current?.focus();
	}

	function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		const next = e.target.value;
		if (allowFreeText) {
			onValueChange(next);
		} else {
			setSearch(next);
		}
		setOpen(true);
		setHighlightIdx(0);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (!open) {
				setOpen(true);
				return;
			}
			setHighlightIdx((i) => Math.min(filtered.length - 1, i + 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (!open) return;
			setHighlightIdx((i) => Math.max(0, i - 1));
		} else if (e.key === "Enter") {
			// Always preventDefault: stop accidental form submit.
			// If popup open + highlighted item, pick it. Otherwise just commit
			// current input (already happened via onChange) and close.
			e.preventDefault();
			if (open && filtered[highlightIdx]) {
				handleSelect(filtered[highlightIdx]);
			} else {
				closeAndReset();
			}
		} else if (e.key === "Escape") {
			if (open) {
				e.preventDefault();
				closeAndReset();
			}
		} else if (e.key === "Tab") {
			// Tab commits + closes; let browser handle focus move naturally.
			closeAndReset();
		}
	}

	function handleFocus() {
		setOpen(true);
		if (!allowFreeText && selectedOption) {
			setSearch("");
		}
	}

	return (
		<div ref={rootRef} className={cn("relative", className)}>
			<input
				ref={inputRef}
				id={inputId}
				type="text"
				value={displayValue}
				onChange={handleInputChange}
				onFocus={handleFocus}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				disabled={disabled}
				autoComplete="off"
				role="combobox"
				aria-expanded={open}
				aria-controls={open ? `${inputId}-list` : undefined}
				aria-autocomplete="list"
				aria-label={ariaProps["aria-label"]}
				aria-invalid={ariaProps["aria-invalid"]}
				className="h-10 w-full rounded-md border border-border-default bg-background pl-3 pr-16 text-fluid-body text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
			/>
			<div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1.5">
				{value && !disabled ? (
					<button
						type="button"
						onClick={handleClear}
						aria-label="Clear"
						className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<X className="size-3.5" />
					</button>
				) : null}
				<button
					type="button"
					onClick={() => {
						setOpen((o) => !o);
						inputRef.current?.focus();
					}}
					disabled={disabled}
					aria-label="Toggle options"
					className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
				>
					<ChevronsUpDown className="size-3.5" />
				</button>
			</div>

			{open && (
				<div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border-default bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 animate-in fade-in-0 zoom-in-95 duration-100">
					{filtered.length === 0 ? (
						<div className="px-3 py-6 text-center text-fluid-caption italic text-muted-foreground">
							{emptyMessage}
						</div>
					) : (
						<ul
							ref={listRef}
							id={`${inputId}-list`}
							role="listbox"
							className="max-h-72 overflow-y-auto p-1"
						>
							{filtered.map((opt, idx) => {
								const isSelected = opt.value === value;
								const isHighlighted = idx === highlightIdx;
								return (
									<li
										key={opt.value}
										role="option"
										aria-selected={isSelected}
										aria-disabled={opt.disabled}
										onMouseDown={(e) => {
											// preventDefault: stop input from blurring before click
											e.preventDefault();
											handleSelect(opt);
										}}
										onMouseEnter={() => setHighlightIdx(idx)}
										className={cn(
											"flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-fluid-body text-foreground transition-colors",
											isHighlighted && "bg-muted",
											isSelected && "bg-primary/10 font-medium",
											opt.disabled && "cursor-not-allowed opacity-40",
										)}
									>
										<span className="grid size-4 shrink-0 place-items-center text-primary">
											{isSelected ? <Check className="size-3.5" /> : null}
										</span>
										<div className="min-w-0 flex-1 space-y-0.5">
											<div className="truncate">{opt.label}</div>
											{opt.sublabel ? (
												<div className="truncate text-[11px] text-muted-foreground">
													{opt.sublabel}
												</div>
											) : null}
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
