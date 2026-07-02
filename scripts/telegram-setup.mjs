/**
 * telegram-setup.mjs — Daftarkan webhook bot Telegram ke deployment produksi.
 *
 * Usage:
 *   node --env-file=.env.local scripts/telegram-setup.mjs           # set webhook
 *   node --env-file=.env.local scripts/telegram-setup.mjs --info    # cek status
 *   node --env-file=.env.local scripts/telegram-setup.mjs --delete  # lepas webhook
 *
 * Butuh env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL.
 * Jalankan ulang tiap kali TELEGRAM_WEBHOOK_SECRET atau URL app berubah.
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

if (!token) {
	console.error("❌ TELEGRAM_BOT_TOKEN belum di-set");
	process.exit(1);
}

async function tg(method, body = {}) {
	const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return res.json();
}

const me = await tg("getMe");
if (!me.ok) {
	console.error("❌ Token ditolak Telegram:", me.description);
	process.exit(1);
}
console.log(`🤖 Bot: @${me.result.username} (${me.result.first_name})`);

const mode = process.argv[2];

if (mode === "--info") {
	const info = await tg("getWebhookInfo");
	console.log(JSON.stringify(info.result, null, 2));
	process.exit(0);
}

if (mode === "--delete") {
	const del = await tg("deleteWebhook", { drop_pending_updates: true });
	console.log(del.ok ? "✅ Webhook dilepas" : `❌ ${del.description}`);
	process.exit(del.ok ? 0 : 1);
}

if (!secret || !appUrl) {
	console.error(
		"❌ TELEGRAM_WEBHOOK_SECRET / NEXT_PUBLIC_APP_URL belum di-set",
	);
	process.exit(1);
}

// Dropdown perintah saat user mengetik "/" (BotFather command menu).
// /daftar & /id sengaja tidak masuk menu — jarang dipakai, cukup via /help.
const COMMANDS = [
	{ command: "cek", description: "Kesiapan event 7 hari ke depan" },
	{ command: "besok", description: "Briefing lengkap event besok" },
	{ command: "minggu", description: "Jadwal semua event 7 hari ke depan" },
	{ command: "bulan", description: "Event bulan ini (atau /bulan <bulan>)" },
	{ command: "stok", description: "Kondisi stok & perkiraan kebutuhan" },
	{ command: "help", description: "Bantuan & daftar perintah" },
];
for (const scope of [
	{ type: "default" },
	{ type: "all_group_chats" },
	{ type: "all_private_chats" },
]) {
	const cmd = await tg("setMyCommands", { commands: COMMANDS, scope });
	if (!cmd.ok)
		console.error(`⚠️ setMyCommands (${scope.type}):`, cmd.description);
}
console.log(`✅ Command menu terdaftar (${COMMANDS.length} perintah)`);

await tg("setMyShortDescription", {
	short_description:
		"Reminder kesiapan event Tetra Photobooth untuk grup owner",
});

const webhookUrl = `${appUrl}/api/telegram/webhook`;
const set = await tg("setWebhook", {
	url: webhookUrl,
	secret_token: secret,
	allowed_updates: ["message", "my_chat_member"],
	drop_pending_updates: true,
});
if (!set.ok) {
	console.error("❌ setWebhook gagal:", set.description);
	process.exit(1);
}
console.log(`✅ Webhook terpasang: ${webhookUrl}`);

const info = await tg("getWebhookInfo");
console.log(
	`   pending: ${info.result.pending_update_count}, last_error: ${info.result.last_error_message ?? "-"}`,
);
console.log(
	"\nSelanjutnya: invite bot ke grup owner → grup otomatis terdaftar sebagai tujuan digest.",
);
