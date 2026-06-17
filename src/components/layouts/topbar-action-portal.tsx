"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * <TopbarActionPortal /> — teleports a page's primary action(s) into the topbar
 * action slot (`#topbar-actions`), so page-level CTAs live in one consistent
 * place (top-right) instead of leaving an empty action row in the page body.
 * No-ops until the slot exists on the client (after hydration).
 */
export function TopbarActionPortal({ children }: { children: React.ReactNode }) {
	const [host, setHost] = useState<HTMLElement | null>(null);
	useEffect(() => {
		setHost(document.getElementById("topbar-actions"));
	}, []);
	if (!host) return null;
	return createPortal(children, host);
}
