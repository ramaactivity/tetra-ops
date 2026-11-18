import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type BillRow,
	type BillStatus,
	billStatus,
	dueLabel,
	type PaidEntry,
} from "./recurring-bills";

const bill = (p: Partial<BillRow>): BillRow => ({
	id: "b",
	name: "Tagihan",
	next_due: "2026-12-01",
	cycle: "monthly",
	is_enabled: true,
	notes: null,
	amount: null,
	category_id: null,
	match_keyword: null,
	kind: "bill",
	manual_paid_due: null,
	...p,
});

// Jurnal asli Okt–Nov 2026.
const entries: PaidEntry[] = [
	{
		ref: "k11",
		date: "2026-11-02",
		period: "2026-11",
		description: "Bayar kost — November 2026",
		coa: "5-260",
	},
	{
		ref: "v10",
		date: "2026-10-21",
		period: "2026-10",
		description: "VPS Sumopod — Oktober 2026",
		coa: "5-400",
	},
	{
		ref: "t11",
		date: "2026-11-18",
		period: "2026-11",
		description: "Token AI — November 2026",
		coa: "5-400",
	},
	{
		ref: "s10",
		date: "2026-10-19",
		period: "2026-10",
		description: "Telkomsel admin — Oktober 2026",
		coa: "5-270",
	},
];

const kost = bill({
	name: "Kost",
	category_id: "bayar-kost",
	match_keyword: "kost",
});
const vps = bill({
	name: "VPS Sumopod",
	next_due: "2026-11-21",
	category_id: "platform",
	match_keyword: "vps",
});
const telkomsel = bill({
	name: "Telkomsel",
	next_due: "2026-11-28",
	category_id: "bayar-internet",
	match_keyword: "telkomsel",
});

test("kost November sudah dibayar → yang diawasi 1 Des; diingatkan H-3", () => {
	const s = billStatus(kost, entries, [], "2026-11-18");
	assert.equal(s?.due, "2026-12-01");
	assert.equal(s?.lastPaid?.ref, "k11");
	assert.equal(s?.urgency, "nanti");
	assert.equal(s?.remindToday, false);
	assert.equal(billStatus(kost, entries, [], "2026-11-28")?.remindToday, true);
});

test("VPS: jatuh tempo 21 Nov belum dibayar; Token AI (akun sama) tidak dihitung", () => {
	const s = billStatus(vps, entries, [], "2026-11-18");
	assert.equal(s?.due, "2026-11-21");
	assert.equal(s?.lastPaid?.ref, "v10"); // Oktober lunas, November belum
	assert.equal(s?.urgency, "segera");
	assert.equal(s?.daysLeft, 3);
	assert.equal(s?.remindToday, true);
	assert.equal(dueLabel(s as BillStatus), "jatuh tempo 3 hari lagi (21 Nov)");
});

test("telat tidak digeser diam-diam; diingatkan H+1, H+3, H+7", () => {
	// November belum dibayar → masuk Desember tetap tampil telat (bukan loncat ke 28 Des)
	const s = billStatus(telkomsel, entries, [], "2026-12-01");
	assert.equal(s?.due, "2026-11-28");
	assert.equal(s?.urgency, "telat");
	assert.equal(s?.remindToday, true);
	const nov = billStatus(telkomsel, entries, [], "2026-11-29");
	assert.equal(nov?.urgency, "telat");
	assert.equal(nov?.remindToday, true);
	assert.equal(
		billStatus(telkomsel, entries, [], "2026-11-30")?.remindToday,
		false,
	);
	// lewat H+7 tetap diingatkan seminggu sekali, bukan diam selamanya
	assert.equal(
		billStatus(telkomsel, entries, [], "2026-12-12")?.remindToday,
		true,
	);
	assert.equal(
		billStatus(telkomsel, entries, [], "2026-12-13")?.remindToday,
		false,
	);
	const q = bill({
		cycle: "quarterly",
		next_due: "2026-09-18",
		match_keyword: "x",
	});
	assert.equal(billStatus(q, [], [], "2026-11-18")?.urgency, "telat");
});

test("bagi hasil lunas kalau ada penarikan di bulan itu; tandai manual juga lunas", () => {
	const bh = bill({ kind: "bagi_hasil", name: "Bagi hasil owner" });
	const belum = billStatus(bh, [], [], "2026-11-18");
	assert.equal(belum?.urgency, "telat");
	assert.equal(dueLabel(belum as BillStatus), "belum diambil sejak 1 Nov");
	assert.equal(
		billStatus(bh, [], ["2026-11-03"], "2026-11-18")?.due,
		"2026-12-01",
	);
	// narik sekaligus di Desember → jatah November ikut lunas
	assert.equal(
		billStatus(bh, [], ["2026-12-02"], "2026-12-05")?.due,
		"2027-01-01",
	);
	const m = bill({
		next_due: "2026-11-21",
		manual_paid_due: "2026-11-21",
		match_keyword: "vps",
	});
	assert.equal(billStatus(m, [], [], "2026-11-18")?.due, "2026-12-21");
});

test("tanggal 31 dipotong ke akhir bulan; tanpa jadwal = null", () => {
	const b31 = bill({ next_due: "2027-03-31", match_keyword: "x" });
	assert.equal(billStatus(b31, [], [], "2027-02-10")?.due, "2027-02-28");
	assert.equal(
		billStatus(bill({ next_due: null }), [], [], "2026-11-18"),
		null,
	);
});
