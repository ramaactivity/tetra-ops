/**
 * Webhook "pembayaran tercatat" ke Hermes: tanda tangan V2 + URL dari alamat
 * terdaftar. Jalankan: `pnpm test`.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { signatureV2, signedRequest, webhookUrl } from "./webhook";

test("tanda tangan V2 = HMAC-SHA256(secret, '<ts>.' + body) hex", () => {
	// Vektor dihitung terpisah (bukan memanggil fungsi yang diuji).
	const expected = createHmac("sha256", "rahasia")
		.update('1795060000.{"a":1}')
		.digest("hex");
	assert.equal(signatureV2("rahasia", 1795060000, '{"a":1}'), expected);
	assert.match(expected, /^[0-9a-f]{64}$/);
	assert.notEqual(signatureV2("rahasia", 1795060001, '{"a":1}'), expected);
});

test("permintaan bertanda tangan: body yang ditandatangani = body yang dikirim", () => {
	const r = signedRequest(
		"s",
		{
			draft_id: "d",
			nama_klien: "Yessi",
			client_wa: "6281298116793",
			nominal: 700000,
			nama_pengirim: "AGRET ANGGRAINI",
			invoice_no: "INV-TP-34-18112026",
			booking_inbox_id: "b",
			event_id: "e",
			project_id: "PRJ-1",
			payment_id: "p",
			kuitansi_no: "KW-1",
			kuitansi_url: "https://team.tetraphoto.com/finance/dokumen/k",
		},
		1795060000_123,
	);
	assert.equal(r.headers["X-Webhook-Timestamp"], "1795060000");
	assert.equal(
		r.headers["X-Webhook-Signature-V2"],
		signatureV2("s", 1795060000, r.body),
	);
	assert.equal(JSON.parse(r.body).nominal, 700000);
});

test("URL webhook dibangun dari alamat terdaftar, bukan hardcode", () => {
	assert.equal(
		webhookUrl("https://abc.trycloudflare.com/p/tetra/"),
		"https://abc.trycloudflare.com/p/tetra/webhooks/pembayaran-tercatat",
	);
	assert.equal(webhookUrl("http://tidak-aman"), null);
	assert.equal(webhookUrl(null), null);
});
