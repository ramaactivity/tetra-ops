"use client";

import { Plus, X } from "lucide-react";
import { useRef } from "react";

/**
 * Daftar "include" paket sebagai poin-poin yang bisa diedit langsung.
 * Enter = poin baru di bawahnya, Backspace di poin kosong = hapus poin.
 */
export function IncludeList({
	value,
	onChange,
	addLabel = "Tambah poin",
}: {
	value: string[];
	onChange: (next: string[]) => void;
	addLabel?: string;
}) {
	const refs = useRef<Array<HTMLTextAreaElement | null>>([]);
	const focus = (i: number) =>
		requestAnimationFrame(() => refs.current[i]?.focus());

	const set = (i: number, text: string) =>
		onChange(value.map((v, j) => (j === i ? text : v)));
	const insertAfter = (i: number) => {
		onChange([...value.slice(0, i + 1), "", ...value.slice(i + 1)]);
		focus(i + 1);
	};
	const remove = (i: number) => {
		onChange(value.filter((_, j) => j !== i));
		focus(Math.max(0, i - 1));
	};

	return (
		<div className="rounded-xl bg-secondary/50 px-2 py-1.5">
			{value.length > 0 ? (
				<ul>
					{value.map((line, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: poin tak punya id; urutan = identitas
							key={i}
							className="group/inc flex items-start gap-2 rounded-lg px-1.5 hover:bg-card focus-within:bg-card"
						>
							<span className="mt-[13px] size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
							<textarea
								ref={(el) => {
									refs.current[i] = el;
								}}
								value={line}
								onChange={(e) => set(i, e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										insertAfter(i);
									} else if (e.key === "Backspace" && line === "") {
										e.preventDefault();
										remove(i);
									}
								}}
								placeholder="Tulis poin…"
								aria-label={`Poin ${i + 1}`}
								rows={1}
								// Poin panjang (S&K) turun baris & memanjang; Enter tetap = poin baru.
								className="field-sizing-content min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-snug text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
							/>
							<button
								type="button"
								onClick={() => remove(i)}
								aria-label="Hapus poin"
								className="mt-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity hover:bg-secondary hover:text-rose-700 group-hover/inc:opacity-100 focus-visible:opacity-100"
							>
								<X className="size-3.5" />
							</button>
						</li>
					))}
				</ul>
			) : null}
			<button
				type="button"
				onClick={() => insertAfter(value.length - 1)}
				className="mt-0.5 inline-flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-card hover:text-foreground"
			>
				<Plus className="size-3.5" />
				{addLabel}
			</button>
		</div>
	);
}
