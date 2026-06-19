"use client";

import { Building2, ChevronDown, Clock } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { setContactStatus } from "@/lib/actions/bot-segment";
import { cn } from "@/lib/utils";
import { ContactPhone } from "./contact-phone";
import {
	type ContactRow,
	type ContactStatus,
	formatPhoneHuman,
	type LeadRow,
	relStatusLabel,
	resolveDisplayPhone,
	STATUS_BADGE,
	STATUS_REL_BADGE,
	STATUS_REL_OPTIONS,
	statusLabel,
	topicLabel,
} from "./leads-shared";
import { SegmentSelect } from "./segment-select";

/** A B2B contact enriched with its lead history. */
export type RekananAccount = ContactRow & {
	leads: LeadRow[];
	interactions: number;
	lastTopic: string | null;
};

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString("id-ID", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** Inline relationship-status editor (prospek → aktif → rekanan). */
function StatusSelect({
	waJid,
	status,
	canManage,
}: {
	waJid: string;
	status: string;
	canManage: boolean;
}) {
	const [pending, start] = useTransition();
	const variant = STATUS_REL_BADGE[status] ?? "neutral";

	const badge = <Badge variant={variant}>{relStatusLabel(status)}</Badge>;
	if (!canManage) return badge;

	function handleChange(next: string | null) {
		if (!next || next === status) return;
		start(async () => {
			try {
				await setContactStatus({ waJid, status: next as ContactStatus });
				toast.success(`Status diubah ke ${relStatusLabel(next)}`);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Gagal ubah status");
			}
		});
	}

	return (
		<Select value={status} onValueChange={handleChange} disabled={pending}>
			<SelectTrigger
				aria-label="Ubah status relasi"
				className={cn(
					"h-auto w-fit gap-1 rounded-full border-0 bg-transparent p-0 shadow-none hover:opacity-80 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-60",
					pending && "opacity-60",
				)}
				onClick={(e) => e.stopPropagation()}
			>
				<span className="inline-flex items-center gap-0.5">
					{badge}
					<ChevronDown className="size-3 text-muted-foreground" aria-hidden />
				</span>
			</SelectTrigger>
			<SelectContent>
				{STATUS_REL_OPTIONS.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function AccountCard({
	account,
	canManage,
}: {
	account: RekananAccount;
	canManage: boolean;
}) {
	const [open, setOpen] = useState(false);
	// Title falls back to a REAL phone only — never the raw LID/wa_jid.
	const displayPhone = resolveDisplayPhone(account);
	const title =
		account.org_name?.trim() ||
		account.name?.trim() ||
		(displayPhone ? formatPhoneHuman(displayPhone) : "Tanpa nama");

	return (
		<div className="overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
			{/* Header — click to expand history */}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/30"
			>
				<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
					<Building2 className="size-4" aria-hidden />
				</span>

				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-[14px] font-semibold text-foreground">
							{title}
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<SegmentSelect
							waJid={account.wa_jid}
							segment={account.segment}
							source={account.segment_source}
							phone={account.phone}
							name={account.name}
							canManage={canManage}
						/>
						<StatusSelect
							waJid={account.wa_jid}
							status={account.status}
							canManage={canManage}
						/>
						<ContactPhone phone={account.phone} waJid={account.wa_jid} />
					</div>
				</div>

				<div className="flex shrink-0 flex-col items-end gap-1 text-right">
					<span className="text-[12.5px] font-medium text-foreground">
						{account.interactions.toLocaleString("id-ID")}{" "}
						<span className="font-normal text-muted-foreground">interaksi</span>
					</span>
					<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
						<Clock className="size-3" aria-hidden />
						{formatDate(account.last_seen_at)}
					</span>
				</div>

				<ChevronDown
					className={cn(
						"mt-1.5 size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					aria-hidden
				/>
			</button>

			{/* Expanded — lead / event history */}
			{open ? (
				<div className="border-t border-border-subtle bg-secondary/20 px-4 py-3">
					{account.notes?.trim() ? (
						<p className="mb-3 rounded-lg bg-card px-3 py-2 text-[12.5px] text-muted-foreground">
							{account.notes.trim()}
						</p>
					) : null}
					{account.leads.length === 0 ? (
						<p className="py-1 text-[12.5px] text-muted-foreground">
							Belum ada riwayat interaksi tercatat.
						</p>
					) : (
						<ol className="space-y-2">
							{account.leads.map((l) => (
								<li
									key={l.id}
									className="flex items-start gap-3 rounded-lg bg-card px-3 py-2"
								>
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<div className="flex items-center gap-2">
											<span className="inline-flex h-[20px] items-center rounded-full bg-secondary px-2 text-[11px] font-medium text-foreground/80">
												{topicLabel(l.topic)}
											</span>
											<Badge variant={STATUS_BADGE[l.status] ?? "neutral"}>
												{statusLabel(l.status)}
											</Badge>
										</div>
										{l.message?.trim() ? (
											<p className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">
												{l.message.trim()}
											</p>
										) : null}
									</div>
									<span className="tabular shrink-0 text-[11px] text-muted-foreground">
										{formatDateTime(l.received_at)}
									</span>
								</li>
							))}
						</ol>
					)}
				</div>
			) : null}
		</div>
	);
}

/**
 * <RekananAccounts /> — B2B contacts rendered as expandable accounts.
 *
 * Each card surfaces the editable segment + relationship status, contact link,
 * interaction count and last-seen; expanding reveals the full lead history so an
 * account reads as a relationship, not a one-off lead.
 */
export function RekananAccounts({
	accounts,
	canManage = false,
}: {
	accounts: RekananAccount[];
	canManage?: boolean;
}) {
	return (
		<div className="space-y-2.5">
			{accounts.map((a) => (
				<AccountCard key={a.id} account={a} canManage={canManage} />
			))}
		</div>
	);
}
