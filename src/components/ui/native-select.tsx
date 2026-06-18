"use client";

import type * as React from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

/**
 * <NativeSelect /> — drop-in replacement for raw <select> elements.
 *
 * Wraps the full Base UI Select primitive into an option-array API so
 * migrations from `<select><option>...</option></select>` are line-for-line
 * minimal. For richer needs (groups, dividers, custom item rendering),
 * use the underlying <Select>...<SelectItem> directly.
 *
 * Usage:
 *   <NativeSelect
 *     value={status}
 *     onValueChange={setStatus}
 *     placeholder="Pilih status"
 *     options={[
 *       { value: "draft", label: "Draft" },
 *       { value: "confirmed", label: "Confirmed" },
 *       { value: "settled", label: "Settled", disabled: true },
 *     ]}
 *   />
 *
 * Form integration (react-hook-form):
 *   <Controller
 *     control={form.control}
 *     name="status"
 *     render={({ field }) => (
 *       <NativeSelect
 *         value={field.value}
 *         onValueChange={field.onChange}
 *         options={statusOptions}
 *       />
 *     )}
 *   />
 */

export interface NativeSelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface NativeSelectProps {
	options: ReadonlyArray<NativeSelectOption>;
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	required?: boolean;
	name?: string;
	id?: string;
	className?: string;
	triggerClassName?: string;
	"aria-label"?: string;
	"aria-invalid"?: boolean;
	size?: "sm" | "default";
}

export function NativeSelect({
	options,
	value,
	defaultValue,
	onValueChange,
	placeholder = "Pilih…",
	disabled,
	required,
	name,
	id,
	className,
	triggerClassName,
	size = "default",
	...ariaProps
}: NativeSelectProps) {
	return (
		<Select
			// Base UI treats `null` as "no selection". Passing an empty string makes
			// it hunt for an item with value="" and, finding none, it can re-emit the
			// previously-selected value — so coerce "" → null for a clean cleared state.
			value={value === "" ? null : value}
			defaultValue={defaultValue}
			onValueChange={
				onValueChange
					? (next) => {
							// Base UI emits string | null on clear; coerce null → "" for
							// react-hook-form compatibility (most form fields expect string).
							onValueChange(next ?? "");
						}
					: undefined
			}
			disabled={disabled}
			required={required}
			name={name}
		>
			<SelectTrigger
				id={id}
				className={triggerClassName ?? className}
				size={size}
				{...ariaProps}
			>
				<SelectValue placeholder={placeholder}>
					{(v) => {
						const matched = options.find((opt) => opt.value === v);
						return matched?.label ?? placeholder ?? "";
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem
						key={option.value}
						value={option.value}
						disabled={option.disabled}
					>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
