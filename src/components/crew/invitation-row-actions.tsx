"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteCrewInvitation } from "@/lib/actions/crew-invitations";

export function InvitationDeleteButton({
	id,
	email,
}: {
	id: string;
	email: string;
}) {
	const [pending, startTransition] = useTransition();

	const handleClick = () => {
		if (
			!confirm(
				`Cabut invitation untuk ${email}? Setelah ini dia nggak bisa auto-promote saat login.`,
			)
		)
			return;
		startTransition(async () => {
			const r = await deleteCrewInvitation(id);
			if (r.error) alert(r.error);
		});
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={pending}
			title="Cabut invitation"
			className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 inline-flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-50"
		>
			{pending ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			) : (
				<Trash2 className="h-3.5 w-3.5" />
			)}
		</button>
	);
}
