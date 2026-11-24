import assert from "node:assert/strict";
import { test } from "node:test";
import { cekKesiapan, type KesiapanInput } from "./kesiapan";

const saadah: KesiapanInput = {
	projectId: "PRJ-20261122-5006",
	disetujui: false,
	transport: "rental",
	sewaMobil: null,
	crewCount: 1,
	durasiJam: 8,
	biaya: [
		{ label: "Bensin", amount: 100_000, nota: false },
		{ label: "Parkir", amount: 25_000, nota: false },
		{ label: "gojek anter mobil", amount: 15_000, nota: false },
	],
	ujDilapor: 0,
	ujTercatat: 0,
	sisaTagihan: 1_500_000,
};

const level = (cs: ReturnType<typeof cekKesiapan>, key: string) =>
	cs.find((c) => c.key === key)?.level;

test("kasus Sa'adah: rekap, sewa mobil, crew, nota, piutang", () => {
	const c = cekKesiapan(saadah);
	assert.equal(level(c, "rekap"), "perlu");
	assert.equal(level(c, "sewa"), "perlu");
	assert.equal(level(c, "crew"), "cek");
	assert.equal(level(c, "nota"), "cek");
	assert.match(c.find((x) => x.key === "nota")?.judul ?? "", /3 dari 3/);
	assert.equal(level(c, "tagihan"), "cek");
	assert.equal(level(c, "uj"), undefined);
});

test("semua beres → semua ok", () => {
	const c = cekKesiapan({
		...saadah,
		disetujui: true,
		sewaMobil: 250_000,
		crewCount: 2,
		biaya: saadah.biaya.map((b) => ({ ...b, nota: true })),
		sisaTagihan: 0,
	});
	assert.ok(
		c.every((x) => x.level === "ok"),
		JSON.stringify(c),
	);
});

test("uang jalan & extend belum beres → perlu", () => {
	const c = cekKesiapan({
		...saadah,
		ujDilapor: 250_000,
		ujTercatat: 0,
		extendJam: 1,
		extendDitagih: false,
	});
	assert.equal(level(c, "uj"), "perlu");
	assert.equal(level(c, "extend"), "perlu");
	assert.equal(
		level(
			cekKesiapan({ ...saadah, extendJam: 1, extendDitagih: true }),
			"extend",
		),
		"ok",
	);
});

test("transport online / tanpa crew", () => {
	assert.equal(
		level(cekKesiapan({ ...saadah, transport: "online" }), "sewa"),
		undefined,
	);
	assert.equal(
		level(cekKesiapan({ ...saadah, crewCount: 0 }), "crew"),
		"perlu",
	);
});
