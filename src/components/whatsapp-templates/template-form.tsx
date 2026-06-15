"use client";

import { useActionState, useId, useMemo, useRef, useState } from "react";
import {
	createWhatsAppTemplate,
	type TemplateFormState,
	updateWhatsAppTemplate,
} from "@/lib/actions/whatsapp-templates";
import { SUPPORTED_WA_VARIABLES, substituteVariables } from "@/lib/whatsapp";

type Defaults = {
	code: string;
	name: string;
	description: string;
	template_body: string;
	available_variables: string;
	display_order: string;
	is_active: boolean;
};

const EMPTY: Defaults = {
	code: "",
	name: "",
	description: "",
	template_body: "",
	available_variables: "",
	display_order: "0",
	is_active: true,
};

const PREVIEW_VALUES: Record<string, string> = {
	project_id: "PRJ-20260822-7378",
	client_name: "Maman Sudarman",
	event_date: "22 Agu 2026",
	setup_time: "16:00",
	start_time: "22:00",
	venue_name: "Grand Savero",
	due_date: "19 Agu 2026",
	dp_amount: "Rp 500.000",
	remaining_balance: "Rp 1.300.000",
	package_name: "2R Unlimited 2 Jam",
	duration_hours: "2",
	crew_lead: "Indra",
	crew_asisten: "Bima",
	drive_link: "https://drive.google.com/...",
	reminder_count: "1",
};

export function WhatsAppTemplateForm({
	mode,
	id,
	defaults = EMPTY,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: Defaults;
}) {
	const action =
		mode === "create"
			? createWhatsAppTemplate
			: updateWhatsAppTemplate.bind(null, id!);
	const [state, formAction, pending] = useActionState<
		TemplateFormState,
		FormData
	>(action, undefined);

	const get = (key: keyof Defaults, fallback?: string) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		return fallback ?? String(defaults[key] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	const [body, setBody] = useState<string>(get("template_body"));
	const bodyRef = useRef<HTMLTextAreaElement | null>(null);
	const previewId = useId();

	function insertVariable(varName: string) {
		const placeholder = `{${varName}}`;
		const ta = bodyRef.current;
		if (!ta) {
			setBody((b) => `${b}${placeholder}`);
			return;
		}
		const start = ta.selectionStart ?? body.length;
		const end = ta.selectionEnd ?? body.length;
		const next = body.slice(0, start) + placeholder + body.slice(end);
		setBody(next);
		// restore caret after insert
		requestAnimationFrame(() => {
			ta.focus();
			const caret = start + placeholder.length;
			ta.setSelectionRange(caret, caret);
		});
	}

	const preview = useMemo(
		() => substituteVariables(body, PREVIEW_VALUES),
		[body],
	);
	const detectedVars = useMemo(() => {
		const matches = body.matchAll(/\{([a-z0-9_]+)\}/g);
		const set = new Set<string>();
		for (const m of matches) set.add(m[1]);
		return Array.from(set);
	}, [body]);
	const unsupported = detectedVars.filter(
		(v) => !SUPPORTED_WA_VARIABLES.includes(v as never),
	);

	return (
		<form action={formAction} className="space-y-5">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Code"
					name="code"
					error={err("code")}
					hint="Lowercase, angka, underscore. Contoh: reminder_dp"
					required
				>
					<input
						type="text"
						name="code"
						required
						defaultValue={get("code")}
						placeholder="reminder_dp"
						className={`${inputClass} font-mono`}
						readOnly={mode === "edit"}
					/>
				</Field>

				<Field label="Nama" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						defaultValue={get("name")}
						placeholder="Reminder DP"
						className={inputClass}
					/>
				</Field>
			</div>

			<Field
				label="Deskripsi"
				name="description"
				error={err("description")}
				hint="Kapan template ini biasa dipakai"
			>
				<input
					type="text"
					name="description"
					maxLength={300}
					defaultValue={get("description")}
					placeholder="Sent 7 days before event if no DP"
					className={inputClass}
				/>
			</Field>

			<div>
				<label
					htmlFor="template_body"
					className="mb-1.5 block text-sm font-medium"
				>
					Template Body
					<span className="text-primary ml-0.5">*</span>
				</label>
				<div className="space-y-2">
					<div className="flex flex-wrap gap-1">
						<span className="text-muted-foreground mr-1 self-center text-xs">
							Sisipkan:
						</span>
						{SUPPORTED_WA_VARIABLES.map((v) => (
							<button
								key={v}
								type="button"
								onClick={() => insertVariable(v)}
								className="border-border-default bg-surface-2 hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors"
							>
								{`{${v}}`}
							</button>
						))}
					</div>
					<textarea
						ref={bodyRef}
						id="template_body"
						name="template_body"
						required
						rows={6}
						minLength={10}
						maxLength={2000}
						value={body}
						onChange={(e) => setBody(e.target.value)}
						placeholder="Halo {client_name}, terima kasih sudah booking…"
						className={`${inputClass} font-mono leading-relaxed`}
						aria-describedby={previewId}
					/>
				</div>
				{err("template_body") ? (
					<p className="text-destructive mt-1.5 text-xs">
						{err("template_body")}
					</p>
				) : (
					<p className="text-muted-foreground mt-1.5 text-xs">
						{body.length} karakter · {detectedVars.length} variabel di-pakai
						{unsupported.length > 0 && (
							<span className="text-amber-600 dark:text-amber-400 ml-2">
								⚠ tidak dikenal: {unsupported.map((v) => `{${v}}`).join(", ")}
							</span>
						)}
					</p>
				)}
			</div>

			<div
				id={previewId}
				className="border-border-default bg-muted/40 space-y-2 rounded-md border p-3"
			>
				<p className="text-muted-foreground text-xs uppercase tracking-wider">
					Preview (dummy data)
				</p>
				<p className="text-foreground whitespace-pre-wrap text-sm">
					{preview || (
						<span className="text-muted-foreground italic">
							Mulai ketik untuk lihat preview…
						</span>
					)}
				</p>
			</div>

			{/* Hidden field — auto-derive from detected vars */}
			<input
				type="hidden"
				name="available_variables"
				value={detectedVars.join(", ")}
			/>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Display Order"
					name="display_order"
					error={err("display_order")}
					hint="Urutan tampil di dropdown — kecil = atas"
				>
					<input
						type="number"
						name="display_order"
						min={0}
						step={1}
						defaultValue={get("display_order")}
						className={`${inputClass} tabular`}
					/>
				</Field>

				<label className="flex items-center gap-2 self-end pb-2 text-sm">
					<input
						type="checkbox"
						name="is_active"
						defaultChecked={
							state?.values?.is_active !== undefined
								? state.values.is_active === "on"
								: defaults.is_active
						}
						className="border-border-default accent-primary h-4 w-4 rounded"
					/>
					<span className="font-medium">Aktif</span>
					<span className="text-muted-foreground text-xs">
						— hanya yang aktif muncul di dropdown
					</span>
				</label>
			</div>

			<div className="flex justify-end pt-2">
				<button
					type="submit"
					disabled={pending}
					className="bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "create"
							? "Buat template"
							: "Simpan perubahan"}
				</button>
			</div>
		</form>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none read-only:opacity-70";

function Field({
	label,
	name,
	hint,
	error,
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
	error?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-sm font-medium">
				{label}
				{required && <span className="text-primary ml-0.5">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-destructive text-xs">{error}</p>
			) : hint ? (
				<p className="text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}
