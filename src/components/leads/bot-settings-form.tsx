"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, fieldInputClass, FormError } from "@/components/catalog/form-kit";
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

// Dedicated textarea chrome — NOT derived from fieldInputClass (that bakes in a
// fixed h-10 that clips multi-line content). Same border/radius/focus tokens,
// but height is driven by `rows`, and the width is capped to a comfortable
// reading measure (~75ch) so reply copy never sprawls edge-to-edge.
const textareaClass =
	"w-full max-w-2xl rounded-lg border border-border-default bg-background px-3 py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground/60 leading-relaxed transition-colors focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none resize-y";

/** A labeled group of related settings — title + description stacked on top,
 *  fields below. Separated from siblings by the form's `divide-y`. */
function Group({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-4 py-6 first:pt-0 last:pb-0">
			<div className="space-y-0.5">
				<h3 className="type-body-strong text-foreground">{title}</h3>
				<p className="type-caption">{description}</p>
			</div>
			{children}
		</div>
	);
}

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
		<form action={formAction} className="space-y-6">
			<FormError message={state?.errors?._form?.[0]} />

			<div className="divide-y divide-border-subtle">
				<Group
					title="Jam operasional"
					description="Di luar jam ini bot menambahkan catatan auto-balas. Offset zona WIB = 7."
				>
					<div className="grid max-w-xl gap-4 sm:grid-cols-3">
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
				</Group>

				<Group
					title="Anti-spam"
					description="Jaga bot tetap sopan: tidak mengulang template, dan berhenti saat admin sudah turun tangan."
				>
					<div className="grid max-w-md gap-4 sm:grid-cols-2">
						<Field
							label="Cooldown (jam)"
							name="cooldown_hours"
							hint="Template sama tidak dikirim 2× ke kontak yang sama dalam rentang ini."
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
							label="Auto-pause (jam)"
							name="pause_hours"
							hint="Setelah admin balas manual, bot diam ke kontak itu sekian jam."
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
				</Group>

				<Group
					title="Template balasan"
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
							rows={4}
							maxLength={1000}
							defaultValue={settings.after_hours_note ?? ""}
							className={textareaClass}
						/>
					</Field>
				</Group>

				<Group
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
				</Group>
			</div>

			<div className="flex justify-end border-t border-border-subtle pt-5">
				<Button type="submit" size="lg" disabled={pending}>
					{pending ? "Menyimpan…" : "Simpan setting"}
				</Button>
			</div>
		</form>
	);
}
