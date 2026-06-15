"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteCrewInvitation } from "@/lib/actions/crew-invitations";

export function InvitationDeleteButton({
	id,
	email,
}: {
	id: string;
	email: string;
}) {
	const [pending, startTransition] = useTransition();
	const confirm = useConfirm();

	const handleClick = async () => {
		const ok = await confirm({
			title: `Cabut invitation untuk ${email}?`,
			description: "Setelah ini dia nggak bisa auto-promote saat login.",
			confirmLabel: "Cabut",
			variant: "destructive",
		});
		if (!ok) return;
		startTransition(async () => {
			const r = await deleteCrewInvitation(id);
			if (r.error) toast.error(r.error);
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
