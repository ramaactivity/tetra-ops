/** POST /api/bot/quotation: auth, validasi, dan hanya membuat draft. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { handleBotQuotation } from "./bot-quotation";

const body = {
	external_id: "wa:628123@s.whatsapp.net:1",
	klien: { nama: "Nadia" },
	layanan: [{ kategori: "photobooth_classic", jam: 3, format: "4R" }],
	sumber: { jenis: "wa_bot" },
};

test("token salah → 401 tanpa membuat apa pun", async () => {
	let called = false;
	const res = await handleBotQuotation({
		authorized: false,
		json: body,
		create: async () => {
			called = true;
			return { error: "x" };
		},
	});
	assert.equal(res.status, 401);
	assert.equal(called, false);
});

test("validasi: external_id, layanan, sumber wajib", async () => {
	const create = async () => ({ error: "tidak boleh terpanggil" });
	for (const bad of [
		null,
		{ ...body, external_id: "" },
		{ ...body, layanan: [] },
		{ ...body, sumber: { jenis: "email" } },
		{
			...body,
			layanan: [{ kategori: "photobooth_classic", jam: 3, format: "A4" }],
		},
	]) {
		const res = await handleBotQuotation({
			authorized: true,
			json: bad,
			create,
		});
		assert.equal(res.status, 400);
	}
});

test("valid → draft dibuat dengan external_id, respons ringkas", async () => {
	let got: unknown[] = [];
	const res = await handleBotQuotation({
		authorized: true,
		json: body,
		create: async (input, ext) => {
			got = [input, ext];
			return {
				id: "doc-1",
				doc_number: "QUO-TP-01-27092026",
				butuh_isian_admin: [],
				url_editor: "https://x/finance/dokumen/doc-1",
			};
		},
	});
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, {
		id: "doc-1",
		doc_number: "QUO-TP-01-27092026",
		butuh_isian_admin: [],
		url_editor: "https://x/finance/dokumen/doc-1",
	});
	assert.equal(got[1], body.external_id);
	assert.ok(!("external_id" in (got[0] as object)));
});

test("aturan bisnis gagal (paket tak ada) → 422", async () => {
	const res = await handleBotQuotation({
		authorized: true,
		json: body,
		create: async () => ({ error: "tidak ada paket" }),
	});
	assert.equal(res.status, 422);
});
