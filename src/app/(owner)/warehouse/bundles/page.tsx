import { redirect } from "next/navigation";

export default function BundlesRedirect() {
	redirect("/warehouse?tab=bundles");
}
