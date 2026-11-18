"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { LeadContactWithStage } from "@/lib/leads/contacts";
import type { FollowupState } from "@/lib/leads/followup-types";
import { ContactPhone } from "./contact-phone";
import { FollowupButton } from "./followup-button";
import {
	type ContactRow,
	type LeadRow,
	REPLY_STATUS_META,
	type ReplyStatus,
	STAGE_META,
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
		// Server Vercel = UTC; tanpa ini jam beda dengan browser (WIB) → hydration error #418.
		timeZone: "Asia/Jakarta",
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

/** Satu kontak (sudah dikelompokkan di server) + pesannya, terbaru dulu. */
export type ContactWithMessages = LeadContactWithStage & {
	messages: LeadRow[];
	/** Bahan follow-up untuk Hermes (followupBrief). */
	alasan: string;
	konteks: string;
	followup: FollowupState | null;
};

type Convo = ContactWithMessages & { key: string; latest: LeadRow };

/** Tanggal acara yang ditanyakan: "Sab, 20 Des · 32 hari lagi". */
function eventDateLabel(iso: string, today: string) {
	const d = new Date(`${iso}T00:00:00+07:00`);
	const days = Math.round(
		(d.getTime() - new Date(`${today}T00:00:00+07:00`).getTime()) / 86_400_000,
	);
	const date = d.toLocaleDateString("id-ID", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "Asia/Jakarta",
	});
	const rel =
		days < 0 ? "sudah lewat" : days === 0 ? "hari ini" : `${days} hari lagi`;
	return { date, rel, soon: days >= 0 && days <= 30, past: days < 0 };
}

function StageCell({ c }: { c: Convo }) {
	const meta = STAGE_META[c.stage];
	return (
		<div className="flex flex-col items-start gap-1">
			<Badge variant={meta.badge}>{meta.label}</Badge>
			{c.ref ? (
				<Link
					href={c.ref.href}
					className="text-[11.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				>
					{c.ref.label}
				</Link>
			) : null}
		</div>
	);
}

function EventDateCell({ iso, today }: { iso: string | null; today: string }) {
	if (!iso)
		return <span className="text-[12.5px] text-muted-foreground/60">—</span>;
	const e = eventDateLabel(iso, today);
	return (
		<div className="flex flex-col gap-0.5">
			<span
				className={`tabular text-[12.5px] ${e.past ? "text-muted-foreground" : "text-foreground"}`}
			>
				{e.date}
			</span>
			<span
				className={`text-[11px] ${e.soon ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
			>
				{e.rel}
			</span>
		</div>
	);
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
	contacts,
	contactByJid = {},
	canManage = false,
	today,
}: {
	contacts: ContactWithMessages[];
	/** wa_jid → contact row (setelan segmen manual). */
	contactByJid?: Record<string, ContactRow>;
	/** Owner / super_admin → show the per-contact pause action. */
	canManage?: boolean;
	/** YYYY-MM-DD WIB, untuk "N hari lagi". */
	today: string;
}) {
	const convos: Convo[] = contacts
		.filter((c) => c.messages.length > 0)
		.map((c) => ({ ...c, key: c.jid, latest: c.messages[0] }));
	const [open, setOpen] = useState<Set<string>>(new Set());
	const toggle = (key: string) =>
		setOpen((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	function segmentCell(cv: Convo) {
		const l = cv.latest;
		const c = contactByJid[l.wa_jid];
		return (
			<SegmentSelect
				waJid={l.wa_jid}
				segment={c?.segment ?? cv.segment}
				source={c?.segment_source ?? "auto"}
				phone={l.phone}
				name={l.name}
				canManage={canManage}
			/>
		);
	}
	/** Follow-up hanya untuk kontak bernomor HP yang belum booking/batal. */
	function followupCell(c: Convo) {
		if (!c.phone || c.stage === "booking" || c.stage === "batal") return null;
		return (
			<FollowupButton
				jid={c.jid}
				nomor={c.phone}
				nama={c.name ?? "kontak ini"}
				alasan={c.alasan}
				konteks={c.konteks}
				latest={c.followup}
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
			{/* DESKTOP — one row per contact */}
			<div className="hidden overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)] md:block">
				<table className="w-full table-fixed text-sm">
					<colgroup>
						<col style={{ width: "19%" }} />
						<col style={{ width: "11%" }} />
						<col style={{ width: "12%" }} />
						<col />
						<col style={{ width: "11%" }} />
						<col style={{ width: "10%" }} />
						{canManage ? <col style={{ width: "12%" }} /> : null}
					</colgroup>
					<thead className="border-b border-border-default">
						<tr className="text-left text-[12px] font-semibold text-muted-foreground">
							<th className="px-4 py-2.5">Kontak</th>
							<th className="px-4 py-2.5">Segmen</th>
							<th className="px-4 py-2.5">Tahap</th>
							<th className="px-4 py-2.5">Pesan terakhir</th>
							<th className="px-4 py-2.5">Tanggal acara</th>
							<th className="px-4 py-2.5">Chat terakhir</th>
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
									<td className="px-4 py-3 align-top">{segmentCell(c)}</td>
									<td className="px-4 py-3 align-top">
										<StageCell c={c} />
									</td>
									<td className="px-4 py-3 align-top">
										<div className="mb-1">
											<TopicTag topic={l.topic} />
										</div>
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
										<EventDateCell iso={c.eventDate} today={today} />
									</td>
									<td className="px-4 py-3 align-top">
										<div className="flex flex-col items-start gap-1">
											<span className="tabular text-[12.5px] text-muted-foreground">
												{formatReceived(l.received_at)}
											</span>
											{l.is_after_hours ? (
												<span className="text-[11px] text-amber-600 dark:text-amber-500">
													luar jam
												</span>
											) : null}
											<ReplyReceipt
												status={l.reply_status}
												at={l.reply_status_at}
											/>
										</div>
									</td>
									{canManage ? (
										<td className="px-4 py-3 text-right align-top">
											<div className="flex flex-col items-end gap-1">
												{followupCell(c)}
												<PauseContactButton
													waJid={l.wa_jid}
													name={l.name || l.phone}
												/>
											</div>
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
								<div className="flex shrink-0 flex-col items-end gap-1 text-right">
									<StageCell c={c} />
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
								{segmentCell(c)}
								<TopicTag topic={l.topic} />
								<span className="tabular text-[12px] text-muted-foreground">
									{formatReceived(l.received_at)}
								</span>
								{l.is_after_hours ? (
									<span className="text-[11px] text-amber-600 dark:text-amber-500">
										· luar jam
									</span>
								) : null}
								<ReplyReceipt status={l.reply_status} at={l.reply_status_at} />
							</div>
							{c.eventDate ? (
								<p className="text-[12.5px] text-muted-foreground">
									Acara{" "}
									<span className="tabular text-foreground">
										{eventDateLabel(c.eventDate, today).date}
									</span>{" "}
									· {eventDateLabel(c.eventDate, today).rel}
								</p>
							) : null}
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
								<div className="flex items-center justify-end gap-1 border-t border-border-subtle pt-2">
									{followupCell(c)}
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
