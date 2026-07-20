import "server-only";

import { GEMINI_API_BASE, geminiApiKey, geminiModel } from "@/lib/ai/config";
import type { AiSchema } from "@/lib/ai/types";

/**
 * Pembungkus tipis REST API Gemini (streamGenerateContent, alt=sse).
 * Tidak ada logika bisnis di sini — hanya transport + parsing SSE.
 */

export type GeminiPart =
	| { text: string }
	| { functionCall: { name: string; args?: Record<string, unknown> } }
	| {
			functionResponse: {
				name: string;
				response: Record<string, unknown>;
			};
	  };

export type GeminiContent = {
	role: "user" | "model";
	parts: GeminiPart[];
};

export type GeminiFunctionDeclaration = {
	name: string;
	description: string;
	parameters: AiSchema;
};

type GeminiStreamChunk = {
	candidates?: Array<{
		content?: { parts?: GeminiPart[]; role?: string };
		finishReason?: string;
	}>;
	promptFeedback?: { blockReason?: string };
	error?: { message?: string };
};

export class GeminiError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = "GeminiError";
		this.status = status;
	}
}

/**
 * Ubah error mentah Google jadi kalimat yang berguna buat owner (bukan dev).
 * Kuota tier gratis habis adalah kasus yang paling sering, jadi disebut jelas.
 */
export function humanizeGeminiError(err: unknown): string {
	if (err instanceof GeminiError) {
		if (err.status === 429) {
			return "Kuota AI gratis hari ini sudah habis. Coba lagi nanti ya.";
		}
		if (err.status === 400 && /API key/i.test(err.message)) {
			return "GEMINI_API_KEY belum benar. Cek pengaturan di server.";
		}
		if (err.status === 503) {
			return "Server AI Google lagi sibuk. Coba ulangi sebentar lagi.";
		}
		return `AI gagal menjawab (${err.status}).`;
	}
	return err instanceof Error ? err.message : "AI gagal menjawab.";
}

export type GenerateArgs = {
	systemInstruction: string;
	contents: GeminiContent[];
	functionDeclarations?: GeminiFunctionDeclaration[];
	signal?: AbortSignal;
};

/**
 * Panggil Gemini dan streamkan part demi part. Yang di-yield adalah *part*
 * mentah: pemanggil yang memutuskan mana teks (diteruskan ke UI) dan mana
 * functionCall (dieksekusi lalu di-loop balik).
 */
export async function* streamGemini(
	args: GenerateArgs,
): AsyncGenerator<GeminiPart, void, undefined> {
	const key = geminiApiKey();
	if (!key) throw new GeminiError("GEMINI_API_KEY belum diset", 500);

	const url = `${GEMINI_API_BASE}/models/${geminiModel()}:streamGenerateContent?alt=sse`;
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-goog-api-key": key },
		signal: args.signal,
		body: JSON.stringify({
			systemInstruction: { parts: [{ text: args.systemInstruction }] },
			contents: args.contents,
			...(args.functionDeclarations?.length
				? { tools: [{ functionDeclarations: args.functionDeclarations }] }
				: {}),
			generationConfig: {
				temperature: 0.3,
				maxOutputTokens: 2048,
			},
		}),
	});

	if (!res.ok || !res.body) {
		let detail = res.statusText;
		try {
			const body = (await res.json()) as GeminiStreamChunk;
			detail = body.error?.message ?? detail;
		} catch {
			// body bukan JSON — pakai statusText
		}
		throw new GeminiError(detail, res.status);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	/**
	 * Ubah satu blok SSE jadi part. Dipisah ke fungsi sendiri karena harus
	 * dipanggil DUA kali: untuk tiap blok yang lengkap, dan sekali lagi untuk
	 * sisa buffer setelah stream tutup.
	 */
	function* parseBlock(raw: string): Generator<GeminiPart> {
		const line = raw
			.split("\n")
			.find((l) => l.startsWith("data:"))
			?.slice(5)
			.trim();
		if (!line || line === "[DONE]") return;

		let chunk: GeminiStreamChunk;
		try {
			chunk = JSON.parse(line) as GeminiStreamChunk;
		} catch {
			return; // blok tak utuh — abaikan, jangan matikan stream
		}
		if (chunk.promptFeedback?.blockReason) {
			throw new GeminiError(
				`Pertanyaan diblokir filter (${chunk.promptFeedback.blockReason})`,
				400,
			);
		}
		for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
			yield part;
		}
	}

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		// Normalkan CRLF: sebagian proxy mengubah pemisah SSE jadi \r\n\r\n,
		// dan pemisah yang tak cocok = seluruh stream terbaca kosong.
		buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");

		// SSE: event dipisah baris kosong, payload pada baris "data: ".
		let sep = buffer.indexOf("\n\n");
		while (sep !== -1) {
			const raw = buffer.slice(0, sep);
			buffer = buffer.slice(sep + 2);
			sep = buffer.indexOf("\n\n");
			yield* parseBlock(raw);
		}
	}

	// WAJIB: event TERAKHIR sering tidak diakhiri baris kosong sebelum stream
	// ditutup. Tanpa flush ini blok itu hilang — pada jawaban pendek (mis. satu
	// functionCall) artinya balasan terbaca KOSONG, pada jawaban panjang
	// artinya kalimat penutup hilang diam-diam.
	buffer += decoder.decode();
	if (buffer.trim()) yield* parseBlock(buffer);
}
