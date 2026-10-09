import "server-only";

import type { AiTool } from "@/lib/ai/types";
import { spotsWithoutLead, unitCountOf } from "@/lib/events/spots";
import { isLikelyWaPhone, toWaPhone } from "@/lib/whatsapp";

/**
 * Pengingat tim internal (CS Mintet di Hermes, MCP_SALES_TOKEN).
 *
 * Definisi (sama dengan yang dipakai Ops):
 * - "masuk Booth": desain event sudah ACC, file frame ACC-nya ada di Ops
 *   (design_requests spot 1 stage acc + approved_version_id), dan webhook
 *   `design.approved` ke Booth sudah terkirim (booth_webhook_outbox.delivered_at).
 *   ACC lewat jalur lama (tanpa file di Ops) tidak bisa dipastikan → tetap
 *   masuk daftar dengan alasan "file_tidak_di_ops".
 * - "rekap crew": baris crew_rekap event itu berstatus submitted/reviewed/settled.
 *   Belum ada baris, atau masih draft/rejected = belum.
 * - "kurang" crew: tiap unit/spot butuh minimal satu lead (spotsWithoutLead).
 */

const DAY = 86_400_000;
const addDays = (iso: string, n: number) =>
	new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
	Math.round(
		(Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY,
	);
/** Tanggal WIB dari timestamp. */
const wibDate = (ts: string) =>
	new Date(Date.parse(ts) + 7 * 3600_000).toISOString().slice(0, 10);

const REKAP_SELESAI = ["submitted", "reviewed", "settled"];

type Ev = {
	id: string;
	project_id: string;
	event_title: string | null;
	client_name: string | null;
	event_date: string;
	start_time: string | null;
	venue_city: string | null;
	status: string;
	service_type: string | null;
	design_status: string | null;
	design_brief_at: string | null;
	unit_count: number | null;
	spots: unknown;
};
type Req = {
	id: string;
	event_id: string;
	spot_no: number;
	stage: string;
	revision_count: number | null;
	brief_submitted_at: string | null;
	approved_version_id: string | null;
	updated_at: string;
};

export type PengingatInput = {
	today: string;
	events: Ev[];
	requests: Req[];
	/** request_id → waktu versi desain terakhir diunggah. */
	lastVersionAt: Map<string, string>;
	/** event_id yang webhook design.approved-nya sudah sampai di Booth. */
	boothDelivered: Set<string>;
	/** event_id → daftar crew {role_in_event, spot_no}. */
	crew: Map<
		string,
		Array<{ role_in_event: string | null; spot_no: number | null }>
	>;
	/** event_id → status crew_rekap. */
	rekap: Map<string, string>;
	lastOpname: string | null;
	stock: Array<{
		nama: string;
		sisa: number;
		satuan: string | null;
		minimum: number;
	}>;
};

function menunggu(ev: Ev, r: Req | undefined): "klien" | "designer" | "owner" {
	if (ev.design_status === "approved") return "designer"; // tinggal input ke Booth
	if (!r) return ev.design_status === "belum" ? "klien" : "designer";
	switch (r.stage) {
		case "brief":
			return r.brief_submitted_at ? "designer" : "klien";
		case "menunggu_review":
			return "klien";
		case "acc":
			return "owner";
		default:
			return "designer"; // dikerjakan / revisi
	}
}

/** Murni: dari data mentah → bentuk pengingat_tim (bisa dites tanpa DB). */
export function susunPengingat(d: PengingatInput) {
	const { today } = d;
	const kemarin = addDays(today, -1);
	const judul = (e: Ev) => e.event_title || e.client_name || e.project_id;
	const live = d.events.filter((e) => e.status !== "cancelled");
	const req1 = new Map(
		d.requests.filter((r) => r.spot_no === 1).map((r) => [r.event_id, r]),
	);

	const masukBooth = (e: Ev) => {
		const r = req1.get(e.id);
		return Boolean(
			r?.stage === "acc" && r.approved_version_id && d.boothDelivered.has(e.id),
		);
	};

	const desainWindow = live.filter(
		(e) =>
			e.event_date >= today &&
			e.event_date <= addDays(today, 30) &&
			e.service_type !== "guest_cam",
	);
	const belumBooth = desainWindow.filter(
		(e) => e.design_status === "approved" && !masukBooth(e),
	);

	return {
		hari_ini: live
			.filter((e) => e.event_date === today)
			.map((e) => ({
				event_id: e.project_id,
				judul: judul(e),
				jam_mulai: e.start_time?.slice(0, 5) ?? null,
				kota: e.venue_city,
			})),
		selesai_kemarin: live
			.filter((e) => e.event_date === kemarin)
			.map((e) => ({
				event_id: e.project_id,
				judul: judul(e),
				tanggal: e.event_date,
			})),
		desain: desainWindow
			.filter((e) => e.design_status !== "approved" || !masukBooth(e))
			.map((e) => {
				const r = req1.get(e.id);
				const terakhir = [
					r?.updated_at,
					r && d.lastVersionAt.get(r.id),
					e.design_brief_at,
				]
					// Abaikan cap waktu di masa depan (mis. design_brief_at terisi tanggal acara).
					.filter(
						(x): x is string => Boolean(x) && wibDate(x as string) <= today,
					)
					.sort()
					.at(-1);
				return {
					event_id: e.project_id,
					judul: judul(e),
					tanggal_acara: e.event_date,
					design_status: e.design_status ?? "belum",
					tahap: r?.stage ?? null,
					hari_ke_acara: daysBetween(today, e.event_date),
					hari_tanpa_progres: terakhir
						? daysBetween(wibDate(terakhir), today)
						: null,
					revisi_ke: r?.revision_count ?? null,
					menunggu: menunggu(e, r),
				};
			})
			.sort((a, b) => a.hari_ke_acara - b.hari_ke_acara),
		desain_belum_booth: belumBooth.map((e) => {
			const r = req1.get(e.id);
			return {
				event_id: e.project_id,
				judul: judul(e),
				tanggal_acara: e.event_date,
				alasan:
					r?.stage === "acc" && r.approved_version_id
						? "terkirim_belum_sampai"
						: "file_tidak_di_ops",
			};
		}),
		crew_belum_assign: live
			.filter(
				(e) =>
					e.event_date >= today &&
					e.event_date <= addDays(today, 14) &&
					["upcoming", "in_progress"].includes(e.status),
			)
			.map((e) => ({
				e,
				kurang: spotsWithoutLead(unitCountOf(e), d.crew.get(e.id) ?? []).length,
			}))
			.filter((x) => x.kurang > 0)
			.map(({ e, kurang }) => ({
				event_id: e.project_id,
				judul: judul(e),
				tanggal: e.event_date,
				kurang,
				crew_ada: (d.crew.get(e.id) ?? []).length,
			})),
		rekap_crew_belum: live
			.filter(
				(e) =>
					e.event_date < today &&
					e.event_date >= addDays(today, -30) &&
					!REKAP_SELESAI.includes(d.rekap.get(e.id) ?? ""),
			)
			.map((e) => ({
				event_id: e.project_id,
				judul: judul(e),
				tanggal: e.event_date,
				status_rekap: d.rekap.get(e.id) ?? "belum_ada",
			})),
		stok_opname_terakhir: d.lastOpname,
		stok_menipis: d.stock
			.filter((s) => s.sisa <= 0 || (s.minimum > 0 && s.sisa <= s.minimum))
			.map(({ nama, sisa, satuan }) => ({ nama, sisa, satuan })),
	};
}

export const pengingatTim: AiTool = {
	name: "pengingat_tim",
	description:
		"Bahan pengingat tim internal (hanya baca): acara hari ini, selesai kemarin, desain ≤30 hari yang belum ACC / belum masuk Booth, " +
		"crew ≤14 hari yang belum lengkap, rekap crew yang belum dibuat (≤30 hari terakhir), stok opname terakhir & stok menipis.",
	scope: "ops",
	parameters: { type: "OBJECT", properties: {} },
	async run(_args, ctx) {
		const db = ctx.supabase;
		const today = ctx.todayISO;
		const { data: evs, error } = await db
			.from("events")
			.select(
				"id, project_id, event_title, client_name, event_date, start_time, venue_city, status, service_type, design_status, design_brief_at, unit_count, spots",
			)
			.gte("event_date", addDays(today, -30))
			.lte("event_date", addDays(today, 30))
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false);
		if (error) return { error: `events: ${error.message}` };
		const events = (evs ?? []) as Ev[];
		const ids = events.map((e) => e.id);
		const none = Promise.resolve({ data: [] as never[], error: null });

		const [reqs, outbox, crew, rekap, opname, items] = await Promise.all([
			ids.length
				? db
						.from("design_requests")
						.select(
							"id, event_id, spot_no, stage, revision_count, brief_submitted_at, approved_version_id, updated_at",
						)
						.in("event_id", ids)
				: none,
			ids.length
				? db
						.from("booth_webhook_outbox")
						.select("event_id")
						.eq("event", "design.approved")
						.not("delivered_at", "is", null)
						.in("event_id", ids)
				: none,
			ids.length
				? db
						.from("crew_assignments")
						.select("event_id, role_in_event, spot_no")
						.in("event_id", ids)
				: none,
			ids.length
				? db.from("crew_rekap").select("event_id, status").in("event_id", ids)
				: none,
			db
				.from("stock_takes")
				.select("committed_at")
				.eq("status", "committed")
				.order("committed_at", { ascending: false })
				.limit(1),
			db
				.from("inventory_items")
				.select("id, name, unit, min_stock_alert")
				.eq("category", "inventory")
				.is("deleted_at", null),
		]);
		for (const [n, r] of Object.entries({
			reqs,
			outbox,
			crew,
			rekap,
			opname,
			items,
		}))
			if (r.error) return { error: `${n}: ${r.error.message}` };

		const requests = (reqs.data ?? []) as Req[];
		const lastVersionAt = new Map<string, string>();
		if (requests.length) {
			const { data: vs, error: ve } = await db
				.from("design_versions")
				.select("request_id, created_at")
				.in(
					"request_id",
					requests.map((r) => r.id),
				);
			if (ve) return { error: `design_versions: ${ve.message}` };
			for (const v of vs ?? []) {
				const k = v.request_id as string;
				const t = v.created_at as string;
				if ((lastVersionAt.get(k) ?? "") < t) lastVersionAt.set(k, t);
			}
		}

		const itemRows = (items.data ?? []) as Array<{
			id: string;
			name: string;
			unit: string | null;
			min_stock_alert: number | null;
		}>;
		const level = new Map<string, number>();
		if (itemRows.length) {
			// Jangan telan error: tanpa level semua item terbaca 0 = alarm palsu massal.
			const { data: lv, error: le } = await db.rpc("get_stock_levels", {
				p_item_ids: itemRows.map((i) => i.id),
			});
			if (le) return { error: `get_stock_levels: ${le.message}` };
			for (const r of (lv ?? []) as Array<{ item_id: string; stock: number }>)
				level.set(r.item_id, Number(r.stock));
		}

		const crewMap = new Map<
			string,
			Array<{ role_in_event: string | null; spot_no: number | null }>
		>();
		for (const c of (crew.data ?? []) as Array<{
			event_id: string;
			role_in_event: string | null;
			spot_no: number | null;
		}>) {
			const arr = crewMap.get(c.event_id) ?? [];
			arr.push(c);
			crewMap.set(c.event_id, arr);
		}
		const committed = (
			opname.data?.[0] as { committed_at: string | null } | undefined
		)?.committed_at;

		return susunPengingat({
			today,
			events,
			requests,
			lastVersionAt,
			boothDelivered: new Set(
				((outbox.data ?? []) as Array<{ event_id: string }>).map(
					(o) => o.event_id,
				),
			),
			crew: crewMap,
			rekap: new Map(
				((rekap.data ?? []) as Array<{ event_id: string; status: string }>).map(
					(r) => [r.event_id, r.status],
				),
			),
			lastOpname: committed ? wibDate(committed) : null,
			stock: itemRows.map((i) => ({
				nama: i.name,
				sisa: level.get(i.id) ?? 0,
				satuan: i.unit,
				minimum: Number(i.min_stock_alert ?? 0),
			})),
		});
	},
};

/** Nomor tim internal yang boleh dikirimi (system_config `tim_wa`). */
export async function nomorTim(
	db: Parameters<AiTool["run"]>[1]["supabase"],
): Promise<Array<{ nomor: string; nama: string; peran?: string }>> {
	const { data } = await db
		.from("system_config")
		.select("value")
		.eq("key", "tim_wa")
		.maybeSingle();
	const list = Array.isArray(data?.value) ? data.value : [];
	return list.filter(
		(x: unknown): x is { nomor: string; nama: string; peran?: string } =>
			typeof (x as { nomor?: unknown })?.nomor === "string",
	);
}

/** Batas bot: maksimal 4 pesan per nomor tim per hari. */
const MAKS_PER_HARI = 4;

export const kirimTim: AiTool = {
	name: "kirim_tim",
	description:
		"Kirim WA ke anggota tim internal (bukan klien). Nomor harus terdaftar sebagai tim. " +
		"Pesan yang sama ke nomor yang sama di hari yang sama ditolak; maks 4 pesan/nomor/hari. " +
		"Bot mengirim jam 07–21 WIB.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			nomor: { type: "STRING", description: "Nomor WA anggota tim (08…/62…)." },
			pesan: { type: "STRING", description: "Isi pesan, ramah & singkat." },
		},
		required: ["nomor", "pesan"],
	},
	async run(args, ctx) {
		const raw = typeof args.nomor === "string" ? args.nomor : "";
		const nomor = isLikelyWaPhone(raw) ? toWaPhone(raw) : null;
		const pesan = typeof args.pesan === "string" ? args.pesan.trim() : "";
		if (!nomor) return { error: "nomor tidak valid" };
		if (pesan.length < 2 || pesan.length > 2000)
			return { error: "pesan kosong atau terlalu panjang (maks 2000 huruf)" };
		const db = ctx.supabase;
		const tim = await nomorTim(db);
		const orang = tim.find((t) => toWaPhone(t.nomor) === nomor);
		if (!orang)
			return {
				error: `nomor ${nomor} bukan anggota tim; kirim_tim hanya untuk tim internal`,
			};

		const sejak = new Date(`${ctx.todayISO}T00:00:00+07:00`).toISOString();
		const { data: hariIni, error } = await db
			.from("bot_commands")
			.select("command")
			.like("command", `send-tim:%"nomor":"${nomor}"%`)
			.gte("created_at", sejak);
		if (error) return { error: error.message };
		const command = `send-tim:${JSON.stringify({ nomor, pesan })}`;
		if ((hariIni ?? []).some((c) => c.command === command))
			return { error: "pesan yang sama sudah dikirim ke nomor ini hari ini" };
		if ((hariIni ?? []).length >= MAKS_PER_HARI)
			return {
				error: `batas ${MAKS_PER_HARI} pesan per hari untuk ${orang.nama} sudah tercapai`,
			};

		const { data: ins, error: ie } = await db
			.from("bot_commands")
			.insert({ command, status: "pending" })
			.select("id")
			.single();
		if (ie || !ins) return { error: ie?.message ?? "gagal mengantrekan pesan" };
		return {
			status: "antre",
			cmd: ins.id,
			kepada: `${orang.nama} ${nomor}`,
			catatan: "Bot mengirim jam 07–21 WIB.",
		};
	},
};
