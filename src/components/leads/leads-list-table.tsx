"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ContactPhone } from "./contact-phone";
import {
	type ContactRow,
	type LeadRow,
	REPLY_STATUS_META,
	type ReplyStatus,
	STATUS_BADGE,
	statusLabel,
	topicLabel,
} from "./leads-shared";
import { PauseContactButton } from "./pause-contact-button";
import { SegmentSelect } from "./segment-select";

/**
 * <LeadsListTable /> — desktop <table> / mobile record-cards.
 *
 * Chrome + typography locked to the Asset & Design table so the two list pages
 * read as one system: rounded-2xl card, hairline-divided rows, eyebrow headers,
 * and a strict type scale — 13/medium primary · 12.5 secondary · 11 tertiary.
 */

function formatReceived(iso: string): string {
	return new Date(iso).toLocaleString("id-ID", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function TopicTag({ topic }: { topic: string }) {
	return (
		<span className="inline-flex h-[22px] items-center rounded-full bg-secondary px-2.5 text-[11.5px] font-medium text-foreground/80">
			{topicLabel(topic)}
		</span>
	);
}

/** Tanda-terima balasan auto-reply ke customer (✓✓ Terkirim / 👁️ Dibaca).
 *  Tidak dirender saat status belum diketahui (null). */
function ReplyReceipt({
	status,
	at,
}: {
	status: string | null;
	at: string | null;
}) {
	const meta = status ? REPLY_STATUS_META[status as ReplyStatus] : undefined;
	if (!meta) return null;
	const tone =
		meta.badge === "success"
			? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
			: "bg-secondary text-muted-foreground";
	return (
		<span
			title={at ? `${meta.label} ${formatReceived(at)}` : meta.label}
			className={`inline-flex h-[20px] w-fit items-center gap-1 rounded-full px-2 text-[11px] font-medium ${tone}`}
		>
			<span aria-hidden>{meta.icon}</span>
			{meta.label}
		</span>
	);
}

/** Status paling maju dalam satu percakapan (closing menang atas baru). */
const STATUS_PRIORITY = ["converted", "contacted", "new", "ignored"];

type Convo = {
	key: string;
	latest: LeadRow;
	messages: LeadRow[];
	status: string;
};

/**
 * Satu baris per kontak (dulu satu baris per pesan — satu kontak bisa muncul
 * puluhan kali berturut-turut). `leads` sudah urut terbaru dulu.
 */
function groupByContact(leads: LeadRow[]): Convo[] {
	const out: Convo[] = [];
	const byKey = new Map<string, Convo>();
	for (const l of leads) {
		const key = l.wa_jid || l.phone;
		let c = byKey.get(key);
		if (!c) {
			c = { key, latest: l, messages: [], status: l.status };
			byKey.set(key, c);
			out.push(c);
		}
		c.messages.push(l);
	}
	for (const c of out)
		c.status =
			STATUS_PRIORITY.find((st) => c.messages.some((m) => m.status === st)) ??
			c.latest.status;
	return out;
}

function OlderMessages({ messages }: { messages: LeadRow[] }) {
	return (
		<ul className="space-y-1.5 border-l-2 border-border-subtle pl-3">
			{messages.map((m) => (
				<li key={m.id} className="text-[12.5px] leading-snug">
					<span className="tabular text-muted-foreground">
						{formatReceived(m.received_at)}
					</span>
					<span className="text-muted-foreground/60">
						{" "}
						· {topicLabel(m.topic)} ·{" "}
					</span>
					<span className="text-foreground/80">{m.message?.trim() || "—"}</span>
				</li>
			))}
		</ul>
	);
}

export function LeadsListTable({
	leads,
	contactByJid = {},
	canManage = false,
}: {
	leads: LeadRow[];
	/** wa_jid → contact row (segment lives on the contact, not the lead). */
	contactByJid?: Record<string, ContactRow>;
	/** Owner / super_admin → show the per-contact pause action. */
	canManage?: boolean;
}) {
	const convos = groupByContact(leads);
	const [open, setOpen] = useState<Set<string>>(new Set());
	const toggle = (key: string) =>
		setOpen((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	function segmentCell(l: LeadRow) {
		const c = contactByJid[l.wa_jid];
		return (
			<SegmentSelect
				waJid={l.wa_jid}
				segment={c?.segment ?? "private"}
				source={c?.segment_source ?? "auto"}
				phone={l.phone}
				name={l.name}
				canManage={canManage}
			/>
		);
	}
	function contactCell(c: Convo, big = false) {
		const l = c.latest;
		return (
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="flex min-w-0 items-baseline gap-1.5">
					{l.name ? (
						<span
							className={`truncate font-medium text-foreground ${big ? "text-[14px] font-semibold" : "text-[13px]"}`}
						>
							{l.name}
						</span>
					) : (
						<span className="text-[13px] text-muted-foreground/70">
							Tanpa nama
						</span>
					)}
					{c.messages.length > 1 ? (
						<span className="tabular shrink-0 text-[11.5px] text-muted-foreground">
							{c.messages.length} pesan
						</span>
					) : null}
				</span>
				<ContactPhone phone={l.phone} waJid={l.wa_jid} />
			</div>
		);
	}
	function moreButton(c: Convo) {
		if (c.messages.length < 2) return null;
		const isOpen = open.has(c.key);
		return (
			<button
				type="button"
				onClick={() => toggle(c.key)}
				aria-expanded={isOpen}
				className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
			>
				{isOpen
					? "Sembunyikan"
					: `Lihat ${c.messages.length - 1} pesan sebelumnya`}
				<ChevronDown
					className={`size-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
					aria-hidden
				/>
			</button>
		);
	}

	return (
		<>
			<p className="px-1 text-[12px] text-muted-foreground">
				{convos.length} kontak · dari {leads.length} pesan terbaru
			</p>

			{/* DESKTOP — one row per contact */}
			<div className="hidden overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)] md:block">
				<table className="w-full table-fixed text-sm">
					<colgroup>
						<col style={{ width: "19%" }} />
						<col style={{ width: "12%" }} />
						<col style={{ width: "10%" }} />
						<col />
						<col style={{ width: "12%" }} />
						<col style={{ width: "11%" }} />
						{canManage ? <col style={{ width: "10%" }} /> : null}
					</colgroup>
					<thead className="border-b border-border-default">
						<tr className="text-left text-[12px] font-semibold text-muted-foreground">
							<th className="px-4 py-2.5">Kontak</th>
							<th className="px-4 py-2.5">Segmen</th>
							<th className="px-4 py-2.5">Topik</th>
							<th className="px-4 py-2.5">Pesan terakhir</th>
							<th className="px-4 py-2.5">Waktu</th>
							<th className="px-4 py-2.5">Status</th>
							{canManage ? (
								<th className="px-4 py-2.5 text-right">Aksi</th>
							) : null}
						</tr>
					</thead>
					<tbody className="divide-y divide-border-subtle">
						{convos.map((c) => {
							const l = c.latest;
							return (
								<tr
									key={c.key}
									className="transition-colors hover:bg-secondary/30"
								>
									<td className="px-4 py-3 align-top">{contactCell(c)}</td>
									<td className="px-4 py-3 align-top">{segmentCell(l)}</td>
									<td className="px-4 py-3 align-top">
										<TopicTag topic={l.topic} />
									</td>
									<td className="px-4 py-3 align-top">
										<p className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">
											{l.message?.trim() || "—"}
										</p>
										{moreButton(c)}
										{open.has(c.key) ? (
											<div className="mt-2">
												<OlderMessages messages={c.messages.slice(1)} />
											</div>
										) : null}
									</td>
									<td className="px-4 py-3 align-top">
										<div className="flex flex-col gap-0.5">
											<span className="tabular text-[12.5px] text-muted-foreground">
												{formatReceived(l.received_at)}
											</span>
											{l.is_after_hours ? (
												<span className="text-[11px] text-amber-600 dark:text-amber-500">
													luar jam
												</span>
											) : null}
										</div>
									</td>
									<td className="px-4 py-3 align-top">
										<div className="flex flex-col items-start gap-1">
											<Badge variant={STATUS_BADGE[c.status] ?? "neutral"}>
												{statusLabel(c.status)}
											</Badge>
											<ReplyReceipt
												status={l.reply_status}
												at={l.reply_status_at}
											/>
										</div>
									</td>
									{canManage ? (
										<td className="px-4 py-3 text-right align-top">
											<PauseContactButton
												waJid={l.wa_jid}
												name={l.name || l.phone}
											/>
										</td>
									) : null}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{/* MOBILE — one card per contact */}
			<div className="space-y-2.5 md:hidden">
				{convos.map((c) => {
					const l = c.latest;
					return (
						<div
							key={c.key}
							className="space-y-2.5 rounded-2xl border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)]"
						>
							<div className="flex items-start justify-between gap-3">
								{contactCell(c, true)}
								<div className="flex flex-col items-end gap-1">
									<Badge variant={STATUS_BADGE[c.status] ?? "neutral"}>
										{statusLabel(c.status)}
									</Badge>
									<ReplyReceipt
										status={l.reply_status}
										at={l.reply_status_at}
									/>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
								{segmentCell(l)}
								<TopicTag topic={l.topic} />
								<span className="tabular text-[12px] text-muted-foreground">
									{formatReceived(l.received_at)}
								</span>
								{l.is_after_hours ? (
									<span className="text-[11px] text-amber-600 dark:text-amber-500">
										· luar jam
									</span>
								) : null}
							</div>
							{l.message?.trim() ? (
								<p className="line-clamp-3 text-[12.5px] leading-snug text-muted-foreground">
									{l.message.trim()}
								</p>
							) : null}
							{moreButton(c)}
							{open.has(c.key) ? (
								<OlderMessages messages={c.messages.slice(1)} />
							) : null}
							{canManage ? (
								<div className="flex justify-end border-t border-border-subtle pt-2">
									<PauseContactButton
										waJid={l.wa_jid}
										name={l.name || l.phone}
									/>
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</>
	);
}
