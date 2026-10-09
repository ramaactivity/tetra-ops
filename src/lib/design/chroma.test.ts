import assert from "node:assert/strict";
import { test } from "node:test";
import { keyColor, suggestKeyColor } from "./chroma";
import { detectSlots } from "./detect";

/** Kanvas putih w×h dengan kotak kuning penanda + satu bintik kuning kecil. */
function frame(w: number, h: number) {
	const d = new Uint8ClampedArray(w * h * 4).fill(255);
	const paint = (x0: number, y0: number, ww: number, hh: number) => {
		for (let y = y0; y < y0 + hh; y++)
			for (let x = x0; x < x0 + ww; x++)
				d.set([255, 222, 89, 255], (y * w + x) * 4);
	};
	paint(10, 10, 40, 30); // kotak foto 1
	paint(10, 60, 40, 30); // kotak foto 2
	paint(80, 95, 2, 2); // bintik dekorasi — harus tetap ada
	return d;
}

test("chroma key: kotak warna penanda jadi lubang, bintik kecil utuh, slot terdeteksi", () => {
	const [w, h] = [100, 100];
	const d = frame(w, h);
	assert.equal(suggestKeyColor(d, w, h).toLowerCase().slice(0, 3), "#ff");
	const cleared = keyColor(d, w, h, { color: "#ffde59" });
	assert.equal(cleared, 2 * 40 * 30);
	assert.equal(d[(95 * w + 80) * 4 + 3], 255, "bintik kecil tetap opaque");
	const slots = detectSlots(d, w, h);
	assert.equal(slots.length, 2);
	assert.ok(slots[0].y < slots[1].y);
	assert.deepEqual([slots[0].w, slots[0].h], [44, 34]); // + pad 2 px tiap sisi
});
