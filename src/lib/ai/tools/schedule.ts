import "server-only";

import type { AiTool } from "@/lib/ai/types";
import {
	type AvailabilityEvent,
	computeAvailability,
	parseHHMM,
	UNITS_TOTAL,
} from "@/lib/availability";
import { addDaysISO, daysUntil } from "@/lib/telegram/digest";

/**
 * Tool operasional: jadwal event, detail satu event, dan cek ketersediaan unit.
 *
 * Semua tool mengembalikan DATA (JSON), bukan kalimat jadi — biar Gemini yang
 * merangkai bahasanya. Predikat query sengaja disamakan dengan bot Telegram &
 * webapp (deleted_at / is_migrated_legacy / status) supaya angka tak pernah
 * berbeda antar permukaan.
 */

type EventRow = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	venue_name: string | null;
	venue_city: string | null;
	status: string;
	payment_status: string;
	grand_total: number;
	total_paid: number;
	remaining_balance: number;
	channel: string | null;
	vendor_name: string | null;
	/** Acara historis hasil impor: nyata & ikut dihitung, tapi tanpa settlement. */
	is_migrated_legacy: boolean;
};

const EVENT_COLUMNS = `id, project_id, client_name, event_date, start_time, end_time,
	venue_name, venue_city, status, payment_status, grand_total, total_paid,
	remaining_balance, channel, vendor_name, is_migrated_legacy`;

export const cariEvent: AiTool = {
	name: "cari_event",
	description:
		"Cari / daftar event (acara) berdasarkan rentang tanggal, status, atau nama klien. " +
		"Pakai ini untuk pertanyaan jadwal: 'event minggu ini', 'ada acara apa bulan depan', " +
		"'kapan acaranya Bu Rina'. Kalau user tidak menyebut tanggal, default 30 hari ke depan.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			dari: {
				type: "STRING",
				description: "Tanggal mulai, format YYYY-MM-DD. Default: hari ini.",
			},
			sampai: {
				type: "STRING",
				description:
					"Tanggal akhir (inklusif), format YYYY-MM-DD. Default: 30 hari dari 'dari'.",
			},
			cari: {
				type: "STRING",
				description:
					"Kata kunci nama klien atau venue. Kalau diisi, rentang tanggal diabaikan supaya event lama tetap ketemu.",
			},
			status: {
				type: "STRING",
				description:
					"Filter status event. Kosongkan untuk semua kecuali yang dibatalkan.",
				enum: [
					"draft",
					"confirmed",
					"upcoming",
					"in_progress",
					"awaiting_settlement",
					"completed",
					"cancelled",
				],
			},
		},
	},
	async run(args, ctx) {
		const cari = typeof args.cari === "string" ? args.cari.trim() : "";
		const dari = typeof args.dari === "string" ? args.dari : ctx.todayISO;
		const sampai =
			typeof args.sampai === "string" ? args.sampai : addDaysISO(dari, 30);
		const status = typeof args.status === "string" ? args.status : null;

		// JANGAN filter is_migrated_legacy di sini. Event "legacy" adalah acara
		// historis hasil impor — tetap acara nyata yang pernah dikerjakan, dan
		// halaman Operations MENGHITUNGNYA di KPI "Tahun Ini". Dulu filter itu
		// terbawa dari digest Telegram (yang benar di sana, karena digest soal
		// event mendatang yang perlu disiapkan crew) dan membuat AI melaporkan
		// 14 event untuk 2026 padahal 62 — 35 di antaranya legacy.
		let q = ctx.supabase
			.from("events")
			.select(EVENT_COLUMNS)
			.is("deleted_at", null);

		if (cari) {
			q = q.or(`client_name.ilike.%${cari}%,venue_name.ilike.%${cari}%`);
		} else {
			q = q.gte("event_date", dari).lte("event_date", sampai);
		}
		if (status) q = q.eq("status", status);
		else q = q.neq("status", "cancelled");

		// Ambil satu baris LEBIH dari batas: kalau kelebihan itu terbawa, kita tahu
		// daftarnya terpotong tanpa perlu query hitung kedua (hemat kuota & waktu).
		const MAKS = 120;
		const { data, error } = await q
			.order("event_date", { ascending: true })
			.limit(MAKS + 1);
		if (error) return { error: error.message };

		const semua = (data ?? []) as EventRow[];
		const terpotong = semua.length > MAKS;
		const rows = terpotong ? semua.slice(0, MAKS) : semua;

		return {
			rentang: cari ? `pencarian "${cari}"` : `${dari} s/d ${sampai}`,
			// Saat terpotong, JANGAN kirim `jumlah` — model akan membacanya sebagai
			// total dan melaporkannya sebagai fakta. Inilah yang membuatnya bilang
			// "Partner Organizer 4 event" padahal 7.
			...(terpotong
				? {
						jumlah_ditampilkan: rows.length,
						PERINGATAN: `Daftar ini TERPOTONG (lebih dari ${MAKS} event cocok). Jangan menyebut jumlah total, peringkat, atau "paling banyak" dari daftar ini — panggil statistik_event untuk angka pastinya.`,
					}
				: { jumlah: rows.length }),
			events: rows.map((e) => ({
				project_id: e.project_id,
				klien: e.client_name,
				tanggal: e.event_date,
				hari_lagi: daysUntil(ctx.todayISO, e.event_date),
				jam: e.start_time
					? `${e.start_time.slice(0, 5)}${e.end_time ? `–${e.end_time.slice(0, 5)}` : ""}`
					: null,
				venue: e.venue_name,
				kota: e.venue_city,
				status: e.status,
				channel: e.channel,
				vendor: e.vendor_name,
				arsip_lama: e.is_migrated_legacy,
				// Nilai uang hanya untuk owner — crew tak boleh lihat nominal event.
				...(ctx.role === "crew"
					? {}
					: {
							nilai: e.grand_total,
							sudah_dibayar: e.total_paid,
							sisa_tagihan: e.remaining_balance,
							status_bayar: e.payment_status,
						}),
			})),
		};
	},
};

export const statistikEvent: AiTool = {
	name: "statistik_event",
	description:
		"Rekap ANGKA event pada satu rentang: total, per bulan, per vendor, per channel, per status, " +
		"dan event bernilai terbesar. WAJIB dipakai untuk semua pertanyaan 'berapa banyak', 'paling ramai', " +
		"'paling sering', 'terbesar', atau perbandingan antar bulan/vendor. JANGAN menghitung sendiri dari " +
		"daftar cari_event — daftarnya bisa terpotong dan hasil hitunganmu akan salah. " +
		"Sudah termasuk acara historis hasil impor, sama seperti KPI di halaman Operations.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			dari: { type: "STRING", description: "YYYY-MM-DD (inklusif)" },
			sampai: { type: "STRING", description: "YYYY-MM-DD (inklusif)" },
			termasuk_batal: {
				type: "BOOLEAN",
				description:
					"Ikutkan event yang dibatalkan. Default false — event batal bukan pencapaian.",
			},
		},
		required: ["dari", "sampai"],
	},
	async run(args, ctx) {
		const dari = String(args.dari ?? "");
		const sampai = String(args.sampai ?? "");
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(dari) ||
			!/^\d{4}-\d{2}-\d{2}$/.test(sampai)
		) {
			return { error: "dari & sampai harus format YYYY-MM-DD" };
		}

		// Predikat SAMA dengan KPI "Tahun Ini" di /operations: hanya buang yang
		// terhapus dan yang dibatalkan. Acara legacy IKUT dihitung.
		let q = ctx.supabase
			.from("events")
			.select(
				"event_date, status, channel, vendor_name, client_name, grand_total, is_migrated_legacy",
			)
			.is("deleted_at", null)
			.gte("event_date", dari)
			.lte("event_date", sampai);
		if (args.termasuk_batal !== true) q = q.neq("status", "cancelled");

		const { data, error } = await q;
		if (error) return { error: error.message };

		type Row = {
			event_date: string;
			status: string;
			channel: string | null;
			vendor_name: string | null;
			client_name: string;
			grand_total: number;
			is_migrated_legacy: boolean;
		};
		const rows = (data ?? []) as Row[];
		if (rows.length === 0) {
			return { rentang: `${dari} s/d ${sampai}`, total_event: 0 };
		}

		const tally = (pick: (r: Row) => string | null) => {
			const m = new Map<string, number>();
			for (const r of rows) {
				const k = pick(r);
				if (!k) continue;
				m.set(k, (m.get(k) ?? 0) + 1);
			}
			return [...m.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([nama, jumlah]) => ({ nama, jumlah }));
		};

		const perBulan = new Map<string, number>();
		for (const r of rows) {
			const k = r.event_date.slice(0, 7);
			perBulan.set(k, (perBulan.get(k) ?? 0) + 1);
		}
		const bulanUrut = [...perBulan.entries()].sort((a, b) =>
			a[0].localeCompare(b[0]),
		);
		const maks = Math.max(...bulanUrut.map(([, n]) => n));

		const owner = ctx.role !== "crew";
		return {
			rentang: `${dari} s/d ${sampai}`,
			total_event: rows.length,
			sudah_lewat: rows.filter((r) => r.event_date < ctx.todayISO).length,
			akan_datang: rows.filter((r) => r.event_date >= ctx.todayISO).length,
			dari_arsip_lama: rows.filter((r) => r.is_migrated_legacy).length,
			per_bulan: bulanUrut.map(([bulan, jumlah]) => ({ bulan, jumlah })),
			// Bisa lebih dari satu bulan yang seri di puncak — sebutkan semuanya
			// supaya model tidak asal memilih satu dan terdengar pasti.
			bulan_terramai: bulanUrut
				.filter(([, n]) => n === maks)
				.map(([bulan]) => bulan),
			jumlah_event_bulan_terramai: maks,
			per_vendor: tally((r) => r.vendor_name?.trim() || null),
			per_channel: tally((r) => r.channel),
			per_status: tally((r) => r.status),
			...(owner
				? {
						nilai_total: rows.reduce(
							(s, r) => s + Number(r.grand_total ?? 0),
							0,
						),
						event_terbesar: [...rows]
							.sort((a, b) => Number(b.grand_total) - Number(a.grand_total))
							.slice(0, 5)
							.map((r) => ({
								klien: r.client_name,
								tanggal: r.event_date,
								nilai: Number(r.grand_total ?? 0),
							})),
					}
				: {}),
			catatan:
				"Angka ini memakai definisi yang sama dengan KPI di halaman Operations (semua status kecuali batal, termasuk acara historis hasil impor).",
		};
	},
};

export const detailEvent: AiTool = {
	name: "detail_event",
	description:
		"Detail lengkap SATU event: paket, add-on, crew yang ditugaskan, venue, dan status pembayaran. " +
		"Butuh project_id (mis. 'TP-2026-014') — dapatkan dulu lewat cari_event kalau user hanya menyebut nama klien.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			project_id: {
				type: "STRING",
				description: "Kode project event, mis. TP-2026-014.",
			},
		},
		required: ["project_id"],
	},
	async run(args, ctx) {
		const projectId = String(args.project_id ?? "").trim();
		if (!projectId) return { error: "project_id wajib diisi" };

		const { data, error } = await ctx.supabase
			.from("events")
			.select(
				`${EVENT_COLUMNS}, setup_time, session_segments, google_maps_url,
				 frame_size, design_status, notes,
				 package:packages(name, duration_hours, price)`,
			)
			.eq("project_id", projectId)
			.is("deleted_at", null)
			.maybeSingle();
		if (error) return { error: error.message };
		if (!data) return { error: `Event ${projectId} tidak ditemukan.` };

		// Embed to-one: PostgREST mengembalikan OBJEK saat runtime, tapi tipe
		// hasil-generate mendeklarasikannya sebagai array. Normalkan keduanya
		// (idiom yang sama dipakai di telegram/digest.ts) — jangan asal baca [0].
		type PackageEmbed = {
			name: string;
			duration_hours: number;
			price: number;
		} | null;
		const ev = data as unknown as EventRow & {
			setup_time: string | null;
			google_maps_url: string | null;
			frame_size: string | null;
			design_status: string | null;
			notes: string | null;
			package: PackageEmbed | PackageEmbed[];
		};
		const pkg =
			(Array.isArray(ev.package) ? ev.package[0] : ev.package) ?? null;

		// FK hint wajib: crew_assignments punya 2 FK ke users (user_id &
		// assigned_by). Tanpa hint → PGRST201 dan crew terbaca kosong.
		const { data: crewData } = await ctx.supabase
			.from("crew_assignments")
			.select(
				"role_in_event, user:users!crew_assignments_user_id_fkey(full_name, nickname)",
			)
			.eq("event_id", ev.id);

		type CrewUserEmbed = { full_name: string; nickname: string | null } | null;
		const crew = (
			(crewData ?? []) as unknown as Array<{
				role_in_event: string;
				user: CrewUserEmbed | CrewUserEmbed[];
			}>
		).map((c) => {
			const u = (Array.isArray(c.user) ? c.user[0] : c.user) ?? null;
			return {
				peran: c.role_in_event,
				nama: u?.nickname?.trim() || u?.full_name || "?",
			};
		});

		return {
			project_id: ev.project_id,
			klien: ev.client_name,
			tanggal: ev.event_date,
			hari_lagi: daysUntil(ctx.todayISO, ev.event_date),
			setup: ev.setup_time?.slice(0, 5) ?? null,
			mulai: ev.start_time?.slice(0, 5) ?? null,
			selesai: ev.end_time?.slice(0, 5) ?? null,
			venue: ev.venue_name,
			kota: ev.venue_city,
			maps: ev.google_maps_url,
			paket: pkg?.name ?? null,
			durasi_jam: pkg?.duration_hours ?? null,
			ukuran_frame: ev.frame_size,
			status_desain: ev.design_status,
			status: ev.status,
			catatan: ev.notes,
			crew: crew.length > 0 ? crew : "belum ada crew yang di-assign",
			...(ctx.role === "crew"
				? {}
				: {
						nilai: ev.grand_total,
						sudah_dibayar: ev.total_paid,
						sisa_tagihan: ev.remaining_balance,
						status_bayar: ev.payment_status,
					}),
		};
	},
};

export const cekKetersediaan: AiTool = {
	name: "cek_ketersediaan",
	description:
		`Cek apakah masih ada unit photobooth kosong di suatu tanggal (total ${UNITS_TOTAL} unit). ` +
		"Pakai untuk 'tanggal 20 masih bisa terima booking?'. Sudah memperhitungkan waktu " +
		"perjalanan antar kota dan acara berjeda.",
	scope: "ops",
	parameters: {
		type: "OBJECT",
		properties: {
			tanggal: { type: "STRING", description: "YYYY-MM-DD" },
			jam_mulai: {
				type: "STRING",
				description: "HH:MM. Default 08:00 (perhitungan konservatif seharian).",
			},
			jam_selesai: { type: "STRING", description: "HH:MM. Default 22:00." },
			kota: {
				type: "STRING",
				description: "Kota venue, untuk menghitung buffer perjalanan.",
			},
		},
		required: ["tanggal"],
	},
	async run(args, ctx) {
		const tanggal = String(args.tanggal ?? "");
		if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
			return { error: "tanggal harus format YYYY-MM-DD" };
		}
		const reqStart = parseHHMM(String(args.jam_mulai ?? "08:00")) ?? 480;
		const reqEnd = parseHHMM(String(args.jam_selesai ?? "22:00")) ?? 1320;

		const { data, error } = await ctx.supabase
			.from("events")
			.select(
				"client_name, start_time, end_time, session_segments, venue_city, status, package:packages(duration_hours)",
			)
			.eq("event_date", tanggal)
			.is("deleted_at", null);
		if (error) return { error: error.message };

		const NON_LOCKING = new Set(["cancelled", "archived"]);
		const events: AvailabilityEvent[] = (
			(data ?? []) as unknown as Array<{
				client_name: string | null;
				start_time: string | null;
				end_time: string | null;
				session_segments: unknown;
				venue_city: string | null;
				status: string | null;
				package: { duration_hours: number | null } | null;
			}>
		)
			.filter((r) => !NON_LOCKING.has(r.status ?? ""))
			.map((r) => ({
				client_name: r.client_name,
				start_time: r.start_time,
				end_time: r.end_time,
				session_segments: r.session_segments,
				venue_city: r.venue_city,
				package_duration_hours: r.package?.duration_hours ?? null,
			}));

		const result = computeAvailability({
			reqStart,
			reqEnd,
			reqCity: typeof args.kota === "string" ? args.kota : null,
			events,
		});

		return {
			tanggal,
			window: `${String(args.jam_mulai ?? "08:00")}–${String(args.jam_selesai ?? "22:00")}`,
			unit_kosong: result.units_free,
			unit_total: UNITS_TOTAL,
			bisa_terima_booking: result.units_free > 0,
			booking_hari_itu: events.map((e) => ({
				klien: e.client_name,
				jam: e.start_time
					? `${e.start_time.slice(0, 5)}${e.end_time ? `–${e.end_time.slice(0, 5)}` : ""}`
					: "TBC",
				kota: e.venue_city,
			})),
		};
	},
};
