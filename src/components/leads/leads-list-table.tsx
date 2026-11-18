"use client";

import { CheckCheck, ChevronDown, Eye } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
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
} from "./leads-shared";
import { PauseContactButton } from "./pause-contact-button";
import { SegmentSelect } from "./segment-select";

/**
 * <LeadsListTable /> — desktop <table> / mobile record-cards.
 *
 * Tiap kontak maksimal dua tingkat teks (owner 18 Nov: "bertumpuk-tumpuk ga
 * jelas"). Satu fakta satu tempat: jumlah pesan = tombol buka riwayat, nomor
 * dokumen = tooltip/tautan di chip tahap, Pause = ikon di samping Follow-up.
 * Riwayat dibuka selebar tabel dan dibaca seperti chat (lama → baru, per hari).
 */

const TZ = "Asia/Jakarta"; // server Vercel = UTC → tanpa ini hydration error #418

function formatReceived(iso: string): string {
	return new Date(iso).toLocaleString("id-ID", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: TZ,
	});
}

const timeOnly = (iso: string) =>
	new Date(iso).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: TZ,
	});

const dayKey = (iso: string) =>
	new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

const dayLabel = (iso: string) =>
	new Date(iso).toLocaleDateString("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "short",
		timeZone: TZ,
	});

/** Tanda-terima balasan bot (sampai / dibaca) — ikon saja, label di tooltip. */
function ReplyReceipt({
	status,
	at,
}: {
	status: string | null;
	at: string | null;
}) {
	const meta = status ? REPLY_STATUS_META[status as ReplyStatus] : undefined;
	if (!meta) return null;
	const label = `Balasan bot ${meta.label.toLowerCase()}${at ? ` ${formatReceived(at)}` : ""}`;
	const Icon = status === "read" ? Eye : CheckCheck;
	return (
		<span
			title={label}
			className={
				status === "read"
					? "inline-flex text-emerald-700 dark:text-emerald-400"
					: "inline-flex text-muted-foreground"
			}
		>
			<Icon className="size-3.5" aria-hidden />
			<span className="sr-only">{label}</span>
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

/** Tanggal acara yang ditanyakan: "Sab, 20 Des" + "32 hari lagi". */
function eventDateLabel(iso: string, today: string) {
	const d = new Date(`${iso}T00:00:00+07:00`);
	const days = Math.round(
		(d.getTime() - new Date(`${today}T00:00:00+07:00`).getTime()) / 86_400_000,
	);
	const date = d.toLocaleDateString("id-ID", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: TZ,
	});
	const rel =
		days < 0 ? "sudah lewat" : days === 0 ? "hari ini" : `${days} hari lagi`;
	return { date, rel, soon: days >= 0 && days <= 30, past: days < 0 };
}

/** Chip tahap; kalau ada dokumen, chip-nya jadi tautan ke dokumen itu. */
function StageCell({ c }: { c: Convo }) {
	const meta = STAGE_META[c.stage];
	const chip = <Badge variant={meta.badge}>{meta.label}</Badge>;
	if (!c.ref) return chip;
	return (
		<Link
			href={c.ref.href}
			title={`Buka ${c.ref.label}`}
			className="inline-flex rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#059669]/40"
		>
			{chip}
			<span className="sr-only">{c.ref.label}</span>
		</Link>
	);
}

function EventDateCell({ iso, today }: { iso: string | null; today: string }) {
	if (!iso)
		return <span className="text-[12.5px] text-muted-foreground/60">—</span>;
	const e = eventDateLabel(iso, today);
	return (
		<div className="flex flex-col gap-0.5 whitespace-nowrap">
			<span
				className={`tabular text-[12.5px] ${e.past ? "text-muted-foreground" : "text-foreground"}`}
			>
				{e.date}
			</span>
			<span
				className={`text-[11.5px] ${e.soon ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
			>
				{e.rel}
			</span>
		</div>
	);
}

/**
 * Riwayat dibaca seperti chat: lama → baru, dikelompokkan per hari, gelembung
 * per pesan. Dibuka di posisi pesan terbaru (bawah).
 */
function ChatHistory({
	messages,
	name,
}: {
	messages: LeadRow[];
	name: string;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = scroller.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, []);
	const asc = [...messages].sort((a, b) =>
		a.received_at.localeCompare(b.received_at),
	);
	const days: Array<{ key: string; label: string; items: LeadRow[] }> = [];
	for (const m of asc) {
		const k = dayKey(m.received_at);
		const last = days[days.length - 1];
		if (last?.key === k) last.items.push(m);
		else days.push({ key: k, label: dayLabel(m.received_at), items: [m] });
	}
	return (
		<div className="space-y-2">
			<p className="text-[12px] text-muted-foreground">
				{messages.length} pesan dari {name} · balasan bot tidak tersimpan di
				sini
			</p>
			<div
				ref={scroller}
				className="max-h-[360px] space-y-3 overflow-y-auto overscroll-contain rounded-xl bg-secondary/40 p-3"
			>
				{days.map((d) => (
					<div key={d.key} className="space-y-1.5">
						<div className="flex justify-center">
							<span className="rounded-full bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-[var(--shadow-level-1)]">
								{d.label}
							</span>
						</div>
						{d.items.map((m) => (
							<div key={m.id} className="flex">
								<div className="max-w-[min(68ch,88%)] rounded-2xl rounded-tl-md bg-card px-3 py-2 shadow-[var(--shadow-level-1)]">
									<p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
										{m.message?.trim() || "—"}
									</p>
									<p className="tabular mt-0.5 text-right text-[11px] text-muted-foreground">
										{timeOnly(m.received_at)}
										{m.is_after_hours ? " · luar jam" : ""}
									</p>
								</div>
							</div>
						))}
					</div>
				))}
			</div>
		</div>
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
	/** Follow-up (kontak bernomor HP, belum booking/batal) + Pause, satu baris. */
	function actions(c: Convo) {
		const l = c.latest;
		return (
			<div className="flex items-center justify-end gap-0.5">
				{c.phone && c.stage !== "booking" && c.stage !== "batal" ? (
					<FollowupButton
						jid={c.jid}
						nomor={c.phone}
						nama={c.name ?? "kontak ini"}
						alasan={c.alasan}
						konteks={c.konteks}
						latest={c.followup}
					/>
				) : null}
				<PauseContactButton
					waJid={l.wa_jid}
					name={l.name || l.phone}
					iconOnly
				/>
			</div>
		);
	}
	function contactCell(c: Convo, big = false) {
		const l = c.latest;
		return (
			<div className="flex min-w-0 flex-col gap-0.5">
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
				<ContactPhone phone={l.phone} waJid={l.wa_jid} />
			</div>
		);
	}
	/** Jumlah pesan = tombol buka riwayat (bukan teks terpisah). */
	function historyToggle(c: Convo) {
		if (c.messages.length < 2) return null;
		const isOpen = open.has(c.key);
		return (
			<button
				type="button"
				onClick={() => toggle(c.key)}
				aria-expanded={isOpen}
				className="tabular inline-flex items-center gap-1 rounded-full text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#059669]/40"
			>
				{isOpen ? "Tutup riwayat" : `${c.messages.length} pesan`}
				<ChevronDown
					className={`size-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
					aria-hidden
				/>
			</button>
		);
	}
	function lastChat(c: Convo) {
		const l = c.latest;
		return (
			<div className="flex flex-col gap-0.5 whitespace-nowrap">
				<span className="tabular inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
					{formatReceived(l.received_at)}
					<ReplyReceipt status={l.reply_status} at={l.reply_status_at} />
				</span>
				{l.is_after_hours ? (
					<span className="text-[11.5px] text-amber-700 dark:text-amber-500">
						luar jam
					</span>
				) : null}
			</div>
		);
	}

	const cols = canManage ? 7 : 6;

	return (
		<>
			{/* DESKTOP — one row per contact */}
			<div className="hidden overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)] md:block">
				<table className="w-full table-fixed text-sm">
					<colgroup>
						<col style={{ width: "17%" }} />
						<col style={{ width: "11%" }} />
						<col style={{ width: "10%" }} />
						<col />
						<col style={{ width: "11%" }} />
						<col style={{ width: "11%" }} />
						{canManage ? <col style={{ width: "15%" }} /> : null}
					</colgroup>
					<thead className="border-b border-border-default">
						<tr className="text-left text-[12px] font-semibold text-muted-foreground">
							<th className="px-4 py-2.5">Kontak</th>
							<th className="px-4 py-2.5">Segmen</th>
							<th className="px-4 py-2.5">Tahap</th>
							<th className="px-4 py-2.5">Pesan terakhir</th>
							<th className="px-4 py-2.5">Acara</th>
							<th className="px-4 py-2.5">Chat terakhir</th>
							{canManage ? (
								<th className="px-4 py-2.5 text-right">Aksi</th>
							) : null}
						</tr>
					</thead>
					<tbody className="divide-y divide-border-subtle">
						{convos.map((c) => {
							const l = c.latest;
							const isOpen = open.has(c.key);
							return (
								<Fragment key={c.key}>
									<tr className="transition-colors hover:bg-secondary/30">
										<td className="px-4 py-3 align-top">{contactCell(c)}</td>
										<td className="px-4 py-3 align-top">{segmentCell(c)}</td>
										<td className="px-4 py-3 align-top">
											<StageCell c={c} />
										</td>
										<td className="px-4 py-3 align-top">
											<p className="line-clamp-2 text-[13px] leading-snug text-foreground/80">
												{l.message?.trim() || "—"}
											</p>
											<div className="mt-1">{historyToggle(c)}</div>
										</td>
										<td className="px-4 py-3 align-top">
											<EventDateCell iso={c.eventDate} today={today} />
										</td>
										<td className="px-4 py-3 align-top">{lastChat(c)}</td>
										{canManage ? (
											<td className="px-3 py-2.5 align-top">{actions(c)}</td>
										) : null}
									</tr>
									{isOpen ? (
										<tr>
											<td colSpan={cols} className="px-4 pb-4 pt-0">
												<ChatHistory
													messages={c.messages}
													name={l.name || "kontak ini"}
												/>
											</td>
										</tr>
									) : null}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>

			{/* MOBILE — one card per contact */}
			<div className="space-y-2.5 md:hidden">
				{convos.map((c) => {
					const l = c.latest;
					const ev = c.eventDate ? eventDateLabel(c.eventDate, today) : null;
					return (
						<div
							key={c.key}
							className="space-y-2 rounded-2xl border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)]"
						>
							<div className="flex items-start justify-between gap-3">
								{contactCell(c, true)}
								<div className="shrink-0">
									<StageCell c={c} />
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
								{segmentCell(c)}
								<span className="tabular inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
									{formatReceived(l.received_at)}
									<ReplyReceipt
										status={l.reply_status}
										at={l.reply_status_at}
									/>
								</span>
							</div>
							{ev ? (
								<p className="text-[12.5px] text-muted-foreground">
									Acara{" "}
									<span className="tabular text-foreground">{ev.date}</span>
									{" · "}
									<span
										className={
											ev.soon
												? "font-medium text-rose-600 dark:text-rose-400"
												: ""
										}
									>
										{ev.rel}
									</span>
								</p>
							) : null}
							{l.message?.trim() ? (
								<p className="line-clamp-2 text-[13px] leading-snug text-foreground/80">
									{l.message.trim()}
								</p>
							) : null}
							{open.has(c.key) ? (
								<ChatHistory
									messages={c.messages}
									name={l.name || "kontak ini"}
								/>
							) : null}
							<div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
								{historyToggle(c) ?? <span />}
								{canManage ? actions(c) : null}
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
}
