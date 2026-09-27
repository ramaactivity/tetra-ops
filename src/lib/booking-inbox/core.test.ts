/**
 * Endpoint POST /api/bot/booking lewat handler murni + store Map:
 * auth, validasi, upsert idempoten, dan aturan status. Jalankan: `pnpm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { handleBotBooking, type InboxRow, type InboxStore } from "./core";

function memStore() {
	const rows = new Map<string, InboxRow>();
	let n = 0;
	const store: InboxStore = {
		async findByExternalId(ext) {
			return [...rows.values()].find((r) => r.external_id === ext) ?? null;
		},
		async insert(row) {
			const r = {
				...row,
				id: `id-${++n}`,
				created_at: "t",
				updated_at: "t",
			} as InboxRow;
			rows.set(r.id, r);
			return r;
		},
		async update(id, patch) {
			const r = { ...(rows.get(id) as InboxRow), ...patch };
			rows.set(id, r);
			return r;
		},
	};
	return { rows, store };
}

const body = {
	external_id: "wa:6281234567890@s.whatsapp.net:1790503619149",
	wa_jid: "6281234567890@s.whatsapp.net",
	client_wa: "6281234567890",
	client_name: "Nadia",
	sumber: "bukti-transfer",
	dp_dilaporkan_at: "2026-09-27T12:01:00.000Z",
	bukti_url: null,
	lengkap: false,
	data: {
		nama_acara: "Rizky & Nadia",
		tanggal_iso: "2026-12-05",
		jam: "11.00 - 14.00",
	},
};

const call = (store: InboxStore, json: unknown, authorized = true) =>
	handleBotBooking({ authorized, json, store, appUrl: "https://ops.test/" });

test("token salah → 401, tidak menyentuh store", async () => {
	const { rows, store } = memStore();
	const res = await call(store, body, false);
	assert.equal(res.status, 401);
	assert.equal(rows.size, 0);
});

test("body tidak valid → 400", async () => {
	const { store } = memStore();
	assert.equal((await call(store, null)).status, 400);
	assert.equal((await call(store, { ...body, external_id: "" })).status, 400);
	assert.equal((await call(store, { ...body, sumber: "lain" })).status, 400);
	const long = { ...body, data: { catatan: "x".repeat(301) } };
	assert.equal((await call(store, long)).status, 400);
});

test("kolom data kosong/null/tak dikenal tidak ditolak", async () => {
	const { rows, store } = memStore();
	const res = await call(store, {
		...body,
		data: { nama_acara: null, jam: "", tanggal_iso: "5 Des", ngawur: "x" },
	});
	assert.equal(res.status, 200);
	const row = [...rows.values()][0];
	assert.equal(row.data.jam, null);
	assert.equal(row.data.tanggal_iso, null);
	assert.ok(!("ngawur" in row.data));
});

test("upsert idempoten per external_id + url", async () => {
	const { rows, store } = memStore();
	const a = await call(store, body);
	const b = await call(store, body);
	assert.equal(rows.size, 1);
	assert.deepEqual(a.body, b.body);
	assert.deepEqual(a.body, {
		id: "id-1",
		status: "baru",
		event_id: null,
		url: "https://ops.test/operations/booking-masuk/id-1",
	});
	await call(store, { ...body, data: { ...body.data, lokasi: "Sentul" } });
	assert.equal(rows.get("id-1")?.data.lokasi, "Sentul");
});

test("jadi_event: data disimpan + berubah_setelah_event, event tak disentuh", async () => {
	const { rows, store } = memStore();
	await call(store, body);
	rows.set("id-1", {
		...(rows.get("id-1") as InboxRow),
		status: "jadi_event",
		event_id: "ev-1",
	});
	await call(store, body); // isi sama → bukan perubahan
	assert.equal(rows.get("id-1")?.berubah_setelah_event, false);
	const res = await call(store, {
		...body,
		data: { ...body.data, jam: "12.00 - 15.00" },
	});
	const row = rows.get("id-1") as InboxRow;
	assert.equal(row.berubah_setelah_event, true);
	assert.equal(row.data.jam, "12.00 - 15.00");
	assert.equal(row.status, "jadi_event");
	assert.equal(row.event_id, "ev-1");
	assert.equal((res.body as { event_id: string }).event_id, "ev-1");
});

test("dibatalkan: diabaikan, status dikembalikan", async () => {
	const { rows, store } = memStore();
	await call(store, body);
	rows.set("id-1", { ...(rows.get("id-1") as InboxRow), status: "dibatalkan" });
	const res = await call(store, { ...body, data: { jam: "20.00 - 22.00" } });
	assert.equal(res.status, 200);
	assert.equal((res.body as { status: string }).status, "dibatalkan");
	assert.equal(rows.get("id-1")?.data.jam, "11.00 - 14.00");
});
