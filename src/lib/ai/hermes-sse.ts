import type { AiStreamEvent } from "@/lib/ai/types";

/**
 * Pembaca SSE + pemetaan frame Hermes → event stream Tanya Tetra. Modul
 * polos (tanpa server-only) supaya bisa diuji dengan node --test.
 *
 * Format dari Hermes API server (/v1/chat/completions, stream=true):
 *   data: {chat.completion.chunk}          → delta.content = potongan teks
 *   event: hermes.tool.progress / data: {…} → {tool, label, status}
 *   event: hermes.status                    → diabaikan
 *   : keepalive                             → komentar, diabaikan
 *   data: [DONE]
 */

export type SseFrame = { event: string; data: string };

export async function* parseSse(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	let event = "message";
	let data: string[] = [];

	const takeFrame = (): SseFrame | null => {
		if (data.length === 0) {
			event = "message";
			return null;
		}
		const frame = { event, data: data.join("\n") };
		event = "message";
		data = [];
		return frame;
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		let nl = buf.indexOf("\n");
		while (nl >= 0) {
			let line = buf.slice(0, nl);
			buf = buf.slice(nl + 1);
			nl = buf.indexOf("\n");
			if (line.endsWith("\r")) line = line.slice(0, -1);
			if (line === "") {
				const f = takeFrame();
				if (f) yield f;
				continue;
			}
			if (line.startsWith(":")) continue;
			const colon = line.indexOf(":");
			const field = colon < 0 ? line : line.slice(0, colon);
			let val = colon < 0 ? "" : line.slice(colon + 1);
			if (val.startsWith(" ")) val = val.slice(1);
			if (field === "event") event = val;
			else if (field === "data") data.push(val);
		}
	}
	const last = takeFrame();
	if (last) yield last;
}

/** `mcp__tetra_ops__cari_event` → `cari_event`; tool bawaan Hermes apa adanya. */
export function stripHermesToolPrefix(name: string): string {
	return name.replace(/^mcp__[a-z0-9_]+?__/, "");
}

export type HermesFrameResult = {
	events: AiStreamEvent[];
	/** finish_reason dari chunk terakhir, kalau ada. */
	finishReason?: string;
};

export function hermesFrameToEvents(
	frame: SseFrame,
	label: (toolName: string) => string,
): HermesFrameResult {
	if (frame.data === "[DONE]") return { events: [] };
	let json: Record<string, unknown>;
	try {
		json = JSON.parse(frame.data) as Record<string, unknown>;
	} catch {
		return { events: [] };
	}

	if (frame.event === "hermes.tool.progress") {
		if (json.status !== "running") return { events: [] };
		const name = stripHermesToolPrefix(String(json.tool ?? ""));
		if (!name) return { events: [] };
		return { events: [{ type: "tool", name, label: label(name) }] };
	}
	if (frame.event !== "message") return { events: [] };

	const choice = (
		json.choices as Array<Record<string, unknown>> | undefined
	)?.[0];
	const delta = choice?.delta as Record<string, unknown> | undefined;
	const events: AiStreamEvent[] = [];
	if (typeof delta?.content === "string" && delta.content) {
		events.push({ type: "text", value: delta.content });
	}
	const finishReason =
		typeof choice?.finish_reason === "string"
			? choice.finish_reason
			: undefined;
	return finishReason ? { events, finishReason } : { events };
}

// ── Streaming ke Hermes API server ────────────────────────────────────────

export type HermesEndpoint = { baseUrl: string; apiKey: string; model: string };

export type StreamHermesOpts = {
	endpoint: HermesEndpoint;
	system: string;
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	/** Nama tool → label manusiawi untuk indikator "Membaca …". */
	label: (toolName: string) => string;
	signal?: AbortSignal;
	/** Batas menunggu header respons (model mulai bicara). Lewat ini → lempar. */
	connectTimeoutMs?: number;
};

/**
 * Kirim percakapan ke Hermes dan yield event Tanya Tetra. Melempar kalau
 * gagal SEBELUM ada teks (HTTP error, timeout, finish_reason gagal, kosong)
 * supaya pemanggil bisa jatuh ke Gemini; sesudah ada teks, kegagalan
 * dilaporkan sebagai event error.
 */
export async function* streamHermes(
	opts: StreamHermesOpts,
): AsyncGenerator<AiStreamEvent> {
	const { endpoint, signal } = opts;
	const ctrl = new AbortController();
	const onAbort = () => ctrl.abort();
	signal?.addEventListener("abort", onAbort);
	const timer = setTimeout(() => ctrl.abort(), opts.connectTimeoutMs ?? 20_000);

	let res: Response;
	try {
		res = await fetch(`${endpoint.baseUrl}/v1/chat/completions`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${endpoint.apiKey}`,
				"content-type": "application/json",
				accept: "text/event-stream",
			},
			body: JSON.stringify({
				model: endpoint.model,
				stream: true,
				messages: [{ role: "system", content: opts.system }, ...opts.messages],
			}),
			signal: ctrl.signal,
		});
	} catch (e) {
		signal?.removeEventListener("abort", onAbort);
		if (signal?.aborted) throw e;
		throw new Error(
			`Hermes tidak terjangkau: ${e instanceof Error ? e.message : String(e)}`,
		);
	} finally {
		clearTimeout(timer);
	}
	if (!res.ok || !res.body) {
		signal?.removeEventListener("abort", onAbort);
		throw new Error(`Hermes HTTP ${res.status}`);
	}

	const toolsUsed: string[] = [];
	let sawText = false;
	try {
		for await (const frame of parseSse(res.body)) {
			const { events, finishReason } = hermesFrameToEvents(frame, opts.label);
			for (const ev of events) {
				if (ev.type === "text") sawText = true;
				if (ev.type === "tool" && !toolsUsed.includes(ev.name)) {
					toolsUsed.push(ev.name);
				}
				yield ev;
			}
			if (finishReason && finishReason !== "stop") {
				if (!sawText) throw new Error(`Hermes finish_reason=${finishReason}`);
				yield {
					type: "error",
					message: "Jawaban terhenti di tengah jalan. Coba tanya lagi.",
				};
			}
		}
	} finally {
		signal?.removeEventListener("abort", onAbort);
	}
	if (!sawText) throw new Error("Hermes tidak mengembalikan teks");
	yield { type: "done", toolsUsed };
}
