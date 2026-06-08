"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * <MonthMemory /> — remembers the operations month filter across in-app
 * navigation, but resets on a hard reload.
 *
 * Behaviour the user asked for:
 *  - Pick a month (e.g. Agustus) → go into a project / another menu → come
 *    back to the Event list: the month stays at Agustus (not snapped back to
 *    bulan berjalan).
 *  - Refresh the page: month resets to bulan berjalan (current month).
 *
 * How: a module-level value survives client-side navigation but is wiped when
 * the document fully reloads. On the *first* effect run per document we use the
 * Navigation Timing type to tell a refresh apart from a fresh entry; on every
 * later (soft) run we either remember an explicit month or restore the last
 * remembered one when the URL arrives without a `month`.
 *
 * Renders nothing.
 */

// Persists across client-side navigations; re-initialised on full page load.
let rememberedMonth: string | null = null;
let documentBooted = false;

function navigationType(): string | undefined {
	if (typeof performance === "undefined") return undefined;
	const [nav] = performance.getEntriesByType("navigation");
	return (nav as PerformanceNavigationTiming | undefined)?.type;
}

export function MonthMemory() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	useEffect(() => {
		const monthParam = searchParams.get("month");
		const isFirstRun = !documentBooted;
		documentBooted = true;

		function replaceWithParams(mutate: (p: URLSearchParams) => void) {
			const params = new URLSearchParams(searchParams.toString());
			mutate(params);
			const qs = params.toString();
			router.replace(qs ? `${pathname}?${qs}` : pathname);
		}

		if (isFirstRun) {
			// Hard reload → reset to bulan berjalan by dropping any month param.
			// (A fresh entry / deep link keeps whatever month is in the URL.)
			if (navigationType() === "reload") {
				rememberedMonth = null;
				if (monthParam) replaceWithParams((p) => p.delete("month"));
				return;
			}
			if (monthParam) rememberedMonth = monthParam;
			return;
		}

		// Soft navigation within the app.
		if (monthParam) {
			rememberedMonth = monthParam;
		} else if (rememberedMonth) {
			const restore = rememberedMonth;
			replaceWithParams((p) => p.set("month", restore));
		}
	}, [searchParams, pathname, router]);

	return null;
}
