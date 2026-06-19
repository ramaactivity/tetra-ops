"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { setContactSegment } from "@/lib/actions/bot-segment";
import { cn } from "@/lib/utils";
import {
	type ContactSegment,
	SEGMENT_BADGE,
	SEGMENT_OPTIONS,
	segmentLabel,
} from "./leads-shared";

/**
 * <SegmentSelect /> — per-contact segment badge that doubles as an editor.
 *
 * Read-only viewers see a plain badge. Owners get a dropdown; picking a segment
 * stamps segment_source='manual' (the bot then honours it ≤60s). The `auto`
 * indicator (small ✨) marks a bot guess vs an admin decision.
 */
export function SegmentSelect({
	waJid,
	segment,
	source,
	phone,
	name,
	canManage = false,
}: {
	waJid: string;
	segment: string;
	source: string;
	phone?: string | null;
	name?: string | null;
	canManage?: boolean;
}) {
	const [pending, start] = useTransition();
	const isAuto = source === "auto";
	const variant = SEGMENT_BADGE[segment] ?? "neutral";

	function badge() {
		return (
			<Badge variant={variant} className="gap-1">
				{segmentLabel(segment, true)}
				{isAuto ? (
					<Sparkles
						className="size-2.5 opacity-60"
						aria-label="Tebakan otomatis bot"
					/>
				) : null}
			</Badge>
		);
	}

	if (!canManage) return badge();

	function handleChange(next: string | null) {
		if (!next || next === segment) return;
		start(async () => {
			try {
				await setContactSegment({
					waJid,
					segment: next as ContactSegment,
					phone: phone ?? undefined,
					name: name ?? undefined,
				});
				toast.success(`Segmen diubah ke ${segmentLabel(next)}`);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Gagal ubah segmen");
			}
		});
	}

	return (
		<Select value={segment} onValueChange={handleChange} disabled={pending}>
			<SelectTrigger
				aria-label="Ubah segmen kontak"
				className={cn(
					"h-auto w-fit gap-1 rounded-full border-0 bg-transparent p-0 shadow-none hover:opacity-80 focus-visible:ring-0 [&>svg]:hidden disabled:opacity-60",
					pending && "opacity-60",
				)}
				onClick={(e) => e.stopPropagation()}
			>
				<span className="inline-flex items-center gap-0.5">
					{badge()}
					<ChevronDown className="size-3 text-muted-foreground" aria-hidden />
				</span>
			</SelectTrigger>
			<SelectContent>
				{SEGMENT_OPTIONS.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
