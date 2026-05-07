"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sheet — slide-in panel from any edge. Mobile bottom sheet by default.
 * Use for forms, filter panels, secondary navigation on mobile.
 *
 * Implementation: Base UI Dialog primitive with edge-positioned popup.
 * (Base UI ships a Drawer with swipe gestures; this Sheet is the simpler
 *  variant suitable for forms and menus. Reach for Drawer in F4 if we
 *  ever need swipe-to-dismiss with snap points.)
 */

const sideClasses: Record<SheetSide, string> = {
	bottom:
		"bottom-0 left-0 right-0 max-h-[90vh] rounded-t-2xl border-t data-[state=open]:translate-y-0 data-[state=closed]:translate-y-full",
	top: "top-0 left-0 right-0 max-h-[90vh] rounded-b-2xl border-b data-[state=open]:translate-y-0 data-[state=closed]:-translate-y-full",
	left: "top-0 bottom-0 left-0 max-w-sm w-full rounded-r-2xl border-r data-[state=open]:translate-x-0 data-[state=closed]:-translate-x-full",
	right:
		"top-0 bottom-0 right-0 max-w-sm w-full rounded-l-2xl border-l data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full",
};

type SheetSide = "top" | "bottom" | "left" | "right";

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-sm",
				"data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
				"duration-base ease-out-expo",
				className,
			)}
			{...props}
		/>
	);
}

interface SheetContentProps extends DialogPrimitive.Popup.Props {
	side?: SheetSide;
	showCloseButton?: boolean;
}

function SheetContent({
	className,
	children,
	side = "bottom",
	showCloseButton = true,
	...props
}: SheetContentProps) {
	const isVertical = side === "top" || side === "bottom";
	return (
		<DialogPrimitive.Portal>
			<SheetOverlay />
			<DialogPrimitive.Popup
				data-slot="sheet-content"
				data-side={side}
				data-state-vertical={isVertical}
				className={cn(
					"fixed z-50 flex flex-col bg-surface-3 border-border-default shadow-xl outline-none",
					"transition-transform duration-base ease-out-expo",
					sideClasses[side],
					"pb-safe-or-4",
					className,
				)}
				{...props}
			>
				{side === "bottom" ? (
					<div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
				) : null}
				<div className="flex-1 overflow-y-auto p-4">{children}</div>
				{showCloseButton ? (
					<DialogPrimitive.Close
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								className="absolute top-2 right-2"
							/>
						}
					>
						<XIcon />
						<span className="sr-only">Close</span>
					</DialogPrimitive.Close>
				) : null}
			</DialogPrimitive.Popup>
		</DialogPrimitive.Portal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1 pb-3", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn(
				"mt-auto flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end",
				className,
			)}
			{...props}
		/>
	);
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return (
		<DialogPrimitive.Title
			data-slot="sheet-title"
			className={cn("font-heading text-base font-medium", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: DialogPrimitive.Description.Props) {
	return (
		<DialogPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetTrigger,
	SheetClose,
	SheetOverlay,
	SheetContent,
	SheetHeader,
	SheetFooter,
	SheetTitle,
	SheetDescription,
};
