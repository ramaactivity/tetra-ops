"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptInvite } from "@/lib/actions/portal-auth";

/** Tombol masuk dari link undangan (sesi dibuat di sini, bukan saat link dibuka). */
export function AcceptInviteButton({
	token,
	label,
}: {
	token: string;
	label: string;
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	return (
		<div style={{ display: "grid", gap: 8 }}>
			<button
				type="button"
				className="btn btn-primary btn-block"
				disabled={busy}
				onClick={async () => {
					setBusy(true);
					setError(null);
					const r = await acceptInvite(token);
					if (!r.ok) {
						setBusy(false);
						return setError(r.error);
					}
					router.push(r.to);
					router.refresh();
				}}
			>
				{busy ? "Membuka…" : `${label} →`}
			</button>
			{error && (
				<p role="alert" className="cap" style={{ margin: 0, color: "#B4442F" }}>
					{error}
				</p>
			)}
		</div>
	);
}
