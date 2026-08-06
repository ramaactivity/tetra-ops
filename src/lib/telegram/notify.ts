import "server-only";

import {
	formatScheduleInline,
	hasBreak,
	parseSegments,
} from "@/lib/schedule/segments";
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

/** Booking baru dibuat → kabari grup owner (detail ala kartu event). */
export async function notifyTelegramBookingCreated(
	eventId: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select(
				`project_id, client_name, event_date, setup_time, start_time, end_time,
				session_segments, venue_name, venue_city, channel, event_category,
				grand_total, vendor_commission_mode, vendor_commission_amount,
				vendor_name, vendor_pic_name, vendor_contact,
				referrer_user_id, referrer_commission,
				pic_name, pic_wa, booker_name,
				package:packages(name), backdrop:backdrops(name)`,
			)
			.eq("id", eventId)
			.maybeSingle();
		if (!ev) return;

		const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
		const pkg = Array.isArray(ev.package) ? ev.package[0] : ev.package;
		const backdrop = Array.isArray(ev.backdrop) ? ev.backdrop[0] : ev.backdrop;

		// Kategori event — label dari master event_types, fallback ke code.
		let kategori: string | null = (ev.event_category as string) ?? null;
		if (kategori) {
			const { data: et } = await admin
				.from("event_types")
				.select("label")
				.eq("code", kategori)
				.maybeSingle();
			kategori = (et?.label as string) ?? kategori;
		}

		// Sumber booking — sebut NAMA-nya, bukan cuma channel-nya.
		const grand = Number(ev.grand_total ?? 0);
		let sumber: string;
		let moneyLine = `💰 ${rp(grand)}`;
		if (ev.channel === "vendor") {
			const pic = ev.vendor_pic_name
				? ` (PIC: ${tgEscape(ev.vendor_pic_name as string)}${ev.vendor_contact ? ` · ${tgEscape(ev.vendor_contact as string)}` : ""})`
				: "";
			sumber = `🤝 Via vendor <b>${tgEscape((ev.vendor_name as string) ?? "-")}</b>${pic}`;
			if (
				ev.vendor_commission_mode === "upfront_cut" &&
				Number(ev.vendor_commission_amount ?? 0) > 0
			) {
				// Potongan langsung: kas yang masuk ke Tetra = grand − potongan.
				const cut = Number(ev.vendor_commission_amount);
				moneyLine = `💰 ${rp(grand)} − potongan vendor ${rp(cut)} → Tetra terima <b>${rp(grand - cut)}</b>`;
			} else if (Number(ev.vendor_commission_amount ?? 0) > 0) {
				moneyLine = `💰 ${rp(grand)} (komisi vendor ${rp(Number(ev.vendor_commission_amount))} dibayar setelah event)`;
			}
		} else if (ev.channel === "relasi") {
			let nama = "-";
			if (ev.referrer_user_id) {
				const { data: u } = await admin
					.from("users")
					.select("full_name")
					.eq("id", ev.referrer_user_id)
					.maybeSingle();
				nama = (u?.full_name as string) ?? "-";
			}
			const komisi = Number(ev.referrer_commission ?? 0);
			sumber = `🤝 Via relasi <b>${tgEscape(nama)}</b>${komisi > 0 ? ` (komisi ${rp(komisi)})` : ""}`;
		} else {
			sumber = `🤝 Direct${ev.booker_name ? ` — booker ${tgEscape(ev.booker_name as string)}` : ""}`;
		}

		// Jadwal — dukung acara dengan jeda (multi-sesi).
		const segments = parseSegments(ev.session_segments);
		const jam = hasBreak(segments)
			? formatScheduleInline(
					ev.start_time as string | null,
					ev.end_time as string | null,
					segments,
				)
			: [
					hhmm(ev.start_time as string | null),
					hhmm(ev.end_time as string | null),
				]
					.filter(Boolean)
					.join("–");
		const setup = hhmm(ev.setup_time as string | null);
		const jadwal = [
			`📅 ${dateLabel(ev.event_date as string, true)}`,
			jam ? `⏰ ${tgEscape(jam)}${setup ? ` (setup ${setup})` : ""}` : null,
		]
			.filter(Boolean)
			.join(" · ");

		const tempat = [ev.venue_name, ev.venue_city]
			.filter(Boolean)
			.map((s) => tgEscape(s as string))
			.join(", ");
		const paket = [
			pkg?.name ? `📦 ${tgEscape(pkg.name as string)}` : null,
			backdrop?.name ? `🖼 ${tgEscape(backdrop.name as string)}` : null,
		]
			.filter(Boolean)
			.join(" · ");
		const picVenue = ev.pic_name
			? `👤 PIC venue: ${tgEscape(ev.pic_name as string)}${ev.pic_wa ? ` · ${tgEscape(ev.pic_wa as string)}` : ""}`
			: null;

		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`🆕 <b>BOOKING BARU — ${tgEscape(ev.client_name as string)}</b>${kategori ? ` · ${tgEscape(kategori)}` : ""}`,
				jadwal,
				tempat ? `📍 ${tempat}` : null,
				paket || null,
				sumber,
				picVenue,
				moneyLine,
				...(appUrl ? [`\nDetail: ${appUrl}/operations/${ev.project_id}`] : []),
			]
				.filter(Boolean)
				.join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] booking:", e);
	}
}

/**
 * Event diedit owner → ringkas perubahan penting ke grup owner.
 * `changeLines` sudah berupa baris HTML siap kirim (di-escape pemanggil) —
 * pemanggil yang tahu nilai lama vs baru; fungsi ini cuma membungkus header.
 */
export async function notifyTelegramEventUpdated(
	eventId: string,
	changeLines: string[],
): Promise<void> {
	try {
		if (changeLines.length === 0) return;
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select("project_id, client_name, event_date")
			.eq("id", eventId)
			.maybeSingle();
		if (!ev) return;
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`✏️ <b>EVENT DIUBAH — ${tgEscape(ev.client_name as string)}</b> · ${dateLabel(ev.event_date as string, true)}`,
				...changeLines,
				...(appUrl ? [`\nDetail: ${appUrl}/operations/${ev.project_id}`] : []),
			].join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] updated:", e);
	}
}

/**
 * Susunan crew berubah (ditambah / dilepas / ganti peran) → grup owner.
 * `line` sudah di-escape pemanggil. Event legacy di-skip — backfill data
 * lama tidak perlu meramaikan grup.
 */
export async function notifyTelegramCrewChanged(
	eventId: string,
	line: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select("project_id, client_name, event_date, is_migrated_legacy")
			.eq("id", eventId)
			.maybeSingle();
		if (!ev || ev.is_migrated_legacy) return;
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`👥 <b>CREW EVENT — ${tgEscape(ev.client_name as string)}</b> · ${dateLabel(ev.event_date as string, true)}`,
				line,
				...(appUrl
					? [`\nDetail: ${appUrl}/operations/${ev.project_id}/crew`]
					: []),
			].join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] crew:", e);
	}
}

/** Pembayaran masuk (DP/cicilan/pelunasan) → grup owner. Event legacy di-skip. */
export async function notifyTelegramPaymentReceived(
	eventId: string,
	info: {
		typeLabel: string;
		amount: number;
		bankLabel: string | null;
		remaining: number;
	},
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select("project_id, client_name, event_date, is_migrated_legacy")
			.eq("id", eventId)
			.maybeSingle();
		if (!ev || ev.is_migrated_legacy) return;
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`💵 <b>PEMBAYARAN MASUK — ${tgEscape(ev.client_name as string)}</b> · ${dateLabel(ev.event_date as string, true)}`,
				`${info.typeLabel} <b>${rp(info.amount)}</b>${info.bankLabel ? ` → ${tgEscape(info.bankLabel)}` : ""}`,
				info.remaining <= 0
					? "✅ Tagihan LUNAS"
					: `Sisa tagihan: ${rp(info.remaining)}`,
				...(appUrl
					? [`\nDetail: ${appUrl}/operations/${ev.project_id}/payments`]
					: []),
			].join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] payment:", e);
	}
}

/** Pembayaran di-reverse (salah catat dsb.) → grup owner. */
export async function notifyTelegramPaymentReversed(
	eventId: string,
	info: { amount: number; reason: string },
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select("project_id, client_name, event_date, is_migrated_legacy")
			.eq("id", eventId)
			.maybeSingle();
		if (!ev || ev.is_migrated_legacy) return;
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`↩️ <b>PEMBAYARAN DIBATALKAN — ${tgEscape(ev.client_name as string)}</b> · ${dateLabel(ev.event_date as string, true)}`,
				`${rp(info.amount)} di-reverse${info.reason ? ` — ${tgEscape(info.reason)}` : ""}`,
				...(appUrl
					? [`\nDetail: ${appUrl}/operations/${ev.project_id}/payments`]
					: []),
			].join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] payment-reverse:", e);
	}
}

/**
 * Event dihapus (soft-delete) → grup owner. Dipanggil SETELAH delete sukses —
 * row masih ada (cuma deleted_at terisi) jadi tetap bisa di-fetch.
 */
export async function notifyTelegramEventDeleted(
	eventId: string,
	deletedByName: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: ev } = await admin
			.from("events")
			.select("client_name, event_date, grand_total, is_migrated_legacy")
			.eq("id", eventId)
			.maybeSingle();
		if (!ev || ev.is_migrated_legacy) return;
		await sendToOwnerGroup(
			[
				`🗑 <b>EVENT DIHAPUS — ${tgEscape(ev.client_name as string)}</b> · ${dateLabel(ev.event_date as string, true)}`,
				`Nilai booking ${rp(Number(ev.grand_total ?? 0))} · dihapus oleh ${tgEscape(deletedByName)}`,
			].join("\n"),
		);
	} catch (e) {
		console.error("[telegram/notify] deleted:", e);
	}
}

/**
 * Rekap crew masuk → owner diminta review. Menyertakan ringkasan biaya
 * lapangan terpilah (ditalangi crew vs dibayar owner) supaya owner tahu
 * kewajiban rembers-nya sebelum sempat membuka aplikasi.
 */
export async function notifyTelegramRekapSubmitted(
	eventId: string,
	projectId: string,
	submittedByName: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const [{ data: ev }, { data: rk }] = await Promise.all([
			admin
				.from("events")
				.select("client_name")
				.eq("id", eventId)
				.maybeSingle(),
			admin
				.from("crew_rekap")
				.select(
					`cetak_total, transport_cost, bensin_cost, toll_cost, parking_cost,
					konsumsi_cost, lainnya_items, expense_paid_by`,
				)
				.eq("event_id", eventId)
				.maybeSingle(),
		]);

		// Pilah biaya lapangan per pembayar — cermin calculate_recap_opex.
		let crewFronted = 0;
		let ownerPaid = 0;
		if (rk) {
			const pb = (rk.expense_paid_by ?? {}) as Record<string, string>;
			const add = (amount: number, payer: string | undefined) => {
				const n = Number(amount) || 0;
				if (n <= 0) return;
				if (payer === "owner") ownerPaid += n;
				else crewFronted += n;
			};
			add(Number(rk.transport_cost), pb.transport);
			add(Number(rk.bensin_cost), pb.bensin);
			add(Number(rk.toll_cost), pb.toll);
			add(Number(rk.parking_cost), pb.parking);
			add(Number(rk.konsumsi_cost), pb.konsumsi);
			for (const it of (rk.lainnya_items ?? []) as Array<{
				amount?: number;
				paid_by?: string;
			}>) {
				add(Number(it?.amount), it?.paid_by);
			}
		}

		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
		await sendToOwnerGroup(
			[
				`📥 <b>REKAP MASUK — ${tgEscape((ev?.client_name as string) ?? "Event")}</b>`,
				`${tgEscape(submittedByName)} sudah submit rekap. Review & approve supaya bisa segera settlement.`,
				rk?.cetak_total ? `🖨 Total cetak ${rk.cetak_total}` : null,
				crewFronted > 0
					? `💸 Ditalangi crew (perlu rembers): <b>${rp(crewFronted)}</b>`
					: null,
				ownerPaid > 0 ? `✓ Dibayar owner: ${rp(ownerPaid)}` : null,
				...(appUrl
					? [`\nReview: ${appUrl}/operations/${projectId}/rekap`]
					: []),
			]
				.filter(Boolean)
				.join("\n"),
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
