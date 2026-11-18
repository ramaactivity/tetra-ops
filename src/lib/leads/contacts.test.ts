import assert from "node:assert/strict";
import { test } from "node:test";
import {
	contactStage,
	groupLeadRows,
	type LeadAggRow,
	type StageDoc,
	type StageEvent,
	segmentKey,
} from "./contacts";

const row = (o: Partial<LeadAggRow>): LeadAggRow => ({
	wa_jid: "1@lid",
	phone: "6281211112222",
	name: "Yessi",
	topic: "pricelist",
	status: "new",
	received_at: "2026-11-10T03:00:00Z",
	segment: "Pribadi",
	event_date: null,
	converted_event_id: null,
	converted_at: null,
	...o,
});

test("groupLeadRows: satu entri per kontak, data terbaru menang", () => {
	const [a, b] = groupLeadRows([
		row({
			received_at: "2026-11-12T03:00:00Z",
			topic: "booking",
			event_date: "2026-12-20",
			name: null,
		}),
		row({ wa_jid: "2@lid", phone: "144439901184133", name: "LID saja" }),
		row({
			received_at: "2026-11-01T03:00:00Z",
			topic: "pricelist",
			event_date: "2026-12-01",
			segment: "Corporate",
		}),
	]);
	assert.equal(a.count, 2);
	assert.equal(a.name, "Yessi");
	assert.equal(a.firstAt, "2026-11-01T03:00:00Z");
	assert.equal(a.lastAt, "2026-11-12T03:00:00Z");
	assert.deepEqual(a.topics, ["booking", "pricelist"]);
	assert.equal(a.eventDate, "2026-12-20");
	assert.equal(a.segment, "private");
	assert.equal(b.phone, null);
});

test("segmentKey: kontak bot menang, label bot dipetakan", () => {
	assert.equal(segmentKey("EO/WO"), "eo_wo");
	assert.equal(segmentKey("Corporate", "venue"), "venue");
	assert.equal(segmentKey("Aneh"), "private");
});

test("contactStage: urutan tahap", () => {
	const [c] = groupLeadRows([
		row({}),
		row({ received_at: "2026-11-09T03:00:00Z" }),
	]);
	const [single] = groupLeadRows([row({})]);
	const none = new Map<string, StageEvent>();
	assert.equal(contactStage(single, none, []).stage, "baru");
	assert.equal(contactStage(c, none, []).stage, "ngobrol");

	const quo: StageDoc = {
		id: "q1",
		doc_type: "quotation",
		doc_number: "QUO-1",
		status: "sent",
		event_id: null,
		created_at: "2026-11-11T00:00:00Z",
		jid: "1@lid",
		tail: null,
	};
	assert.deepEqual(contactStage(c, none, [quo]), {
		stage: "quotation",
		ref: { label: "QUO-1", href: "/finance/dokumen/q1" },
	});
	assert.equal(
		contactStage(c, none, [{ ...quo, status: "accepted" }]).stage,
		"invoice",
	);
	// dokumen sebelum pesan pertama = acara lama, tidak dihitung
	assert.equal(
		contactStage(c, none, [{ ...quo, created_at: "2026-01-01T00:00:00Z" }])
			.stage,
		"ngobrol",
	);

	const ev = (o: Partial<StageEvent>): Map<string, StageEvent> =>
		new Map([
			[
				"e1",
				{
					id: "e1",
					project_id: "PRJ-1",
					status: "upcoming",
					payment_status: "unpaid",
					deleted_at: null,
					...o,
				},
			],
		]);
	const inv: StageDoc = {
		...quo,
		id: "i1",
		doc_type: "invoice",
		doc_number: "INV-1",
		jid: null,
		tail: "211112222",
		event_id: "e1",
	};
	assert.equal(contactStage(c, ev({}), [quo, inv]).stage, "invoice");
	assert.equal(
		contactStage(c, ev({ payment_status: "dp" }), [inv]).stage,
		"booking",
	);

	const [conv] = groupLeadRows([row({ converted_event_id: "e1" })]);
	assert.deepEqual(contactStage(conv, ev({ status: "cancelled" }), []), {
		stage: "batal",
		ref: { label: "Lihat acara", href: "/operations/PRJ-1" },
	});
	const [ign] = groupLeadRows([row({ status: "ignored" })]);
	assert.equal(contactStage(ign, none, [quo]).stage, "batal");
});
