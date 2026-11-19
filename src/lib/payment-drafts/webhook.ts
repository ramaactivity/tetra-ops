import { createHmac } from "node:crypto";

/**
 * Webhook "pembayaran tercatat" ke Hermes (DR-055 M2). Hermes hanya menyusun
 * usulan kuitansi + mengabari Rama di topic Tetra; tidak mengirim ke klien.
 *
 * Tanda tangan V2 (kontrak sesi hermes-15):
 *   X-Webhook-Timestamp: unix detik (Hermes menerima ±300 dtk)
 *   X-Webhook-Signature-V2: hex(HMAC_SHA256(secret, "<timestamp>." + raw body))
 * Body yang ditandatangani = body yang dikirim, byte-for-byte.
 *
 * Bagian ini murni (tanpa server-only) supaya bisa diuji.
 */

export const WEBHOOK_PATH = "/webhooks/pembayaran-tercatat";

export function signatureV2(
	secret: string,
	timestamp: number,
	rawBody: string,
): string {
	return createHmac("sha256", secret)
		.update(`${timestamp}.${rawBody}`)
		.digest("hex");
}

/**
 * URL webhook dari alamat Hermes yang didaftarkan VPS (system_config
 * hermes_api_url, quick tunnel — berubah tiap restart, jangan di-hardcode).
 */
export function webhookUrl(registered: unknown): string | null {
	const base =
		typeof registered === "string" ? registered.trim().replace(/\/+$/, "") : "";
	return /^https:\/\//.test(base) ? `${base}${WEBHOOK_PATH}` : null;
}

export type PembayaranTercatat = {
	draft_id: string;
	nama_klien: string | null;
	client_wa: string | null;
	nominal: number;
	nama_pengirim: string | null;
	invoice_no: string | null;
	booking_inbox_id: string | null;
	/** Sama dengan booking_inbox_id — placeholder {booking_id} di route Hermes. */
	booking_id: string | null;
	event_id: string;
	project_id: string | null;
	payment_id: string;
	kuitansi_no: string | null;
	kuitansi_url: string | null;
	/** true = panggilan uji; Hermes boleh mengabaikan / menandai UJI. */
	uji?: boolean;
};

export function signedRequest(
	secret: string,
	payload: PembayaranTercatat,
	nowMs = Date.now(),
): { body: string; headers: Record<string, string> } {
	const body = JSON.stringify(payload);
	const ts = Math.floor(nowMs / 1000);
	return {
		body,
		headers: {
			"Content-Type": "application/json",
			"X-Webhook-Timestamp": String(ts),
			"X-Webhook-Signature-V2": signatureV2(secret, ts, body),
		},
	};
}
