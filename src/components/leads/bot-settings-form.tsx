"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormError, fieldInputClass } from "@/components/catalog/form-kit";
import { Button } from "@/components/ui/button";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toaster";
import { WhatsAppPreview } from "@/components/ui/whatsapp-preview";
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

/** A standalone settings card — its own surface, header inside, fields below.
 *  Each concern gets one card instead of stacking everything in one panel. */
function Card({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section className="overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
			<div className="px-5 py-4">
				<h3 className="type-heading text-foreground">{title}</h3>
				<p className="type-secondary mt-0.5 leading-snug">{description}</p>
			</div>
			<div className="border-t border-border-subtle px-5 py-5">{children}</div>
		</section>
	);
}

/** Top-label field — label sits directly above its control, hint beneath. */
function Field({
	label,
	htmlFor,
	hint,
	error,
	children,
}: {
	label: string;
	htmlFor: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label
				htmlFor={htmlFor}
				className="block text-[13px] font-medium text-foreground"
			>
				{label}
			</label>
			{children}
			{error ? (
				<p className="text-[12px] text-destructive">{error}</p>
			) : hint ? (
				<p className="text-[12px] leading-snug text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

export function BotSettingsForm({ settings }: { settings: BotSettings }) {
	const [state, formAction, pending] = useActionState<
		BotSettingsFormState,
		FormData
	>(updateBotSettings, undefined);
	const wasPending = useRef(false);
	// Track unsaved edits so the long, multi-card form signals when there's
	// something to save (and clears the signal once the save lands).
	const [dirty, setDirty] = useState(false);
	// Controlled so the WhatsApp preview updates live as you type. Still submit
	// via `name`, so the server action reads them unchanged.
	const [salamReply, setSalamReply] = useState(settings.salam_reply ?? "");
	const [afterHoursNote, setAfterHoursNote] = useState(
		settings.after_hours_note ?? "",
	);

	useEffect(() => {
		if (wasPending.current && !pending) {
			if (state?.ok) {
				toast.success("Setting bot disimpan");
				setDirty(false);
			} else if (state?.errors?._form) toast.error(state.errors._form[0]);
		}
		wasPending.current = pending;
	}, [pending, state]);

	const err = (k: string): string | undefined => {
		const errs = state?.errors as
			| Record<string, string[] | undefined>
			| undefined;
		return errs?.[k]?.[0];
	};

	const numClass = cn(fieldInputClass, "tabular");

	return (
		<form
			action={formAction}
			onChange={() => setDirty(true)}
			className="space-y-3"
		>
			{state?.errors?._form ? (
				<FormError message={state.errors._form[0]} />
			) : null}

			<Card
				title="Jam operasional"
				description="Di luar jam ini bot menambahkan catatan auto-balas. Offset zona WIB = 7."
			>
				<div className="grid max-w-md grid-cols-3 gap-3">
					<Field
						label="Jam buka"
						htmlFor="business_start_hour"
						hint="0–23"
						error={err("business_start_hour")}
					>
						<input
							id="business_start_hour"
							type="number"
							name="business_start_hour"
							min={0}
							max={23}
							defaultValue={settings.business_start_hour}
							className={numClass}
						/>
					</Field>
					<Field
						label="Jam tutup"
						htmlFor="business_end_hour"
						hint="0–24"
						error={err("business_end_hour")}
					>
						<input
							id="business_end_hour"
							type="number"
							name="business_end_hour"
							min={0}
							max={24}
							defaultValue={settings.business_end_hour}
							className={numClass}
						/>
					</Field>
					<Field
						label="Offset zona"
						htmlFor="timezone_offset"
						hint="WIB = 7"
						error={err("timezone_offset")}
					>
						<input
							id="timezone_offset"
							type="number"
							name="timezone_offset"
							min={-12}
							max={14}
							defaultValue={settings.timezone_offset}
							className={numClass}
						/>
					</Field>
				</div>
			</Card>

			<Card
				title="Anti-spam"
				description="Jaga bot tetap sopan: tidak mengulang template, dan berhenti saat admin sudah turun tangan."
			>
				<div className="grid gap-5 sm:max-w-3xl sm:grid-cols-2 sm:gap-x-8">
					<Field
						label="Cooldown (jam)"
						htmlFor="cooldown_hours"
						hint="Template sama tidak dikirim 2× ke kontak yang sama dalam rentang ini."
						error={err("cooldown_hours")}
					>
						<input
							id="cooldown_hours"
							type="number"
							name="cooldown_hours"
							min={0}
							max={720}
							defaultValue={settings.cooldown_hours}
							className={cn(numClass, "max-w-[8rem]")}
						/>
					</Field>
					<Field
						label="Auto-pause (jam)"
						htmlFor="pause_hours"
						hint="Setelah admin balas manual, bot diam ke kontak itu sekian jam."
						error={err("pause_hours")}
					>
						<input
							id="pause_hours"
							type="number"
							name="pause_hours"
							min={0}
							max={720}
							defaultValue={settings.pause_hours}
							className={cn(numClass, "max-w-[8rem]")}
						/>
					</Field>
				</div>
			</Card>

			<Card
				title="Template balasan"
				description="Teks otomatis yang ditambahkan ke balasan. Kosongkan salah satu untuk mematikannya."
			>
				<div className="space-y-5">
					<div className="space-y-2">
						<Field
							label="Balasan salam"
							htmlFor="salam_reply"
							hint="Diawalkan saat pesan mengandung 'Assalamualaikum'."
							error={err("salam_reply")}
						>
							<RichTextarea
								id="salam_reply"
								name="salam_reply"
								rows={2}
								maxLength={1000}
								value={salamReply}
								onChange={setSalamReply}
							/>
						</Field>
						<WhatsAppPreview text={salamReply} />
					</div>
					<div className="space-y-2">
						<Field
							label="Catatan di luar jam kerja"
							htmlFor="after_hours_note"
							hint="Ditambahkan ke balasan saat pesan masuk di luar jam operasional. Baris kosong di awal sengaja — itu jarak dari balasan utama."
							error={err("after_hours_note")}
						>
							<RichTextarea
								id="after_hours_note"
								name="after_hours_note"
								rows={6}
								maxLength={1000}
								value={afterHoursNote}
								onChange={setAfterHoursNote}
							/>
						</Field>
						<WhatsAppPreview text={afterHoursNote} />
					</div>
				</div>
			</Card>

			<Card
				title="Notif admin"
				description="Nomor WA yang menerima ping tiap ada lead baru. Kosongkan untuk mematikan notif."
			>
				<Field
					label="JID notif admin"
					htmlFor="admin_notify_jid"
					hint="Format 628xxx@s.whatsapp.net"
					error={err("admin_notify_jid")}
				>
					<input
						id="admin_notify_jid"
						type="text"
						name="admin_notify_jid"
						defaultValue={settings.admin_notify_jid ?? ""}
						placeholder="628xxx@s.whatsapp.net"
						className={cn(fieldInputClass, "max-w-xl font-mono")}
					/>
				</Field>
			</Card>

			<div className="flex flex-col-reverse items-stretch gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
				{dirty && !pending ? (
					<p className="type-secondary inline-flex items-center justify-center gap-1.5 sm:mr-auto">
						<span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
						Ada perubahan belum disimpan
					</p>
				) : null}
				<Button
					type="submit"
					size="lg"
					disabled={pending}
					className="w-full sm:w-auto"
				>
					{pending ? "Menyimpan…" : "Simpan setting"}
				</Button>
			</div>
		</form>
	);
}
