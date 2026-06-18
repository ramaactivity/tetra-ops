"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "@/components/ui/toaster";
import {
	type BotSettingsFormState,
	updateBotSettings,
} from "@/lib/actions/bot-control";

export type BotSettings = {
	business_start_hour: number;
	business_end_hour: number;
	timezone_offset: number;
	cooldown_hours: number;
	pause_hours: number;
	salam_reply: string | null;
	after_hours_note: string | null;
	admin_notify_jid: string | null;
};

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";

export function BotSettingsForm({ settings }: { settings: BotSettings }) {
	const [state, formAction, pending] = useActionState<
		BotSettingsFormState,
		FormData
	>(updateBotSettings, undefined);
	const wasPending = useRef(false);

	useEffect(() => {
		if (wasPending.current && !pending) {
			if (state?.ok) toast.success("Setting bot disimpan");
			else if (state?.errors?._form) toast.error(state.errors._form[0]);
		}
		wasPending.current = pending;
	}, [pending, state]);

	const err = (k: string): string | undefined => {
		const errs = state?.errors as
			| Record<string, string[] | undefined>
			| undefined;
		return errs?.[k]?.[0];
	};

	return (
		<form action={formAction} className="space-y-5">
			{state?.errors?._form && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-3">
				<Field
					label="Jam buka (0–23)"
					name="business_start_hour"
					error={err("business_start_hour")}
				>
					<input
						type="number"
						name="business_start_hour"
						min={0}
						max={23}
						defaultValue={settings.business_start_hour}
						className={`${inputClass} tabular`}
					/>
				</Field>
				<Field
					label="Jam tutup (0–24)"
					name="business_end_hour"
					error={err("business_end_hour")}
				>
					<input
						type="number"
						name="business_end_hour"
						min={0}
						max={24}
						defaultValue={settings.business_end_hour}
						className={`${inputClass} tabular`}
					/>
				</Field>
				<Field
					label="Offset zona (WIB=7)"
					name="timezone_offset"
					error={err("timezone_offset")}
				>
					<input
						type="number"
						name="timezone_offset"
						min={-12}
						max={14}
						defaultValue={settings.timezone_offset}
						className={`${inputClass} tabular`}
					/>
				</Field>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Cooldown (jam)"
					name="cooldown_hours"
					hint="Template sama tidak dikirim 2× ke kontak yang sama dalam rentang ini"
					error={err("cooldown_hours")}
				>
					<input
						type="number"
						name="cooldown_hours"
						min={0}
						max={720}
						defaultValue={settings.cooldown_hours}
						className={`${inputClass} tabular`}
					/>
				</Field>
				<Field
					label="Auto-pause (jam)"
					name="pause_hours"
					hint="Setelah admin balas manual, bot diam ke kontak itu sekian jam"
					error={err("pause_hours")}
				>
					<input
						type="number"
						name="pause_hours"
						min={0}
						max={720}
						defaultValue={settings.pause_hours}
						className={`${inputClass} tabular`}
					/>
				</Field>
			</div>

			<Field
				label="Balasan salam"
				name="salam_reply"
				hint="Diawalkan saat pesan mengandung 'Assalamualaikum'. Kosongkan = matikan."
				error={err("salam_reply")}
			>
				<textarea
					name="salam_reply"
					rows={2}
					maxLength={1000}
					defaultValue={settings.salam_reply ?? ""}
					className={`${inputClass} leading-relaxed`}
				/>
			</Field>

			<Field
				label="Catatan di luar jam kerja"
				name="after_hours_note"
				hint="Ditambahkan ke balasan saat pesan masuk di luar jam operasional. Kosongkan = matikan."
				error={err("after_hours_note")}
			>
				<textarea
					name="after_hours_note"
					rows={3}
					maxLength={1000}
					defaultValue={settings.after_hours_note ?? ""}
					className={`${inputClass} leading-relaxed`}
				/>
			</Field>

			<Field
				label="JID notif admin"
				name="admin_notify_jid"
				hint="Nomor WA admin untuk notif lead, format 628xxx@s.whatsapp.net. Kosongkan = matikan notif."
				error={err("admin_notify_jid")}
			>
				<input
					type="text"
					name="admin_notify_jid"
					defaultValue={settings.admin_notify_jid ?? ""}
					placeholder="628xxx@s.whatsapp.net"
					className={`${inputClass} font-mono`}
				/>
			</Field>

			<div className="flex justify-end pt-1">
				<button
					type="submit"
					disabled={pending}
					className="inline-flex h-10 items-center rounded-md bg-[#059669] px-4 text-sm font-medium text-white hover:bg-[#047857] disabled:opacity-60 dark:bg-[#0b9e6a] dark:hover:bg-[#059669]"
				>
					{pending ? "Menyimpan…" : "Simpan setting"}
				</button>
			</div>
		</form>
	);
}

function Field({
	label,
	name,
	hint,
	error,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-sm font-medium">
				{label}
			</label>
			{children}
			{error ? (
				<p className="text-xs text-destructive">{error}</p>
			) : hint ? (
				<p className="text-xs text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}
