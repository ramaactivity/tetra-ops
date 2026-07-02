"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Privacy-mode eye toggle — hides every money/number surface app-wide.
 * Flips the `data-privacy` attribute on <html>; globals.css blurs
 * `.tabular` / `.type-num*` under it (money is always one of those per
 * DESIGN.md §3). Persists in the `privacy` cookie so SSR paints the masked
 * state with no flash of visible numbers (read in the root layout).
 */
export function PrivacyToggle({
	initialOn,
	className,
}: {
	initialOn: boolean;
	className?: string;
}) {
	const [on, setOn] = useState(initialOn);
	const Icon = on ? EyeOff : Eye;
	const label = on ? "Tampilkan nominal" : "Sembunyikan nominal";

	function toggle() {
		const next = !on;
		setOn(next);
		document.documentElement.toggleAttribute("data-privacy", next);
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is not available on older iOS Safari (this app runs as an iOS PWA)
		document.cookie = next
			? "privacy=1; path=/; max-age=31536000; samesite=lax"
			: "privacy=; path=/; max-age=0; samesite=lax";
	}

	return (
		<button
			type="button"
			onClick={toggle}
			aria-pressed={on}
			aria-label={label}
			title={label}
			className={cn(
				"inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
				className,
			)}
		>
			<Icon className="h-4 w-4" />
		</button>
	);
}
