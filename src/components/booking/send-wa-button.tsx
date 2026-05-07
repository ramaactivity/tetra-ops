"use client";

import { ChevronDown, MessageCircle } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	buildEventVars,
	type EventForWA,
	substituteVariables,
	whatsappUrl,
} from "@/lib/whatsapp";

export type WhatsAppTemplate = {
	code: string;
	name: string;
	description: string | null;
	template_body: string;
};

export function SendWhatsAppButton({
	event,
	templates,
	size = "default",
}: {
	event: EventForWA;
	templates: WhatsAppTemplate[];
	size?: "default" | "sm";
}) {
	function handleSelect(t: WhatsAppTemplate) {
		const vars = buildEventVars(event);
		const body = substituteVariables(t.template_body, vars);
		const url = whatsappUrl(event.client_wa, body);
		window.open(url, "_blank", "noopener,noreferrer");
	}

	const sizeClass =
		size === "sm"
			? "h-8 px-2.5 text-xs gap-1"
			: "h-9 px-3 text-sm gap-1.5";

	if (templates.length === 0) {
		return (
			<button
				type="button"
				disabled
				className={`border-border bg-card text-muted-foreground inline-flex items-center rounded-md border font-medium ${sizeClass} disabled:cursor-not-allowed disabled:opacity-60`}
				title="Belum ada WA template"
			>
				<MessageCircle className="h-3.5 w-3.5" />
				WA
			</button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={`border-border bg-card hover:bg-muted text-foreground inline-flex items-center rounded-md border font-medium ${sizeClass}`}
			>
				<MessageCircle className="h-3.5 w-3.5" />
				Send WA
				<ChevronDown className="h-3 w-3" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
						Pilih template untuk{" "}
						<span className="text-foreground font-medium">
							{event.client_name}
						</span>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				{templates.map((t) => (
					<DropdownMenuItem
						key={t.code}
						onClick={() => handleSelect(t)}
						className="cursor-pointer"
					>
						<div className="space-y-0.5">
							<div className="text-sm font-medium">{t.name}</div>
							{t.description && (
								<div className="text-muted-foreground text-xs">
									{t.description}
								</div>
							)}
						</div>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
