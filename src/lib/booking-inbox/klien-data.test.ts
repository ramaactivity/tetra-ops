/**
 * Data klien dari dokumen (GET /api/bot/klien, MCP data_klien, isian Booking
 * Masuk) — kasus nyata Yessi 19 Nov 2026. Jalankan: `pnpm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { supersededBy } from "@/lib/documents/types";
import {
	buildDataKlien,
	type DocLike,
	docToInboxFill,
	pickPrimaryDoc,
} from "./klien-data";

const items: DocLike["items"] = [
	{
		name: "Photobooth Classic Unlimited 2 Jam",
		qty: 1,
		package_id: null,
		includes: [
			"Cetak foto unlimited selama durasi acara",
			"Menyusul: Backdrop: basic Tetra atau disediakan klien",
			"Menyusul: Pilihan format cetak: 2R, 4R, atau Polaroid (harga sama)",
		],
	},
	{
		name: "Cetak Backdrop Banner 230×230 (desain dari klien)",
		qty: 1,
		addon_id: "a1",
	},
	{ name: "Break Time 3 Jam (jeda 17.00–20.00)", qty: 1, addon_id: "a2" },
];

const quo: DocLike = {
	id: "q1",
	doc_type: "quotation",
	doc_number: "QUO-TP-03-18112026",
	status: "accepted",
	issued_at: "2026-11-18",
	created_at: "2026-11-18T03:17:10Z",
	client: { name: "Yessi", phone: "6281298116793" },
	event_info: {
		date: "2026-12-02",
		time: "16:00–21:00",
		venue: "Grand Wisata",
		city: "Bekasi",
		title: null,
	},
	items,
	origin: { wa_jid: "144439901184133@lid", jenis_acara: "event" },
};
const inv: DocLike = {
	...quo,
	id: "i1",
	doc_type: "invoice",
	doc_number: "INV-TP-34-18112026",
	status: "sent",
	created_at: "2026-11-18T03:59:10Z",
	origin: null,
};

test("dokumen acuan: invoice > quotation, tanggal lain dilewati", () => {
	assert.equal(pickPrimaryDoc([quo, inv])?.id, "i1");
	assert.equal(pickPrimaryDoc([quo, inv], "2027-01-01"), null);
	assert.equal(pickPrimaryDoc([{ ...inv, status: "void" }, quo])?.id, "q1");
});

test("bentuk data klien Yessi: tanpa uang, kunci kontrak quotation", () => {
	const d = buildDataKlien(
		[inv, quo],
		{
			id: "b1",
			status: "diproses",
			data: { catatan: "DP masuk", jenis: "keagamaan" },
		},
		[],
	);
	assert.equal(d.ditemukan, true);
	assert.deepEqual(d.klien, {
		nama: "Yessi",
		instansi: null,
		attn: null,
		email: null,
	});
	assert.deepEqual(d.acara, {
		judul: null,
		jenis: "keagamaan",
		tanggal: "2026-12-02",
		jam_mulai: "16:00",
		jam_selesai: "21:00",
		venue: "Grand Wisata",
		kota: "Bekasi",
		jumlah_tamu: null,
	});
	assert.deepEqual(d.layanan, [
		{
			kategori: "photobooth_classic",
			jam: 2,
			qty: 1,
			format: null,
			nama: "Photobooth Classic Unlimited 2 Jam",
		},
	]);
	assert.equal(d.addons.length, 2);
	assert.equal(d.backdrop, "Cetak Backdrop Banner 230×230 (desain dari klien)");
	assert.deepEqual(
		d.dokumen.map((x) => x.nomor),
		["INV-TP-34-18112026", "QUO-TP-03-18112026"],
	);
	assert.deepEqual(d.booking_masuk, {
		id: "b1",
		status: "diproses",
		terisi: ["jenis", "catatan"],
	});
	assert.ok(!JSON.stringify(d).match(/price|harga|total/i));
});

test("paket ber-id: kategori/format/jam dari master + tambahan durasi", () => {
	const d = buildDataKlien(
		[
			{
				...inv,
				items: [
					{
						name: "Photobooth 4R 8 Jam",
						qty: 2,
						package_id: "p8",
						includes: ["Total durasi 10 jam"],
					},
					{ name: "Tambahan durasi 1 jam", qty: 2 },
				],
				client: { name: "PT Maju", attn: "Bu Rina", phone: "0812" },
				notes: "Perkiraan tamu: 300",
			},
		],
		null,
		[
			{
				id: "p8",
				category: "photobooth_classic",
				frame_size: "4R",
				duration_hours: 8,
			},
		],
	);
	assert.deepEqual(d.layanan, [
		{
			kategori: "photobooth_classic",
			jam: 10,
			qty: 2,
			format: "4r",
			nama: "Photobooth 4R 8 Jam",
		},
	]);
	assert.deepEqual(d.addons, []);
	assert.equal(d.klien?.nama, "Bu Rina");
	assert.equal(d.klien?.instansi, "PT Maju");
	assert.equal(d.acara?.jumlah_tamu, "300");
});

test("tanpa dokumen & tanpa booking → ditemukan false", () => {
	const d = buildDataKlien([], null, []);
	assert.equal(d.ditemukan, false);
	assert.equal(d.acara, null);
});

test("isian Booking Masuk dari invoice Yessi", () => {
	const f = docToInboxFill(inv, []);
	assert.equal(f.client_wa, "6281298116793");
	assert.equal(f.client_name, "Yessi");
	assert.equal(f.data.tanggal_iso, "2026-12-02");
	assert.equal(f.data.tanggal, "Rabu, 2 Desember 2026");
	assert.equal(f.data.jam, "16:00–21:00");
	assert.equal(f.data.lokasi, "Grand Wisata, Bekasi");
	assert.equal(f.data.paket, "Photobooth Classic Unlimited 2 Jam");
	assert.equal(f.data.ukuran_frame, null);
	assert.equal(f.data.jumlah_unit, null);
});

test("quotation yang sudah diganti invoice keluar dari antrean", () => {
	const q = {
		id: "q1",
		doc_type: "quotation" as const,
		status: "sent" as const,
		client: { name: "Yessi", phone: "081298116793" },
		event_info: { date: "2026-12-02" },
	};
	const linked = {
		doc_number: "INV-1",
		source_document_id: "q1",
		client: { name: "x" },
		event_info: {},
		status: "sent" as const,
	};
	const samePhoneDate = {
		doc_number: "INV-2",
		source_document_id: null,
		client: { name: "Yessi", phone: "6281298116793" },
		event_info: { date: "2026-12-02" },
		status: "draft" as const,
	};
	assert.equal(supersededBy(q, [linked]), "INV-1");
	assert.equal(supersededBy(q, [samePhoneDate]), "INV-2");
	assert.equal(
		supersededBy(q, [{ ...samePhoneDate, event_info: { date: "2026-12-03" } }]),
		null,
	);
	assert.equal(supersededBy(q, [{ ...linked, status: "void" as const }]), null);
	assert.equal(
		supersededBy({ ...q, status: "accepted" as const }, []),
		"invoice",
	);
	assert.equal(
		supersededBy({ ...q, doc_type: "invoice" as const }, [linked]),
		null,
	);
	assert.equal(supersededBy(q, []), null);
});
