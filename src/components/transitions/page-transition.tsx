"use client";

import type * as React from "react";

/**
 * <PageTransition /> — page-level wrapper that opts a route into
 * View Transitions. Pair with <Link transitionTypes={["nav-forward"]}>
 * (or `nav-back`) to trigger directional slide animations defined in
 * globals.css.
 *
 * Default behavior (no transitionTypes on the Link): a soft crossfade
 * via the global ::view-transition CSS rules.
 *
 * Implementation: assigns `view-transition-name: page-content` so the
 * browser snapshots and morphs THIS element specifically. Multiple
 * <PageTransition> wrappers on the same page would conflict — wrap
 * once at the route segment root.
 *
 * NOTE: Anchored elements like the topbar / sidebar / bottom nav should
 * have their own `viewTransitionName` (site-header / site-bottom-nav /
 * site-sidebar) so they DON'T animate. globals.css has the rules.
 */

interface PageTransitionProps extends React.ComponentProps<"div"> {
	/** Override the view-transition-name. Default = "page-content". */
	name?: string;
}

export function PageTransition({
	name = "page-content",
	style,
	...props
}: PageTransitionProps) {
	return (
		<div
			data-slot="page-transition"
			style={{ viewTransitionName: name, ...style }}
			{...props}
		/>
	);
}
