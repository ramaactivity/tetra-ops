import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import type { AiToolContext } from "@/lib/ai/types";

// prospek.ts mengimpor "server-only"; di tes pakai varian react-server (kosong).
registerHooks({
	resolve: (spec, c, next) =>
		next(
			spec,
			spec === "server-only"
				? { ...c, conditions: [...c.conditions, "react-server"] }
				: c,
		),
});
const tools = () => import("./prospek");

type Row = Record<string, unknown>;

/** Supabase palsu secukupnya: filter eq/in/is/not, insert, update. */
function fakeDb(tables: Record<string, Row[]>) {
	let seq = 0;
	return {
		tables,
		from(t: string) {
			tables[t] ??= [];
			const rows = tables[t];
			const fs: ((r: Row) => boolean)[] = [];
			let op: "select" | "insert" | "update" = "select";
			let payload: Row = {};
			const run = () => {
				if (op === "insert") {
					const r = { id: `cmd-${++seq}`, ...payload };
					rows.push(r);
					return [r];
				}
				const hit = rows.filter((r) => fs.every((f) => f(r)));
				if (op === "update") for (const r of hit) Object.assign(r, payload);
				return hit;
			};
			const where = (f: (r: Row) => boolean) => {
				fs.push(f);
				return q;
			};
			const tulis = (o: typeof op, p: Row) => {
				op = o;
				payload = p;
				return q;
			};
			const q = {
				select: () => q,
				order: () => q,
				limit: () => q,
				// Kode asli membaca per halaman (fetchAllRows → .range); data uji
				// < 1 halaman, jadi kembalikan semuanya.
				range: () => q,
				eq: (k: string, v: unknown) => where((r) => r[k] === v),
				in: (k: string, v: unknown[]) => where((r) => v.includes(r[k])),
				is: (k: string, v: unknown) => where((r) => (r[k] ?? null) === v),
				like: (k: string, pat: string) => {
					const re = new RegExp(
						`^${pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("%", ".*")}$`,
					);
					return where((r) => re.test(String(r[k])));
				},
				not: (k: string, _o: string, v: unknown) =>
					where((r) => (r[k] ?? null) !== v),
				insert: (p: Row) => tulis("insert", p),
				update: (p: Row) => tulis("update", p),
				single: async () => ({ data: run()[0], error: null }),
				maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
				// biome-ignore lint/suspicious/noThenProperty: meniru query builder Supabase yang bisa di-await
				then: (ok: (v: unknown) => unknown) => ok({ data: run(), error: null }),
			};
			return q;
		},
	};
}

const prospek = () => [
	{
		id: "p1",
		nama: "Violetta Wedding",
		segmen: "eo_wo",
		status: "membalas",
		telepon: "0812-1111-2222",
		pic: null,
		catatan: "disapa 1 Okt",
	},
	{
		id: "p2",
		nama: "Kandidat Hall",
		segmen: "venue",
		status: "kandidat",
		telepon: "081233334444",
		pic: null,
		catatan: null,
	},
	{
		id: "p3",
		nama: "Tolak Hall",
		segmen: "venue",
		status: "tolak",
		telepon: "081255556666",
		pic: null,
		catatan: null,
	},
	{
		id: "p4",
		nama: "Jangan Corp",
		segmen: "corporate",
		status: "jangan_hubungi",
		telepon: "081277778888",
		pic: null,
		catatan: null,
	},
	{
		id: "p5",
		nama: "Kantor Hotel",
		segmen: "venue",
		status: "membalas",
		telepon: "021-5551234",
		pic: null,
		catatan: null,
	},
	{
		id: "p6",
		nama: "Agave Hall",
		segmen: "venue",
		status: "deal",
		telepon: "+62 813 9999 0000",
		pic: "Bu Sinta (Marcom)",
		catatan: null,
	},
];

const ctxDari = (db: ReturnType<typeof fakeDb>) =>
	({
		supabase: db,
		role: "owner",
		todayISO: "2026-10-07",
		surface: "mcp",
	}) as unknown as AiToolContext;

test("kontakDikenal: hanya lead yang sudah membalas dan bernomor HP", async () => {
	const db = fakeDb({ contacts: [], events: [], prospek: prospek() });
	const { kontakDikenal } = await tools();
	const lead = await kontakDikenal(ctxDari(db));
	assert.deepEqual(
		lead.map((k) => [k.nama, k.jenis, k.wa, k.info]),
		[
			["Violetta Wedding", "lead", "6281211112222", "eo_wo · membalas"],
			[
				"Bu Sinta (Marcom) (Agave Hall)",
				"lead",
				"6281399990000",
				"venue · deal",
			],
		],
	);
});

test("kontakDikenal: pernah chat bot = dikenal, kecuali nomor tim & prospek tolak", async () => {
	const db = fakeDb({
		contacts: [],
		events: [],
		prospek: prospek(),
		system_config: [
			{ key: "tim_wa", value: [{ nomor: "0811-0000-1111", nama: "Iqbal" }] },
		],
		// urut terbaru dulu, seperti query asli
		whatsapp_bot_leads: [
			{
				phone: "6281300001111",
				name: "SPARK",
				segment: "Corporate",
				received_at: "2026-11-18T03:00:00Z",
			},
			{
				phone: "6281300001111",
				name: "Spark lama",
				segment: "Pribadi",
				received_at: "2026-11-01T03:00:00Z",
			},
			{
				phone: "6281100001111",
				name: "Iqbal",
				segment: "Pribadi",
				received_at: "2026-11-10T03:00:00Z",
			},
			{
				phone: "6281255556666",
				name: "Tolak Hall",
				segment: "Venue",
				received_at: "2026-11-09T03:00:00Z",
			},
			{
				phone: "144439901184133",
				name: "LID",
				segment: "Pribadi",
				received_at: "2026-11-08T03:00:00Z",
			},
		],
	});
	const { kontakDikenal } = await tools();
	const chat = (await kontakDikenal(ctxDari(db))).filter(
		(k) => k.jenis === "chat_bot",
	);
	assert.deepEqual(
		chat.map((k) => [k.nama, k.wa, k.info]),
		[["SPARK", "6281300001111", "Corporate · chat terakhir 2026-11-18"]],
	);
});

test("kontak_cari('violetta') menemukan lead; klien bernomor sama didahulukan", async () => {
	const db = fakeDb({
		contacts: [
			{
				name: "Violet Klien",
				type: "client",
				phone: "081211112222",
				is_active: true,
			},
		],
		events: [],
		prospek: prospek(),
	});
	const { kontakCari } = await tools();
	const r = (await kontakCari.run({ nama: "violet" }, ctxDari(db))) as {
		kontak: { jenis: string }[];
	};
	assert.deepEqual(
		r.kontak.map((k) => k.jenis),
		["client"],
	);
	const db2 = fakeDb({ contacts: [], events: [], prospek: prospek() });
	console.log(
		"kontak_cari:",
		JSON.stringify(await kontakCari.run({ nama: "violetta" }, ctxDari(db2))),
	);
});

test("wa_kirim_kontak ke lead membalas → antre send-relasi + catatan bertambah", async () => {
	const { waKirimKontak } = await tools();
	const db = fakeDb({ contacts: [], events: [], prospek: prospek() });
	const pesan =
		"Halo kak, ini pricelist photobooth Tetra yang kemarin diminta ya.";
	const r = (await waKirimKontak.run(
		{ nomor: "081211112222", pesan, alasan: "kirim PL ke Violetta" },
		ctxDari(db),
	)) as Record<string, string>;
	console.log("wa_kirim_kontak:", JSON.stringify(r));
	assert.equal(r.status, "antre");
	assert.equal(r.kepada, "Violetta Wedding (lead) 6281211112222");
	assert.ok(
		String(db.tables.bot_commands[0].command).startsWith("send-relasi:"),
	);
	const p1 = db.tables.prospek.find((p) => p.id === "p1") as Row;
	assert.equal(
		p1.catatan,
		`disapa 1 Okt\nWA dari Rama via Bruno (cmd ${r.cmd}): "${pesan}"`,
	);
	assert.equal(p1.status, "membalas");
});

test("wa_kirim_kontak: lead tolak/jangan_hubungi/kantor ditolak tanpa bot_commands", async () => {
	const { waKirimKontak } = await tools();
	for (const [nomor, pola] of [
		["081255556666", /Tolak Hall berstatus tolak/],
		["081277778888", /Jangan Corp berstatus jangan_hubungi/],
		["0215551234", /tidak valid|tidak tercatat/],
		["081233334444", /tidak tercatat/],
	] as const) {
		const db = fakeDb({ contacts: [], events: [], prospek: prospek() });
		const r = (await waKirimKontak.run(
			{ nomor, pesan: "Halo kak, info photobooth.", alasan: "tes" },
			ctxDari(db),
		)) as { error?: string };
		assert.match(r.error ?? "", pola);
		assert.equal(db.tables.bot_commands?.length ?? 0, 0);
	}
});

test("wa_kirim_kontak: status lead berubah setelah daftar dimuat → ditolak", async () => {
	const { waKirimKontak } = await tools();
	const db = fakeDb({ contacts: [], events: [], prospek: prospek() });
	const ctx = ctxDari(db);
	const asli = db.from.bind(db);
	let n = 0;
	// Ubah status p1 setelah daftar dimuat, sebelum cek ulang. kontakDikenal
	// membaca prospek 2× (terlibat + tolak), jadi cek ulang = query ke-3.
	db.from = (t: string) => {
		if (t === "prospek" && ++n === 3)
			(db.tables.prospek[0] as Row).status = "jangan_hubungi";
		return asli(t);
	};
	const r = (await waKirimKontak.run(
		{
			nomor: "081211112222",
			pesan: "Halo kak, info photobooth.",
			alasan: "tes",
		},
		ctx,
	)) as { error?: string };
	assert.match(r.error ?? "", /kini berstatus jangan_hubungi/);
	assert.equal(db.tables.bot_commands?.length ?? 0, 0);
});

test("kontak_cek_nomor: normalisasi nomor + nomor asing = semua kosong", async () => {
	const { kontakCekNomor } = await tools();
	const db = fakeDb({ prospek: prospek() });
	const ctx = { supabase: db } as unknown as AiToolContext;
	for (const n of ["089900001111", "+62 899-0000-1111", "6289900001111"])
		assert.deepEqual(await kontakCekNomor.run({ nomor: n }, ctx), {
			nomor: "6289900001111",
			prospek: null,
			kontak: false,
			klien: [],
			basis_kontak: false,
			promo_dipakai: null,
		});
	assert.ok(
		"error" in
			((await kontakCekNomor.run({ nomor: "021-5551234" }, ctx)) as object),
	);
});

test("kontak_cek_nomor: jangan_hubungi terbaca, wa_status ikut bot_commands, klien & promo", async () => {
	const { kontakCekNomor } = await tools();
	const nomor = "6281277778888";
	const db = fakeDb({
		prospek: prospek(),
		bot_commands: [
			{
				command: `send-text:${JSON.stringify({ nomor, pesan: "Halo" })}`,
				status: "error",
			},
			{
				command: `send-text:${JSON.stringify({ nomor: "6281233334444", pesan: "x" })}`,
				status: "done",
			},
		],
		contacts: [{ phone: "0812 7777 8888", default_pic_contact: null }],
		events: [
			{
				id: "e1",
				event_date: "2026-09-01",
				created_at: "t",
				client_wa: null,
				pic_wa: "+6281277778888",
				deleted_at: null,
			},
			{
				id: "e2",
				event_date: "2026-09-02",
				created_at: "t",
				client_wa: "081200000000",
				pic_wa: null,
				deleted_at: null,
			},
		],
		basis_kontak: [{ id: "b1", wa: nomor }],
		portal_people: [{ id: "pp1", phone: nomor }],
		booking_members: [{ booking_id: "cb1", person_id: "pp1" }],
		client_bookings: [
			{
				id: "cb1",
				event_id: "e1",
				promo: { code: "TAMU-AB12C", redeemed_at: "2026-10-01" },
			},
		],
	});
	const r = (await kontakCekNomor.run({ nomor: "081277778888" }, {
		supabase: db,
	} as unknown as AiToolContext)) as Record<string, unknown>;
	assert.deepEqual(r.prospek, {
		id: "p4",
		nama: "Jangan Corp",
		status: "jangan_hubungi",
		sumber: undefined,
		wa_status: "error",
	});
	assert.equal(r.kontak, true);
	assert.deepEqual(r.klien, [
		{ event_id: "e1", tanggal: "2026-09-01", created_at: "t" },
	]);
	assert.equal(r.basis_kontak, true);
	assert.deepEqual(r.promo_dipakai, {
		kode: "TAMU-AB12C",
		event_id: "e1",
		dipakai_at: "2026-10-01",
	});
});
