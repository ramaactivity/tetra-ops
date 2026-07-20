/**
 * Konfigurasi Gemini — dipakai bersama oleh web (/tanya) dan bot Telegram.
 *
 * Env:
 *   GEMINI_API_KEY — kunci dari https://aistudio.google.com/apikey (tier gratis)
 *   GEMINI_MODEL   — opsional, default gemini-2.5-flash (model tier gratis
 *                    yang paling murah tapi masih mendukung function calling)
 *
 * Sengaja tanpa SDK: hanya butuh satu endpoint streaming, jadi `fetch` cukup —
 * sama alasannya dengan src/lib/telegram/client.ts yang tidak memakai grammY.
 */

export const GEMINI_API_BASE =
	"https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Berapa kali agent boleh bolak-balik panggil tool sebelum wajib menjawab. */
export const MAX_TOOL_ROUNDS = 5;

/** Batas riwayat percakapan yang dikirim ulang — jaga kuota tier gratis. */
export const MAX_HISTORY_TURNS = 12;

export function geminiApiKey(): string | null {
	return process.env.GEMINI_API_KEY?.trim() || null;
}

export function geminiModel(): string {
	return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function isAiConfigured(): boolean {
	return geminiApiKey() !== null;
}
