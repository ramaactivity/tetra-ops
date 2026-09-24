import "server-only";

import type { AiTool } from "@/lib/ai/types";
import { getCashAccountBalance } from "@/lib/finance/balance-guard";
import { listUnpaidCrew } from "@/lib/finance/unpaid-crew";
import { addDaysISO, daysUntil } from "@/lib/telegram/digest";

/**
 * Tool keuangan — RAHASIA BISNIS. Registry hanya menyerahkan tool ber-scope
 * "finance" kepada owner / super_admin; crew tidak pernah melihat namanya
 * sekalipun, jadi model tak bisa tergoda memanggilnya.
 *
 * Angka di sini memakai definisi yang sama persis dengan halaman Finance dan
 * perintah bot (/saldo, /piutang, /crew, /bisnis) — kalau definisi berubah,
 * ubah di helper bersamanya, jangan di sini.
 */

export const ringkasanBisnis: AiTool = {
	name: "ringkasan_bisnis",
	description:
		"Ringkasan performa bisnis pada satu rentang tanggal: jumlah event, omzet & profit dari event " +
		"yang sudah settled, uang masuk, dan leads. Pakai untuk 'gimana bulan ini', 'profit bulan lalu berapa'.",
	scope: "finance",
	parameters: {
		type: "OBJECT",
		properties: {
			dari: { type: "STRING", description: "YYYY-MM-DD (inklusif)" },
			sampai: { type: "STRING", description: "YYYY-MM-DD (inklusif)" },
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
		// Query internal pakai batas atas eksklusif; user bicara inklusif.
		const endExcl = new Date(`${sampai}T00:00:00Z`);
		endExcl.setUTCDate(endExcl.getUTCDate() + 1);
		const sampaiExcl = endExcl.toISOString().slice(0, 10);

		// Legacy DIKECUALIKAN di sini. Tool ini adalah ringkasan FINANSIAL —
		// tiga angka lainnya bersumber dari event_settlements, yang memang tak
		// pernah ada untuk acara impor. Modul yang dicerminkan tool ini adalah
		// /bisnis di bot (telegram/digest.ts), yang memakai
		// .eq("is_migrated_legacy", false) atas label yang sama persis
		// ("Event terlaksana") untuk rentang yang sama. Tanpa filter ini, owner
		// menanyakan hal yang sama lewat dua pintu dan menerima dua jawaban
		// berbeda dari bot yang sama.
		//
		// Untuk JUMLAH event murni (KPI "Tahun Ini" di Operations), legacy tetap
		// ikut dihitung — itu tool statistik_event, bukan yang ini.
		// Lihat catatan reference_legacy_events_counting.
		const { count: eventCount } = await ctx.supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.gte("event_date", dari)
			.lt("event_date", sampaiExcl)
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.neq("status", "cancelled");

		const { data: settlements } = await ctx.supabase
			.from("event_settlements")
			.select("net_profit, revenue_net, is_loss")
			.eq("is_reopened", false)
			.gte("closed_at", `${dari}T00:00:00+07:00`)
			.lt("closed_at", `${sampaiExcl}T00:00:00+07:00`);
		const st = (settlements ?? []) as Array<{
			net_profit: number;
			revenue_net: number;
			is_loss: boolean;
		}>;
		const omzet = st.reduce((s, r) => s + Number(r.revenue_net ?? 0), 0);
		const profit = st.reduce((s, r) => s + Number(r.net_profit ?? 0), 0);

		const { data: pays } = await ctx.supabase
			.from("payments")
			.select("amount")
			.eq("is_reversed", false)
			.gte("payment_date", dari)
			.lt("payment_date", sampaiExcl);
		const uangMasuk = ((pays ?? []) as Array<{ amount: number }>).reduce(
			(s, p) => s + Number(p.amount ?? 0),
			0,
		);

		return {
			rentang: `${dari} s/d ${sampai}`,
			event_terlaksana: eventCount ?? 0,
			event_settled: st.length,
			event_rugi: st.filter((r) => r.is_loss).length,
			omzet_settled: omzet,
			profit_bersih: profit,
			margin_persen: omzet > 0 ? Math.round((profit / omzet) * 100) : 0,
			uang_masuk_semua_pembayaran: uangMasuk,
			catatan:
				st.length === 0
					? "Belum ada event yang di-settle di rentang ini, jadi omzet & profit masih nol. Uang masuk tetap terhitung."
					: "Omzet & profit hanya dari event yang sudah di-settle.",
		};
	},
};

export const saldoKas: AiTool = {
	name: "saldo_kas",
	description:
		"Saldo semua rekening kas & bank saat ini (dihitung dari buku besar). " +
		"Pakai untuk 'uang kita sekarang berapa', 'saldo BCA berapa'.",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run(_args, ctx) {
		const { data, error } = await ctx.supabase
			.from("chart_of_accounts")
			.select("code, name")
			.like("code", "1-1%")
			.order("code");
		if (error) return { error: error.message };

		const accounts = (data ?? []) as Array<{ code: string; name: string }>;
		const balances = await Promise.all(
			accounts.map(async (a) => ({
				akun: a.name,
				kode: a.code,
				saldo: await getCashAccountBalance(ctx.supabase, a.code),
			})),
		);
		return {
			rekening: balances,
			total: balances.reduce((s, b) => s + b.saldo, 0),
			minus: balances.filter((b) => b.saldo < 0).map((b) => b.akun),
		};
	},
};

export const piutang: AiTool = {
	name: "piutang",
	description:
		"Daftar event yang belum lunas (piutang / tagihan ke klien), dipisah antara yang eventnya " +
		"sudah lewat dan yang masih akan datang. Pakai untuk 'siapa yang belum bayar' dan " +
		"pengingat pelunasan: jatuh_tempo diambil dari invoice (standar H-1 acara, bisa diubah per invoice).",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run(_args, ctx) {
		// Predikat SAMA dengan /billing & get_outstanding_total: belum 'paid' DAN
		// masih ada sisa. Kalau hanya cek remaining_balance, jalur upfront_cut
		// (net billing) ikut terhitung dan totalnya beda dari webapp.
		const { data, error } = await ctx.supabase
			.from("events")
			.select(
				"id, project_id, client_name, client_wa, event_date, total_paid, remaining_balance, grand_total",
			)
			.gt("remaining_balance", 0)
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.neq("payment_status", "paid")
			.order("event_date", { ascending: true });
		if (error) return { error: error.message };

		const rows = (data ?? []) as Array<{
			id: string;
			project_id: string;
			client_name: string;
			client_wa: string | null;
			event_date: string;
			total_paid: number;
			remaining_balance: number;
			grand_total: number;
		}>;

		// Tenggat pelunasan = due_date invoice (satu invoice non-void per event).
		// Belum ada invoice → standar H-1 acara, sama dengan default invoice baru.
		// events.due_date sengaja tidak dipakai: hanya dari impor CSV lama dan
		// tidak ikut bergeser saat tanggal acara diubah.
		const { data: docs } = await ctx.supabase
			.from("documents")
			.select("event_id, doc_number, due_date")
			.eq("doc_type", "invoice")
			.neq("status", "void")
			.in(
				"event_id",
				rows.map((r) => r.id),
			);
		const invoiceOf = new Map(
			(
				(docs ?? []) as Array<{
					event_id: string;
					doc_number: string;
					due_date: string | null;
				}>
			).map((d) => [d.event_id, d]),
		);

		const mapped = rows.map((r) => {
			const inv = invoiceOf.get(r.id);
			const jatuhTempo = inv?.due_date ?? addDaysISO(r.event_date, -1);
			return {
				project_id: r.project_id,
				klien: r.client_name,
				wa_klien: r.client_wa,
				no_invoice: inv?.doc_number ?? null,
				tanggal_event: r.event_date,
				jatuh_tempo: jatuhTempo,
				jatuh_tempo_dari: inv?.due_date ? "invoice" : "standar H-1",
				hari_ke_jatuh_tempo: daysUntil(ctx.todayISO, jatuhTempo),
				sudah_lewat: r.event_date < ctx.todayISO,
				hari_lagi: daysUntil(ctx.todayISO, r.event_date),
				nilai: r.grand_total,
				sudah_dibayar: r.total_paid,
				sisa: r.remaining_balance,
				belum_dp_sama_sekali: Number(r.total_paid) === 0,
			};
		});
		return {
			jumlah_event: mapped.length,
			total_piutang: mapped.reduce((s, r) => s + Number(r.sisa), 0),
			sudah_lewat: mapped.filter((r) => r.sudah_lewat),
			akan_datang: mapped.filter((r) => !r.sudah_lewat),
		};
	},
};

export const feeCrewBelumDibayar: AiTool = {
	name: "fee_crew_belum_dibayar",
	description:
		"Fee crew yang masih jadi hutang perusahaan (hanya dari event yang sudah settle di buku). " +
		"Pakai untuk 'utang fee ke crew berapa', 'siapa yang belum digaji'.",
	scope: "finance",
	parameters: { type: "OBJECT", properties: {} },
	async run(_args, ctx) {
		const { rows } = await listUnpaidCrew(ctx.supabase);
		const perOrang = new Map<string, number>();
		for (const r of rows) {
			perOrang.set(r.crewName, (perOrang.get(r.crewName) ?? 0) + r.amount);
		}
		return {
			total: [...perOrang.values()].reduce((a, b) => a + b, 0),
			per_orang: [...perOrang.entries()].map(([nama, jumlah]) => ({
				nama,
				jumlah,
			})),
			catatan:
				"Definisi sama dengan halaman Finance: hanya event yang sudah ter-settle di buku besar, bukan sekadar flag belum dibayar.",
		};
	},
};
