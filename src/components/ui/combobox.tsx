"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * <Combobox /> — controlled, branded autocomplete + free-text input.
 *
 * Rewritten dari nol (sesi 9) — sebelumnya pakai Base UI Combobox.Root
 * yang reset input pada blur saat value=null (no selected item).
 * Sekarang pure React: input controlled + popup portaled ke document.body.
 *
 * **Popup is portaled** via React's createPortal so it never gets clipped
 * by ancestors with `overflow-hidden` (e.g. <SectionCard> / <CollapsibleCard>
 * which uses overflow-hidden for its slide-open animation). Position is
 * fixed-to-viewport and tracks the trigger's getBoundingClientRect on
 * scroll + resize. Same escape pattern DatePicker / TimePicker use via
 * base-ui <Popover.Portal>.
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
	/** Compact (h-9, text-sm) for toolbars; default (h-10, body) for forms. */
	size?: "default" | "sm";
	/**
	 * Close the dropdown on scroll instead of tracking the trigger. Use inside
	 * scroll containers (e.g. a bottom Sheet) where fixed-popup repositioning
	 * lags a frame behind and looks glitchy. Default false (track on scroll).
	 */
	closeOnScroll?: boolean;
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
	size = "default",
	closeOnScroll = false,
	...ariaProps
}: ComboboxProps) {
	const fallbackId = useId();
	const inputId = idProp ?? fallbackId;
	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const popupRef = useRef<HTMLDivElement>(null);

	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState(""); // only used in select-only mode
	const [highlightIdx, setHighlightIdx] = useState(0);
	const [popupRect, setPopupRect] = useState<{
		top: number;
		left: number;
		width: number;
		placement: "below" | "above";
		/** Tinggi maksimum nyata di layar — bukan angka tetap. */
		maxHeight: number;
	} | null>(null);

	const selectedOption = useMemo(
		() => options.find((o) => o.value === value),
		[options, value],
	);

	// What's displayed inside the trigger?
	// - allowFreeText: always show committed value (input IS the value)
	// - !allowFreeText: show selected option's label. Search happens in a
	//   dedicated box INSIDE the dropdown (so tapping the trigger on mobile
	//   opens the list without popping the keyboard).
	const displayValue = allowFreeText ? value : (selectedOption?.label ?? "");

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

	// Click outside → close. Popup is portaled to <body>, so it's NOT inside
	// rootRef — check both refs.
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			const target = e.target as Node;
			if (
				rootRef.current?.contains(target) ||
				popupRef.current?.contains(target)
			) {
				return;
			}
			closeAndReset();
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open, closeAndReset]);

	// Position the portaled popup relative to the trigger. Recompute on
	// open + on scroll (capture: true to catch nested scrollers) + resize.
	// Auto-flip to "above" if there's not enough room below the trigger.
	useLayoutEffect(() => {
		if (!open) {
			setPopupRect(null);
			return;
		}
		const update = () => {
			const trigger = rootRef.current;
			if (!trigger) return;
			const rect = trigger.getBoundingClientRect();
			const viewportH = window.innerHeight;
			const POPUP_MAX_H = 360; // batas nyaman; sisanya di-scroll di dalam
			const GAP = 4;
			// Sisakan sedikit napas dari tepi layar supaya tidak menempel/terpotong.
			const EDGE = 12;
			const spaceBelow = viewportH - rect.bottom - GAP - EDGE;
			const spaceAbove = rect.top - GAP - EDGE;
			// Buka ke atas hanya kalau atas benar-benar lebih lega. Yang bikin
			// dropdown "kepotong" sebelumnya bukan sisi pilihannya, melainkan
			// tingginya dipatok tetap (max-h-72) tanpa peduli sisa ruang.
			const placement: "below" | "above" =
				spaceBelow < Math.min(POPUP_MAX_H, 240) && spaceAbove > spaceBelow
					? "above"
					: "below";
			const room = placement === "below" ? spaceBelow : spaceAbove;
			setPopupRect({
				top:
					placement === "below"
						? rect.bottom + GAP
						: rect.top - GAP, // popup will translate up via CSS
				left: rect.left,
				width: rect.width,
				placement,
				// Minimal 180px: kalau ruangnya benar-benar sempit, biarkan sedikit
				// menonjol lalu di-scroll di dalam — jauh lebih baik daripada daftar
				// yang terpotong tanpa bisa digulir.
				maxHeight: Math.max(180, Math.min(POPUP_MAX_H, room)),
			});
		};
		update();
		// In a scroll container, fixed-popup tracking lags a frame and looks
		// glitchy — close on scroll instead so the dropdown never trails.
		// BUT: capture:true also catches scroll INSIDE the popup's own list —
		// scrolling the options must NOT close it. Ignore events originating
		// within the popup; only outer/page scroll closes.
		const onScroll = closeOnScroll
			? (e: Event) => {
					if (popupRef.current?.contains(e.target as Node)) return;
					closeAndReset();
				}
			: update;
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", update);
		return () => {
			window.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("resize", update);
		};
	}, [open, closeOnScroll, closeAndReset]);

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
				// Selector mode: read-only trigger so tapping opens the dropdown
				// without showing the keyboard (search lives inside the popup).
				readOnly={!allowFreeText}
				value={displayValue}
				onChange={handleInputChange}
				onFocus={handleFocus}
				onClick={!allowFreeText ? () => setOpen(true) : undefined}
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
				className={cn(
					"w-full rounded-xl border border-border-default bg-background pl-3.5 pr-16 text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
					!allowFreeText && "cursor-pointer",
					size === "sm" ? "h-9 text-[0.8125rem]" : "h-11 text-[1rem]",
				)}
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

			{open &&
				popupRect &&
				typeof document !== "undefined" &&
				createPortal(
					<div
						ref={popupRef}
						style={{
							position: "fixed",
							top: popupRect.top,
							left: popupRect.left,
							width: popupRect.width,
							maxHeight: popupRect.maxHeight,
							transform:
								popupRect.placement === "above" ? "translateY(-100%)" : undefined,
						}}
						className="z-50 flex flex-col overflow-hidden rounded-2xl border border-border-default bg-popover text-popover-foreground shadow-[var(--shadow-level-3)] animate-in fade-in-0 zoom-in-95 duration-100"
					>
						{/* Selector mode: search lives in the popup so the trigger can
						    open the list without popping the keyboard. Not autofocused. */}
						{!allowFreeText ? (
							<div className="shrink-0 border-b border-border-subtle p-2">
								<input
									type="text"
									value={search}
									onChange={(e) => {
										setSearch(e.target.value);
										setHighlightIdx(0);
									}}
									placeholder="Cari…"
									inputMode="search"
									autoComplete="off"
									aria-label="Cari item"
									className="h-10 w-full rounded-xl border border-border-default bg-background px-3 text-[1rem] text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
								/>
							</div>
						) : null}
						{filtered.length === 0 ? (
							<div className="px-3 py-6 text-center text-fluid-caption italic text-muted-foreground">
								{emptyMessage}
							</div>
						) : (
							<ul
								ref={listRef}
								id={`${inputId}-list`}
								role="listbox"
								className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
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
					</div>,
					document.body,
				)}
		</div>
	);
}
