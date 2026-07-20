import "server-only";

import { GEMINI_API_BASE, geminiApiKey, geminiModels } from "@/lib/ai/config";
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
	/** Detik yang Google sarankan sebelum mencoba lagi (dari RetryInfo). */
	readonly retryAfterSec: number | null;
	constructor(
		message: string,
		status: number,
		retryAfterSec: number | null = null,
	) {
		super(message);
		this.name = "GeminiError";
		this.status = status;
		this.retryAfterSec = retryAfterSec;
	}
}

/** Status yang layak dicoba ulang dengan model lain (kuota/kesibukan). */
function isRetryableStatus(status: number): boolean {
	return status === 429 || status === 503 || status === 500;
}

/**
 * Ingatan sesaat model yang barusan kehabisan kuota, supaya permintaan
 * berikutnya tidak membuang round-trip ke pintu yang sudah jelas tertutup.
 *
 * Sengaja hanya di memori proses: pada serverless umurnya pendek, dan itu
 * justru aman — kalau instance mati, cooldown ikut hilang dan model dicoba
 * lagi. Tidak ada risiko model "terkunci" lebih lama dari semestinya.
 */
const cooldownUntil = new Map<string, number>();
const MAX_COOLDOWN_MS = 10 * 60 * 1000;

function inCooldown(model: string): boolean {
	const until = cooldownUntil.get(model);
	if (until === undefined) return false;
	if (Date.now() >= until) {
		cooldownUntil.delete(model);
		return false;
	}
	return true;
}

function markCooldown(model: string, retryAfterSec: number | null): void {
	const ms = Math.min((retryAfterSec ?? 60) * 1000, MAX_COOLDOWN_MS);
	cooldownUntil.set(model, Date.now() + ms);
}

/**
 * Ambil saran jeda dari `google.rpc.RetryInfo` ("35s") atau dari kalimat
 * "Please retry in 35.04s" di pesan error.
 */
function parseRetryDelay(body: GeminiErrorBody): number | null {
	const info = body.error?.details?.find(
		(d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
	) as { retryDelay?: string } | undefined;
	const raw =
		info?.retryDelay ?? body.error?.message?.match(/retry in ([\d.]+)s/i)?.[1];
	if (!raw) return null;
	const n = Number.parseFloat(String(raw).replace("s", ""));
	return Number.isFinite(n) ? Math.ceil(n) : null;
}

type GeminiErrorBody = {
	error?: {
		message?: string;
		details?: Array<Record<string, unknown>>;
	};
};

/**
 * Ubah error mentah Google jadi kalimat yang berguna buat owner (bukan dev).
 *
 * PENTING soal 429: tier gratis membatasi **request per hari PER MODEL**
 * (gemini-2.5-flash = 20/hari). Pesannya harus jujur bahwa ini batas Google,
 * bukan kesalahan pemakaian — dan menyebutkan jeda kalau Google memberitahu,
 * karena sering kali cuma perlu menunggu puluhan detik, bukan sampai besok.
 */
export function humanizeGeminiError(err: unknown): string {
	if (err instanceof GeminiError) {
		if (err.status === 429) {
			const jeda = err.retryAfterSec;
			if (jeda !== null && jeda <= 120) {
				return `Jatah pemakaian AI gratis lagi penuh sesaat. Coba lagi sekitar ${jeda} detik.`;
			}
			return "Jatah AI gratis dari Google untuk hari ini sudah terpakai semua. Besok akan pulih otomatis.";
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

	const payload = JSON.stringify({
		systemInstruction: { parts: [{ text: args.systemInstruction }] },
		contents: args.contents,
		...(args.functionDeclarations?.length
			? { tools: [{ functionDeclarations: args.functionDeclarations }] }
			: {}),
		generationConfig: {
			temperature: 0.3,
			maxOutputTokens: 2048,
		},
	});

	// Coba tiap model sampai ada yang mau melayani. Fallback SENGAJA hanya di
	// tahap fetch — begitu satu byte sudah di-stream kita tak boleh berpindah
	// model, karena jawaban akan tercampur dua penulis di tengah kalimat.
	const all = geminiModels();
	// Dahulukan model yang tidak sedang cooldown, tapi JANGAN buang yang sedang
	// cooldown dari daftar: kalau semuanya sedang cooldown kita tetap harus
	// mencoba, karena jatah bisa saja sudah pulih lebih cepat dari perkiraan.
	const models = [
		...all.filter((m) => !inCooldown(m)),
		...all.filter(inCooldown),
	];
	let res: Response | null = null;
	let lastErr: GeminiError | null = null;

	for (const model of models) {
		const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`;
		const attempt = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-goog-api-key": key },
			signal: args.signal,
			body: payload,
		});

		if (attempt.ok && attempt.body) {
			cooldownUntil.delete(model);
			res = attempt;
			break;
		}

		let detail = attempt.statusText;
		let retryAfter: number | null = null;
		try {
			const body = (await attempt.json()) as GeminiErrorBody;
			detail = body.error?.message ?? detail;
			retryAfter = parseRetryDelay(body);
		} catch {
			// body bukan JSON — pakai statusText
		}
		lastErr = new GeminiError(detail, attempt.status, retryAfter);

		// Error permanen (kunci salah, model tak ada, permintaan cacat) tidak
		// akan membaik di model lain — hentikan daripada menghabiskan kuota.
		if (!isRetryableStatus(attempt.status)) throw lastErr;
		if (attempt.status === 429) markCooldown(model, retryAfter);
		console.warn(
			`[gemini] ${model} → ${attempt.status}, coba model berikutnya`,
		);
	}

	if (!res?.body) {
		throw lastErr ?? new GeminiError("Semua model gagal dihubungi", 503);
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
