import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import type { AiToolContext } from "@/lib/ai/types";

// tim.ts mengimpor "server-only"; di tes pakai varian react-server (kosong).
registerHooks({
	resolve: (spec, c, next) =>
		next(
			spec,
			spec === "server-only"
				? { ...c, conditions: [...c.conditions, "react-server"] }
				: c,
		),
});
const mod = () => import("./tim");

type Row = Record<string, unknown>;

/** Supabase palsu: cukup untuk system_config + bot_commands. */
function fakeDb(tables: Record<string, Row[]>) {
	let seq = 0;
	return {
		tables,
		from(t: string) {
			tables[t] ??= [];
			const rows = tables[t];
			const fs: ((r: Row) => boolean)[] = [];
			let ins: Row | null = null;
			const run = () => {
				if (ins) {
					const r = {
						id: `cmd-${++seq}`,
						created_at: new Date().toISOString(),
						...ins,
					};
					rows.push(r);
					return [r];
				}
				return rows.filter((r) => fs.every((f) => f(r)));
			};
			const q = {
				select: () => q,
				eq: (k: string, v: unknown) => (fs.push((r) => r[k] === v), q),
				gte: (k: string, v: string) => (fs.push((r) => String(r[k]) >= v), q),
				like: (k: string, pat: string) => {
					const re = new RegExp(
						`^${pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("%", ".*")}$`,
					);
					return fs.push((r) => re.test(String(r[k]))), q;
				},
				insert: (p: Row) => {
					ins = p;
					return q;
				},
				single: async () => ({ data: run()[0], error: null }),
				maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
				// biome-ignore lint/suspicious/noThenProperty: meniru query builder Supabase yang bisa di-await
				then: (ok: (v: unknown) => unknown) => ok({ data: run(), error: null }),
			};
			return q;
		},
	};
}

const ctxOf = (db: ReturnType<typeof fakeDb>) =>
	({
		supabase: db,
		todayISO: "2026-10-09",
		role: "owner",
	}) as unknown as AiToolContext;

const TIM = [
	{ nomor: "6285884359656", nama: "Iqbal", peran: "designer" },
	{ nomor: "6281288150041", nama: "Adit", peran: "crew" },
];

test("kirim_tim: nomor di luar tim ditolak, pesan dobel ditolak, maks 4/hari", async () => {
	const { kirimTim } = await mod();
	const db = fakeDb({
		system_config: [{ key: "tim_wa", value: TIM }],
		bot_commands: [],
	});
	const ctx = ctxOf(db);

	const luar = (await kirimTim.run(
		{ nomor: "081234567890", pesan: "Halo" },
		ctx,
	)) as Row;
	assert.match(String(luar.error), /bukan anggota tim/);

	const ok = (await kirimTim.run(
		{ nomor: "085884359656", pesan: "Halo Iqbal" },
		ctx,
	)) as Row;
	assert.equal(ok.status, "antre");
	assert.equal(typeof ok.cmd, "string");
	assert.equal(
		db.tables.bot_commands[0].command,
		'send-tim:{"nomor":"6285884359656","pesan":"Halo Iqbal"}',
	);

	const dobel = (await kirimTim.run(
		{ nomor: "+62 858-8435-9656", pesan: "Halo Iqbal" },
		ctx,
	)) as Row;
	assert.match(String(dobel.error), /sudah dikirim/);

	for (const p of ["a2", "a3", "a4"])
		assert.equal(
			((await kirimTim.run({ nomor: "085884359656", pesan: p }, ctx)) as Row)
				.status,
			"antre",
		);
	const lewat = (await kirimTim.run(
		{ nomor: "085884359656", pesan: "a5" },
		ctx,
	)) as Row;
	assert.match(String(lewat.error), /batas 4/);
});

test("pengingat_tim: bentuk & definisi (desain, Booth, crew, rekap, stok)", async () => {
	const { susunPengingat } = await mod();
	const ev = (id: string, date: string, x: Row = {}) => ({
		id,
		project_id: `PRJ-${id}`,
		event_title: `Acara ${id}`,
		client_name: null,
		event_date: date,
		start_time: "16:00:00",
		venue_city: "Bogor",
		status: date < "2026-10-09" ? "completed" : "upcoming",
		service_type: "photobooth_classic",
		design_status: "belum",
		design_brief_at: null,
		unit_count: 1,
		spots: null,
		...x,
	});
	const out = susunPengingat({
		today: "2026-10-09",
		events: [
			ev("A", "2026-10-09", { design_status: "approved" }), // hari ini, ACC jalur lama
			ev("B", "2026-10-08"), // selesai kemarin, rekap draft
			ev("C", "2026-10-20", { design_status: "proses" }), // menunggu review klien
			ev("D", "2026-10-25", { design_status: "approved" }), // sudah masuk Booth
			ev("E", "2026-10-12", { unit_count: 2 }), // 2 spot, baru 1 lead
			ev("F", "2026-10-15", { status: "cancelled" }),
			ev("G", "2026-10-01", {}), // rekap sudah submitted
		],
		requests: [
			{
				id: "rC",
				event_id: "C",
				spot_no: 1,
				stage: "menunggu_review",
				revision_count: 1,
				brief_submitted_at: "x",
				approved_version_id: null,
				updated_at: "2026-10-05T03:00:00Z",
			},
			{
				id: "rD",
				event_id: "D",
				spot_no: 1,
				stage: "acc",
				revision_count: 0,
				brief_submitted_at: "x",
				approved_version_id: "v1",
				updated_at: "2026-10-01T03:00:00Z",
			},
		],
		lastVersionAt: new Map([["rC", "2026-10-06T03:00:00Z"]]),
		boothDelivered: new Set(["D"]),
		crew: new Map([["E", [{ role_in_event: "lead", spot_no: 1 }]]]),
		rekap: new Map([
			["B", "draft"],
			["G", "submitted"],
		]),
		lastOpname: "2026-09-02",
		stock: [
			{ nama: "Kertas 4R", sisa: 0, satuan: "lembar", minimum: 100 },
			{ nama: "Sleeve", sisa: 40, satuan: "pcs", minimum: 50 },
			{ nama: "Tinta", sisa: 9, satuan: "botol", minimum: 2 },
		],
	});

	assert.deepEqual(Object.keys(out).sort(), [
		"crew_belum_assign",
		"desain",
		"desain_belum_booth",
		"hari_ini",
		"rekap_crew_belum",
		"selesai_kemarin",
		"stok_menipis",
		"stok_opname_terakhir",
	]);
	assert.deepEqual(out.hari_ini, [
		{ event_id: "PRJ-A", judul: "Acara A", jam_mulai: "16:00", kota: "Bogor" },
	]);
	assert.deepEqual(
		out.selesai_kemarin.map((e) => e.event_id),
		["PRJ-B"],
	);

	const c = out.desain.find((d) => d.event_id === "PRJ-C");
	assert.equal(c?.menunggu, "klien");
	assert.equal(c?.revisi_ke, 1);
	assert.equal(c?.hari_ke_acara, 11);
	assert.equal(c?.hari_tanpa_progres, 3); // versi terakhir 6 Okt
	assert.ok(
		!out.desain.some((d) => d.event_id === "PRJ-D"),
		"D sudah masuk Booth",
	);
	assert.deepEqual(out.desain_belum_booth, [
		{
			event_id: "PRJ-A",
			judul: "Acara A",
			tanggal_acara: "2026-10-09",
			alasan: "file_tidak_di_ops",
		},
	]);

	assert.deepEqual(
		out.crew_belum_assign.map((x) => [x.event_id, x.kurang]),
		[
			["PRJ-A", 1],
			["PRJ-C", 1],
			["PRJ-E", 1],
		],
	);
	assert.deepEqual(
		out.rekap_crew_belum.map((x) => x.event_id),
		["PRJ-B"],
	);
	assert.equal(out.stok_opname_terakhir, "2026-09-02");
	assert.deepEqual(
		out.stok_menipis.map((s) => s.nama),
		["Kertas 4R", "Sleeve"],
	);
});
