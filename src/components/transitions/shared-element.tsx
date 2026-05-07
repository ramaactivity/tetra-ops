"use client";

import type * as React from "react";

/**
 * <SharedElement /> — assigns a `view-transition-name` so the browser
 * morphs this element into another <SharedElement> with the same name on
 * the next page during navigation.
 *
 * Example: morph an event card on /operations into the hero on
 * /operations/[id]. Wrap both with <SharedElement name={`event-${id}`}>.
 *
 * Naming rule: prefix with the entity type, then the id. Avoids
 * collisions across modules.
 *
 * Implementation note: when React 19's `<ViewTransition>` component
 * stabilizes, this wrapper will internally switch to it. For now it
 * applies the CSS property directly via inline style. The browser's
 * View Transitions API picks it up automatically when navigations
 * trigger document.startViewTransition (Next.js does this when
 * experimental.viewTransition is enabled in next.config.ts).
 *
 * Reduced motion is respected globally via a CSS rule in globals.css.
 */

type Tag = "div" | "span" | "section" | "article" | "header" | "footer";

interface SharedElementProps extends React.ComponentProps<"div"> {
	name: string;
	as?: Tag;
}

export function SharedElement({
	name,
	as: Tag = "div",
	style,
	...props
}: SharedElementProps) {
	return (
		<Tag
			data-slot="shared-element"
			style={{ viewTransitionName: name, ...style }}
			{...props}
		/>
	);
}
