import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
	isTelegramConfigured,
	sendTelegramMessage,
	tgEscape,
} from "@/lib/telegram/client";
import { dateLabel, rp } from "@/lib/telegram/digest";

/**
 * Ping event-driven ke grup Telegram owner (booking baru, rekap masuk,
 * event settled). Semua fungsi di sini best-effort dan TIDAK PERNAH throw —
 * kegagalan kirim Telegram tidak boleh menggagalkan aksi yang memicunya.
 * Pola yang sama dengan rekap-notifications.ts.
 */

export async function sendToOwnerGroup(html: string): Promise<void> {
	try {
		if (!isTelegramConfigured()) return;
		const admin = createAdminClient();
		const { data } = await admin
			.from("telegram_settings")
			.select("group_chat_id")
			.eq("id", 1)
			.maybeSingle();
		const chatId = data?.group_chat_id as number | null;
		if (!chatId) return;
		await sendTelegramMessage(chatId, html);
	} catch (e) {
		console.error("[telegram/notify] send failed:", e);
	}
}

const CHANNEL_LABEL: Record<string, string> = {
	direct: "Direct",
	vendor: "Vendor",
	relasi: "Relasi",
};

/** Booking baru dibuat → kabari grup owner. */
export async function notifyTelegramBookingCreated(
	eventId: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select(
				"project_id, client_name, event_date, venue_name, venue_city, channel, grand_total",
			)
			.eq("id", eventId)
			.maybeSingle();
		if (!ev) return;
		const tempat = [ev.venue_name, ev.venue_city]
			.filter(Boolean)
			.map((s) => tgEscape(s as string))
			.join(", ");
		const via = CHANNEL_LABEL[ev.channel as string] ?? ev.channel ?? "-";
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`🆕 <b>BOOKING BARU — ${tgEscape(ev.client_name as string)}</b>`,
				`📅 ${dateLabel(ev.event_date as string, true)}${tempat ? ` · 📍 ${tempat}` : ""}`,
				`💰 ${rp(Number(ev.grand_total ?? 0))} · via ${tgEscape(via)}`,
				...(appUrl ? [`\nDetail: ${appUrl}/operations/${ev.project_id}`] : []),
			].join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] booking:", e);
	}
}

/** Rekap crew masuk → owner diminta review. */
export async function notifyTelegramRekapSubmitted(
	eventId: string,
	projectId: string,
	submittedByName: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select("client_name")
			.eq("id", eventId)
			.maybeSingle();
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`📥 <b>REKAP MASUK — ${tgEscape((ev?.client_name as string) ?? "Event")}</b>`,
				`${tgEscape(submittedByName)} sudah submit rekap. Review & approve supaya bisa segera settlement.`,
				...(appUrl
					? [`\nReview: ${appUrl}/operations/${projectId}/rekap`]
					: []),
			].join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] rekap:", e);
	}
}

/** Event di-tutup buku → kabar profit ke grup owner (grup owner-only). */
export async function notifyTelegramEventSettled(
	eventId: string,
	projectId: string,
	result: {
		revenue_net: number;
		net_profit: number;
		margin_pct: number;
		is_loss: boolean;
	},
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select("client_name")
			.eq("id", eventId)
			.maybeSingle();
		const icon = result.is_loss ? "🚨" : "✅";
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`${icon} <b>EVENT SETTLED — ${tgEscape((ev?.client_name as string) ?? "Event")}</b>`,
				`📈 Omzet ${rp(Number(result.revenue_net ?? 0))}`,
				`💰 Profit bersih ${rp(Number(result.net_profit ?? 0))} (margin ${Math.round(Number(result.margin_pct ?? 0))}%)${result.is_loss ? " — RUGI, review settlement-nya" : ""}`,
				...(appUrl ? [`\nDetail: ${appUrl}/operations/${projectId}`] : []),
			].join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] settled:", e);
	}
}
