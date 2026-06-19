"use client";

import { useActionState, useEffect, useRef } from "react";
import {
	Field,
	fieldInputClass,
	FormDivider,
	FormError,
	FormSection,
} from "@/components/catalog/form-kit";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
	type BotSettingsFormState,
	updateBotSettings,
} from "@/lib/actions/bot-control";
import { cn } from "@/lib/utils";

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

// Textarea chrome derived from the shared field input so it lines up with the
// catalog forms: same border/radius/focus ring, height relaxed for prose, and
// a max width so reply copy stays at a comfortable reading measure.
const textareaClass = cn(
	fieldInputClass,
	"h-auto max-w-2xl resize-y py-2 leading-relaxed",
);

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
		<form action={formAction} className="space-y-8">
			<FormError message={state?.errors?._form?.[0]} />

			<FormSection
				eyebrow="01 — Jam operasional"
				title="Jam kerja bot"
				description="Di luar jam ini bot menambahkan catatan auto-balas. Pakai offset zona WIB = 7."
			>
				<div className="grid max-w-md gap-4 sm:grid-cols-3">
					<Field
						label="Jam buka"
						name="business_start_hour"
						hint="0–23"
						error={err("business_start_hour")}
					>
						<input
							type="number"
							name="business_start_hour"
							min={0}
							max={23}
							defaultValue={settings.business_start_hour}
							className={cn(fieldInputClass, "tabular")}
						/>
					</Field>
					<Field
						label="Jam tutup"
						name="business_end_hour"
						hint="0–24"
						error={err("business_end_hour")}
					>
						<input
							type="number"
							name="business_end_hour"
							min={0}
							max={24}
							defaultValue={settings.business_end_hour}
							className={cn(fieldInputClass, "tabular")}
						/>
					</Field>
					<Field
						label="Offset zona"
						name="timezone_offset"
						hint="WIB = 7"
						error={err("timezone_offset")}
					>
						<input
							type="number"
							name="timezone_offset"
							min={-12}
							max={14}
							defaultValue={settings.timezone_offset}
							className={cn(fieldInputClass, "tabular")}
						/>
					</Field>
				</div>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="02 — Anti-spam"
				title="Cooldown & auto-pause"
				description="Jaga bot tetap sopan: tidak mengulang template & berhenti saat admin sudah turun tangan."
			>
				<div className="grid max-w-md gap-4 sm:grid-cols-2">
					<Field
						label="Cooldown"
						name="cooldown_hours"
						hint="Jam. Template sama tidak dikirim 2× ke kontak yang sama dalam rentang ini."
						error={err("cooldown_hours")}
					>
						<input
							type="number"
							name="cooldown_hours"
							min={0}
							max={720}
							defaultValue={settings.cooldown_hours}
							className={cn(fieldInputClass, "tabular")}
						/>
					</Field>
					<Field
						label="Auto-pause"
						name="pause_hours"
						hint="Jam. Setelah admin balas manual, bot diam ke kontak itu sekian jam."
						error={err("pause_hours")}
					>
						<input
							type="number"
							name="pause_hours"
							min={0}
							max={720}
							defaultValue={settings.pause_hours}
							className={cn(fieldInputClass, "tabular")}
						/>
					</Field>
				</div>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="03 — Template balasan"
				title="Salam & luar jam"
				description="Teks otomatis yang ditambahkan ke balasan. Kosongkan salah satu untuk mematikannya."
			>
				<Field
					label="Balasan salam"
					name="salam_reply"
					hint="Diawalkan saat pesan mengandung 'Assalamualaikum'."
					error={err("salam_reply")}
				>
					<textarea
						name="salam_reply"
						rows={2}
						maxLength={1000}
						defaultValue={settings.salam_reply ?? ""}
						className={textareaClass}
					/>
				</Field>

				<Field
					label="Catatan di luar jam kerja"
					name="after_hours_note"
					hint="Ditambahkan ke balasan saat pesan masuk di luar jam operasional."
					error={err("after_hours_note")}
				>
					<textarea
						name="after_hours_note"
						rows={3}
						maxLength={1000}
						defaultValue={settings.after_hours_note ?? ""}
						className={textareaClass}
					/>
				</Field>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="04 — Notifikasi"
				title="Notif admin"
				description="Nomor WA yang menerima ping tiap ada lead baru. Kosongkan untuk mematikan notif."
			>
				<Field
					label="JID notif admin"
					name="admin_notify_jid"
					hint="Format 628xxx@s.whatsapp.net"
					error={err("admin_notify_jid")}
				>
					<input
						type="text"
						name="admin_notify_jid"
						defaultValue={settings.admin_notify_jid ?? ""}
						placeholder="628xxx@s.whatsapp.net"
						className={cn(fieldInputClass, "max-w-md font-mono")}
					/>
				</Field>
			</FormSection>

			<div className="flex justify-end border-t border-border-subtle pt-5">
				<Button type="submit" size="lg" disabled={pending}>
					{pending ? "Menyimpan…" : "Simpan setting"}
				</Button>
			</div>
		</form>
	);
}
