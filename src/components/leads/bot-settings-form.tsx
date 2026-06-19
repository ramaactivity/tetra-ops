"use client";

import { useActionState, useEffect, useRef } from "react";
import { fieldInputClass, FormError } from "@/components/catalog/form-kit";
import { FieldGrid } from "@/components/operations/_shared/field-grid";
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

// Textarea chrome — height driven by `rows` (NOT the baked-in h-10), same
// border/radius/focus tokens as the rest of the form fields.
const textareaClass =
	"w-full rounded-lg border border-border-default bg-background px-3 py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground/60 leading-relaxed transition-colors focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none resize-y";

// Compact width for the small numeric fields so they don't stretch across the
// whole value column.
const numClass = cn(fieldInputClass, "tabular w-28");

function GroupHeader({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="space-y-0.5">
			<h3 className="type-body-strong text-foreground">{title}</h3>
			<p className="type-caption">{description}</p>
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
		<form action={formAction} className="space-y-7">
			<FormError message={state?.errors?._form?.[0]} />

			<section className="space-y-4">
				<GroupHeader
					title="Jam operasional"
					description="Di luar jam ini bot menambahkan catatan auto-balas. Offset zona WIB = 7."
				/>
				<FieldGrid gap="tight">
					<FieldGrid.Row
						label="Jam buka"
						name="business_start_hour"
						hint="Jam 0–23"
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
					</FieldGrid.Row>
					<FieldGrid.Row
						label="Jam tutup"
						name="business_end_hour"
						hint="Jam 0–24"
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
					</FieldGrid.Row>
					<FieldGrid.Row
						label="Offset zona"
						name="timezone_offset"
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
					</FieldGrid.Row>
				</FieldGrid>
			</section>

			<div className="border-t border-border-subtle" />

			<section className="space-y-4">
				<GroupHeader
					title="Anti-spam"
					description="Jaga bot tetap sopan: tidak mengulang template, dan berhenti saat admin sudah turun tangan."
				/>
				<FieldGrid gap="tight">
					<FieldGrid.Row
						label="Cooldown"
						name="cooldown_hours"
						hint="Jam. Template sama tidak dikirim 2× ke kontak yang sama dalam rentang ini."
						error={err("cooldown_hours")}
					>
						<input
							id="cooldown_hours"
							type="number"
							name="cooldown_hours"
							min={0}
							max={720}
							defaultValue={settings.cooldown_hours}
							className={numClass}
						/>
					</FieldGrid.Row>
					<FieldGrid.Row
						label="Auto-pause"
						name="pause_hours"
						hint="Jam. Setelah admin balas manual, bot diam ke kontak itu sekian jam."
						error={err("pause_hours")}
					>
						<input
							id="pause_hours"
							type="number"
							name="pause_hours"
							min={0}
							max={720}
							defaultValue={settings.pause_hours}
							className={numClass}
						/>
					</FieldGrid.Row>
				</FieldGrid>
			</section>

			<div className="border-t border-border-subtle" />

			<section className="space-y-4">
				<GroupHeader
					title="Template balasan"
					description="Teks otomatis yang ditambahkan ke balasan. Kosongkan salah satu untuk mematikannya."
				/>
				<FieldGrid>
					<FieldGrid.Row
						label="Balasan salam"
						name="salam_reply"
						hint="Diawalkan saat pesan mengandung 'Assalamualaikum'."
						error={err("salam_reply")}
						labelAlign="start"
					>
						<textarea
							id="salam_reply"
							name="salam_reply"
							rows={2}
							maxLength={1000}
							defaultValue={settings.salam_reply ?? ""}
							className={textareaClass}
						/>
					</FieldGrid.Row>
					<FieldGrid.Row
						label="Catatan di luar jam kerja"
						name="after_hours_note"
						hint="Ditambahkan ke balasan saat pesan masuk di luar jam operasional."
						error={err("after_hours_note")}
						labelAlign="start"
					>
						<textarea
							id="after_hours_note"
							name="after_hours_note"
							rows={4}
							maxLength={1000}
							defaultValue={settings.after_hours_note ?? ""}
							className={textareaClass}
						/>
					</FieldGrid.Row>
				</FieldGrid>
			</section>

			<div className="border-t border-border-subtle" />

			<section className="space-y-4">
				<GroupHeader
					title="Notif admin"
					description="Nomor WA yang menerima ping tiap ada lead baru. Kosongkan untuk mematikan notif."
				/>
				<FieldGrid>
					<FieldGrid.Row
						label="JID notif admin"
						name="admin_notify_jid"
						hint="Format 628xxx@s.whatsapp.net"
						error={err("admin_notify_jid")}
					>
						<input
							id="admin_notify_jid"
							type="text"
							name="admin_notify_jid"
							defaultValue={settings.admin_notify_jid ?? ""}
							placeholder="628xxx@s.whatsapp.net"
							className={cn(fieldInputClass, "font-mono")}
						/>
					</FieldGrid.Row>
				</FieldGrid>
			</section>

			<div className="flex justify-end border-t border-border-subtle pt-5">
				<Button type="submit" size="lg" disabled={pending}>
					{pending ? "Menyimpan…" : "Simpan setting"}
				</Button>
			</div>
		</form>
	);
}
