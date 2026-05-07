"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useActionState } from "react";
import {
	completeCrewProfile,
	type OnboardingFormState,
} from "@/lib/actions/profile-onboarding";

export function OnboardingForm({
	defaultFullName,
	defaultNickname,
	defaultPhoneWa,
	submitLabel = "Submit & lanjut",
}: {
	defaultFullName: string;
	defaultNickname?: string | null;
	defaultPhoneWa?: string | null;
	submitLabel?: string;
}) {
	const [state, formAction, pending] = useActionState<
		OnboardingFormState,
		FormData
	>(completeCrewProfile, undefined);

	return (
		<form action={formAction} className="space-y-4">
			<Field label="Full name" required hint="Nama lengkap sesuai KTP">
				<input
					name="full_name"
					type="text"
					required
					defaultValue={defaultFullName}
					maxLength={120}
					className="border-border bg-background focus-visible:ring-ring h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			<Field label="Nickname" hint="Panggilan akrab di crew">
				<input
					name="nickname"
					type="text"
					defaultValue={defaultNickname ?? ""}
					maxLength={60}
					placeholder="Aminah"
					className="border-border bg-background focus-visible:ring-ring h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			<Field
				label="WhatsApp / Phone"
				required
				hint="Crew assignment notif & panggilan dari PIC akan ke nomor ini"
			>
				<input
					name="phone_wa"
					type="tel"
					required
					defaultValue={defaultPhoneWa ?? ""}
					placeholder="+628..."
					inputMode="tel"
					autoComplete="tel"
					className="border-border bg-background focus-visible:ring-ring tabular h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</Field>

			{state?.error && (
				<div className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2">
					<p className="text-destructive text-xs font-medium">{state.error}</p>
				</div>
			)}

			<button
				type="submit"
				disabled={pending}
				className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors"
			>
				{pending ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin" />
						Menyimpan…
					</>
				) : (
					<>
						{submitLabel}
						<ArrowRight className="h-4 w-4" />
					</>
				)}
			</button>
		</form>
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
		<label className="block space-y-1.5">
			<span className="text-foreground block text-xs font-medium">
				{label}
				{required && <span className="text-destructive ml-0.5">*</span>}
			</span>
			{children}
			{hint && (
				<span className="text-muted-foreground block text-[11px] leading-snug">
					{hint}
				</span>
			)}
		</label>
	);
}
