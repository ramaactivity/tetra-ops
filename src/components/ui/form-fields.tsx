import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Form-field primitives — thin wrappers around the canonical input chrome.
 *
 * These don't carry layout (no label, no error rendering, no tooltip) —
 * compose them inside `<FieldGrid.Row>` (`src/components/operations/_shared/
 * field-grid.tsx`) which owns label-LEFT layout + hint/error stack.
 *
 * Why thin: booking-form has 76+ raw `<input className={inputClass}>` calls
 * with subtle behavior drift (number coercion, tabular flag, Rp prefix).
 * These primitives lock the canonical shape so future code reaches for a
 * typed component instead of copy-pasting the inputClass string. Migration
 * is gradual — existing inline inputs keep working.
 *
 * Source of truth for the input chrome lives here in `INPUT_CLASS`. Other
 * primitives that need to match (Combobox trigger, NativeSelect trigger,
 * TimePicker trigger) already coordinate their height + radius + ring
 * tokens, so visual parity is maintained.
 */

// Font: 16px on mobile (`text-base`) to defeat iOS focus auto-zoom — MOBILE.md
// hard rule "input ≥ 16px on mobile". Desktop (`md+`) keeps the fluid body
// scale, matching the Combobox trigger. Fixed 40px height is unchanged, so
// no alignment drift with the coordinated Combobox/Select triggers.
export const INPUT_CLASS =
	"h-10 w-full rounded-md border border-border-default bg-background px-3 text-base md:text-fluid-body text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50";

// ────────────────────────────────────────────────────────────────────────────
// TextField — default text input

export type TextFieldProps = ComponentProps<"input">;

export function TextField({ className, type = "text", ...props }: TextFieldProps) {
	return <input type={type} className={cn(INPUT_CLASS, className)} {...props} />;
}

// ────────────────────────────────────────────────────────────────────────────
// NumberField — number input with tabular numerals

export type NumberFieldProps = Omit<ComponentProps<"input">, "type">;

export function NumberField({ className, ...props }: NumberFieldProps) {
	return (
		<input
			type="number"
			inputMode="numeric"
			className={cn(INPUT_CLASS, "tabular", className)}
			{...props}
		/>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// MoneyInput — IDR amount with "Rp " prefix + tabular numerals.
// Controlled via numeric value/onValueChange — callers don't deal with
// strings. Empty input → calls onValueChange(0).

interface MoneyInputProps
	extends Omit<ComponentProps<"input">, "type" | "value" | "onChange"> {
	value: number;
	onValueChange?: (value: number) => void;
	prefixLabel?: string; // defaults to "Rp"
}

export function MoneyInput({
	value,
	onValueChange,
	className,
	prefixLabel = "Rp",
	disabled,
	...props
}: MoneyInputProps) {
	return (
		<div className="relative">
			<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
				{prefixLabel}
			</span>
			<input
				type="number"
				inputMode="numeric"
				min={0}
				step={1}
				value={value === 0 ? "" : value}
				onChange={(e) => {
					const next = Math.max(0, Number(e.target.value) || 0);
					onValueChange?.(next);
				}}
				disabled={disabled}
				className={cn(INPUT_CLASS, "tabular pl-9", className)}
				{...props}
			/>
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// PhoneInput — Indonesian phone number. Defaults inputMode + autoComplete.

export type PhoneInputProps = Omit<ComponentProps<"input">, "type">;

export function PhoneInput({
	className,
	placeholder = "081234567890",
	...props
}: PhoneInputProps) {
	return (
		<input
			type="tel"
			inputMode="tel"
			autoComplete="tel"
			placeholder={placeholder}
			className={cn(INPUT_CLASS, "tabular", className)}
			{...props}
		/>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// TextareaField — textarea with non-resize default.

export type TextareaFieldProps = ComponentProps<"textarea">;

export function TextareaField({
	className,
	rows = 2,
	...props
}: TextareaFieldProps) {
	return (
		<textarea
			rows={rows}
			className={cn(INPUT_CLASS, "h-auto resize-none py-2", className)}
			{...props}
		/>
	);
}
