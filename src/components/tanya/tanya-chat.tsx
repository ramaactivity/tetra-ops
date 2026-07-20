"use client";

import { ArrowUp, Loader2, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MessageText } from "@/components/tanya/message-text";
import { Button } from "@/components/ui/button";
import { RichTextarea } from "@/components/ui/rich-textarea";
import type { AiChatMessage, AiStreamEvent } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

/**
 * <TanyaChat /> — antarmuka chat "Tanya Tetra".
 *
 * Membaca stream NDJSON dari POST /api/ai/chat dan menggambar tiap event:
 * "text" ditambahkan ke jawaban yang sedang tumbuh, "tool" jadi indikator
 * "sedang cek data", "error" jadi gelembung merah.
 */

const SARAN_OWNER = [
	"Minggu ini ada acara apa saja?",
	"Siapa yang belum lunas?",
	"Saldo kas sekarang berapa?",
	"Ada stok yang mau habis?",
];

const SARAN_CREW = [
	"Minggu ini ada acara apa saja?",
	"Aku pegang acara apa besok?",
	"Ada stok yang mau habis?",
];

type Msg = AiChatMessage & { error?: boolean };

export function TanyaChat({ isOwner }: { isOwner: boolean }) {
	const [messages, setMessages] = useState<Msg[]>([]);
	const [input, setInput] = useState("");
	const [streaming, setStreaming] = useState(false);
	const [partial, setPartial] = useState("");
	const [toolLabel, setToolLabel] = useState<string | null>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Selalu tempel ke bawah selama jawaban tumbuh. Ketiga dependency dipakai
	// sebagai PEMICU (tidak dibaca di dalam efek): tiap kali pesan bertambah,
	// teks tumbuh, atau indikator tool muncul, tinggi konten berubah.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pemicu scroll, lihat di atas
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, partial, toolLabel]);

	async function send(text: string) {
		const question = text.trim();
		if (!question || streaming) return;

		const next: Msg[] = [...messages, { role: "user", content: question }];
		setMessages(next);
		setInput("");
		setPartial("");
		setToolLabel(null);
		setStreaming(true);

		const controller = new AbortController();
		abortRef.current = controller;

		let acc = "";
		let failed: string | null = null;

		try {
			const res = await fetch("/api/ai/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				signal: controller.signal,
				body: JSON.stringify({
					messages: next.map((m) => ({ role: m.role, content: m.content })),
				}),
			});

			if (!res.ok || !res.body) {
				const body = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				failed = body?.error ?? "Gagal menghubungi asisten.";
			} else {
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					// NDJSON: baris terakhir bisa terpotong — sisakan di buffer.
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						if (!line.trim()) continue;
						let ev: AiStreamEvent;
						try {
							ev = JSON.parse(line) as AiStreamEvent;
						} catch {
							continue;
						}
						if (ev.type === "text") {
							acc += ev.value;
							setToolLabel(null);
							setPartial(acc);
						} else if (ev.type === "tool") {
							setToolLabel(ev.label);
						} else if (ev.type === "error") {
							failed = ev.message;
						}
					}
				}
			}
		} catch (err) {
			if ((err as Error)?.name !== "AbortError") {
				failed = "Koneksi terputus. Coba lagi ya.";
			}
		} finally {
			abortRef.current = null;
			setStreaming(false);
			setToolLabel(null);
			setPartial("");
			setMessages((prev) => {
				const out = [...prev];
				if (acc.trim()) out.push({ role: "assistant", content: acc });
				if (failed)
					out.push({ role: "assistant", content: failed, error: true });
				return out;
			});
			textareaRef.current?.focus();
		}
	}

	function stop() {
		abortRef.current?.abort();
	}

	const saran = isOwner ? SARAN_OWNER : SARAN_CREW;
	const kosong = messages.length === 0 && !streaming;

	return (
		<div className="flex h-[calc(100dvh-12rem)] min-h-[420px] flex-col gap-3 md:h-[calc(100dvh-10rem)]">
			<div
				ref={scrollRef}
				className="scrollbar-vercel flex-1 overflow-y-auto rounded-2xl border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)] md:p-5"
			>
				{kosong ? (
					<div className="flex h-full flex-col items-center justify-center gap-4 text-center">
						<span className="flex size-11 items-center justify-center rounded-full bg-secondary">
							<Sparkles className="size-5 text-foreground" strokeWidth={1.85} />
						</span>
						<div className="flex flex-col gap-1">
							<p className="type-heading text-foreground">
								Ada yang mau ditanya?
							</p>
							<p className="type-secondary max-w-sm">
								Aku bisa lihat jadwal acara
								{isOwner ? ", keuangan," : ""} dan stok gudang Tetra — langsung
								dari data yang ada di sini.
							</p>
						</div>
						<div className="flex flex-wrap justify-center gap-2">
							{saran.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => send(s)}
									className="press-sm rounded-full border border-border-default bg-secondary px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								>
									{s}
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{messages.map((m, i) => (
							<Bubble
								// biome-ignore lint/suspicious/noArrayIndexKey: pesan hanya ditambah di akhir
								key={i}
								message={m}
							/>
						))}
						{toolLabel ? (
							<div className="flex items-center gap-2 text-muted-foreground">
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
								<span className="type-secondary">{toolLabel}…</span>
							</div>
						) : null}
						{partial ? (
							<Bubble message={{ role: "assistant", content: partial }} />
						) : null}
						{streaming && !partial && !toolLabel ? (
							<div className="flex items-center gap-2 text-muted-foreground">
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
								<span className="type-secondary">Sebentar…</span>
							</div>
						) : null}
					</div>
				)}
			</div>

			{/* Composer = RichTextarea (toolbar mati). Jangan pernah pasang
			    <textarea> telanjang — lihat DESIGN.md §5. */}
			<div className="flex items-end gap-2">
				<div className="min-w-0 flex-1">
					<RichTextarea
						toolbar={false}
						rows={1}
						value={input}
						onChange={setInput}
						inputRef={textareaRef}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								send(input);
							}
						}}
						placeholder="Tanya apa saja… (Enter kirim, Shift+Enter baris baru)"
						disabled={streaming}
					/>
				</div>
				{streaming ? (
					<Button
						type="button"
						size="icon"
						variant="secondary"
						onClick={stop}
						aria-label="Hentikan"
					>
						<Square className="size-3.5 fill-current" aria-hidden />
					</Button>
				) : (
					<Button
						type="button"
						size="icon"
						onClick={() => send(input)}
						disabled={!input.trim()}
						aria-label="Kirim"
					>
						<ArrowUp className="size-4" aria-hidden />
					</Button>
				)}
			</div>

			<p className="type-caption px-1 text-center text-muted-foreground">
				Asisten bisa keliru — untuk keputusan penting, cek lagi di halaman
				aslinya.
			</p>
		</div>
	);
}

function Bubble({ message }: { message: Msg }) {
	if (message.role === "user") {
		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-[15px] leading-snug text-primary-foreground">
					{message.content}
				</div>
			</div>
		);
	}
	return (
		<div className="flex justify-start">
			<div
				className={cn(
					"max-w-[92%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
					message.error
						? "bg-rose-100 text-rose-700"
						: "bg-secondary text-foreground",
				)}
			>
				<MessageText text={message.content} />
			</div>
		</div>
	);
}
