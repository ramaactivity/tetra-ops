import { EyeOff } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp";
import { cn } from "@/lib/utils";
import { formatPhoneHuman, resolveDisplayPhone } from "./leads-shared";

/**
 * <ContactPhone /> — renders a WhatsApp contact's number the SAFE way.
 *
 * If a real phone is known (`resolveDisplayPhone`), shows it as a wa.me link.
 * If only a LID is stored (WhatsApp privacy identity, a 15–16 digit value that
 * is NOT a phone), shows a quiet "nomor tersembunyi (LID)" label with no link —
 * never formatting the LID as if it were a phone number.
 * See WHATSAPP_BOT_LID_DISPLAY_NOTE.
 */
export function ContactPhone({
	phone,
	waJid,
	className,
}: {
	phone?: string | null;
	waJid?: string | null;
	className?: string;
}) {
	const display = resolveDisplayPhone({ phone, wa_jid: waJid });

	if (!display) {
		return (
			<span
				className={cn(
					"inline-flex w-fit items-center gap-1.5 text-[11.5px] text-muted-foreground/60",
					className,
				)}
				title="WhatsApp menyembunyikan nomor asli (LID) — tak bisa di-chat langsung"
			>
				<EyeOff className="size-3.5 shrink-0" aria-hidden />
				nomor tersembunyi (LID)
			</span>
		);
	}

	return (
		<a
			href={`https://wa.me/${display}`}
			target="_blank"
			rel="noopener noreferrer"
			onClick={(e) => e.stopPropagation()}
			title="Chat via WhatsApp"
			className={cn(
				"group/wa inline-flex w-fit items-center gap-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground",
				className,
			)}
		>
			<WhatsAppIcon className="size-3.5 shrink-0 text-[#25D366]" />
			<span className="tabular group-hover/wa:underline">
				{formatPhoneHuman(display)}
			</span>
		</a>
	);
}
