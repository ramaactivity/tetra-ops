import { CheckCheck } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * <WhatsAppPreview /> — renders WhatsApp-markup text as it will actually look in
 * a chat, inside an outgoing message bubble. Pairs with <RichTextarea> on
 * message-composition fields so owners SEE the formatting instead of reading
 * raw `*asterisks*`.
 *
 * Supported WA markup: `*bold*`, `_italic_`, `~strike~`, ```monospace```.
 * Plain-text in, styled nodes out — no HTML is stored or sent (WA only accepts
 * its own plain-text markers).
 */

const INLINE_MARKERS: Array<{ re: RegExp; tag: "strong" | "em" | "s" }> = [
	{ re: /\*([^*\n]+)\*/, tag: "strong" },
	{ re: /_([^_\n]+)_/, tag: "em" },
	{ re: /~([^~\n]+)~/, tag: "s" },
];

/** Parse WA markup into React nodes. Mono blocks first (their inner text is not
 * re-parsed), then nestable inline bold/italic/strike. */
function renderWhatsAppMarkup(text: string): ReactNode {
	let keySeq = 0;
	const nextKey = () => keySeq++;

	function inline(input: string, markerIdx: number): ReactNode {
		if (markerIdx >= INLINE_MARKERS.length) return input;
		const { re, tag: Tag } = INLINE_MARKERS[markerIdx];
		const parts = input.split(re);
		if (parts.length === 1) return inline(input, markerIdx + 1);
		const nodes: ReactNode[] = [];
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i % 2 === 1) {
				nodes.push(<Tag key={nextKey()}>{inline(part, markerIdx + 1)}</Tag>);
			} else if (part) {
				nodes.push(
					<Fragment key={nextKey()}>{inline(part, markerIdx + 1)}</Fragment>,
				);
			}
		}
		return nodes;
	}

	const monoParts = text.split(/```([\s\S]+?)```/);
	const out: ReactNode[] = [];
	for (let i = 0; i < monoParts.length; i++) {
		const seg = monoParts[i];
		if (i % 2 === 1) {
			out.push(
				<code
					key={nextKey()}
					className="rounded bg-black/5 px-1 font-mono text-[0.92em] dark:bg-white/10"
				>
					{seg}
				</code>,
			);
		} else if (seg) {
			out.push(<Fragment key={nextKey()}>{inline(seg, 0)}</Fragment>);
		}
	}
	return out;
}

export function WhatsAppPreview({
	text,
	label = "Preview WhatsApp",
	className,
}: {
	text: string | null | undefined;
	label?: string;
	className?: string;
}) {
	const value = (text ?? "").trim();

	return (
		<div className={cn("space-y-1.5", className)}>
			<p className="eyebrow inline-flex items-center gap-1 text-muted-foreground">
				{label}
			</p>
			<div className="overflow-hidden rounded-xl border border-border-subtle">
				<div className="bg-[#efeae2] px-3 py-3 dark:bg-[#0b141a]">
					{value ? (
						<div className="ml-auto w-fit max-w-[88%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-2.5 py-1.5 shadow-sm dark:bg-[#005c4b]">
							<div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#111b21] dark:text-[#e9edef]">
								{renderWhatsAppMarkup(value)}
							</div>
							<div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-[#aebac1]">
								<span>terkirim</span>
								<CheckCheck
									className="size-3.5 text-[#53bdeb]"
									aria-hidden
								/>
							</div>
						</div>
					) : (
						<p className="py-2 text-center text-[12px] text-muted-foreground/70">
							Ketik balasan di atas untuk lihat tampilan WhatsApp-nya.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
