import { redirect } from "next/navigation";

// Backwards-compat: original /register has been replaced by /crew-portal
// which presents Login + Register tabs together. Forward any inbound
// /register links to the register tab.
export default function RegisterRedirectPage() {
	redirect("/crew-portal?mode=register");
}
