"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * <Combobox /> — branded autocomplete + free-text input.
 *
 * Differences vs <NativeSelect/>:
 * - User can type to filter the option list
 * - User can submit free text not in the list (when `allowFreeText`)
 * - Uses Base UI's Combobox primitive (portal'd dropdown, full a11y +
 *   keyboard nav)
 *
 * Layered API:
 *   <Combobox
 *     value={vendorName}
 *     onValueChange={setVendorName}
 *     options={[{ value: "PT A", label: "PT A", sublabel: "08123..." }]}
 *     placeholder="Pilih atau ketik..."
 *     allowFreeText
 *   />
 *
 * Form integration: parent should still render a hidden <input
 * name="..." value={state} /> for FormData submission. Combobox is
 * purely controlled.
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
	/** If true, user can submit free-text not in the option list. Default true. */
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

	// Derive the currently selected option object from the value string.
	// When the value matches an option, Combobox highlights it; otherwise
	// the input is just free text and no item is "selected".
	const selectedItem = options.find((o) => o.value === value);

	return (
		<ComboboxPrimitive.Root<ComboboxOption>
			items={options as ComboboxOption[]}
			inputValue={selectedItem?.label ?? value}
			onInputValueChange={(next) => {
				// allowFreeText: input value IS the committed value (e.g.
				// vendor name typed manually). Ignored for select-only
				// pickers (relasi) where value must be a UUID; for those
				// the input is just filter text and only onValueChange
				// (item pick) commits.
				if (allowFreeText) {
					onValueChange(next ?? "");
				}
			}}
			value={selectedItem ?? null}
			onValueChange={(next) => {
				// User explicitly picked an item from the list → commit its
				// value (e.g. UUID for relasi picker). Null here means user
				// cleared selection OR pressed Enter on free text → don't
				// blow away the input; onInputValueChange already kept it.
				if (next && typeof next === "object" && "value" in next) {
					onValueChange((next as ComboboxOption).value);
				}
			}}
		>
			<div className={cn("relative", className)}>
				<ComboboxPrimitive.Input
					id={inputId}
					placeholder={placeholder}
					disabled={disabled}
					aria-label={ariaProps["aria-label"]}
					aria-invalid={ariaProps["aria-invalid"]}
					className="h-10 w-full rounded-md border border-border-default bg-background pl-3 pr-16 text-fluid-body text-foreground placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
				/>
				<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1.5">
					{value ? (
						<ComboboxPrimitive.Clear
							className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							aria-label="Clear"
						>
							<X className="size-3.5" />
						</ComboboxPrimitive.Clear>
					) : null}
					<ComboboxPrimitive.Trigger
						className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
						aria-label="Toggle options"
					>
						<ChevronsUpDown className="size-3.5" />
					</ComboboxPrimitive.Trigger>
				</div>
			</div>

			<ComboboxPrimitive.Portal>
				<ComboboxPrimitive.Positioner
					sideOffset={4}
					className="isolate z-50"
				>
					<ComboboxPrimitive.Popup
						className="relative z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-hidden rounded-lg border border-border-default bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
					>
						<ComboboxPrimitive.Empty className="px-3 py-6 text-center text-fluid-caption italic text-muted-foreground">
							{emptyMessage}
						</ComboboxPrimitive.Empty>
						<ComboboxPrimitive.List className="max-h-72 overflow-y-auto p-1">
							{(item) => {
								const opt = item as ComboboxOption;
								return (
									<ComboboxPrimitive.Item
										key={opt.value}
										value={opt}
										disabled={opt.disabled}
										className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-fluid-body text-foreground outline-none transition-colors data-[highlighted]:bg-muted data-[selected]:bg-primary/10 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[selected]:font-medium"
									>
										<ComboboxPrimitive.ItemIndicator
											className="grid size-4 shrink-0 place-items-center text-primary"
											render={<Check className="size-3.5" />}
										/>
										<span className="grid size-4 shrink-0 place-items-center data-[selected]:hidden" />
										<div className="min-w-0 flex-1 space-y-0.5">
											<div className="truncate">{opt.label}</div>
											{opt.sublabel ? (
												<div className="truncate text-[11px] text-muted-foreground">
													{opt.sublabel}
												</div>
											) : null}
										</div>
									</ComboboxPrimitive.Item>
								);
							}}
						</ComboboxPrimitive.List>
					</ComboboxPrimitive.Popup>
				</ComboboxPrimitive.Positioner>
			</ComboboxPrimitive.Portal>
		</ComboboxPrimitive.Root>
	);
}
