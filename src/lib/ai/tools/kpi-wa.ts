import type { AiTool } from "@/lib/ai/types";

/**
 * KPI konversi lead bot WA (DR-051). Konversi ditandai di database oleh
 * wa_lead_convert (pemicu di events) — tool ini hanya membaca.
 *
 * Definisi (sama di laporan mana pun):
 *   lead_wa   = nomor unik (9 digit terakhir) yang PERTAMA KALI chat bot di
 *               rentang. Nomor tim (system_config.tim_wa) tidak dihitung.
 *   converted = event direct yang DIBUAT di rentang dan berasal dari lead WA
 *               (lead masuk sebelum event dibuat). Event dihapus tidak dihitung.
 *   konversi  = converted / lead_wa (perkiraan; booking bisa dari lead minggu
 *               sebelumnya).
 * Minggu = Senin–Minggu WIB.
 */

export type KpiLead = { phone: string; received_at: string };
export type KpiConverted = {
	phone: string;
	name: string | null;
	received_at: string;
	event: {
		id: string;
		project_id: string | null;
		title: string;
		event_date: string;
		grand_total: number;
		created_at: string;
	};
};

const tail = (p: string) => p.replace(/\D/g, "").slice(-9);
/** Tanggal WIB (YYYY-MM-DD) dari timestamp. */
const wib = (ts: string) =>
	new Date(Date.parse(ts) + 7 * 3600_000).toISOString().slice(0, 10);
/** Senin dari minggu tanggal ini. */
export const mondayOf = (d: string) => {
	const t = Date.parse(`${d}T00:00:00Z`);
	const dow = (new Date(t).getUTCDay() + 6) % 7;
	return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
};
const days = (a: string, b: string) =>
	Math.round(
		(Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
	);

export function aggregateKpiWa(input: {
	leads: KpiLead[];
	converted: KpiConverted[];
	dari: string;
	sampai: string;
	timTails?: string[];
}) {
	const { dari, sampai } = input;
	const tim = new Set(input.timTails ?? []);
	const inRange = (d: string) => d >= dari && d <= sampai;

	// Lead: chat pertama per nomor (seluruh riwayat), dihitung kalau jatuh di rentang.
	const first = new Map<string, string>();
	for (const l of input.leads) {
		const t = tail(l.phone);
		if (t.length < 9 || tim.has(t)) continue;
		const d = wib(l.received_at);
		const cur = first.get(t);
		if (!cur || d < cur) first.set(t, d);
	}
	const leadDays = [...first.values()].filter(inRange);

	// Converted: satu baris per event (banyak pesan lead → satu booking).
	const perEvent = new Map<string, { c: KpiConverted; lead: string }>();
	for (const c of input.converted) {
		const d = wib(c.received_at);
		const cur = perEvent.get(c.event.id);
		if (!cur || d < cur.lead) perEvent.set(c.event.id, { c, lead: d });
	}
	const daftar = [...perEvent.values()]
		.filter(({ c }) => inRange(wib(c.event.created_at)))
		.map(({ c, lead }) => ({
			nama: c.event.title,
			nama_di_wa: c.name,
			nomor_akhir: tail(c.phone).slice(-4),
			project_id: c.event.project_id,
			tanggal_acara: c.event.event_date,
			nilai: Math.round(c.event.grand_total),
			booking_dibuat: wib(c.event.created_at),
			lead_pertama: lead,
			hari_sampai_booking: days(lead, wib(c.event.created_at)),
		}))
		.sort((a, b) => a.booking_dibuat.localeCompare(b.booking_dibuat));

	const weeks = new Map<
		string,
		{ lead_wa: number; converted: number; nilai: number }
	>();
	const wk = (d: string) => {
		const k = mondayOf(d);
		const w = weeks.get(k) ?? { lead_wa: 0, converted: 0, nilai: 0 };
		weeks.set(k, w);
		return w;
	};
	for (
		let d = mondayOf(dari);
		d <= sampai;
		d = new Date(Date.parse(`${d}T00:00:00Z`) + 7 * 86_400_000)
			.toISOString()
			.slice(0, 10)
	)
		wk(d);
	for (const d of leadDays) wk(d).lead_wa++;
	for (const x of daftar) {
		const w = wk(x.booking_dibuat);
		w.converted++;
		w.nilai += x.nilai;
	}

	const nilai = daftar.reduce((t, x) => t + x.nilai, 0);
	return {
		rentang: { dari, sampai },
		lead_wa: leadDays.length,
		converted: daftar.length,
		konversi_persen: leadDays.length
			? Math.round((daftar.length / leadDays.length) * 1000) / 10
			: null,
		nilai_booking: nilai,
		per_minggu: [...weeks.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([minggu_mulai, w]) => ({ minggu_mulai, ...w })),
		daftar_converted: daftar,
		definisi:
			"lead_wa = nomor unik yang pertama kali chat bot WA di rentang (tanpa nomor tim). " +
			"converted = event direct yang dibuat di rentang dan nomornya pernah chat bot sebelum event dibuat. " +
			"konversi_persen = converted / lead_wa. Minggu = Senin–Minggu WIB.",
	};
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Ambil semua baris (PostgREST memotong di 1000). */
async function all<T>(
	page: (
		from: number,
		to: number,
	) => PromiseLike<{
		data: unknown[] | null;
		error: { message: string } | null;
	}>,
): Promise<T[]> {
	const out: T[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await page(from, from + 999);
		if (error) throw new Error(error.message);
		// Tipe embed dari supabase-js tidak tahu relasi to-one → cast.
		out.push(...((data ?? []) as T[]));
		if (!data || data.length < 1000) return out;
	}
}

export const kpiKonversiWa: AiTool = {
	name: "kpi_konversi_wa",
	description:
		"KPI konversi lead bot WhatsApp: jumlah lead WA (nomor unik yang pertama kali chat), jumlah " +
		"booking direct yang berasal dari lead WA, nilai bookingnya, persen konversi, rincian per minggu " +
		"(Senin–Minggu), dan daftar yang converted (nama, tanggal acara, nilai). Pakai untuk laporan " +
		"mingguan/bulanan bot WA atau 'berapa closing dari WA bulan ini'.",
	// Nilai booking = data keuangan → bukan untuk crew.
	scope: "finance",
	parameters: {
		type: "OBJECT",
		properties: {
			dari: {
				type: "STRING",
				description: "Tanggal awal YYYY-MM-DD (WIB). Default: 28 hari lalu.",
			},
			sampai: {
				type: "STRING",
				description:
					"Tanggal akhir YYYY-MM-DD (WIB), termasuk. Default: hari ini.",
			},
		},
	},
	async run(args, ctx) {
		const sampai =
			typeof args.sampai === "string" && ISO.test(args.sampai)
				? args.sampai
				: ctx.todayISO;
		const dari =
			typeof args.dari === "string" && ISO.test(args.dari)
				? args.dari
				: new Date(Date.parse(`${sampai}T00:00:00Z`) - 27 * 86_400_000)
						.toISOString()
						.slice(0, 10);
		if (dari > sampai) return { error: "dari harus sebelum sampai" };

		const db = ctx.supabase;
		const [leads, conv, tim] = await Promise.all([
			all<KpiLead>((a, b) =>
				db
					.from("whatsapp_bot_leads")
					.select("phone, received_at")
					.lte("received_at", `${sampai}T23:59:59+07:00`)
					.order("received_at")
					.range(a, b),
			),
			all<{
				phone: string;
				name: string | null;
				received_at: string;
				event: {
					id: string;
					project_id: string | null;
					event_title: string | null;
					client_name: string | null;
					event_date: string;
					grand_total: number | string | null;
					created_at: string;
					deleted_at: string | null;
				} | null;
			}>((a, b) =>
				db
					.from("whatsapp_bot_leads")
					.select(
						"phone, name, received_at, event:events!whatsapp_bot_leads_converted_event_id_fkey(id, project_id, event_title, client_name, event_date, grand_total, created_at, deleted_at)",
					)
					.not("converted_event_id", "is", null)
					.order("received_at")
					.range(a, b),
			),
			db
				.from("system_config")
				.select("value")
				.eq("key", "tim_wa")
				.maybeSingle(),
		]);
		const timTails = (Array.isArray(tim.data?.value) ? tim.data.value : [])
			.map((x: { nomor?: unknown }) => tail(String(x?.nomor ?? "")))
			.filter((t: string) => t.length === 9);
		return aggregateKpiWa({
			leads,
			// to-one embed → objek. Event dihapus tidak dihitung.
			converted: conv
				.filter((c) => c.event && !c.event.deleted_at)
				.map((c) => {
					const e = c.event as NonNullable<typeof c.event>;
					return {
						phone: c.phone,
						name: c.name,
						received_at: c.received_at,
						event: {
							id: e.id,
							project_id: e.project_id,
							title: e.event_title || e.client_name || "(tanpa nama)",
							event_date: e.event_date,
							grand_total: Number(e.grand_total ?? 0),
							created_at: e.created_at,
						},
					};
				}),
			dari,
			sampai,
			timTails,
		});
	},
};
