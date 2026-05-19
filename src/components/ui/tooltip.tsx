"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tooltip — short hover/focus hints. Use sparingly; mobile users won't
 * see them. For info that's important on mobile, use inline text or a
 * <Sheet> instead.
 *
 * Wrap your app once with <TooltipProvider> in the root layout to share
 * the open-delay timing across all tooltips.
 */

function TooltipProvider({
	delay = 250,
	closeDelay = 0,
	...props
}: TooltipPrimitive.Provider.Props) {
	return (
		<TooltipPrimitive.Provider
			delay={delay}
			closeDelay={closeDelay}
			{...props}
		/>
	);
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
	return <TooltipPrimitive.Root {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	sideOffset = 6,
	children,
	...props
}: TooltipPrimitive.Popup.Props & { sideOffset?: number }) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner sideOffset={sideOffset}>
				<TooltipPrimitive.Popup
					data-slot="tooltip-content"
					className={cn(
						"z-50 max-w-xs rounded-md bg-surface-4 px-2.5 py-1.5 text-xs text-foreground shadow-[var(--shadow-level-2)] ring-1 ring-border-strong/40",
						"data-[instant]:duration-0",
						"data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
						"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
						"duration-fast ease-out-expo",
						className,
					)}
					{...props}
				>
					{children}
					<TooltipPrimitive.Arrow className="text-surface-4" />
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
