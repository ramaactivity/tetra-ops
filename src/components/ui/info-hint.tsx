"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * InfoHint — a tap/click "ℹ️ Apa ini?" explainer for non-accountant owners.
 * Plain-language help for technical finance terms. Tap-friendly (mobile) with a
 * full-screen backdrop to dismiss; no hover dependency.
 */
export function InfoHint({
	title,
	children,
	className,
}: {
	title?: string;
	children: ReactNode;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<span className={cn("relative inline-flex align-middle", className)}>
			<button
				type="button"
				aria-label="Apa ini?"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground"
			>
				<Info className="size-3.5" />
			</button>
			{open ? (
				<>
					<button
						type="button"
						aria-hidden="true"
						tabIndex={-1}
						className="fixed inset-0 z-40 cursor-default"
						onClick={() => setOpen(false)}
					/>
					<span
						role="tooltip"
						className="absolute top-full left-1/2 z-50 mt-1.5 w-60 max-w-[70vw] -translate-x-1/2 rounded-xl border border-border-subtle bg-popover p-3 text-left text-xs leading-relaxed shadow-lg"
					>
						{title ? (
							<span className="mb-1 block font-semibold text-foreground">
								{title}
							</span>
						) : null}
						<span className="block text-muted-foreground">{children}</span>
					</span>
				</>
			) : null}
		</span>
	);
}
