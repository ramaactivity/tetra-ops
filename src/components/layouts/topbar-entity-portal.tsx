"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * <TopbarEntityPortal /> — teleports the current entity name (e.g. the client
 * name on an event detail page) into the topbar, next to the back pill, as a
 * breadcrumb tail: "‹ Operations · Luthfi & Rosya". Lets a deep page show WHERE
 * you are without an in-page title. Desktop-only (the slot is sm:flex) so the
 * slim mobile topbar stays uncluttered. No-ops until the slot exists.
 */
export function TopbarEntityPortal({ name }: { name: string }) {
	const [host, setHost] = useState<HTMLElement | null>(null);
	useEffect(() => {
		setHost(document.getElementById("topbar-entity"));
	}, []);
	if (!host) return null;
	return createPortal(
		<>
			<span className="text-muted-foreground/40" aria-hidden>
				·
			</span>
			<span className="truncate text-[14px] font-medium text-foreground">
				{name}
			</span>
		</>,
		host,
	);
}
