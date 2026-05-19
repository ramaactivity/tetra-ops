"use client";

import {
	Loader2,
	MoreHorizontal,
	Pencil,
	Power,
	UserCheck,
	X,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
	type ProfileEditFormState,
	setCrewActive,
	updateCrewProfile,
} from "@/lib/actions/crew";

type Role = "super_admin" | "owner" | "crew" | "pending_approval";

export type EditCrewDrawerProps = {
	user: {
		id: string;
		full_name: string;
		nickname: string | null;
		phone_wa: string | null;
		role: Role;
		default_fee_override: number | null;
		notes: string | null;
		is_active: boolean;
	};
	disabled?: boolean;
};

export function EditCrewDrawer({ user, disabled }: EditCrewDrawerProps) {
	const [open, setOpen] = useState(false);
	const [state, formAction, pending] = useActionState<
		ProfileEditFormState,
		FormData
	>(updateCrewProfile, undefined);
	const [activeBusy, startActiveTransition] = useTransition();
	const formRef = useRef<HTMLFormElement>(null);

	useEffect(() => {
		if (state?.ok) {
			setOpen(false);
		}
	}, [state?.ok]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	const toggleActive = () => {
		if (
			!confirm(
				user.is_active
					? `Nonaktifin ${user.full_name}? Mereka gak bisa login sampai diaktifin lagi.`
					: `Aktifin ulang ${user.full_name}?`,
			)
		)
			return;
		startActiveTransition(async () => {
			const r = await setCrewActive(user.id, !user.is_active);
			if (r.error) alert(r.error);
		});
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={disabled}
				className="border-border-default bg-surface-2 text-foreground hover:bg-muted disabled:opacity-50 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium"
			>
				<MoreHorizontal className="h-3.5 w-3.5" />
				Manage
			</button>

			{open && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center px-4"
					role="dialog"
					aria-modal="true"
				>
					{/* Backdrop */}
					<button
						type="button"
						aria-label="Close"
						onClick={() => setOpen(false)}
						className="absolute inset-0 bg-black/40 backdrop-blur-sm"
					/>

					{/* Drawer body */}
					<div className="bg-surface-2 border-border-default relative z-10 w-full max-w-lg overflow-hidden rounded-lg border shadow-[var(--shadow-level-5)]">
						<div className="border-border-default flex items-start justify-between gap-3 border-b px-6 py-4">
							<div className="space-y-0.5">
								<h2 className="text-foreground text-base font-semibold">
									Edit crew
								</h2>
								<p className="text-muted-foreground text-xs">
									{user.full_name}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						<form
							ref={formRef}
							action={formAction}
							className="space-y-4 px-6 py-5"
						>
							<input type="hidden" name="id" value={user.id} />

							<div className="grid gap-3 sm:grid-cols-2">
								<Field label="Full name" required>
									<input
										name="full_name"
										type="text"
										required
										defaultValue={user.full_name}
										maxLength={120}
										className="border-border-default bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
									/>
								</Field>
								<Field label="Nickname">
									<input
										name="nickname"
										type="text"
										defaultValue={user.nickname ?? ""}
										maxLength={60}
										className="border-border-default bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
									/>
								</Field>
								<Field label="WhatsApp / Phone">
									<input
										name="phone_wa"
										type="tel"
										defaultValue={user.phone_wa ?? ""}
										maxLength={40}
										placeholder="+628..."
										className="border-border-default bg-background focus-visible:ring-ring tabular h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
									/>
								</Field>
								<Field
									label="Default fee override"
									hint="Kosong = pakai tier rate"
								>
									<input
										name="default_fee_override"
										type="number"
										min="0"
										step="50000"
										defaultValue={user.default_fee_override ?? ""}
										className="border-border-default bg-background focus-visible:ring-ring tabular h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
									/>
								</Field>
							</div>

							<Field label="Notes (internal)">
								<textarea
									name="notes"
									rows={2}
									defaultValue={user.notes ?? ""}
									maxLength={500}
									placeholder="Catatan internal — area standby, kemampuan, dll."
									className="border-border-default bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
								/>
							</Field>

							{state?.error && (
								<div className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2">
									<p className="text-destructive text-xs font-medium">
										{state.error}
									</p>
								</div>
							)}

							<div className="border-border-default flex items-center justify-between gap-3 border-t pt-4">
								<button
									type="button"
									onClick={toggleActive}
									disabled={activeBusy}
									className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium disabled:opacity-50 ${
										user.is_active
											? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
											: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
									}`}
								>
									{activeBusy ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : user.is_active ? (
										<Power className="h-3.5 w-3.5" />
									) : (
										<UserCheck className="h-3.5 w-3.5" />
									)}
									{user.is_active ? "Nonaktifin" : "Aktifin ulang"}
								</button>

								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setOpen(false)}
										disabled={pending}
										className="text-muted-foreground hover:text-foreground h-9 px-3 text-xs font-medium disabled:opacity-50"
									>
										Cancel
									</button>
									<button
										type="submit"
										disabled={pending}
										className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-xs font-semibold disabled:opacity-60"
									>
										{pending ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											<Pencil className="h-3.5 w-3.5" />
										)}
										Save changes
									</button>
								</div>
							</div>
						</form>
					</div>
				</div>
			)}
		</>
	);
}

function Field({
	label,
	required,
	hint,
	children,
}: {
	label: string;
	required?: boolean;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<label className="block space-y-1">
			<span className="text-foreground block text-xs font-medium">
				{label}
				{required && <span className="text-destructive ml-0.5">*</span>}
			</span>
			{children}
			{hint && (
				<span className="text-muted-foreground block text-[10px]">
					{hint}
				</span>
			)}
		</label>
	);
}
