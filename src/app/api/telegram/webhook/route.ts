import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	answerCallbackQuery,
	sendTelegramMessage,
	type TgInlineKeyboard,
	tgApi,
} from "@/lib/telegram/client";
import {
	buildDigestText,
	buildMonthText,
	buildScheduleText,
	buildStockText,
	buildTomorrowText,
} from "@/lib/telegram/digest";

/**
 * Webhook Telegram — didaftarkan via scripts/telegram-setup.mjs (setWebhook).
 *
 * Dua tugas:
 * 1. Registrasi grup otomatis: saat bot di-invite ke grup owner (update
 *    my_chat_member), chat_id grup disimpan ke telegram_settings id=1.
 *    Tidak perlu copy-paste chat_id manual.
 * 2. Perintah dari grup: /cek (digest on-demand), /id (lihat chat id),
 *    /daftar (registrasi manual — fallback kalau bot sudah terlanjur jadi
 *    member sebelum webhook aktif, sehingga my_chat_member tidak terkirim).
 *
 * Auth: Telegram menyertakan header X-Telegram-Bot-Api-Secret-Token berisi
 * secret yang kita set saat setWebhook. Tanpa header valid → 401.
 */

export const maxDuration = 30;

type TgChat = {
	id: number;
	type: "private" | "group" | "supergroup" | "channel";
	title?: string;
};

type TgUpdate = {
	update_id: number;
	message?: {
		chat: TgChat;
		text?: string;
		migrate_to_chat_id?: number;
	};
	my_chat_member?: {
		chat: TgChat;
		new_chat_member: { status: string; user: { is_bot: boolean } };
	};
	callback_query?: {
		id: string;
		data?: string;
		message?: { chat: TgChat };
	};
};

const HELP_TEXT = [
	"🤖 <b>Tetra Ops Bot</b>",
	"",
	"/cek — kesiapan event 7 hari ke depan (yang belum beres)",
	"/besok — briefing lengkap event besok",
	"/minggu — jadwal semua event 7 hari ke depan",
	"/bulan — event bulan ini · /bulan 8 atau /bulan agustus utk bulan lain",
	"/stok — kondisi stok & perkiraan kebutuhan",
	"/menu — panel tombol",
	"/id — chat ID grup ini",
	"",
	"Digest otomatis tiap pagi ±06:30 WIB + briefing event H-1.",
].join("\n");

function menuKeyboard(): TgInlineKeyboard {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	return [
		[
			{ text: "📋 Kesiapan", callback_data: "cek" },
			{ text: "📸 Briefing Besok", callback_data: "besok" },
		],
		[
			{ text: "🗓 Minggu Ini", callback_data: "minggu" },
			{ text: "📆 Bulan Ini", callback_data: "bulan" },
		],
		[
			{ text: "📦 Stok", callback_data: "stok" },
			{ text: "❓ Bantuan", callback_data: "help" },
		],
		...(appUrl ? [[{ text: "🔗 Buka Tetra Ops", url: appUrl }]] : []),
	];
}

/**
 * Eksekutor bersama untuk perintah teks (/cek dst) dan tombol inline
 * (callback_data yang sama). Error dibalas sebagai pesan, bukan silence.
 */
async function runAction(action: string, chatId: number): Promise<void> {
	try {
		switch (action) {
			case "cek":
				await sendTelegramMessage(chatId, await buildDigestText());
				break;
			case "besok":
				await sendTelegramMessage(chatId, await buildTomorrowText());
				break;
			case "minggu":
				await sendTelegramMessage(chatId, await buildScheduleText());
				break;
			case "bulan":
				await sendTelegramMessage(chatId, await buildMonthText());
				break;
			case "stok":
				await sendTelegramMessage(chatId, await buildStockText());
				break;
			case "menu":
				await sendTelegramMessage(
					chatId,
					"🤖 <b>Tetra Ops Bot</b> — pilih menu:",
					{ replyMarkup: menuKeyboard() },
				);
				break;
			case "help":
				await sendTelegramMessage(chatId, HELP_TEXT, {
					replyMarkup: menuKeyboard(),
				});
				break;
		}
	} catch (err) {
		console.error(`[telegram] action ${action}`, err);
		await sendTelegramMessage(
			chatId,
			"⚠️ Gagal mengambil data — coba lagi sebentar.",
		);
	}
}

function isAuthorized(request: Request): boolean {
	const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
	if (!expected) return process.env.NODE_ENV !== "production";
	return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

async function saveGroupChat(chat: TgChat) {
	const admin = createAdminClient();
	await admin.from("telegram_settings").upsert({
		id: 1,
		group_chat_id: chat.id,
		group_title: chat.title ?? null,
		connected_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	});
}

async function getRegisteredChatId(): Promise<number | null> {
	const admin = createAdminClient();
	const { data } = await admin
		.from("telegram_settings")
		.select("group_chat_id")
		.eq("id", 1)
		.maybeSingle();
	return (data?.group_chat_id as number | null) ?? null;
}

export async function POST(request: Request) {
	if (!isAuthorized(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let update: TgUpdate;
	try {
		update = (await request.json()) as TgUpdate;
	} catch {
		return NextResponse.json({ ok: true }); // bukan JSON — abaikan
	}

	try {
		// ── 0. Tombol inline ditekan (callback_query) ──
		const cb = update.callback_query;
		if (cb) {
			await answerCallbackQuery(cb.id);
			const chat = cb.message?.chat;
			if (chat) {
				const registered = await getRegisteredChatId();
				if (chat.type === "private" || registered === chat.id) {
					await runAction(cb.data ?? "", chat.id);
				}
			}
			return NextResponse.json({ ok: true });
		}

		// ── 1. Bot di-invite / di-promote di sebuah grup → registrasi ──
		const mcm = update.my_chat_member;
		if (
			mcm &&
			(mcm.chat.type === "group" || mcm.chat.type === "supergroup") &&
			["member", "administrator"].includes(mcm.new_chat_member.status)
		) {
			await saveGroupChat(mcm.chat);
			await sendTelegramMessage(
				mcm.chat.id,
				[
					"✅ <b>Tetra Ops Bot terhubung ke grup ini.</b>",
					"",
					"Setiap pagi ±06:30 WIB saya kirim digest kesiapan event 7 hari ke depan, plus briefing lengkap untuk event besok.",
					"",
					"Perintah: /cek — lihat kesiapan event sekarang juga.",
				].join("\n"),
				{ replyMarkup: menuKeyboard() },
			);
			return NextResponse.json({ ok: true });
		}

		const msg = update.message;
		if (!msg) return NextResponse.json({ ok: true });

		// ── 2. Grup di-upgrade ke supergroup → chat_id berubah ──
		if (msg.migrate_to_chat_id) {
			const registered = await getRegisteredChatId();
			if (registered === msg.chat.id) {
				await saveGroupChat({
					id: msg.migrate_to_chat_id,
					type: "supergroup",
					title: msg.chat.title,
				});
			}
			return NextResponse.json({ ok: true });
		}

		// ── 3. Perintah teks ──
		const text = (msg.text ?? "").trim();
		const [rawCmd = "", ...rest] = text.split(/\s+/);
		const command = rawCmd.split("@")[0]; // "/cek@tetraph_bot" → "/cek"
		const arg = rest.join(" "); // "/bulan agustus" → "agustus"

		if (msg.chat.type === "private") {
			if (command === "/start" || command === "/help") {
				await sendTelegramMessage(
					msg.chat.id,
					"Halo! Saya bot reminder Tetra Ops. Invite saya ke grup owner — begitu masuk, grup itu otomatis terdaftar sebagai tujuan digest harian.",
				);
			}
			return NextResponse.json({ ok: true });
		}

		// /daftar — registrasi manual grup ini sebagai tujuan digest. Aman
		// karena hanya bisa diketik orang yang satu grup dengan bot, dan bot
		// hanya di-invite owner ke grup owner.
		if (command === "/daftar") {
			await saveGroupChat(msg.chat);
			await sendTelegramMessage(
				msg.chat.id,
				[
					"✅ <b>Grup ini terdaftar sebagai tujuan reminder Tetra Ops.</b>",
					"",
					"Setiap pagi ±06:30 WIB: digest kesiapan event 7 hari ke depan + briefing lengkap event besok.",
					"",
					"Perintah: /cek — lihat kesiapan event sekarang juga.",
				].join("\n"),
				{ replyMarkup: menuKeyboard() },
			);
			return NextResponse.json({ ok: true });
		}

		// Perintah grup lain: hanya layani grup yang terdaftar
		const registered = await getRegisteredChatId();
		if (registered !== msg.chat.id) {
			if (command === "/id") {
				await sendTelegramMessage(
					msg.chat.id,
					`Chat ID: <code>${msg.chat.id}</code> (grup ini belum terdaftar)`,
				);
			}
			return NextResponse.json({ ok: true });
		}

		if (command === "/bulan" && arg) {
			// /bulan dengan argumen (mis. "/bulan agustus") — satu-satunya
			// perintah berargumen, tidak lewat runAction
			try {
				await sendTelegramMessage(msg.chat.id, await buildMonthText(arg));
			} catch (err) {
				console.error("[telegram] /bulan", err);
				await sendTelegramMessage(
					msg.chat.id,
					"⚠️ Gagal mengambil data — coba lagi sebentar.",
				);
			}
		} else if (command === "/id") {
			await sendTelegramMessage(
				msg.chat.id,
				`Chat ID: <code>${msg.chat.id}</code>`,
			);
		} else if (command === "/start") {
			await runAction("menu", msg.chat.id);
		} else if (command.startsWith("/")) {
			await runAction(command.slice(1), msg.chat.id);
		}
	} catch (err) {
		// Selalu balas 200 supaya Telegram tidak retry-storm; error cukup dicatat.
		console.error("[telegram/webhook]", err);
	}

	return NextResponse.json({ ok: true });
}

// Endpoint sehat-tidaknya webhook (untuk cek manual di browser).
export async function GET() {
	const me = await tgApi<{ username?: string }>("getMe", {});
	return NextResponse.json({
		ok: me.ok,
		bot: me.result?.username ?? null,
	});
}
