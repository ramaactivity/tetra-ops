import assert from "node:assert/strict";
import { test } from "node:test";
import { sapaKlien, teksQuotation } from "./pesan-klien";

test("quotation ke klien: sapa Kak + nama orang, istilah quotation, tanpa penawaran/basa-basi (owner 16 Nov, Riska)", () => {
	const t = teksQuotation({
		client: { name: "Riska", attn: null },
		tanggalAcara: "10 Jan 2027",
		total: "Rp 2.500.000",
		berlakuSampai: "30 Nov 2026",
	});
	assert.equal(
		t,
		"Halo Kak Riska, berikut quotation-nya untuk acara 10 Jan 2027 ya.\nTotalnya Rp 2.500.000, berlaku sampai 30 Nov 2026. Tanggalnya terkunci setelah DP minimal Rp 500.000.",
	);
	assert.doesNotMatch(t, /penawaran|Kabari kami|🙏/);
});

test("sapaan: u.p. dipakai, nama lembaga tidak, sapaan bawaan tidak dobel", () => {
	assert.equal(
		sapaKlien({
			name: "Padjadjaran Suites Resort & Convention Bogor",
			attn: "Muhammad Rofiq",
		}),
		"Kak Muhammad Rofiq",
	);
	assert.equal(sapaKlien({ name: "PT BIPO", attn: null }), "Kak");
	assert.equal(sapaKlien({ name: "Bu Ani", attn: null }), "Bu Ani");
});
