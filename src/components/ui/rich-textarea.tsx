"use client";

import { Bold, Code, Italic, List, Smile, Strikethrough } from "lucide-react";
import {
	type ComponentProps,
	type Ref,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * <RichTextarea /> — the modern, app-wide multi-line text control.
 *
 * Replaces bare `<textarea>` chrome (the "2010 blog" look) with a framed
 * composer: soft card, focus-within ring, autosize, a live character counter,
 * and an optional formatting toolbar.
 *
 * IMPORTANT — WhatsApp-safe by design. Several of these fields are WhatsApp
 * auto-reply / template bodies, and WhatsApp only understands its OWN plain-text
 * markup (`*bold*`, `_italic_`, `~strike~`, ```mono```). So this is NOT an HTML
 * rich-text editor — the underlying value stays plain text and the toolbar just
 * inserts WA markers. That keeps it a drop-in for existing forms: it still
 * renders a real `<textarea>` carrying `name` / `defaultValue` / `value`, so
 * server actions and controlled forms work unchanged.
 *
 * Usage:
 *   - Uncontrolled (server-action form):  <RichTextarea name="x" defaultValue={v} />
 *   - Controlled:                          <RichTextarea value={v} onChange={set} />
 *   - Plain note (no markup toolbar):      <RichTextarea toolbar={false} ... />
 */

export type RichTextareaProps = Omit<
	ComponentProps<"textarea">,
	"onChange" | "value" | "defaultValue"
> & {
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	/** Show the WhatsApp-markup formatting toolbar. Default true. */
	toolbar?: boolean;
	/** Min visible rows before autosize grows it. Default 3. */
	rows?: number;
	/** Forwarded ref to the underlying <textarea> (e.g. for cursor inserts). */
	inputRef?: Ref<HTMLTextAreaElement>;
};

const COMMON_EMOJI = [
	"🙏",
	"😊",
	"🙌",
	"✅",
	"📸",
	"🎉",
	"✨",
	"👍",
	"🔥",
	"❤️",
	"📍",
	"🗓️",
	"⏰",
	"💬",
	"📷",
	"🤝",
];

export function RichTextarea({
	value,
	defaultValue,
	onChange,
	toolbar = true,
	rows = 3,
	maxLength,
	className,
	id,
	disabled,
	inputRef,
	...rest
}: RichTextareaProps) {
	const ref = useRef<HTMLTextAreaElement | null>(null);

	// Merge the internal ref (toolbar ops) with an optional forwarded ref.
	function setRefs(el: HTMLTextAreaElement | null) {
		ref.current = el;
		if (typeof inputRef === "function") inputRef(el);
		else if (inputRef) (inputRef as { current: typeof el }).current = el;
	}
	const reactId = useId();
	const fieldId = id ?? reactId;
	const isControlled = value !== undefined;

	// Length tracked for the counter; works for typing AND programmatic edits
	// (toolbar) because those dispatch a bubbling `input` event we read here.
	const [length, setLength] = useState(
		(isControlled ? value : (defaultValue ?? "")).length,
	);
	const [showEmoji, setShowEmoji] = useState(false);

	function autosize() {
		const el = ref.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}

	// Re-autosize when a controlled value changes from outside.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run on value to fit external updates
	useEffect(() => {
		autosize();
	}, [value]);

	/**
	 * Set the textarea value via the native setter + dispatch a bubbling `input`
	 * event. This makes React's onChange fire (controlled mode) AND any form-level
	 * onChange fire (uncontrolled mode) — one code path for both.
	 */
	function commit(next: string, selStart: number, selEnd: number) {
		const el = ref.current;
		if (!el) return;
		const setter = Object.getOwnPropertyDescriptor(
			HTMLTextAreaElement.prototype,
			"value",
		)?.set;
		setter?.call(el, next);
		el.dispatchEvent(new Event("input", { bubbles: true }));
		// Restore caret/selection after React settles.
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(selStart, selEnd);
			autosize();
		});
	}

	/** Wrap the current selection with `marker` on both sides (WA bold/italic/…). */
	function wrap(marker: string) {
		const el = ref.current;
		if (!el || disabled) return;
		const { selectionStart: s, selectionEnd: e, value: v } = el;
		const sel = v.slice(s, e) || "teks";
		const next = v.slice(0, s) + marker + sel + marker + v.slice(e);
		commit(next, s + marker.length, s + marker.length + sel.length);
	}

	/** Prefix each line in the selection (or the current line) with "• ". */
	function bulletList() {
		const el = ref.current;
		if (!el || disabled) return;
		const { selectionStart: s, selectionEnd: e, value: v } = el;
		const lineStart = v.lastIndexOf("\n", s - 1) + 1;
		const block = v.slice(lineStart, e);
		const bulleted = block
			.split("\n")
			.map((ln) => (ln.startsWith("• ") ? ln : `• ${ln}`))
			.join("\n");
		const next = v.slice(0, lineStart) + bulleted + v.slice(e);
		commit(next, lineStart, lineStart + bulleted.length);
	}

	function insertEmoji(emoji: string) {
		const el = ref.current;
		if (!el || disabled) return;
		const { selectionStart: s, selectionEnd: e, value: v } = el;
		const next = v.slice(0, s) + emoji + v.slice(e);
		commit(next, s + emoji.length, s + emoji.length);
		setShowEmoji(false);
	}

	const tools = toolbar
		? ([
				{ key: "bold", icon: Bold, label: "Tebal", run: () => wrap("*") },
				{ key: "italic", icon: Italic, label: "Miring", run: () => wrap("_") },
				{
					key: "strike",
					icon: Strikethrough,
					label: "Coret",
					run: () => wrap("~"),
				},
				{ key: "mono", icon: Code, label: "Monospace", run: () => wrap("```") },
				{ key: "list", icon: List, label: "Daftar", run: bulletList },
			] as const)
		: [];

	return (
		<div
			className={cn(
				"group w-full rounded-xl border border-border-default bg-background shadow-soft-xs transition-colors focus-within:border-border-strong focus-within:ring-2 focus-within:ring-ring",
				disabled && "cursor-not-allowed opacity-60",
			)}
		>
			{toolbar && (
				<div className="flex items-center gap-0.5 border-b border-border-subtle px-1.5 py-1">
					{tools.map((t) => (
						<button
							key={t.key}
							type="button"
							onClick={t.run}
							disabled={disabled}
							title={t.label}
							aria-label={t.label}
							className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
						>
							<t.icon className="size-4" aria-hidden />
						</button>
					))}
					<div className="relative">
						<button
							type="button"
							onClick={() => setShowEmoji((o) => !o)}
							disabled={disabled}
							title="Emoji"
							aria-label="Emoji"
							aria-expanded={showEmoji}
							className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
						>
							<Smile className="size-4" aria-hidden />
						</button>
						{showEmoji && (
							<>
								<button
									type="button"
									aria-hidden
									tabIndex={-1}
									onClick={() => setShowEmoji(false)}
									className="fixed inset-0 z-40 cursor-default"
								/>
								<div className="absolute left-0 top-9 z-50 grid w-max grid-cols-8 gap-0.5 rounded-xl border border-border-default bg-popover p-1.5 shadow-soft-lg">
									{COMMON_EMOJI.map((em) => (
										<button
											key={em}
											type="button"
											onClick={() => insertEmoji(em)}
											className="inline-flex size-8 items-center justify-center rounded-lg text-lg hover:bg-secondary"
										>
											{em}
										</button>
									))}
								</div>
							</>
						)}
					</div>
					<span className="ml-auto pr-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
						WhatsApp
					</span>
				</div>
			)}

			<textarea
				ref={setRefs}
				id={fieldId}
				rows={rows}
				maxLength={maxLength}
				disabled={disabled}
				{...(isControlled ? { value } : { defaultValue })}
				onChange={(ev) => {
					setLength(ev.target.value.length);
					onChange?.(ev.target.value);
					autosize();
				}}
				className={cn(
					"block max-h-[60vh] min-h-[2.5rem] w-full resize-none bg-transparent px-3.5 py-2.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none md:text-fluid-body",
					className,
				)}
				{...rest}
			/>

			{maxLength ? (
				<div className="flex justify-end px-3 pb-1.5">
					<span
						className={cn(
							"tabular text-[10px] text-muted-foreground/60",
							length >= maxLength && "text-destructive",
						)}
					>
						{length}/{maxLength}
					</span>
				</div>
			) : null}
		</div>
	);
}
