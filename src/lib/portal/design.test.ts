/**
 * Validasi file desain (kontrak Booth §2.3) + ringkasan status desain.
 * Jalankan: `pnpm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	checkDesignFile,
	designStatusFor,
	readPngInfo,
	revisionLeft,
} from "./design";

test("ukuran pricelist (2×) dan kanvas 1× diterima, orientasi terbaca", () => {
	assert.deepEqual(checkDesignFile("4R", 2400, 3600), {
		ok: true,
		orientation: "portrait",
	});
	assert.deepEqual(checkDesignFile("4R", 1800, 1200), {
		ok: true,
		orientation: "landscape",
	});
	assert.deepEqual(checkDesignFile("2R", 1200, 3600), {
		ok: true,
		orientation: "portrait",
	});
	assert.deepEqual(checkDesignFile("polaroid", 2400, 1800), {
		ok: true,
		orientation: "landscape",
	});
	assert.deepEqual(checkDesignFile("polaroid", 900, 1200), {
		ok: true,
		orientation: "portrait",
	});
});

test("rasio salah / resolusi kurang ditolak", () => {
	assert.equal(checkDesignFile("4R", 1080, 1920).ok, false); // 9:16
	assert.equal(checkDesignFile("2R", 1200, 1800).ok, false); // itu 4R
	const kecil = checkDesignFile("4R", 600, 900);
	assert.ok(!kecil.ok && /minimal/.test(kecil.error));
	assert.equal(checkDesignFile("4R", 1203, 1800).ok, true); // < 1% toleransi
});

function png(width: number, height: number, colorType: number): Uint8Array {
	const b = new Uint8Array(40);
	b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
	const dv = new DataView(b.buffer);
	dv.setUint32(16, width);
	dv.setUint32(20, height);
	b[24] = 8;
	b[25] = colorType;
	return b;
}

test("header PNG: ukuran + kanal alpha; bukan PNG = null", () => {
	assert.deepEqual(readPngInfo(png(2400, 3600, 6)), {
		width: 2400,
		height: 3600,
		hasAlphaChannel: true,
	});
	assert.equal(readPngInfo(png(1200, 1800, 2))?.hasAlphaChannel, false);
	assert.equal(
		readPngInfo(
			new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)]),
		),
		null,
	);
});

test("status desain event & sisa revisi", () => {
	assert.equal(designStatusFor([]), "belum");
	assert.equal(designStatusFor(["brief"]), "belum");
	assert.equal(designStatusFor(["brief", "dikerjakan"]), "proses");
	assert.equal(designStatusFor(["acc"]), "proses");
	assert.equal(revisionLeft(1, 3), 2);
	assert.equal(revisionLeft(4, 3), 0);
});
