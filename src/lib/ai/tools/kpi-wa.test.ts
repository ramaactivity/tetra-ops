import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateKpiWa, mondayOf } from "./kpi-wa";

const ev = (id: string, created: string, total: number) => ({
	id,
	project_id: `PRJ-${id}`,
	title: `Acara ${id}`,
	event_date: "2026-11-01",
	grand_total: total,
	created_at: created,
});

test("minggu mulai Senin (WIB)", () => {
	assert.equal(mondayOf("2026-10-22"), "2026-10-19"); // Kamis
	assert.equal(mondayOf("2026-10-19"), "2026-10-19"); // Senin
	assert.equal(mondayOf("2026-10-25"), "2026-10-19"); // Minggu
});

test("lead = nomor unik chat pertama di rentang; converted = event dibuat di rentang", () => {
	const r = aggregateKpiWa({
		dari: "2026-10-12",
		sampai: "2026-10-25",
		timTails: ["288150041"],
		leads: [
			// A: chat pertama di rentang, 3 pesan → 1 lead
			{ phone: "6281111111111", received_at: "2026-10-13T02:00:00Z" },
			{ phone: "081111111111", received_at: "2026-10-13T03:00:00Z" },
			{ phone: "6281111111111", received_at: "2026-10-20T03:00:00Z" },
			// B: chat pertama SEBELUM rentang → bukan lead baru
			{ phone: "6282222222222", received_at: "2026-10-01T02:00:00Z" },
			{ phone: "6282222222222", received_at: "2026-10-14T02:00:00Z" },
			// C: minggu kedua
			{ phone: "6283333333333", received_at: "2026-10-21T02:00:00Z" },
			// nomor tim tidak dihitung
			{ phone: "6281288150041", received_at: "2026-10-14T02:00:00Z" },
			// 23:30 WIB tanggal 11 = sebelum rentang
			{ phone: "6284444444444", received_at: "2026-10-11T16:30:00Z" },
		],
		converted: [
			// A booking minggu pertama: dua baris lead → satu converted
			{
				phone: "6281111111111",
				name: "Ani",
				received_at: "2026-10-13T02:00:00Z",
				event: ev("a", "2026-10-15T05:00:00Z", 2_500_000),
			},
			{
				phone: "6281111111111",
				name: "Ani",
				received_at: "2026-10-13T03:00:00Z",
				event: ev("a", "2026-10-15T05:00:00Z", 2_500_000),
			},
			// B (lead lama) booking minggu kedua tetap dihitung converted
			{
				phone: "6282222222222",
				name: "Budi",
				received_at: "2026-10-01T02:00:00Z",
				event: ev("b", "2026-10-22T05:00:00Z", 3_000_000),
			},
			// event dibuat sebelum rentang → tidak dihitung
			{
				phone: "6285555555555",
				name: "Cici",
				received_at: "2026-09-01T02:00:00Z",
				event: ev("c", "2026-09-10T05:00:00Z", 9_000_000),
			},
		],
	});
	assert.equal(r.lead_wa, 2);
	assert.equal(r.converted, 2);
	assert.equal(r.nilai_booking, 5_500_000);
	assert.equal(r.konversi_persen, 100);
	assert.deepEqual(
		r.per_minggu.map((w) => [w.minggu_mulai, w.lead_wa, w.converted, w.nilai]),
		[
			["2026-10-12", 1, 1, 2_500_000],
			["2026-10-19", 1, 1, 3_000_000],
		],
	);
	assert.equal(r.daftar_converted[0].hari_sampai_booking, 2);
	assert.equal(r.daftar_converted[1].lead_pertama, "2026-10-01");
});
