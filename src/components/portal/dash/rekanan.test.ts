import assert from "node:assert/strict";
import { test } from "node:test";
import type { RekananRow } from "@/lib/portal/vendor";
import { todo } from "./rekanan";

const row = (p: Partial<RekananRow>): RekananRow => ({
	code: "ABC123",
	eventId: "e",
	projectId: "PRJ",
	title: "Acara",
	date: "2026-10-20",
	start: null,
	venue: null,
	status: "resmi",
	payer: "klien",
	remaining: null,
	clientInvited: true,
	designDone: true,
	missingData: 0,
	commission: null,
	...p,
});

test("dasbor rekanan: perlu tindakan hanya untuk acara mendatang", () => {
	const today = "2026-10-09";
	assert.deepEqual(todo(row({}), today), []);
	assert.deepEqual(
		todo(row({ clientInvited: false, designDone: false }), today),
		["Klien belum diundang", "Desain belum disetujui"],
	);
	// desain baru dikejar ≤30 hari sebelum acara
	assert.deepEqual(
		todo(row({ designDone: false, date: "2026-12-20" }), today),
		[],
	);
	assert.deepEqual(todo(row({ payer: "wo", remaining: 2_000_000 }), today), [
		"Sisa tagihan Rp2.000.000",
	]);
	assert.deepEqual(
		todo(row({ status: "draf", payer: "wo", missingData: 2 }), today),
		["2 data acara kurang", "Belum DP"],
	);
	// acara lewat / batal tidak dihitung
	assert.deepEqual(
		todo(row({ clientInvited: false, date: "2026-09-01" }), today),
		[],
	);
	assert.deepEqual(
		todo(row({ clientInvited: false, status: "batal" }), today),
		[],
	);
});
