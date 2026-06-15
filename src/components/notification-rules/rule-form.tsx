"use client";

import { useActionState, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import {
	type RuleFormState,
	updateNotificationRule,
} from "@/lib/actions/notification-rules";

type Defaults = {
	name: string;
	description: string;
	severity: "alert" | "warning" | "info" | "success";
	recipient_roles: Array<"super_admin" | "owner" | "crew">;
	send_push: boolean;
	is_enabled: boolean;
};

const SEVERITY_OPTIONS: Array<{
	value: "alert" | "warning" | "info" | "success";
	label: string;
	tone: string;
}> = [
	{ value: "alert", label: "Alert (kritikal)", tone: "text-rose-600" },
	{ value: "warning", label: "Warning (perhatian)", tone: "text-amber-600" },
	{ value: "info", label: "Info (FYI)", tone: "text-sky-600" },
	{ value: "success", label: "Success (konfirmasi)", tone: "text-emerald-600" },
];

const ROLE_OPTIONS: Array<{
	value: "super_admin" | "owner" | "crew";
	label: string;
}> = [
	{ value: "super_admin", label: "Super Admin" },
	{ value: "owner", label: "Owner" },
	{ value: "crew", label: "Crew" },
];

export function NotificationRuleForm({
	id,
	defaults,
	triggerCondition,
}: {
	id: string;
	defaults: Defaults;
	triggerCondition: Record<string, unknown> | null;
}) {
	const action = updateNotificationRule.bind(null, id);
	const [state, formAction, pending] = useActionState<RuleFormState, FormData>(
		action,
		undefined,
	);

	const get = (key: keyof Defaults | "name" | "description" | "severity") => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		return String(defaults[key as keyof Defaults] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	const checkedRoles = state?.values?.recipient_roles
		? state.values.recipient_roles.split(",").filter(Boolean)
		: defaults.recipient_roles;

	return (
		<form action={formAction} className="space-y-5">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<Field label="Nama" name="name" error={err("name")} required>
				<input
					type="text"
					name="name"
					required
					defaultValue={get("name")}
					className={inputClass}
				/>
			</Field>

			<Field label="Deskripsi" name="description" error={err("description")}>
				<textarea
					name="description"
					rows={2}
					maxLength={300}
					defaultValue={get("description")}
					className={`${inputClass} resize-none`}
				/>
			</Field>

			<Field label="Severity" name="severity" error={err("severity")} required>
				<RuleSeveritySelect defaultValue={get("severity")} error={!!err("severity")} />
			</Field>

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium">
					Recipient Roles
					<span className="text-primary ml-0.5">*</span>
				</legend>
				<div className="grid gap-2 sm:grid-cols-3">
					{ROLE_OPTIONS.map((r) => (
						<label
							key={r.value}
							className="border-border-default bg-background hover:bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
						>
							<input
								type="checkbox"
								name="recipient_roles"
								value={r.value}
								defaultChecked={checkedRoles.includes(r.value)}
								className="border-border-default accent-primary h-4 w-4 rounded"
							/>
							{r.label}
						</label>
					))}
				</div>
				{err("recipient_roles") && (
					<p className="text-destructive text-xs">{err("recipient_roles")}</p>
				)}
			</fieldset>

			<div className="grid gap-3 sm:grid-cols-2">
				<label className="border-border-default bg-surface-2 flex items-start gap-3 rounded-md border p-3">
					<input
						type="checkbox"
						name="send_push"
						defaultChecked={
							state?.values?.send_push !== undefined
								? state.values.send_push === "on"
								: defaults.send_push
						}
						className="border-border-default accent-primary mt-0.5 h-4 w-4 rounded"
					/>
					<div>
						<div className="text-sm font-medium">Send Push Notification</div>
						<div className="text-muted-foreground text-xs">
							Kirim ke device user (PWA push)
						</div>
					</div>
				</label>

				<label className="border-border-default bg-surface-2 flex items-start gap-3 rounded-md border p-3">
					<input
						type="checkbox"
						name="is_enabled"
						defaultChecked={
							state?.values?.is_enabled !== undefined
								? state.values.is_enabled === "on"
								: defaults.is_enabled
						}
						className="border-border-default accent-primary mt-0.5 h-4 w-4 rounded"
					/>
					<div>
						<div className="text-sm font-medium">Rule Aktif</div>
						<div className="text-muted-foreground text-xs">
							Rule akan dievaluasi oleh anomaly cron
						</div>
					</div>
				</label>
			</div>

			{triggerCondition && (
				<div className="border-border-default bg-muted/40 rounded-md border p-3">
					<p className="text-muted-foreground mb-1 text-xs uppercase tracking-wider">
						Trigger Condition (read-only)
					</p>
					<pre className="text-foreground overflow-x-auto font-mono text-xs">
						{JSON.stringify(triggerCondition, null, 2)}
					</pre>
					<p className="text-muted-foreground mt-1 text-xs">
						Edit logic engine via code — schema field tidak dimaintain dari UI.
					</p>
				</div>
			)}

			<div className="flex justify-end pt-2">
				<button
					type="submit"
					disabled={pending}
					className="bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending ? "Menyimpan…" : "Simpan perubahan"}
				</button>
			</div>
		</form>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";
const selectClass = `${inputClass} appearance-none`;

function RuleSeveritySelect({
	defaultValue,
	error,
}: {
	defaultValue: string;
	error: boolean;
}) {
	const [severity, setSeverity] = useState(defaultValue);
	return (
		<>
			<NativeSelect
				value={severity}
				onValueChange={setSeverity}
				options={SEVERITY_OPTIONS.map((s) => ({
					value: s.value,
					label: s.label,
				}))}
				triggerClassName="w-full"
				aria-invalid={error}
			/>
			<input type="hidden" name="severity" value={severity} required />
		</>
	);
}

function Field({
	label,
	name,
	error,
	required,
	children,
}: {
	label: string;
	name: string;
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
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}
