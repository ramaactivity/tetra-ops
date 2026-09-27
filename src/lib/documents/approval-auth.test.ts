/** Tombol "Kirim ke klien" di Telegram hanya boleh dari owner terdaftar. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isOwnerTg, parseDocSendCallback } from "./approval-auth";

test("callback ks:<uuid> dikenali, lainnya tidak", () => {
	const id = "0f3caa27-b6f4-40a2-bb5b-0c8960148015";
	assert.equal(parseDocSendCallback(`ks:${id}`), id);
	assert.equal(parseDocSendCallback("ks:bukan-uuid"), null);
	assert.equal(parseDocSendCallback("m:main"), null);
	assert.equal(parseDocSendCallback(undefined), null);
});

test("hanya user id owner yang lolos", () => {
	assert.equal(isOwnerTg(111, [111, 222]), true);
	assert.equal(isOwnerTg(111, ["111"]), true);
	assert.equal(isOwnerTg(333, [111, 222]), false); // desainer/crew di grup
	assert.equal(isOwnerTg(null, [111]), false);
	assert.equal(isOwnerTg(111, []), false); // belum ada owner terdaftar
});
