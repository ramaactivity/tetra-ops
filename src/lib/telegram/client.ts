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
		const flush = () => {
			// Jangan pernah push chunk kosong — Telegram menolaknya dengan
			// "message text is empty" dan sendTelegramMessage berhenti di situ.
			if (buf.length > 0) chunks.push(buf);
			buf = "";
		};
		for (const line of html.split("\n")) {
			// Baris tunggal yang lebih panjang dari MAX harus dipotong paksa.
			// Sebelumnya baris seperti ini dikirim UTUH (ditolak: "message is
			// too long") dan, karena buf masih "" saat itu, sebuah chunk KOSONG
			// ikut ter-push lebih dulu. Jawaban AI berupa prosa panjang tanpa
			// newline persis memicu ini, dan grup hanya melihat kesenyapan.
			if (line.length > MAX) {
				flush();
				let rest = line;
				while (rest.length > MAX) {
					// Potong di spasi terakhir sebelum batas supaya kata (dan
					// sebisa mungkin tag HTML) tidak terbelah di tengah.
					const cut = rest.lastIndexOf(" ", MAX);
					const at = cut > MAX * 0.5 ? cut : MAX;
					chunks.push(rest.slice(0, at));
					rest = rest.slice(at).trimStart();
				}
				if (rest.length > 0) chunks.push(rest);
				continue;
			}
			if (buf.length + line.length + 1 > MAX) {
				flush();
				buf = line;
			} else {
				buf = buf ? `${buf}\n${line}` : line;
			}
		}
		flush();
	}

	for (let i = 0; i < chunks.length; i++) {
		const isLast = i === chunks.length - 1;
		const extra =
			isLast && opts?.replyMarkup
				? { reply_markup: { inline_keyboard: opts.replyMarkup } }
				: {};
		const res = await tgApi("sendMessage", {
			chat_id: chatId,
			text: chunks[i],
			parse_mode: "HTML",
			link_preview_options: { is_disabled: true },
			...extra,
		});
		if (res.ok) continue;

		// Pemotongan paksa baris panjang bisa membelah tag HTML, dan Telegram
		// menolaknya ("can't parse entities"). Daripada pesannya hilang total,
		// kirim ulang chunk itu sebagai teks polos: isinya sampai, hanya
		// kehilangan format tebal/miring.
		const parseIssue = /parse|entities/i.test(res.description ?? "");
		if (parseIssue) {
			const plain = await tgApi("sendMessage", {
				chat_id: chatId,
				text: stripHtmlTags(chunks[i]),
				link_preview_options: { is_disabled: true },
				...extra,
			});
			if (plain.ok) continue;
			return { ok: false, error: plain.description };
		}
		return { ok: false, error: res.description };
	}
	return { ok: true };
}

/** Buang tag HTML — dipakai sebagai fallback saat Telegram menolak parse HTML. */
function stripHtmlTags(s: string): string {
	return s
		.replace(/<[^>]*>/g, "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

/**
 * Edit pesan yang sudah ada (teks + keyboard) — dipakai navigasi submenu
 * supaya panel menu berganti di tempat, bukan menumpuk pesan baru.
 */
export async function editTelegramMessage(
	chatId: number | string,
	messageId: number,
	html: string,
	replyMarkup?: TgInlineKeyboard,
): Promise<{ ok: boolean; error?: string }> {
	const res = await tgApi("editMessageText", {
		chat_id: chatId,
		message_id: messageId,
		text: html,
		parse_mode: "HTML",
		link_preview_options: { is_disabled: true },
		...(replyMarkup ? { reply_markup: { inline_keyboard: replyMarkup } } : {}),
	});
	return res.ok ? { ok: true } : { ok: false, error: res.description };
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
// Definisinya pindah ke format.ts (modul murni, bisa dites). Diekspor ulang
// di sini supaya seluruh pemanggil lama tidak perlu diubah.
export { tgEscape } from "@/lib/telegram/format";
