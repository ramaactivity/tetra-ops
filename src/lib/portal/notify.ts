import "server-only";

import { formatDateID, formatRupiah } from "@/lib/format";
import { PRODUCT_LABELS } from "@/lib/portal/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { tgEscape } from "@/lib/telegram/client";
import { sendToOwnerGroup } from "@/lib/telegram/notify";

/**
 * Kabar seputar booking portal. Semua best-effort: TIDAK PERNAH throw, karena
 * gagal mengabari tidak boleh menggagalkan booking/pembayaran yang memicunya.
 */

const appUrl = () =>
	process.env.NEXT_PUBLIC_APP_URL ?? "https://tetra-ops-lac.vercel.app";

/** Link portal yang dikirim ke klien. */
export function portalUrl(code?: string): string {
	return `${process.env.PORTAL_BASE_URL ?? appUrl()}/akun${code ? `/booking/${code}` : ""}`;
}

/**
 * Pesan WA ke klien lewat antrean bot. Perintah `send-portal:` punya jalur
 * sendiri di bot (di luar rem 15/hari milik sapaan sales), karena ini pesan
 * transaksi yang ditunggu klien.
 */
export async function sendClientWa(phone: string, text: string): Promise<void> {
	try {
		const { error } = await createAdminClient()
			.from("bot_commands")
			.insert({
				command: `send-portal:${JSON.stringify({ nomor: phone, pesan: text })}`,
				status: "pending",
			});
		if (error) console.error("[portal/notify] bot_commands:", error.message);
	} catch (e) {
		console.error("[portal/notify] sendClientWa:", e);
	}
}

/** Owner/admin: ada DP portal yang harus dicek. Telegram grup + notifikasi in-app. */
export async function notifyPortalPaymentSubmitted(
	submissionId: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: s } = await admin
			.from("payment_submissions")
			.select(
				"amount, kind, booking:client_bookings(public_code, service_type, package_hours, event_date, detail, quoted_total), person:portal_people!payment_submissions_submitted_by_fkey(name, phone)",
			)
			.eq("id", submissionId)
			.maybeSingle();
		if (!s) return;
		// to-one embed → object.
		const b = s.booking as unknown as {
			public_code: string;
			service_type: string;
			package_hours: number;
			event_date: string;
			detail: { nama_acara?: string };
			quoted_total: number;
		};
		const p = s.person as unknown as {
			name: string | null;
			phone: string;
		} | null;
		const acara = b.detail?.nama_acara || "(belum diberi nama)";
		const title = `${s.kind === "dp" ? "DP" : "Pembayaran"} portal ${formatRupiah(Number(s.amount))} menunggu dicek`;
		const url = `${appUrl()}/operations/portal`;

		await sendToOwnerGroup(
			[
				`💳 <b>${tgEscape(title)}</b>`,
				`${tgEscape(acara)} · ${tgEscape(PRODUCT_LABELS[b.service_type] ?? b.service_type)} ${b.package_hours} jam`,
				`📅 ${tgEscape(formatDateID(b.event_date))} · total ${tgEscape(formatRupiah(Number(b.quoted_total)))}`,
				`👤 ${tgEscape(p?.name ?? "-")} (${tgEscape(p?.phone ?? "-")}) · kode ${b.public_code}`,
				`Slot ditahan sampai dicek. <a href="${url}">Cek bukti transfer</a>`,
			].join("\n"),
		);

		const { data: owners } = await admin
			.from("users")
			.select("id, role")
			.eq("is_active", true)
			.is("deleted_at", null);
		const rows = (owners ?? [])
			.filter((u) => u.role === "owner" || u.role === "super_admin")
			.map((u) => ({
				user_id: u.id,
				severity: "warning",
				category: "financial",
				title,
				body: `${acara} — ${formatDateID(b.event_date)}. Cek bukti transfer lalu terima atau tolak.`,
				entity_type: "client_booking",
				entity_id: submissionId,
				action_url: "/operations/portal",
			}));
		if (rows.length) await admin.from("notifications").insert(rows);
	} catch (e) {
		console.error("[portal/notify] payment submitted:", e);
	}
}

/** Owner/admin: klien mengajukan pindah tanggal / batal. */
export async function notifyPortalRequest(
	requestId: string,
	slotAvailable: boolean | null,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: r } = await admin
			.from("booking_requests")
			.select(
				"kind, new_date, new_start, reason, refund_estimate, booking:client_bookings(public_code, event_date, detail), person:portal_people!booking_requests_requested_by_fkey(name, phone)",
			)
			.eq("id", requestId)
			.maybeSingle();
		if (!r) return;
		const b = r.booking as unknown as {
			public_code: string;
			event_date: string;
			detail: { nama_acara?: string };
		};
		const p = r.person as unknown as {
			name: string | null;
			phone: string;
		} | null;
		const acara = b.detail?.nama_acara || b.public_code;
		const title =
			r.kind === "batal"
				? `Klien minta BATAL: ${acara}`
				: `Klien minta pindah tanggal: ${acara}`;
		const lines = [
			`📝 <b>${tgEscape(title)}</b>`,
			`Tanggal sekarang ${tgEscape(formatDateID(b.event_date))} · ${tgEscape(p?.name ?? "-")} (${tgEscape(p?.phone ?? "-")})`,
		];
		if (r.kind === "pindah_tanggal" && r.new_date)
			lines.push(
				`Mau pindah ke ${tgEscape(formatDateID(r.new_date))}${r.new_start ? ` jam ${String(r.new_start).slice(0, 5)}` : ""} · slot ${slotAvailable === null ? "belum dicek" : slotAvailable ? "masih ada ✅" : "PENUH ⚠️"}`,
			);
		if (r.kind === "batal")
			lines.push(
				`Perkiraan refund (DR-034): ${tgEscape(formatRupiah(Number(r.refund_estimate ?? 0)))}`,
			);
		if (r.reason) lines.push(`Alasan: ${tgEscape(r.reason)}`);
		lines.push(
			`<a href="${appUrl()}/operations/portal">Proses di Booking Portal</a>`,
		);
		await sendToOwnerGroup(lines.join("\n"));

		const { data: owners } = await admin
			.from("users")
			.select("id, role")
			.eq("is_active", true)
			.is("deleted_at", null);
		const rows = (owners ?? [])
			.filter((u) => u.role === "owner" || u.role === "super_admin")
			.map((u) => ({
				user_id: u.id,
				severity: r.kind === "batal" ? "alert" : "warning",
				category: "operational",
				title,
				body: "Cek dan proses permintaan klien di Booking Portal.",
				entity_type: "booking_request",
				entity_id: requestId,
				action_url: "/operations/portal",
			}));
		if (rows.length) await admin.from("notifications").insert(rows);
	} catch (e) {
		console.error("[portal/notify] request:", e);
	}
}
