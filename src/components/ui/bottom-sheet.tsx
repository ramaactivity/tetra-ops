"use client";

import { Drawer } from "@base-ui/react/drawer";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * BottomSheet — native gesture sheet (swipe-to-dismiss + snap points) built on
 * the Base UI Drawer primitive. This is the modal pattern that reads as native
 * on mobile: it rises with a spring, you can drag it down to dismiss, and it
 * can rest at partial heights via `snapPoints`.
 *
 * Use for action menus, pickers, and detail peeks. For long blocking forms the
 * Dialog-based <Sheet> is still fine.
 */
export function BottomSheet({
	open,
	onOpenChange,
	children,
	title,
	description,
	snapPoints,
	className,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
	title?: React.ReactNode;
	description?: React.ReactNode;
	/** Fractions (0-1), px, or rem strings. Omit for a single full-content rest. */
	snapPoints?: (number | string)[];
	className?: string;
}) {
	return (
		<Drawer.Root
			open={open}
			onOpenChange={onOpenChange}
			swipeDirection="down"
			snapPoints={snapPoints}
		>
			<Drawer.Portal>
				<Drawer.Backdrop className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] transition-opacity duration-base ease-out-expo data-closed:opacity-0 data-open:opacity-100" />
				<Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
					<Drawer.Popup
						className={cn(
							"flex max-h-[92svh] w-full max-w-[30rem] flex-col rounded-t-[1.75rem] border-t border-border-default bg-card shadow-[var(--shadow-level-5)] outline-none",
							"transition-transform duration-spring ease-spring-soft data-closed:translate-y-full",
							"pb-[max(1rem,env(safe-area-inset-bottom))]",
							className,
						)}
					>
						{/* Grab handle */}
						<div className="flex shrink-0 justify-center pt-2.5 pb-1">
							<span className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
						</div>
						{(title || description) && (
							<div className="app-gutter shrink-0 pt-1 pb-2 text-center">
								{title ? (
									<Drawer.Title className="type-heading">{title}</Drawer.Title>
								) : null}
								{description ? (
									<Drawer.Description className="type-secondary mt-1">
										{description}
									</Drawer.Description>
								) : null}
							</div>
						)}
						<Drawer.Content className="scrollbar-vercel min-h-0 flex-1 overflow-y-auto overscroll-contain app-gutter pb-2">
							{children}
						</Drawer.Content>
					</Drawer.Popup>
				</Drawer.Viewport>
			</Drawer.Portal>
		</Drawer.Root>
	);
}

export { Drawer as BottomSheetPrimitive };
