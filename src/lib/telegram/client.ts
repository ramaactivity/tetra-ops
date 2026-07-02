import "server-only";

/**
 * Klien Telegram Bot API — cukup fetch, tanpa library. Bot ini hanya perlu
 * sendMessage + webhook, jadi dependency grammY/telegraf tidak sepadan.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN      — dari @BotFather
 *   TELEGRAM_WEBHOOK_SECRET — secret_token yang Telegram kirim balik di header
 *                             X-Telegram-Bot-Api-Secret-Token setiap update
 */

const API_BASE = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
	return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

type TgResponse<T> = { ok: boolean; result?: T; description?: string };

export async function tgApi<T = unknown>(
	method: string,
	body: Record<string, unknown>,
): Promise<TgResponse<T>> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN not set" };
	const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return (await res.json()) as TgResponse<T>;
}

/** Inline keyboard (tombol di bawah pesan). */
export type TgInlineKeyboard = Array<
	Array<{ text: string; callback_data?: string; url?: string }>
>;

/**
 * Kirim pesan HTML ke satu chat. Pesan > 4096 char dipecah per baris supaya
 * tidak ditolak Telegram (digest dengan banyak event bisa panjang).
 * replyMarkup (inline keyboard) dipasang di chunk terakhir.
 */
export async function sendTelegramMessage(
	chatId: number | string,
	html: string,
	opts?: { replyMarkup?: TgInlineKeyboard },
): Promise<{ ok: boolean; error?: string }> {
	const MAX = 4000; // margin di bawah limit 4096
	const chunks: string[] = [];
	if (html.length <= MAX) {
		chunks.push(html);
	} else {
		let buf = "";
		for (const line of html.split("\n")) {
			if (buf.length + line.length + 1 > MAX) {
				chunks.push(buf);
				buf = line;
			} else {
				buf = buf ? `${buf}\n${line}` : line;
			}
		}
		if (buf) chunks.push(buf);
	}

	for (let i = 0; i < chunks.length; i++) {
		const isLast = i === chunks.length - 1;
		const res = await tgApi("sendMessage", {
			chat_id: chatId,
			text: chunks[i],
			parse_mode: "HTML",
			link_preview_options: { is_disabled: true },
			...(isLast && opts?.replyMarkup
				? { reply_markup: { inline_keyboard: opts.replyMarkup } }
				: {}),
		});
		if (!res.ok) return { ok: false, error: res.description };
	}
	return { ok: true };
}

/** Stop spinner di tombol setelah callback ditekan (wajib dipanggil). */
export async function answerCallbackQuery(
	callbackQueryId: string,
	text?: string,
): Promise<void> {
	await tgApi("answerCallbackQuery", {
		callback_query_id: callbackQueryId,
		...(text ? { text } : {}),
	});
}

/** Escape teks dinamis (nama klien, venue) untuk parse_mode HTML. */
export function tgEscape(s: string | null | undefined): string {
	return (s ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}
