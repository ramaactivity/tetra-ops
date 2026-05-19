"use client";

import { CheckCircle2, Search } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
	type SystemConfigFormState,
	updateSystemConfigBatch,
} from "@/lib/actions/system-config";

export type ConfigEntry = {
	key: string;
	value: unknown;
	description: string | null;
	category: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
	financial: "Financial",
	commission: "Komisi",
	crew: "Crew",
	system: "System",
	profile: "Profil Bisnis",
	alerts: "Alert Thresholds",
};

const CATEGORY_HINTS: Record<string, string> = {
	financial:
		"Default DP, gross-up rate, platform fee, owner pool — dipakai oleh booking & settlement.",
	commission: "Aturan komisi sales / vendor / relasi.",
	crew: "Default fee crew per tier (senior / junior).",
	system: "Lokal, currency, format tanggal.",
	profile: "Identitas bisnis untuk PDF & WA template.",
	alerts: "Threshold untuk anomaly radar (cash low, outstanding tinggi).",
};

const CATEGORY_ORDER = [
	"financial",
	"commission",
	"crew",
	"profile",
	"alerts",
	"system",
];

function inferType(v: unknown): "number" | "string" | "boolean" | "json" {
	if (typeof v === "number") return "number";
	if (typeof v === "boolean") return "boolean";
	if (typeof v === "string") return "string";
	return "json";
}

function isMoneyKey(key: string): boolean {
	return (
		key.includes("amount") ||
		key.includes("fee") ||
		key.includes("commission") ||
		key.includes("threshold") ||
		key.includes("pool") ||
		key.includes("minimum") ||
		key.includes("flat")
	);
}

function isPercentKey(key: string): boolean {
	return key.includes("rate") || key.includes("percent");
}

export function SystemConfigForm({ entries }: { entries: ConfigEntry[] }) {
	const [state, formAction, pending] = useActionState<
		SystemConfigFormState,
		FormData
	>(updateSystemConfigBatch, undefined);

	const [query, setQuery] = useState("");
	const normalizedQuery = query.trim().toLowerCase();

	// Group entries by category (memoized — entries identity stable from parent)
	const { categoriesPresent, groupedMap } = useMemo(() => {
		const grouped = new Map<string, ConfigEntry[]>();
		for (const e of entries) {
			const cat = e.category ?? "other";
			const arr = grouped.get(cat) ?? [];
			arr.push(e);
			grouped.set(cat, arr);
		}
		for (const [, arr] of grouped) {
			arr.sort((a, b) => a.key.localeCompare(b.key));
		}
		const present = CATEGORY_ORDER.filter((c) => grouped.has(c));
		for (const c of grouped.keys()) {
			if (!present.includes(c)) present.push(c);
		}
		return { categoriesPresent: present, groupedMap: grouped };
	}, [entries]);

	function matchesQuery(entry: ConfigEntry): boolean {
		if (!normalizedQuery) return true;
		const haystack = (
			entry.key +
			" " +
			(entry.description ?? "")
		).toLowerCase();
		return haystack.includes(normalizedQuery);
	}

	const totalMatches = normalizedQuery
		? entries.filter(matchesQuery).length
		: entries.length;

	return (
		<form action={formAction} className="space-y-6 pb-32">
			{/* Search — filter visible rows by key OR description substring.
			    Hidden rows stay in DOM so their form inputs serialize on
			    submit (no risk of silently dropping unchanged keys when
			    user searches + saves). */}
			<div className="relative">
				<Search
					className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2"
					aria-hidden
				/>
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Cari config (key atau deskripsi)…"
					aria-label="Cari config"
					className="border-border-default bg-background focus-visible:ring-ring h-10 w-full rounded-md border pl-10 pr-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none"
				/>
				{normalizedQuery && (
					<p className="text-muted-foreground mt-1 text-xs">
						{totalMatches} dari {entries.length} key cocok
					</p>
				)}
			</div>

			{categoriesPresent.map((cat) => {
				const items = groupedMap.get(cat) ?? [];
				const sectionVisibleCount = items.filter(matchesQuery).length;
				const sectionHidden =
					normalizedQuery !== "" && sectionVisibleCount === 0;
				return (
					<section
						key={cat}
						className={`border-border-default bg-surface-2 rounded-xl border p-5 ${sectionHidden ? "hidden" : ""}`}
					>
						<header className="mb-5 space-y-1 border-b border-border-default pb-4">
							<h3 className="text-base font-semibold tracking-tight">
								{CATEGORY_LABELS[cat] ?? cat}
								{normalizedQuery && (
									<span className="text-muted-foreground ml-2 text-xs font-normal">
										({sectionVisibleCount}/{items.length})
									</span>
								)}
							</h3>
							{CATEGORY_HINTS[cat] && (
								<p className="text-muted-foreground text-xs">
									{CATEGORY_HINTS[cat]}
								</p>
							)}
						</header>

						<dl className="space-y-5">
							{items.map((entry) => (
								<ConfigRow
									key={entry.key}
									entry={entry}
									hidden={!matchesQuery(entry)}
								/>
							))}
						</dl>
					</section>
				);
			})}

			{/* Sticky footer */}
			<div className="border-border-default bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t backdrop-blur md:bottom-0">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
					<div className="text-xs text-muted-foreground">
						{state?.updated && state.updated > 0 ? (
							<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
								<CheckCircle2 className="h-3.5 w-3.5" />
								{state.updated} key tersimpan
							</span>
						) : state?.error ? (
							<span className="text-destructive">{state.error}</span>
						) : (
							<span>
								{entries.length} key terdaftar · ubah lalu klik simpan
							</span>
						)}
					</div>
					<button
						type="submit"
						disabled={pending}
						className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
					>
						{pending ? "Menyimpan…" : "Simpan semua perubahan"}
					</button>
				</div>
			</div>
		</form>
	);
}

function ConfigRow({
	entry,
	hidden = false,
}: {
	entry: ConfigEntry;
	hidden?: boolean;
}) {
	const type = inferType(entry.value);

	// When hidden=true we still render the form inputs (so they serialize
	// on submit) but apply CSS `hidden` to remove from view. This prevents
	// search-filter from silently dropping unchanged keys on save.
	return (
		<div
			className={`grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,260px)] ${hidden ? "hidden" : ""}`}
		>
			<div className="space-y-0.5">
				<div className="flex items-center gap-2">
					<code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
						{entry.key}
					</code>
					<span className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">
						{type}
					</span>
				</div>
				{entry.description && (
					<p className="text-muted-foreground text-xs">{entry.description}</p>
				)}
			</div>
			<div>
				<input type="hidden" name="keys" value={entry.key} />
				<input type="hidden" name={`type__${entry.key}`} value={type} />
				<ConfigInput entry={entry} type={type} />
			</div>
		</div>
	);
}

function ConfigInput({
	entry,
	type,
}: {
	entry: ConfigEntry;
	type: "number" | "string" | "boolean" | "json";
}) {
	const name = `value__${entry.key}`;

	if (type === "boolean") {
		const checked = entry.value === true;
		return (
			<label className="flex h-10 items-center gap-2 text-sm">
				<input
					type="checkbox"
					name={name}
					defaultChecked={checked}
					className="border-border-default accent-primary h-4 w-4 rounded"
				/>
				<span className="text-muted-foreground">
					{checked ? "true" : "false"}
				</span>
			</label>
		);
	}

	if (type === "number") {
		const isMoney = isMoneyKey(entry.key);
		const isPercent = isPercentKey(entry.key);
		const value = entry.value as number;
		return (
			<div className="relative">
				{isMoney && (
					<span className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm">
						Rp
					</span>
				)}
				<input
					type="number"
					name={name}
					defaultValue={value}
					step={isPercent ? 0.01 : 1}
					className={`${inputClass} tabular ${isMoney ? "pl-9" : ""} ${isPercent ? "pr-9" : ""}`}
				/>
				{isPercent && (
					<span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-sm">
						%
					</span>
				)}
			</div>
		);
	}

	if (type === "string") {
		return (
			<input
				type="text"
				name={name}
				defaultValue={String(entry.value)}
				className={inputClass}
			/>
		);
	}

	// JSON fallback
	return (
		<textarea
			name={name}
			defaultValue={JSON.stringify(entry.value, null, 2)}
			rows={3}
			className={`${inputClass} font-mono text-xs leading-relaxed`}
		/>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";
