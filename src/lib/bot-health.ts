/**
 * Bot health evaluation — shared by the dashboard banner (client) and the
 * alert server action. Plain module (no "use server") so both can import it.
 *
 * The bot bumps bot_status.updated_at every ~90s while alive (heartbeat) and on
 * every connection change. So a stale heartbeat means the process is dead / VPS
 * down; a non-'open' connection means the WhatsApp link itself is broken.
 * See WHATSAPP_BOT_ALERT_ANALITIK_HANDOVER §1.
 */

export const BOT_STALE_MS = 5 * 60_000; // 5 min heartbeat grace

export type BotHealthInput = {
	connection: string;
	updated_at: string | null;
};

export type BotHealth =
	| { ok: true }
	| {
			ok: false;
			reason: string;
			kind: "stale" | "logged_out" | "disconnected";
	  };

export function botHealth(s: BotHealthInput, now = Date.now()): BotHealth {
	const ts = s.updated_at ? new Date(s.updated_at).getTime() : 0;
	const staleMs = now - ts;
	if (!ts || staleMs > BOT_STALE_MS) {
		return {
			ok: false,
			kind: "stale",
			reason: "Bot tidak merespons — proses bot mati atau VPS down.",
		};
	}
	if (s.connection === "logged_out") {
		return {
			ok: false,
			kind: "logged_out",
			reason: "Bot ter-logout dari WhatsApp — perlu scan QR ulang.",
		};
	}
	if (s.connection !== "open") {
		return {
			ok: false,
			kind: "disconnected",
			reason: "Koneksi WhatsApp terputus — bot sedang mencoba menyambung.",
		};
	}
	return { ok: true };
}
