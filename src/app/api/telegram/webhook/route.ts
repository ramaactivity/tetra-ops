import { NextResponse } from "next/server";
import { buildAiAnswer } from "@/lib/ai/telegram-ask";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	answerCallbackQuery,
	editTelegramMessage,
	sendTelegramMessage,
	type TgInlineKeyboard,
	tgApi,
} from "@/lib/telegram/client";
import {
	addDaysISO,
	buildBusinessRecapText,
	buildDigestText,
	buildMonthText,
	buildRenewalsText,
	buildScheduleText,
	buildStockText,
	buildTomorrowText,
	dateLabel,
	isoDateUTC,
	wibNow,
} from "@/lib/telegram/digest";
import {
	buildAdaText,
	buildCrewText,
	buildPiutangText,
	buildSaldoText,
	buildVendorPicker,
	buildVendorText,
} from "@/lib/telegram/queries";

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

type TgUser = {
	id: number;
	is_bot?: boolean;
	first_name?: string;
	last_name?: string;
	username?: string;
};

type TgUpdate = {
	update_id: number;
	message?: {
		chat: TgChat;
		text?: string;
		migrate_to_chat_id?: number;
		from?: TgUser;
		reply_to_message?: { from?: TgUser };
	};
	my_chat_member?: {
		chat: TgChat;
		new_chat_member: { status: string; user: { is_bot: boolean } };
	};
	callback_query?: {
		id: string;
		data?: string;
		message?: { chat: TgChat; message_id: number };
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
	"/ada 15 agu — cek ketersediaan unit di suatu tanggal",
	"/piutang — event yang belum lunas",
	"/saldo — saldo semua rekening kas & bank",
	"/crew — jadwal crew 7 hari + fee belum dibayar",
	"/vendor — event upcoming via vendor (nilai, komisi, PIC)",
	"/bisnis — rekap bisnis bulan berjalan (omzet, profit, leads)",
	"/langganan — jatuh tempo VPS, domain, simcard, dll",
	"/desainer — daftarkan diri sebagai PIC desain (biar di-mention tiap pagi)",
	"/tanya ... — tanya bebas ke AI, mis. <code>/tanya profit bulan ini berapa</code>",
	"/menu — panel tombol",
	"/id — chat ID grup ini",
	"",
	"Digest otomatis tiap pagi ±06:30 WIB + briefing event H-1.",
].join("\n");

// ── Menu bertingkat ──────────────────────────────────────────────────────
// callback_data "m:<view>" = navigasi (edit pesan menu di tempat);
// "bulan:<n>" / "ada:<iso>" = aksi berparameter; sisanya aksi biasa.

type MenuView = { text: string; keyboard: TgInlineKeyboard };

const BACK_ROW = [{ text: "⬅️ Kembali ke Menu", callback_data: "m:main" }];
const BULAN_PENDEK = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

function menuView(view: string): MenuView {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	switch (view) {
		case "jadwal": {
			// Pilih bulan: bulan ini + 5 berikutnya (tahun berjalan/berikut otomatis)
			const now = wibNow();
			const monthBtns: TgInlineKeyboard[number] = [];
			const rows: TgInlineKeyboard = [
				[
					{ text: "🗓 Minggu Ini", callback_data: "minggu" },
					{ text: "📆 Bulan Ini", callback_data: "bulan" },
				],
				[{ text: "🤝 Event via Vendor", callback_data: "vendor" }],
			];
			for (let i = 0; i < 6; i++) {
				const m = (now.getUTCMonth() + i) % 12;
				monthBtns.push({
					text: BULAN_PENDEK[m],
					callback_data: `bulan:${m + 1}`,
				});
			}
			rows.push(monthBtns.slice(0, 3), monthBtns.slice(3, 6), BACK_ROW);
			return {
				text: "🗓 <b>Jadwal Event</b>\n\nLihat daftar event beserta klien, venue, dan crew yang bertugas.\n\n🗓 <b>Minggu Ini</b> — semua event 7 hari ke depan\n📆 <b>Bulan Ini</b> — semua event bulan berjalan\n\nAtau pilih bulan di baris bawah untuk melihat jadwal bulan itu. Bisa juga ketik <code>/bulan agustus</code>.",
				keyboard: rows,
			};
		}
		case "uang":
			return {
				text: "💰 <b>Keuangan</b>\n\nPantau kondisi uang bisnis tanpa buka aplikasi. Semua angka diambil langsung dari pembukuan Tetra Ops saat tombol ditekan.\n\n💰 <b>Piutang</b> — event yang pembayarannya belum lunas\n💵 <b>Saldo Kas/Bank</b> — saldo terkini semua rekening\n📊 <b>Rekap Bisnis</b> — omzet, profit & leads bulan berjalan\n🔔 <b>Langganan</b> — jatuh tempo VPS, domain, simcard, dll",
				keyboard: [
					[
						{ text: "💰 Piutang", callback_data: "piutang" },
						{ text: "💵 Saldo Kas/Bank", callback_data: "saldo" },
					],
					[
						{ text: "📊 Rekap Bisnis", callback_data: "bisnis" },
						{ text: "🔔 Langganan", callback_data: "langganan" },
					],
					BACK_ROW,
				],
			};
		case "tgl": {
			// 14 hari ke depan sebagai tombol — cek ketersediaan tanpa mengetik
			const todayISO = isoDateUTC(wibNow());
			const rows: TgInlineKeyboard = [];
			for (let i = 0; i < 14; i += 2) {
				const d1 = addDaysISO(todayISO, i);
				const d2 = addDaysISO(todayISO, i + 1);
				rows.push([
					{ text: dateLabel(d1), callback_data: `ada:${d1}` },
					{ text: dateLabel(d2), callback_data: `ada:${d2}` },
				]);
			}
			rows.push(BACK_ROW);
			return {
				text: "📅 <b>Cek Ketersediaan Unit</b>\n\nMasih bisa terima booking di tanggal tertentu? Pilih tanggalnya, saya hitung berapa unit photobooth yang masih kosong — sudah memperhitungkan bentrok jadwal dan jarak antar kota.\n\nTombol di bawah = 14 hari ke depan.\nTanggal lain: ketik <code>/ada 15 agu</code>",
				keyboard: rows,
			};
		}
		default:
			return {
				text: "🤖 <b>Tetra Ops Bot</b> — Menu Utama\n\nPusat kendali bisnis langsung dari Telegram:\n\n📋 <b>Kesiapan</b> — event 7 hari ke depan yang persiapannya belum beres\n📸 <b>Briefing Besok</b> — detail lengkap event besok (crew, alat, venue)\n🗓 <b>Jadwal</b> — daftar event minggu ini / per bulan\n📅 <b>Cek Tanggal</b> — sisa unit kosong di tanggal tertentu\n💰 <b>Keuangan</b> — piutang, saldo, rekap bisnis, langganan\n📦 <b>Stok</b> — kondisi stok & perkiraan kebutuhan\n👥 <b>Crew</b> — jadwal crew 7 hari + fee belum dibayar\n\nTanda ▸ = buka sub-menu. Digest otomatis tiap pagi ±06:30 WIB.",
				keyboard: [
					[
						{ text: "📋 Kesiapan", callback_data: "cek" },
						{ text: "📸 Briefing Besok", callback_data: "besok" },
					],
					[
						{ text: "🗓 Jadwal ▸", callback_data: "m:jadwal" },
						{ text: "📅 Cek Tanggal ▸", callback_data: "m:tgl" },
					],
					[
						{ text: "💰 Keuangan ▸", callback_data: "m:uang" },
						{ text: "📦 Stok", callback_data: "stok" },
					],
					[
						{ text: "👥 Crew", callback_data: "crew" },
						{ text: "❓ Bantuan", callback_data: "help" },
					],
					...(appUrl ? [[{ text: "🔗 Buka Tetra Ops", url: appUrl }]] : []),
				],
			};
	}
}

function menuKeyboard(): TgInlineKeyboard {
	return menuView("main").keyboard;
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
			case "bisnis":
				await sendTelegramMessage(chatId, await buildBusinessRecapText());
				break;
			case "langganan":
				await sendTelegramMessage(chatId, await buildRenewalsText());
				break;
			case "piutang":
				await sendTelegramMessage(chatId, await buildPiutangText());
				break;
			case "saldo":
				await sendTelegramMessage(chatId, await buildSaldoText());
				break;
			case "crew":
				await sendTelegramMessage(chatId, await buildCrewText());
				break;
			case "vendor": {
				// Pemilih vendor — bukan dump semua; tap vendor → detailnya saja
				const picker = await buildVendorPicker();
				await sendTelegramMessage(chatId, picker.text, {
					replyMarkup: [...picker.buttons, BACK_ROW],
				});
				break;
			}
			case "menu": {
				const v = menuView("main");
				await sendTelegramMessage(chatId, v.text, { replyMarkup: v.keyboard });
				break;
			}
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

/**
 * Boleh tidak chat ini didaftarkan sebagai tujuan digest?
 *
 * Webhook secret hanya membuktikan request datang dari Telegram — TIDAK
 * membuktikan siapa yang ada di dalam chat-nya. Username @tetraph_bot bersifat
 * publik, jadi siapa pun bisa membuat grup, mengundang bot, dan Telegram akan
 * mengirim my_chat_member → sebelumnya group_chat_id langsung tertimpa. Sejak
 * saat itu digest 06:30 (omzet, piutang, saldo kas) mengalir ke grup penyerang,
 * grup owner senyap, dan grup penyerang lolos gate "grup terdaftar" sehingga
 * /saldo, /piutang, dan /tanya ikut aktif.
 *
 * Aturan sekarang:
 *   • TELEGRAM_ALLOWED_CHAT_IDS diisi → hanya id di daftar itu yang boleh.
 *   • Belum ada grup terdaftar        → boleh (pairing pertama kali).
 *   • Sudah terdaftar                 → hanya grup yang sama yang boleh.
 * Pindah grup dilakukan sadar: kosongkan telegram_settings atau pakai env.
 */
async function canRegisterChat(chatId: number): Promise<boolean> {
	const allow = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (allow.length > 0) return allow.includes(String(chatId));

	const registered = await getRegisteredChatId();
	return registered === null || registered === chatId;
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
					const dataStr = cb.data ?? "";
					if (dataStr.startsWith("m:") && cb.message) {
						// Navigasi submenu → edit panel menu di tempat
						const v = menuView(dataStr.slice(2));
						await editTelegramMessage(
							chat.id,
							cb.message.message_id,
							v.text,
							v.keyboard,
						);
					} else if (dataStr === "vendor" && cb.message) {
						// Dari tombol → panel berubah jadi pemilih vendor di tempat
						const picker = await buildVendorPicker();
						await editTelegramMessage(
							chat.id,
							cb.message.message_id,
							picker.text,
							[...picker.buttons, BACK_ROW],
						);
					} else if (dataStr.startsWith("v:")) {
						// Vendor dipilih → kirim detail vendor itu saja
						await sendTelegramMessage(
							chat.id,
							await buildVendorText(dataStr.slice(2)),
						);
					} else if (dataStr.startsWith("bulan:")) {
						await sendTelegramMessage(
							chat.id,
							await buildMonthText(dataStr.slice(6)),
						);
					} else if (dataStr.startsWith("ada:")) {
						await sendTelegramMessage(
							chat.id,
							await buildAdaText(dataStr.slice(4)),
						);
					} else {
						await runAction(dataStr, chat.id);
					}
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
			if (!(await canRegisterChat(mcm.chat.id))) {
				await sendTelegramMessage(
					mcm.chat.id,
					"⛔ <b>Bot ini sudah terikat ke grup lain.</b>\n\nDemi keamanan, tujuan laporan keuangan tidak bisa dipindah hanya dengan mengundang bot. Hubungi owner Tetra Ops kalau grup ini memang seharusnya jadi tujuan baru.",
				);
				return NextResponse.json({ ok: true });
			}
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

		// /daftar — registrasi manual grup ini sebagai tujuan digest.
		// Dijaga canRegisterChat: sekali terikat ke satu grup, tidak bisa
		// dibajak dengan mengetik /daftar di grup lain.
		if (command === "/daftar") {
			if (!(await canRegisterChat(msg.chat.id))) {
				await sendTelegramMessage(
					msg.chat.id,
					"⛔ <b>Bot ini sudah terikat ke grup lain.</b>\n\nTujuan laporan keuangan tidak bisa dipindah dari sini.",
				);
				return NextResponse.json({ ok: true });
			}
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

		// /desainer — orangnya sendiri yang mendaftar sebagai PIC desain, supaya
		// reminder "desain belum ACC" tiap pagi bisa me-mention dia. Telegram
		// tidak membocorkan user_id lewat cara lain, dan mention @username gagal
		// untuk akun tanpa username — jadi id-nya diambil dari pesan ini.
		// Balas ke pesan orang lain + ketik /desainer = mendaftarkan orang itu.
		if (command === "/desainer") {
			const target = msg.reply_to_message?.from ?? msg.from;
			if (!target || target.is_bot) {
				await sendTelegramMessage(
					msg.chat.id,
					"Ketik <code>/desainer</code> dari akun PIC desain (atau balas pesan orangnya lalu ketik /desainer).",
				);
				return NextResponse.json({ ok: true });
			}
			const name =
				[target.first_name, target.last_name].filter(Boolean).join(" ") ||
				target.username ||
				"PIC desain";
			const admin = createAdminClient();
			const { error } = await admin
				.from("telegram_settings")
				.update({
					design_pic_user_id: target.id,
					design_pic_name: name,
					updated_at: new Date().toISOString(),
				})
				.eq("id", 1);
			await sendTelegramMessage(
				msg.chat.id,
				error
					? `⚠️ Gagal menyimpan PIC desain: ${error.message}`
					: [
							`🎨 <b>${name}</b> terdaftar sebagai PIC desain.`,
							"",
							"Tiap pagi kamu di-mention untuk event yang desainnya belum ACC. Saat menandai desain Approved, sistem menanyakan ukuran filenya dan mencocokkannya dengan pesanan klien.",
						].join("\n"),
			);
			return NextResponse.json({ ok: true });
		}

		if (command === "/ada") {
			if (arg) {
				try {
					await sendTelegramMessage(msg.chat.id, await buildAdaText(arg));
				} catch (err) {
					console.error("[telegram] /ada", err);
					await sendTelegramMessage(
						msg.chat.id,
						"⚠️ Gagal mengambil data — coba lagi sebentar.",
					);
				}
			} else {
				// Tanpa argumen → tampilkan pemilih tanggal (klik-klik)
				const v = menuView("tgl");
				await sendTelegramMessage(msg.chat.id, v.text, {
					replyMarkup: v.keyboard,
				});
			}
		} else if (command === "/bulan" && arg) {
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
		} else if (command === "/tanya") {
			// Tanya bebas ke AI. Bisa makan belasan detik (beberapa putaran ambil
			// data), jadi kirim tanda "lagi mikir" dulu supaya grup tidak mengira
			// bot-nya mati.
			await tgApi("sendChatAction", {
				chat_id: msg.chat.id,
				action: "typing",
			});
			try {
				await sendTelegramMessage(msg.chat.id, await buildAiAnswer(arg));
			} catch (err) {
				console.error("[telegram] /tanya", err);
				await sendTelegramMessage(
					msg.chat.id,
					"⚠️ Gagal menjawab — coba lagi sebentar.",
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
