"use client";

import type React from "react";

/**
 * Shared form primitives untuk inventory + fixed-asset item forms.
 * Disimpan terpisah supaya tidak ada duplikasi dan styling konsisten.
 */

export const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none read-only:opacity-70";

export function Field({
	label,
	name,
	hint,
	error,
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
	error?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-sm font-medium">
				{label}
				{required && <span className="text-primary ml-0.5">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-destructive text-xs">{error}</p>
			) : hint ? (
				<p className="text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}

export function SectionHeader({
	title,
	subtitle,
}: {
	title: string;
	subtitle?: string;
}) {
	return (
		<div className="space-y-0.5">
			<h3 className="text-sm font-semibold text-foreground">{title}</h3>
			{subtitle && (
				<p className="text-xs text-muted-foreground">{subtitle}</p>
			)}
		</div>
	);
}
