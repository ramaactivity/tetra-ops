/**
 * Konfigurasi Gemini — dipakai bersama oleh web (/tanya) dan bot Telegram.
 *
 * Env:
 *   GEMINI_API_KEY — kunci dari https://aistudio.google.com/apikey (tier gratis)
 *   GEMINI_MODELS  — opsional, daftar model dipisah koma (urut prioritas)
 *
 * Sengaja tanpa SDK: hanya butuh satu endpoint streaming, jadi `fetch` cukup —
 * sama alasannya dengan src/lib/telegram/client.ts yang tidak memakai grammY.
 */

export const GEMINI_API_BASE =
	"https://generativelanguage.googleapis.com/v1beta";

/**
 * Rantai model, urut dari yang paling pintar.
 *
 * KENAPA BERANTAI: kuota tier gratis dihitung **per model per hari**
 * (`GenerateRequestsPerDayPerProjectPerModel-FreeTier` — gemini-2.5-flash cuma
 * 20/hari, diverifikasi 2026-07-20). Karena tiap model punya jatah sendiri,
 * jatuh ke model berikutnya saat kena 429 melipatgandakan kapasitas harian
 * tanpa biaya. Model diurutkan pintar→hemat supaya jawaban terbaik dicoba dulu.
 *
 * Jangan masukkan gemini-2.0-flash / 2.5-pro: keduanya berkuota 0 di tier
 * gratis, jadi hanya menambah satu request sia-sia sebelum fallback.
 */
export const DEFAULT_MODELS = [
	"gemini-2.5-flash",
	"gemini-flash-lite-latest",
] as const;

/** Berapa kali agent boleh bolak-balik panggil tool sebelum wajib menjawab. */
export const MAX_TOOL_ROUNDS = 4;

/** Batas riwayat percakapan yang dikirim ulang — jaga kuota tier gratis. */
export const MAX_HISTORY_TURNS = 10;

export function geminiApiKey(): string | null {
	return process.env.GEMINI_API_KEY?.trim() || null;
}

export function geminiModels(): string[] {
	const raw = process.env.GEMINI_MODELS?.trim();
	if (!raw) return [...DEFAULT_MODELS];
	const list = raw
		.split(",")
		.map((m) => m.trim())
		.filter(Boolean);
	return list.length > 0 ? list : [...DEFAULT_MODELS];
}

export function isAiConfigured(): boolean {
	return geminiApiKey() !== null;
}
