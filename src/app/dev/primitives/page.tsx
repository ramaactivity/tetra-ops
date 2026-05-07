import { notFound } from "next/navigation";
import { PrimitivesShowcase } from "./showcase";

/**
 * Dev-only showcase for the custom primitive library.
 *
 * Routes here:
 *   /dev/primitives
 *
 * Production: returns 404. Local + Vercel preview: renders every primitive
 * in light + dark variants so you can visually verify changes.
 */
export default function DevPrimitivesPage() {
	if (process.env.NODE_ENV === "production") notFound();
	return <PrimitivesShowcase />;
}

export const dynamic = "force-static";
