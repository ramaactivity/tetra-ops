"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import {
	createCrewInvitation,
	type InvitationFormState,
} from "@/lib/actions/crew-invitations";

export function InviteCrewForm() {
	const [state, formAction, pending] = useActionState<
		InvitationFormState,
		FormData
	>(createCrewInvitation, undefined);
	const [open, setOpen] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	useEffect(() => {
		if (state?.ok && formRef.current) {
			formRef.current.reset();
			setOpen(false);
		}
	}, [state?.ok]);

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
			>
				<UserPlus className="h-4 w-4" />
				Invite crew
			</button>
		);
	}

	return (
		<form
			ref={formRef}
			action={formAction}
			className="border-border-default bg-surface-2 grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
		>
			<div className="space-y-1 sm:col-span-2">
				<h3 className="text-base font-semibold">Invite crew baru</h3>
				<p className="text-muted-foreground text-xs">
					Saat dia login pakai Gmail di bawah ini, otomatis di-promote ke crew
					+ tier yang lo set — skip approval review.
				</p>
			</div>

			<Field label="Email (Gmail)" required>
				<input
					name="email"
					type="email"
					required
					placeholder="contoh@gmail.com"
					className="border-border-default bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			<Field label="Full name" required>
				<input
					name="full_name"
					type="text"
					required
					placeholder="Aminah Salsabila"
					className="border-border-default bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			<Field label="Nickname (opsional)">
				<input
					name="nickname"
					type="text"
					placeholder="Aminah"
					className="border-border-default bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			<Field label="Phone / WA (opsional)">
				<input
					name="phone_wa"
					type="tel"
					placeholder="+628..."
					className="border-border-default bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			<Field label="Tier" required>
				<TierSelect />
			</Field>

			<Field label="Default fee override (opsional)">
				<input
					name="default_fee_override"
					type="number"
					min="0"
					step="50000"
					placeholder="biarin kosong = pakai tier rate"
					className="border-border-default bg-background focus-visible:ring-ring tabular h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			<Field label="Notes (opsional)" wide>
				<textarea
					name="notes"
					rows={2}
					placeholder="Catatan internal"
					className="border-border-default bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			{state?.error && (
				<div className="border-destructive bg-destructive/10 sm:col-span-2 rounded-md border p-2.5">
					<p className="text-destructive text-xs font-medium">{state.error}</p>
				</div>
			)}

			<div className="flex items-center justify-end gap-2 sm:col-span-2">
				<button
					type="button"
					onClick={() => setOpen(false)}
					disabled={pending}
					className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center px-3 text-sm font-medium"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={pending}
					className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-50"
				>
					{pending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<UserPlus className="h-4 w-4" />
					)}
					Send invite
				</button>
			</div>
		</form>
	);
}

function TierSelect() {
	const [tier, setTier] = useState("junior");
	return (
		<>
			<NativeSelect
				value={tier}
				onValueChange={setTier}
				options={[
					{ value: "senior", label: "Senior" },
					{ value: "junior", label: "Junior" },
				]}
				triggerClassName="w-full"
			/>
			<input type="hidden" name="tier" value={tier} required />
		</>
	);
}

function Field({
	label,
	required,
	wide,
	children,
}: {
	label: string;
	required?: boolean;
	wide?: boolean;
	children: React.ReactNode;
}) {
	return (
		<label
			className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`.trim()}
		>
			<span className="text-foreground block text-xs font-medium">
				{label}
				{required && <span className="text-destructive ml-0.5">*</span>}
			</span>
			{children}
		</label>
	);
}
