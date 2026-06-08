import { redirect } from "next/navigation";

/**
 * The design workflow board moved into the unified "Asset & Design" page
 * (/design). Keep this route as a permanent redirect for old links/bookmarks.
 */
export default function OperationsDesignRedirect() {
	redirect("/design");
}
