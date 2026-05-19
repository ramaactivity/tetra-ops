"use client";

import {
	CheckCircle2,
	ChevronDown,
	ExternalLink,
	Loader2,
	MessageCircle,
	Send,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import { PaymentStatusBadge } from "@/components/badges/status-badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logReminderSent, logRemindersBatch } from "@/lib/actions/reminders";
import { cn } from "@/lib/utils";
import { substituteVariables, whatsappUrl } from "@/lib/whatsapp";
import type { ReminderBucket } from "./buckets";

type Template = {
	code: string;
	name: string;
	template_body: string;
};

type EventPayload = {
	event_id: string;
	project_id: string;
	client_name: string;
	recipient_phone: string;
	recipient_label: "client" | "pic" | "booker";
	vars: Record<string, string>;
};

type EventMeta = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	event_date_label: string;
	venue_name: string;
	payment_status: string;
	remaining_balance: number;
	remaining_balance_label: string;
};

type LastReminder = {
	event_id: string;
	template_code: string;
	sent_at: string;
};

function relativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	const now = Date.now();
	const diff = Math.max(0, now - then);
	const min = Math.round(diff / 60000);
	if (min < 1) return "baru saja";
	if (min < 60) return `${min}m lalu`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}j lalu`;
	const day = Math.round(hr / 24);
	if (day === 1) return "kemarin";
	return `${day}h lalu`;
}

const SEND_DELAY_MS = 800;

export function ReminderBatchClient({
	bucket,
	suggestedTemplate,
	allTemplates,
	events,
	lastReminderByEvent,
	eventsMeta,
}: {
	bucket: ReminderBucket;
	suggestedTemplate: Template | null;
	allTemplates: Template[];
	events: EventPayload[];
	lastReminderByEvent: Record<string, LastReminder>;
	eventsMeta: EventMeta[];
}) {
	const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
		suggestedTemplate,
	);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
	const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
	const [previewId, setPreviewId] = useState<string | null>(null);
	const [batching, startBatching] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const eventsById = useMemo(() => {
		const m = new Map<string, EventPayload>();
		for (const e of events) m.set(e.event_id, e);
		return m;
	}, [events]);

	const sendableSelectedIds = useMemo(() => {
		return Array.from(selectedIds).filter((id) => {
			const e = eventsById.get(id);
			return Boolean(e?.recipient_phone && e.recipient_phone.length > 0);
		});
	}, [selectedIds, eventsById]);

	const allRowsSelectable = useMemo(
		() => events.filter((e) => e.recipient_phone),
		[events],
	);

	const allSelected =
		allRowsSelectable.length > 0 &&
		allRowsSelectable.every((e) => selectedIds.has(e.event_id));

	function toggleAll() {
		if (allSelected) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(allRowsSelectable.map((e) => e.event_id)));
		}
	}

	function toggleOne(id: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function previewMessageFor(id: string): string {
		if (!selectedTemplate) return "";
		const e = eventsById.get(id);
		if (!e) return "";
		return substituteVariables(selectedTemplate.template_body, e.vars);
	}

	async function handleSendOne(id: string) {
		if (!selectedTemplate) {
			setError("Pilih template dulu");
			return;
		}
		const e = eventsById.get(id);
		if (!e) return;
		if (!e.recipient_phone) {
			setError(`Tidak ada nomor WA untuk ${e.client_name}`);
			return;
		}
		setError(null);
		const message = substituteVariables(selectedTemplate.template_body, e.vars);
		const url = whatsappUrl(e.recipient_phone, message);
		window.open(url, "_blank", "noopener,noreferrer");

		// Optimistic mark + log on server
		setSentIds((prev) => new Set(prev).add(id));
		const r = await logReminderSent({
			event_id: e.event_id,
			template_code: selectedTemplate.code,
			recipient_phone: e.recipient_phone,
			recipient_label: e.recipient_label,
		});
		if (r.error) {
			setError(`Gagal log: ${r.error}`);
		}
	}

	function handleBatchSend() {
		if (!selectedTemplate) {
			setError("Pilih template dulu");
			return;
		}
		if (sendableSelectedIds.length === 0) {
			setError("Centang event yang punya nomor WA");
			return;
		}
		setError(null);

		const ids = [...sendableSelectedIds];
		const tplCode = selectedTemplate.code;
		const tplBody = selectedTemplate.template_body;

		// Open wa.me windows in sequence with delay (browsers throttle popups)
		ids.forEach((id, idx) => {
			const e = eventsById.get(id);
			if (!e) return;
			window.setTimeout(() => {
				const message = substituteVariables(tplBody, e.vars);
				const url = whatsappUrl(e.recipient_phone, message);
				window.open(url, "_blank", "noopener,noreferrer");
				setSentIds((prev) => new Set(prev).add(id));
			}, idx * SEND_DELAY_MS);
		});

		// Log all clicks server-side in one batch (best-effort; client-side log too)
		startBatching(async () => {
			const payload = ids
				.map((id) => {
					const e = eventsById.get(id);
					if (!e) return null;
					return {
						event_id: e.event_id,
						template_code: tplCode,
						recipient_phone: e.recipient_phone,
						recipient_label: e.recipient_label,
					};
				})
				.filter((v): v is NonNullable<typeof v> => v != null);

			const r = await logRemindersBatch(payload);
			if (r.error) {
				setError(`Gagal log batch: ${r.error}`);
			}
		});
	}

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="border-border-default bg-surface-2 flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-1 flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-xs font-medium">
						Template:
					</span>
					<DropdownMenu>
						<DropdownMenuTrigger className="border-border-default bg-background hover:bg-muted text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium">
							<MessageCircle className="h-3.5 w-3.5" />
							{selectedTemplate?.name ?? "Pilih template"}
							<ChevronDown className="h-3 w-3" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-72">
							{allTemplates.map((t) => (
								<DropdownMenuItem
									key={t.code}
									onClick={() => setSelectedTemplate(t)}
									className="cursor-pointer"
								>
									<div className="flex w-full flex-col gap-0.5">
										<div className="text-sm font-medium">{t.name}</div>
										<code className="text-muted-foreground text-xs">
											{t.code}
										</code>
									</div>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					{!selectedTemplate && (
						<span className="text-muted-foreground text-xs">
							pilih dulu sebelum kirim
						</span>
					)}
				</div>

				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-xs">
						{sendableSelectedIds.length} / {allRowsSelectable.length} dipilih
					</span>
					<button
						type="button"
						disabled={
							batching || sendableSelectedIds.length === 0 || !selectedTemplate
						}
						onClick={handleBatchSend}
						className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
					>
						{batching ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Send className="h-3.5 w-3.5" />
						)}
						Kirim {sendableSelectedIds.length || ""}
					</button>
				</div>
			</div>

			{error && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			)}

			<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
				<table className="w-full text-sm">
					<thead className="bg-muted/50">
						<tr className="border-b">
							<th className="w-10 px-3 py-2 text-left">
								<input
									type="checkbox"
									checked={allSelected}
									onChange={toggleAll}
									className="size-4 cursor-pointer"
									aria-label="Pilih semua"
								/>
							</th>
							<th className="text-foreground px-2 py-2 text-left text-xs font-medium">
								Event
							</th>
							<th className="text-foreground px-2 py-2 text-left text-xs font-medium">
								Tanggal
							</th>
							<th className="text-foreground px-2 py-2 text-left text-xs font-medium">
								Sisa Pembayaran
							</th>
							<th className="text-foreground px-2 py-2 text-left text-xs font-medium">
								Last reminder
							</th>
							<th className="text-foreground px-2 py-2 text-right text-xs font-medium">
								Aksi
							</th>
						</tr>
					</thead>
					<tbody>
						{eventsMeta.map((meta) => {
							const e = eventsById.get(meta.id);
							if (!e) return null;
							const checked = selectedIds.has(meta.id);
							const noPhone = !e.recipient_phone;
							const last = lastReminderByEvent[meta.id];
							const isSent = sentIds.has(meta.id);
							const isPreviewing = previewId === meta.id;

							return (
								<Fragment key={meta.id}>
									<tr
										className={cn(
											"border-b transition-colors",
											checked && "bg-muted/30",
											noPhone && "opacity-60",
										)}
									>
										<td className="px-3 py-2 align-top">
											<input
												type="checkbox"
												checked={checked}
												onChange={() => toggleOne(meta.id)}
												disabled={noPhone}
												className="size-4 cursor-pointer disabled:cursor-not-allowed"
												aria-label={`Pilih ${meta.client_name}`}
											/>
										</td>
										<td className="px-2 py-2 align-top">
											<div className="flex flex-col gap-0.5">
												<Link
													href={`/operations/${meta.project_id}`}
													className="text-foreground hover:text-primary text-sm font-medium"
												>
													{meta.client_name}
												</Link>
												<span className="text-muted-foreground text-xs">
													{meta.project_id} · {meta.venue_name}
												</span>
												{noPhone && (
													<span className="text-destructive text-xs font-medium">
														No WA number
													</span>
												)}
												{!noPhone && (
													<span className="text-muted-foreground text-xs">
														→ {e.recipient_phone}
													</span>
												)}
											</div>
										</td>
										<td className="px-2 py-2 align-top">
											<span className="text-foreground text-sm">
												{meta.event_date_label}
											</span>
										</td>
										<td className="px-2 py-2 align-top">
											<div className="flex flex-col gap-1">
												<span className="text-foreground tabular-nums text-sm">
													{meta.remaining_balance > 0
														? meta.remaining_balance_label
														: "—"}
												</span>
												<PaymentStatusBadge status={meta.payment_status} />
											</div>
										</td>
										<td className="px-2 py-2 align-top">
											{last ? (
												<div className="flex flex-col gap-0.5">
													<span className="text-foreground text-xs">
														{relativeTime(last.sent_at)}
													</span>
													<code className="text-muted-foreground text-xs">
														{last.template_code}
													</code>
												</div>
											) : (
												<span className="text-muted-foreground text-xs">
													belum pernah
												</span>
											)}
											{isSent && (
												<div className="mt-1 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
													<CheckCircle2 className="h-3 w-3" />
													<span className="text-xs">terkirim</span>
												</div>
											)}
										</td>
										<td className="px-2 py-2 text-right align-top">
											<div className="inline-flex items-center gap-1">
												<button
													type="button"
													onClick={() =>
														setPreviewId(isPreviewing ? null : meta.id)
													}
													className="border-border-default bg-background hover:bg-muted text-foreground inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium"
													disabled={!selectedTemplate}
												>
													Preview
												</button>
												<button
													type="button"
													onClick={() => handleSendOne(meta.id)}
													disabled={noPhone || !selectedTemplate}
													className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
												>
													<ExternalLink className="h-3 w-3" />
													Kirim
												</button>
											</div>
										</td>
									</tr>
									{isPreviewing && (
										<tr className="border-b">
											<td colSpan={6} className="bg-muted/30 px-4 py-3">
												<div className="flex flex-col gap-2">
													<span className="text-muted-foreground text-xs font-medium">
														Preview pesan untuk {meta.client_name}
													</span>
													<pre className="text-foreground bg-background border-border-default rounded-md border p-3 text-xs whitespace-pre-wrap">
														{previewMessageFor(meta.id)}
													</pre>
												</div>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>

			<p className="text-muted-foreground text-xs">
				Pesan dibuka di tab WhatsApp baru — kamu yang klik <em>Kirim</em> di
				WhatsApp Web/HP. Sistem cuma melog niat kirim untuk tracking. Bucket{" "}
				<code className="bg-muted rounded px-1 py-0.5">{bucket}</code>.
			</p>
		</div>
	);
}
