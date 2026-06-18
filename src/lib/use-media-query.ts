"use client";

import { useEffect, useState } from "react";

/**
 * useMediaQuery — subscribe to a CSS media query from React.
 *
 * SSR-safe: returns `false` until mounted (no `window` on the server), then
 * syncs on the client. Use for the rare case where a component must branch on
 * viewport in JS rather than CSS (e.g. picking a Sheet `side` responsively).
 * Prefer Tailwind `md:` classes for pure styling — reach for this only when the
 * difference is structural.
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		const mql = window.matchMedia(query);
		setMatches(mql.matches);
		const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [query]);

	return matches;
}
