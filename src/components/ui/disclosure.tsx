"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <Disclosure /> — animated collapsible wrapper. Replaces native
 * <details>/<summary> for consistent styling and transition.
 *
 * Usage:
 *   <Disclosure>
 *     <DisclosureTrigger>Detail tambahan</DisclosureTrigger>
 *     <DisclosurePanel>
 *       <p>Isi yang bisa di-toggle</p>
 *     </DisclosurePanel>
 *   </Disclosure>
 */

function Disclosure({
	className,
	...props
}: CollapsiblePrimitive.Root.Props) {
	return (
		<CollapsiblePrimitive.Root
			data-slot="disclosure"
			className={cn("group/disclosure", className)}
			{...props}
		/>
	);
}

function DisclosureTrigger({
	className,
	children,
	...props
}: CollapsiblePrimitive.Trigger.Props) {
	return (
		<CollapsiblePrimitive.Trigger
			data-slot="disclosure-trigger"
			className={cn(
				"flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors",
				"hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				className,
			)}
			{...props}
		>
			<span className="flex-1">{children}</span>
			<ChevronDownIcon
				className="size-4 shrink-0 transition-transform duration-fast ease-out-expo group-data-[panel-open]/disclosure:rotate-180"
				aria-hidden
			/>
		</CollapsiblePrimitive.Trigger>
	);
}

function DisclosurePanel({
	className,
	children,
	...props
}: CollapsiblePrimitive.Panel.Props) {
	return (
		<CollapsiblePrimitive.Panel
			data-slot="disclosure-panel"
			className={cn(
				"overflow-hidden",
				"data-[panel-open]:animate-in data-[panel-open]:fade-in-0",
				"data-[panel-closed]:animate-out data-[panel-closed]:fade-out-0",
				"duration-base ease-out-expo",
				className,
			)}
			{...props}
		>
			<div className="px-3 pt-2 pb-3 text-sm text-muted-foreground">
				{children}
			</div>
		</CollapsiblePrimitive.Panel>
	);
}

export { Disclosure, DisclosureTrigger, DisclosurePanel };
