import assert from "node:assert/strict";
import { test } from "node:test";
import { docFilename } from "./types";

test("nama file: Jenis_Tetra Photobooth_Acara/Klien_tanggal, tanpa nomor", () => {
	assert.equal(
		docFilename("quotation", { clientName: "Yessi", issuedAt: "2026-11-18" }),
		"Quotation_Tetra Photobooth_Yessi_18 Nov 2026.pdf",
	);
	assert.equal(
		docFilename("invoice", {
			title: "Lampu Imaji",
			clientName: "Rini",
			issuedAt: "2026-07-28",
		}),
		"Invoice_Tetra Photobooth_Lampu Imaji_28 Jul 2026.pdf",
	);
	// karakter terlarang & "_" dibuang, & tetap; tanpa tanggal tetap rapi
	assert.equal(
		docFilename("receipt", {
			title: "Rilqi & Aprielya / Wedding_Day: 1",
			issuedAt: null,
		}),
		"Kuitansi_Tetra Photobooth_Rilqi & Aprielya Wedding Day 1.pdf",
	);
});
