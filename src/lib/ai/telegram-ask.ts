import "server-only";

import { runAgent } from "@/lib/ai/agent";
import { isAiConfigured } from "@/lib/ai/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { isoDateUTC, wibNow } from "@/lib/telegram/digest";

/**
 * /tanya di grup owner — memakai agent yang SAMA dengan web, hanya berbeda
 * permukaan (prompt-nya beralih ke format Telegram).
 *
 * Client-nya admin (service-role) dan perannya dipatok "owner": pemanggilnya
 * sudah lewat dua gerbang di webhook — secret token Telegram + pencocokan
 * chat id dengan grup terdaftar. Tidak ada sesi user di sini untuk dipakai RLS.
 */

/** Tag HTML yang diterima Telegram; sisanya di-escape jadi teks biasa. */
const ALLOWED = ["b", "strong", "i", "em", "u", "s", "code", "pre"];

/**
 * Amankan output model untuk parse_mode HTML. Model kadang tetap menulis
 * markdown atau tag liar; satu tag tak dikenal cukup untuk membuat Telegram
 * menolak SELURUH pesan, jadi kita escape dulu lalu buka kembali tag aman.
 */
export function sanitizeTelegramHtml(text: string): string {
	let out = text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

	for (const tag of ALLOWED) {
		out = out
			.replaceAll(`&lt;${tag}&gt;`, `<${tag}>`)
			.replaceAll(`&lt;/${tag}&gt;`, `</${tag}>`);
	}
	// Sisa markdown **tebal** → <b> supaya tidak terbaca sebagai bintang.
	out = out.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
	// Bullet markdown ("* ", "- ") → "•". Telegram tidak punya daftar, jadi
	// tanpa ini owner melihat bintang/strip mentah di awal tiap baris.
	out = out.replace(/^[ \t]*[*-][ \t]+/gm, "• ");
	return out;
}

export async function buildAiAnswer(question: string): Promise<string> {
	if (!isAiConfigured()) {
		return "🤖 Fitur tanya-jawab belum aktif — GEMINI_API_KEY belum diset di server.";
	}
	const q = question.trim();
	if (!q) {
		return [
			"🤖 Tulis pertanyaannya setelah /tanya. Contoh:",
			"<code>/tanya minggu ini ada acara apa saja?</code>",
			"<code>/tanya siapa yang belum lunas?</code>",
			"<code>/tanya stok apa yang mau habis?</code>",
		].join("\n");
	}

	const todayISO = isoDateUTC(wibNow());
	const supabase = createAdminClient();

	let answer = "";
	let error: string | null = null;

	for await (const ev of runAgent({
		messages: [{ role: "user", content: q }],
		toolCtx: { supabase, role: "owner", todayISO, surface: "telegram" },
		promptCtx: { todayISO, role: "owner", userName: null, surface: "telegram" },
	})) {
		if (ev.type === "text") answer += ev.value;
		else if (ev.type === "error") error = ev.message;
	}

	if (!answer.trim()) {
		return `🤖 ${sanitizeTelegramHtml(error ?? "Tidak ada jawaban. Coba tanya dengan kalimat lain.")}`;
	}
	const body = sanitizeTelegramHtml(answer.trim());
	// Error setelah sebagian jawaban keluar tetap perlu diberitahukan — kalau
	// tidak, owner mengira jawaban yang terpotong itu sudah lengkap.
	return error ? `${body}\n\n⚠️ ${sanitizeTelegramHtml(error)}` : body;
}
