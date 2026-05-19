"use client";

import { ChevronDown, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type PdfMenuOption = {
	label: string;
	href: string;
	hint?: string;
};

export function PdfDownloadMenu({
	options,
	label = "PDF",
}: {
	options: PdfMenuOption[];
	label?: string;
}) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("mousedown", onClick);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("mousedown", onClick);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div ref={containerRef} className="relative inline-block">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
				className="border-border-default bg-surface-2 hover:bg-muted text-foreground inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium"
			>
				<FileText className="h-3.5 w-3.5" />
				{label}
				<ChevronDown className="h-3 w-3 opacity-60" />
			</button>
			{open && (
				<div
					className="border-border-default bg-surface-2 absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-md border shadow-[var(--shadow-level-3)]"
					role="menu"
				>
					{options.map((o) => (
						<a
							key={o.href}
							href={o.href}
							target="_blank"
							rel="noopener noreferrer"
							role="menuitem"
							onClick={() => setOpen(false)}
							className="hover:bg-muted flex flex-col gap-0.5 px-3 py-2 transition-colors"
						>
							<span className="text-foreground text-sm font-medium">
								{o.label}
							</span>
							{o.hint && (
								<span className="text-muted-foreground text-[11px]">
									{o.hint}
								</span>
							)}
						</a>
					))}
				</div>
			)}
		</div>
	);
}
