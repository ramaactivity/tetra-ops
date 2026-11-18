import assert from "node:assert/strict";
import { test } from "node:test";
import { saldoAiView } from "./saldo-ai";

const now = new Date("2026-11-18T13:00:00+07:00").getTime();
const base = {
	sisa_usd: 9.277,
	laju_usd_per_hari: 1.5,
	hari_tersisa: 6.2,
	menipis: false,
	diperbarui: "2026-11-18T12:23:38+0700",
};

test("saldo AI: sehat → dolar, perkiraan rupiah, sisa hari", () => {
	assert.deepEqual(saldoAiView(base, now), {
		value: "$9,28",
		hint: "≈ Rp165.594 · cukup ±6 hari",
		merah: false,
	});
});

test("saldo AI: menipis atau basi > 3 jam → merah", () => {
	assert.equal(saldoAiView({ ...base, menipis: true }, now).badge, "Menipis");
	const basi = saldoAiView(
		{ ...base, diperbarui: "2026-11-18T09:00:00+0700" },
		now,
	);
	assert.equal(basi.merah, true);
	assert.equal(basi.badge, "Basi");
	assert.equal(saldoAiView(null, now).merah, true);
	assert.match(
		saldoAiView({ ...base, hari_tersisa: null }, now).hint,
		/belum terbaca/,
	);
});
