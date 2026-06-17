"use client";

import { CheckCheck, Loader2, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import {
	dismissNotification,
	markAllNotificationsRead,
	markNotificationRead,
} from "@/lib/actions/notifications";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
	const [pending, startTransition] = useTransition();
	const handle = () => {
		startTransition(async () => {
			const r = await markAllNotificationsRead();
			if (r.error) toast.error(r.error);
		});
	};
	return (
		<button
			type="button"
			onClick={handle}
			disabled={pending || disabled}
			className="border-border-default bg-card text-foreground hover:bg-secondary disabled:opacity-50 inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium"
		>
			{pending ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			) : (
				<CheckCheck className="h-3.5 w-3.5" />
			)}
			Mark all read
		</button>
	);
}

export function MarkReadButton({ id }: { id: string }) {
	const [pending, startTransition] = useTransition();
	const handle = () => {
		startTransition(async () => {
			const r = await markNotificationRead(id);
			if (r.error) toast.error(r.error);
		});
	};
	return (
		<button
			type="button"
			onClick={handle}
			disabled={pending}
			title="Mark as read"
			className="text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 inline-flex h-7 w-7 items-center justify-center rounded-md"
		>
			{pending ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			) : (
				<CheckCheck className="h-3.5 w-3.5" />
			)}
		</button>
	);
}

export function DismissButton({ id }: { id: string }) {
	const [pending, startTransition] = useTransition();
	const handle = () => {
		startTransition(async () => {
			const r = await dismissNotification(id);
			if (r.error) toast.error(r.error);
		});
	};
	return (
		<button
			type="button"
			onClick={handle}
			disabled={pending}
			title="Dismiss"
			className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-muted disabled:opacity-50 inline-flex h-7 w-7 items-center justify-center rounded-md"
		>
			{pending ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			) : (
				<X className="h-3.5 w-3.5" />
			)}
		</button>
	);
}
