"use client";

import { useRouter } from "next/navigation";
import { logoutPortal } from "@/lib/actions/portal-auth";
import { VerifyPhone } from "./verify-phone";

export function PortalLogin() {
	const router = useRouter();
	return (
		<VerifyPhone
			askName={false}
			cta="Masuk lewat WhatsApp"
			onDone={() => router.refresh()}
		/>
	);
}

export function LogoutButton() {
	const router = useRouter();
	return (
		<button
			type="button"
			className="link cap"
			onClick={async () => {
				await logoutPortal();
				router.refresh();
			}}
		>
			Keluar
		</button>
	);
}
