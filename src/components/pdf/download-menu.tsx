"use client";

import { ChevronDown, FileText } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type PdfMenuOption = {
	label: string;
	href: string;
	hint?: string;
};

/**
 * <PdfDownloadMenu /> — built on the shared base-ui DropdownMenu so the menu
 * renders in a portal (won't clip when the trigger sits inside an
 * overflow-x-auto toolbar, e.g. the event-detail action row).
 */
export function PdfDownloadMenu({
	options,
	label = "PDF",
}: {
	options: PdfMenuOption[];
	label?: string;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="border-border-default bg-card hover:bg-secondary data-[state=open]:bg-secondary text-foreground inline-flex h-8 items-center gap-1.5 rounded-[12px] border px-3 text-[12.5px] font-medium transition-colors">
				<FileText className="size-3.5" />
				{label}
				<ChevronDown className="size-3 opacity-60" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-56">
				{options.map((o) => (
					<DropdownMenuItem
						key={o.href}
						onClick={() =>
							window.open(o.href, "_blank", "noopener,noreferrer")
						}
						className="flex-col items-start gap-0.5"
					>
						<span className="text-foreground text-sm font-medium">
							{o.label}
						</span>
						{o.hint && (
							<span className="text-muted-foreground text-[11px]">{o.hint}</span>
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
