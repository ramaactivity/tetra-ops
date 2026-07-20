"use client";

import {
	ArrowUp,
	Check,
	Copy,
	Database,
	RotateCcw,
	Sparkles,
	Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageText } from "@/components/tanya/message-text";
import { Button } from "@/components/ui/button";
import { RichTextarea } from "@/components/ui/rich-textarea";
import type { AiChatMessage, AiStreamEvent } from "@/lib/ai/types";

/**
 * <TanyaChat /> — antarmuka chat "Tanya Tetra".
 *
 * Membaca stream NDJSON dari POST /api/ai/chat. Tiga hal yang disengaja:
 *  1. Jawaban asisten TIDAK dibungkus gelembung — sebagian besar jawaban di
 *     sini adalah daftar angka; teks lebar penuh jauh lebih enak dipindai
 *     daripada balon abu-abu yang menyempit.
 *  2. Sumber data ditampilkan di bawah jawaban. Ini aplikasi pembukuan —
 *     owner harus bisa melihat angka itu dibaca dari mana, bukan percaya buta.
 *  3. Auto-scroll hanya kalau pandangan sudah di dekat bawah, supaya membaca
 *     jawaban panjang tidak direbut paksa saat teks masih tumbuh.
 */

const SARAN_OWNER = [
	"Minggu ini ada acara apa saja?",
	"Siapa yang belum lunas?",
	"Saldo kas sekarang berapa?",
	"Ada stok yang mau habis?",
	"Gimana performa bulan ini?",
];

const SARAN_CREW = [
	"Minggu ini ada acara apa saja?",
	"Acara terdekat di mana lokasinya?",
	"Ada stok yang mau habis?",
	"Alat apa yang lagi rusak?",
];

type Msg = AiChatMessage & {
	error?: boolean;
	/** Sumber data yang dibaca untuk menyusun jawaban ini. */
	sources?: string[];
};

export function TanyaChat({ isOwner }: { isOwner: boolean }) {
	const [messages, setMessages] = useState<Msg[]>([]);
	const [input, setInput] = useState("");
	const [streaming, setStreaming] = useState(false);
	const [partial, setPartial] = useState("");
	const [activeSource, setActiveSource] = useState<string | null>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	/** Pandangan sedang menempel di bawah? Menentukan boleh auto-scroll. */
	const stickToBottom = useRef(true);

	const onScroll = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const jarak = el.scrollHeight - el.scrollTop - el.clientHeight;
		stickToBottom.current = jarak < 120;
	}, []);

	// Dependency dipakai sebagai PEMICU (tidak dibaca di dalam efek): tiap kali
	// pesan bertambah / teks tumbuh / indikator sumber muncul, tinggi berubah.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pemicu scroll
	useEffect(() => {
		if (!stickToBottom.current) return;
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, partial, activeSource]);

	// Esc menghentikan jawaban yang sedang mengalir.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape" && abortRef.current) abortRef.current.abort();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	async function send(text: string) {
		const question = text.trim();
		if (!question || streaming) return;

		const next: Msg[] = [...messages, { role: "user", content: question }];
		setMessages(next);
		setInput("");
		setPartial("");
		setActiveSource(null);
		setStreaming(true);
		stickToBottom.current = true;

		const controller = new AbortController();
		abortRef.current = controller;

		let acc = "";
		let failed: string | null = null;
		const sources: string[] = [];

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
							setActiveSource(null);
							setPartial(acc);
						} else if (ev.type === "tool") {
							if (!sources.includes(ev.label)) sources.push(ev.label);
							setActiveSource(ev.label);
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
			setActiveSource(null);
			setPartial("");
			setMessages((prev) => {
				const out = [...prev];
				if (acc.trim()) {
					out.push({ role: "assistant", content: acc, sources });
				}
				if (failed) {
					out.push({ role: "assistant", content: failed, error: true });
				}
				return out;
			});
			inputRef.current?.focus();
		}
	}

	const saran = isOwner ? SARAN_OWNER : SARAN_CREW;
	const kosong = messages.length === 0 && !streaming;

	return (
		// Tinggi disamakan dengan ruang tersisa di <main>: 100dvh dikurangi
		// padding frame (12+12), topbar (60), gap (12) — dan di mobile ditambah
		// bottom nav (56). Kalau tinggi topbar berubah, angka ini ikut berubah.
		<div className="flex h-[calc(100dvh-9.5rem)] min-h-[440px] flex-col gap-3 md:h-[calc(100dvh-6rem)]">
			<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
				<header className="flex shrink-0 items-center gap-2.5 border-b border-border-subtle px-4 py-3 md:px-6">
					<span className="flex size-7 items-center justify-center rounded-full bg-emerald-500/12">
						<Sparkles
							className="size-4 text-emerald-700 dark:text-emerald-400"
							strokeWidth={1.9}
							aria-hidden
						/>
					</span>
					<div className="flex min-w-0 flex-col">
						<span className="type-body-strong leading-tight text-foreground">
							Tanya Tetra
						</span>
						<span className="type-caption leading-tight text-muted-foreground">
							Menjawab dari data Tetra yang sebenarnya
						</span>
					</div>
					{messages.length > 0 ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="ml-auto"
							onClick={() => {
								abortRef.current?.abort();
								setMessages([]);
								setPartial("");
								inputRef.current?.focus();
							}}
						>
							<RotateCcw className="size-3.5" aria-hidden />
							Obrolan baru
						</Button>
					) : null}
				</header>

				<div
					ref={scrollRef}
					onScroll={onScroll}
					className="scrollbar-vercel min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6"
				>
					{kosong ? (
						<EmptyState
							isOwner={isOwner}
							saran={saran}
							onPick={(s) => send(s)}
						/>
					) : (
						<div className="mx-auto flex max-w-3xl flex-col gap-6">
							{messages.map((m, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: pesan hanya ditambah di akhir
								<Bubble key={i} message={m} />
							))}
							{partial ? (
								<Bubble
									message={{ role: "assistant", content: partial }}
									streaming
								/>
							) : null}
							{/* Tampil juga saat AI mengambil data LAGI di tengah jawaban
						    (partial sudah terisi). Kalau syaratnya hanya `!partial`,
						    ronde tool kedua terlihat seperti menggantung tanpa sebab. */}
							{streaming && (activeSource || !partial) ? (
								<Thinking label={activeSource} />
							) : null}
						</div>
					)}
				</div>
			</div>

			{/* Composer — RichTextarea menyediakan frame + focus ring + autosize;
			    tombol kirim diletakkan DI DALAM frame itu supaya terbaca sebagai
			    satu kontrol, bukan dua kotak yang berdampingan. Jangan ganti
			    dengan <textarea> telanjang (DESIGN.md §5). */}
			<div className="relative shrink-0">
				<RichTextarea
					toolbar={false}
					rows={1}
					value={input}
					onChange={setInput}
					inputRef={inputRef}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							send(input);
						}
					}}
					placeholder={
						isOwner
							? "Tanya soal acara, keuangan, atau stok…"
							: "Tanya soal acara atau stok…"
					}
					disabled={streaming}
					// Ruang untuk tombol kirim: 32px tombol + 6px jarak kanan + napas.
					className="pr-12"
				/>
				{/* bottom-1 = 4px: frame RichTextarea tingginya minimal 40px dan
				    tombolnya 32px, jadi 4px atas-bawah membuatnya benar-benar
				    terpusat saat satu baris, lalu menempel ke bawah saat tumbuh. */}
				<div className="absolute bottom-1 right-1.5">
					{streaming ? (
						<Button
							type="button"
							size="icon"
							variant="secondary"
							onClick={() => abortRef.current?.abort()}
							title="Hentikan (Esc)"
							aria-label="Hentikan"
						>
							<Square className="size-3 fill-current" aria-hidden />
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
			</div>

			<p className="type-caption shrink-0 text-center text-muted-foreground">
				Asisten bisa keliru — untuk keputusan penting, cek lagi di halaman
				aslinya.
			</p>
		</div>
	);
}

function EmptyState({
	isOwner,
	saran,
	onPick,
}: {
	isOwner: boolean;
	saran: string[];
	onPick: (s: string) => void;
}) {
	return (
		<div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-5 text-center">
			<span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/12">
				<Sparkles
					className="size-6 text-emerald-700 dark:text-emerald-400"
					strokeWidth={1.7}
					aria-hidden
				/>
			</span>
			<div className="flex flex-col gap-1.5">
				<h2 className="type-title text-foreground">Ada yang mau ditanya?</h2>
				<p className="type-secondary">
					Aku bisa lihat jadwal acara{isOwner ? ", keuangan," : ""} dan stok
					gudang Tetra — jawabannya diambil langsung dari data di aplikasi ini,
					bukan karangan.
				</p>
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				{saran.map((s) => (
					<button
						key={s}
						type="button"
						onClick={() => onPick(s)}
						className="press-sm rounded-full border border-border-default bg-card px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
					>
						{s}
					</button>
				))}
			</div>
		</div>
	);
}

function Thinking({ label }: { label: string | null }) {
	return (
		<div className="flex items-center gap-2.5">
			<Avatar />
			<span className="type-secondary flex items-center gap-1.5 text-muted-foreground">
				{label ? (
					<>
						<Database className="size-3.5" aria-hidden />
						Membaca {label}
					</>
				) : (
					"Sebentar"
				)}
				<Dots />
			</span>
		</div>
	);
}

/** Tiga titik berdenyut — tanda hidup tanpa spinner yang berisik. */
function Dots() {
	return (
		<span className="inline-flex gap-0.5" aria-hidden>
			{[0, 150, 300].map((d) => (
				<span
					key={d}
					className="size-1 animate-pulse rounded-full bg-current"
					style={{ animationDelay: `${d}ms` }}
				/>
			))}
		</span>
	);
}

function Avatar() {
	return (
		<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/12">
			<Sparkles
				className="size-3.5 text-emerald-700 dark:text-emerald-400"
				strokeWidth={2}
				aria-hidden
			/>
		</span>
	);
}

function Bubble({ message, streaming }: { message: Msg; streaming?: boolean }) {
	const [copied, setCopied] = useState(false);

	if (message.role === "user") {
		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-[16px] rounded-br-[6px] bg-primary px-4 py-2.5 text-[15px] leading-snug text-primary-foreground">
					{message.content}
				</div>
			</div>
		);
	}

	if (message.error) {
		return (
			<div className="flex items-start gap-2.5">
				<Avatar />
				<p className="rounded-[12px] bg-rose-100 px-3 py-2 text-[14.5px] leading-snug text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
					{message.content}
				</p>
			</div>
		);
	}

	return (
		<div className="group/msg flex items-start gap-2.5">
			<Avatar />
			<div className="min-w-0 flex-1">
				<div className="text-[15px] leading-relaxed text-foreground">
					<MessageText text={message.content} />
					{streaming ? (
						<span
							className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-foreground align-text-bottom"
							aria-hidden
						/>
					) : null}
				</div>

				{!streaming && message.sources && message.sources.length > 0 ? (
					<p className="type-caption mt-2 flex items-center gap-1.5 text-muted-foreground">
						<Database className="size-3" aria-hidden />
						Dibaca dari: {message.sources.join(", ")}
					</p>
				) : null}

				{!streaming ? (
					<button
						type="button"
						onClick={() => {
							navigator.clipboard?.writeText(message.content);
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						}}
						className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
					>
						{copied ? (
							<>
								<Check className="size-3" aria-hidden /> Tersalin
							</>
						) : (
							<>
								<Copy className="size-3" aria-hidden /> Salin
							</>
						)}
					</button>
				) : null}
			</div>
		</div>
	);
}
