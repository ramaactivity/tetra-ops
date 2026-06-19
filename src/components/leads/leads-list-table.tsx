"use client";

import { WhatsAppIcon } from "@/components/icons/whatsapp";
import { Badge } from "@/components/ui/badge";
import {
	formatPhoneHuman,
	type LeadRow,
	STATUS_BADGE,
	statusLabel,
	topicLabel,
	waMePhone,
} from "./leads-shared";
import { PauseContactButton } from "./pause-contact-button";

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

function PhoneLink({ phone }: { phone: string }) {
	return (
		<a
			href={`https://wa.me/${waMePhone(phone)}`}
			target="_blank"
			rel="noopener noreferrer"
			onClick={(e) => e.stopPropagation()}
			title="Chat via WhatsApp"
			className="group/wa inline-flex w-fit items-center gap-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
		>
			<WhatsAppIcon className="size-3.5 shrink-0 text-[#25D366]" />
			<span className="tabular group-hover/wa:underline">
				{formatPhoneHuman(phone)}
			</span>
		</a>
	);
}

export function LeadsListTable({
	leads,
	canManage = false,
}: {
	leads: LeadRow[];
	/** Owner / super_admin → show the per-contact pause action. */
	canManage?: boolean;
}) {
	return (
		<>
			{/* DESKTOP — real table, Asset & Design chrome */}
			<div className="hidden overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)] md:block">
				<table className="w-full table-fixed text-sm">
					<colgroup>
						<col style={{ width: "20%" }} />
						<col style={{ width: "11%" }} />
						<col />
						<col style={{ width: "15%" }} />
						<col style={{ width: "12%" }} />
						{canManage ? <col style={{ width: "9%" }} /> : null}
					</colgroup>
					<thead className="border-b border-border-default">
						<tr className="text-left">
							<th className="eyebrow px-4 py-2.5">Kontak</th>
							<th className="eyebrow px-4 py-2.5">Topik</th>
							<th className="eyebrow px-4 py-2.5">Pesan</th>
							<th className="eyebrow px-4 py-2.5">Waktu</th>
							<th className="eyebrow px-4 py-2.5">Status</th>
							{canManage ? (
								<th className="eyebrow px-4 py-2.5 text-right">Aksi</th>
							) : null}
						</tr>
					</thead>
					<tbody className="divide-y divide-border-subtle">
						{leads.map((l) => (
							<tr key={l.id} className="transition-colors hover:bg-secondary/30">
								<td className="px-4 py-3 align-top">
									<div className="flex min-w-0 flex-col gap-0.5">
										{l.name ? (
											<span className="truncate text-[13px] font-medium text-foreground">
												{l.name}
											</span>
										) : (
											<span className="text-[13px] text-muted-foreground/70">
												Tanpa nama
											</span>
										)}
										<PhoneLink phone={l.phone} />
									</div>
								</td>
								<td className="px-4 py-3 align-top">
									<TopicTag topic={l.topic} />
								</td>
								<td className="px-4 py-3 align-top">
									<p className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">
										{l.message?.trim() || "—"}
									</p>
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
									<Badge variant={STATUS_BADGE[l.status] ?? "neutral"}>
										{statusLabel(l.status)}
									</Badge>
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
						))}
					</tbody>
				</table>
			</div>

			{/* MOBILE — record-card stack */}
			<div className="space-y-2.5 md:hidden">
				{leads.map((l) => (
					<div
						key={l.id}
						className="space-y-2.5 rounded-2xl border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)]"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="flex min-w-0 flex-col gap-0.5">
								{l.name ? (
									<span className="truncate text-[14px] font-semibold text-foreground">
										{l.name}
									</span>
								) : (
									<span className="text-[14px] text-muted-foreground/70">
										Tanpa nama
									</span>
								)}
								<PhoneLink phone={l.phone} />
							</div>
							<Badge variant={STATUS_BADGE[l.status] ?? "neutral"}>
								{statusLabel(l.status)}
							</Badge>
						</div>

						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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

						{canManage ? (
							<div className="flex justify-end border-t border-border-subtle pt-2">
								<PauseContactButton
									waJid={l.wa_jid}
									name={l.name || l.phone}
								/>
							</div>
						) : null}
					</div>
				))}
			</div>
		</>
	);
}
